//! What macOS hands the app to open (0.3-P3): a board file opened from Finder, or an `aphrodite://open` link
//! pressed in a terminal. Both come from outside. A link is read for the board and the page it names and for
//! nothing else, the way src/board-file.ts reads it (both held to tests/support/open-links.json), so following
//! one opens and never edits. A file is kept here by its path, and the app has it only as bytes, once, through
//! `opened_file_read`: no path reaches the page, and a link never names one.
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// The most a board file may be, in bytes; src/board-file.ts holds the same.
pub const MAX_BOARD_FILE: u64 = 1024 * 1024 * 1024;
/// How many links and files wait at once; past that the oldest go, so nothing from outside grows without end.
const MAX_WAITING: usize = 20;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct OpenLink {
    pub board: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct WaitingFile {
    id: u64,
    name: String,
}

#[derive(Default)]
pub struct Opened {
    links: Vec<OpenLink>,
    files: Vec<(u64, PathBuf)>,
    next: u64,
}
pub struct OpenedState(pub Mutex<Opened>);

fn is_id(text: &str) -> bool {
    !text.is_empty() && text.len() <= 200 && text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The board and page an `aphrodite://open?board=…&page=…` link names, or None for anything else: another
/// host, a fragment, a key it does not know, one twice, or an id that is not one.
pub fn read_link(href: &str) -> Option<OpenLink> {
    if href.len() > 1000 {
        return None;
    }
    let lower = href.to_ascii_lowercase();
    let query = ["aphrodite://open?", "aphrodite://open/?"].iter().find(|lead| lower.starts_with(*lead)).map(|lead| &href[lead.len()..])?;
    if query.contains('#') {
        return None;
    }
    let (mut board, mut page) = (None, None);
    for pair in query.split('&') {
        let mut parts = pair.split('=');
        let (key, value) = (parts.next()?, parts.next()?);
        if parts.next().is_some() || !is_id(value) {
            return None;
        }
        match key {
            "board" if board.is_none() => board = Some(value.to_string()),
            "page" if page.is_none() => page = Some(value.to_string()),
            _ => return None,
        }
    }
    Some(OpenLink { board: board?, page })
}

/// Where a board file really is, when it is one to read: a regular file named .aphrodite, where it ends up
/// as well as as it was handed over, and no bigger than MAX_BOARD_FILE. Checked before a byte is read.
pub fn board_file(path: &Path) -> Result<PathBuf, String> {
    let named = |p: &Path| p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("aphrodite"));
    if !named(path) {
        return Err("only a .aphrodite file opens as a board".into());
    }
    let real = std::fs::canonicalize(path).map_err(|e| format!("the file could not be found: {e}"))?;
    let meta = std::fs::metadata(&real).map_err(|e| format!("the file could not be read: {e}"))?;
    if !meta.is_file() || !named(&real) {
        return Err("only a .aphrodite file opens as a board".into());
    }
    if meta.len() > MAX_BOARD_FILE {
        return Err(format!("the file is {} bytes; a board file holds at most {MAX_BOARD_FILE}", meta.len()));
    }
    Ok(real)
}

/// The bytes of a board file, read only as far as MAX_BOARD_FILE: a file that grew since it was checked is refused.
pub fn read_board_file(path: &Path) -> Result<Vec<u8>, String> {
    let real = board_file(path)?;
    let mut bytes = Vec::new();
    std::fs::File::open(&real).and_then(|f| f.take(MAX_BOARD_FILE + 1).read_to_end(&mut bytes)).map_err(|e| format!("the file could not be read: {e}"))?;
    if bytes.len() as u64 > MAX_BOARD_FILE {
        return Err(format!("the file is past {MAX_BOARD_FILE} bytes; a board file holds at most that"));
    }
    Ok(bytes)
}

/// Takes what macOS asked the app to open: links read now, files kept by path for the app to ask for.
pub fn receive(opened: &mut Opened, urls: &[tauri::Url]) {
    for url in urls {
        match url.scheme() {
            "file" => {
                if let Ok(path) = url.to_file_path() {
                    opened.next += 1;
                    let id = opened.next;
                    opened.files.push((id, path));
                }
            }
            "aphrodite" => {
                if let Some(link) = read_link(url.as_str()) {
                    opened.links.push(link);
                }
            }
            _ => {}
        }
    }
    let over = opened.links.len().saturating_sub(MAX_WAITING);
    opened.links.drain(..over);
    let over = opened.files.len().saturating_sub(MAX_WAITING);
    opened.files.drain(..over);
}

pub fn opened(app: &AppHandle, urls: Vec<tauri::Url>) {
    if let Ok(mut opened) = app.state::<OpenedState>().0.lock() {
        receive(&mut opened, &urls);
    }
    let _ = app.emit_to("main", "aphrodite-opened", ());
}

#[derive(Serialize)]
pub struct Waiting {
    links: Vec<OpenLink>,
    files: Vec<WaitingFile>,
}

/// The links waiting (taken: each is followed once) and the files waiting, by id and name only.
#[tauri::command]
pub fn opened_take(state: tauri::State<'_, OpenedState>) -> Waiting {
    let mut opened = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let links = std::mem::take(&mut opened.links);
    let files = opened.files.iter().map(|(id, path)| WaitingFile { id: *id, name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default() }).collect();
    Waiting { links, files }
}

/// One waiting file's bytes, once: it is no longer waiting after this, read or refused. Read off the command workers.
#[tauri::command]
pub async fn opened_file_read(state: tauri::State<'_, OpenedState>, id: u64) -> Result<tauri::ipc::Response, String> {
    let path = {
        let mut opened = state.0.lock().unwrap_or_else(|e| e.into_inner());
        let at = opened.files.iter().position(|(n, _)| *n == id).ok_or("no such file is waiting")?;
        opened.files.remove(at).1
    };
    let bytes = tauri::async_runtime::spawn_blocking(move || read_board_file(&path)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_link_is_read_as_the_app_reads_it() {
        let table: serde_json::Value = serde_json::from_str(include_str!("../../tests/support/open-links.json")).unwrap();
        let rows = table.as_array().unwrap();
        assert!(rows.len() >= 20);
        for row in rows {
            let href = row["href"].as_str().unwrap();
            let got = read_link(href).map(|l| serde_json::to_value(l).unwrap()).unwrap_or(serde_json::Value::Null);
            assert_eq!(got, row["opens"], "{href}");
        }
    }

    #[test]
    fn only_a_regular_aphrodite_file_within_the_cap_is_read() {
        let dir = tempfile::tempdir().unwrap();
        let board = dir.path().join("a.aphrodite");
        std::fs::write(&board, b"PK").unwrap();
        assert_eq!(read_board_file(&board).unwrap(), b"PK");
        let other = dir.path().join("a.zip");
        std::fs::write(&other, b"PK").unwrap();
        assert!(board_file(&other).is_err());
        let folder = dir.path().join("f.aphrodite");
        std::fs::create_dir(&folder).unwrap();
        assert!(board_file(&folder).is_err());
        // A link named .aphrodite is read only when what it leads to is one too.
        let secret = dir.path().join("secret.txt");
        std::fs::write(&secret, b"secret").unwrap();
        let pointing = dir.path().join("b.aphrodite");
        std::os::unix::fs::symlink(&secret, &pointing).unwrap();
        assert!(board_file(&pointing).is_err());
        let alias = dir.path().join("c.aphrodite");
        std::os::unix::fs::symlink(&board, &alias).unwrap();
        assert_eq!(board_file(&alias).unwrap(), std::fs::canonicalize(&board).unwrap());
        let big = dir.path().join("big.aphrodite");
        std::fs::File::create(&big).unwrap().set_len(MAX_BOARD_FILE + 1).unwrap();
        assert!(board_file(&big).unwrap_err().contains("at most"));
        assert!(board_file(&dir.path().join("gone.aphrodite")).is_err());
    }

    #[test]
    fn what_macos_hands_over_is_kept_by_kind_and_held_to_a_few() {
        let mut opened = Opened::default();
        let urls: Vec<tauri::Url> = ["file:///tmp/a%20b.aphrodite", "aphrodite://open?board=b1&page=p1", "aphrodite://open?board=b1&file=/etc/passwd", "https://example.com/", "aphrodite://edit?board=b1"].iter().map(|u| tauri::Url::parse(u).unwrap()).collect();
        receive(&mut opened, &urls);
        assert_eq!(opened.links, vec![OpenLink { board: "b1".into(), page: Some("p1".into()) }]);
        assert_eq!(opened.files, vec![(1, PathBuf::from("/tmp/a b.aphrodite"))]);
        let many: Vec<tauri::Url> = (0..30).map(|i| tauri::Url::parse(&format!("aphrodite://open?board=b{i}")).unwrap()).collect();
        receive(&mut opened, &many);
        assert_eq!(opened.links.len(), MAX_WAITING);
        assert_eq!(opened.links.last().unwrap().board, "b29");
    }
}
