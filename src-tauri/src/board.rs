//! The board's own files (0.3-P2). A picture or a video put on a board is kept in `board-media/` under
//! the SHA-256 of its bytes, so the project names it only as `media:<sha256>` and never as a place on
//! this machine. A free page's frame loads a copy of the page from `free-pages/`; the project holds the
//! page. These two folders are all the asset protocol serves (tauri.conf.json), and nothing here reads
//! or writes outside the app's data folder except `store`, which copies a file the agent names in.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// One file on a board holds at most this many bytes; past it, nothing is copied (src/free-page.ts holds the same number).
pub const MAX_MEDIA_BYTES: u64 = 500 * 1024 * 1024;
const MEDIA: &str = "board-media";
const PAGES: &str = "free-pages";
/// How long a page's copy is kept after a frame last wrote or opened it (write_page).
const PAGE_KEPT: std::time::Duration = std::time::Duration::from_secs(600);
/// A copy written or opened this recently is never cleared for the folder's size: a frame may be about to show it (publish).
const PAGE_FRESH: std::time::Duration = std::time::Duration::from_secs(60);
/// What the copies frames load may take together; past it the oldest no frame shows are cleared (0.3-R fix 2 #21).
const PAGES_BOUND: u64 = 256 * 1024 * 1024;
/// Files on their way in, outside both folders the asset protocol serves.
const UPLOADS: &str = "board-uploads";
const EXTENSIONS: [&str; 6] = ["png", "jpg", "gif", "webp", "mp4", "webm"];

#[derive(Serialize, Debug, PartialEq)]
pub struct Stored {
    pub sha: String,
    pub mime: String,
    pub bytes: u64,
}

fn base(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn folder(base: &Path, name: &str) -> Result<PathBuf, String> {
    let dir = base.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The six kinds a board shows, by their first bytes rather than by a name anyone can change.
pub(crate) fn sniff(head: &[u8]) -> Option<&'static str> {
    if head.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if head.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if head.len() >= 12 && head.starts_with(b"RIFF") && &head[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if head.len() >= 8 && &head[4..8] == b"ftyp" {
        return Some("video/mp4");
    }
    if head.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        return Some("video/webm");
    }
    None
}

fn extension(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "video/mp4" => "mp4",
        _ => "webm",
    }
}

fn is_sha(text: &str) -> bool {
    text.len() == 64 && text.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn too_big(bytes: u64) -> String {
    format!("the file is {} MB; a file on a board holds at most {} MB.", bytes.div_ceil(1024 * 1024), MAX_MEDIA_BYTES / 1024 / 1024)
}

const UNKNOWN: &str = "the file is not a PNG, JPEG, GIF, WebP, MP4 or WebM picture or video.";

/// Hashes `from` into `to`, at most MAX_MEDIA_BYTES, and says what it is. A file that is something
/// else, or grows past the cap while it is read, leaves nothing behind.
fn copy_hashed(mut from: impl Read, to: &Path) -> Result<(String, &'static str, u64), String> {
    let result = (|| {
        let mut out = fs::File::create(to).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1 << 20];
        let (mut total, mut mime) = (0u64, None);
        loop {
            let n = from.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            if total == 0 {
                mime = Some(sniff(&buffer[..n]).ok_or(UNKNOWN)?);
            }
            total += n as u64;
            if total > MAX_MEDIA_BYTES {
                return Err(too_big(total));
            }
            hasher.update(&buffer[..n]);
            out.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        }
        let mime = mime.ok_or("the file is empty.")?;
        out.sync_all().map_err(|e| e.to_string())?;
        Ok((format!("{:x}", hasher.finalize()), mime, total))
    })();
    if result.is_err() {
        let _ = fs::remove_file(to);
    }
    result
}

/// This process's own name for what it keeps apart from another Aphrodite on this Mac (0.3-R fix 3 #14, #15): its pid and a
/// random part, so a pid the system gives again never names it.
pub(crate) fn session() -> &'static str {
    static SESSION: OnceLock<String> = OnceLock::new();
    SESSION.get_or_init(|| format!("{}-{}", std::process::id(), &crate::agent::random_token()[..12]))
}

/// Moving a file into `board-media/` and letting go of a staged one take this lock, between the processes of this Mac too
/// (0.3-R fix 3 #15), so a file another one has taken since is never removed under it.
fn settling(base: &Path) -> Result<(std::sync::MutexGuard<'static, ()>, fs::File), String> {
    static IN_PROCESS: Mutex<()> = Mutex::new(());
    let guard = IN_PROCESS.lock().unwrap_or_else(|e| e.into_inner());
    let file = fs::OpenOptions::new().create(true).truncate(false).write(true).open(folder(base, MEDIA)?.join(".settle.lock")).map_err(|e| e.to_string())?;
    fs2::FileExt::lock_exclusive(&file).map_err(|e| e.to_string())?;
    Ok((guard, file))
}

/// Where a file an agent's batch was the first to bring is marked as staged, with the session that staged it (0.3-R fix 2 #20,
/// fix 3 #15). The same bytes coming in any other way, from any process, take the mark away, so the file stays.
fn mark(base: &Path, dest: &Path) -> Result<PathBuf, String> {
    Ok(base.join(UPLOADS).join("staged").join(dest.file_name().ok_or("no file name")?))
}

/// Moves a file that has come in into `board-media/` under its hash; one already there stays as it is. `stage` names the
/// session staging a file this move is the first to bring; a file already there loses any mark, whoever made it.
fn settle(base: &Path, incoming: &Path, sha: String, mime: &str, bytes: u64, stage: Option<&str>) -> Result<Stored, String> {
    let dest = folder(base, MEDIA)?.join(format!("{sha}.{}", extension(mime)));
    let _held = settling(base)?;
    if dest.exists() {
        let _ = fs::remove_file(incoming);
        let _ = fs::remove_file(mark(base, &dest)?);
    } else {
        fs::rename(incoming, &dest).map_err(|e| e.to_string())?;
        if let Some(session) = stage {
            let marked = mark(base, &dest)?;
            fs::create_dir_all(marked.parent().ok_or("no folder")?).and_then(|_| fs::write(&marked, session)).map_err(|e| e.to_string())?;
        }
    }
    Ok(Stored { sha, mime: mime.to_string(), bytes })
}

/// Lets go of the files a batch of `session` staged: kept when it landed, removed when it was refused. Only a file still
/// marked by that session is removed, under the lock every move takes, so a file anything else has brought in since stays.
pub(crate) fn release(base: &Path, shas: &[String], keep: bool, session: &str) {
    let Ok(_held) = settling(base) else { return };
    for sha in shas {
        let Some(path) = media_file(base, sha) else { continue };
        let Ok(marked) = mark(base, &path) else { continue };
        if fs::read_to_string(&marked).ok().as_deref() != Some(session) {
            continue;
        }
        let _ = fs::remove_file(&marked);
        if !keep {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Copies a file an agent names onto the board: a regular file, of a kind a board shows, within the cap.
/// A link is followed to the file it names, and that file is what is judged and read. No folder is kept
/// out (hidden or system ones included): only an agent running on this Mac may name a path (the row's
/// `reads` in src/agent/commands.mjs), and it can read this Mac's files already; what it gets here is
/// a copy of a picture or a video, never anything else.
pub(crate) fn store(base: &Path, from: &Path) -> Result<Stored, String> {
    store_as(base, from, None)
}

/// As `store`, for an agent's batch: a file it is the first to bring is staged until the batch lands or is refused.
pub(crate) fn store_staged(base: &Path, from: &Path, session: &str) -> Result<Stored, String> {
    store_as(base, from, Some(session))
}

fn store_as(base: &Path, from: &Path, stage: Option<&str>) -> Result<Stored, String> {
    let from = &fs::canonicalize(from).map_err(|_| format!("there is no file at {}.", from.display()))?;
    let meta = fs::metadata(from).map_err(|_| format!("there is no file at {}.", from.display()))?;
    if !meta.is_file() {
        return Err(format!("{} is not a file.", from.display()));
    }
    if meta.len() > MAX_MEDIA_BYTES {
        return Err(too_big(meta.len()));
    }
    let incoming = folder(base, UPLOADS)?.join(format!("{}.part", crate::agent::random_token()));
    let file = fs::File::open(from).map_err(|e| e.to_string())?;
    let (sha, mime, bytes) = copy_hashed(file, &incoming)?;
    settle(base, &incoming, sha, mime, bytes, stage)
}

fn upload_path(base: &Path, id: &str) -> Result<PathBuf, String> {
    if id.len() != 48 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("no such upload".into());
    }
    Ok(folder(base, UPLOADS)?.join(format!("{id}.part")))
}

/// A file the person drops arrives in pieces: begun, appended to, then finished under its hash.
pub(crate) fn begin(base: &Path) -> Result<String, String> {
    let id = crate::agent::random_token();
    fs::File::create(upload_path(base, &id)?).map_err(|e| e.to_string())?;
    Ok(id)
}

pub(crate) fn append(base: &Path, id: &str, piece: &[u8]) -> Result<u64, String> {
    let path = upload_path(base, id)?;
    let had = fs::metadata(&path).map_err(|_| "no such upload".to_string())?.len();
    let total = had + piece.len() as u64;
    if total > MAX_MEDIA_BYTES {
        let _ = fs::remove_file(&path);
        return Err(too_big(total));
    }
    let mut file = fs::OpenOptions::new().append(true).open(&path).map_err(|e| e.to_string())?;
    file.write_all(piece).map_err(|e| e.to_string())?;
    Ok(total)
}

pub(crate) fn finish(base: &Path, id: &str) -> Result<Stored, String> {
    let path = upload_path(base, id)?;
    let file = fs::File::open(&path).map_err(|_| "no such upload".to_string())?;
    let hashed = folder(base, UPLOADS)?.join(format!("{id}.hashed"));
    let result = copy_hashed(file, &hashed);
    let _ = fs::remove_file(&path);
    let (sha, mime, bytes) = result?;
    settle(base, &hashed, sha, mime, bytes, None)
}

/// Where a board's file is, when this Mac has it.
pub(crate) fn media_file(base: &Path, sha: &str) -> Option<PathBuf> {
    if !is_sha(sha) {
        return None;
    }
    EXTENSIONS.iter().map(|ext| base.join(MEDIA).join(format!("{sha}.{ext}"))).find(|p| p.is_file())
}

/// What a board's file is, by its name here: its kind and its size, without reading it.
pub(crate) fn media_stat(base: &Path, sha: &str) -> Option<Stored> {
    let path = media_file(base, sha)?;
    let mime = match path.extension()?.to_str()? {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        _ => "video/webm",
    };
    Some(Stored { sha: sha.to_string(), mime: mime.to_string(), bytes: fs::metadata(&path).ok()?.len() })
}

/// The folder this process's frames load their copies from, under `free-pages/` (0.3-R fix 3 #14): its own, so no other
/// Aphrodite on this Mac sweeps it, held by a lock for as long as this process runs. It is made under a name a reap passes
/// over and then given its own name, so no reap finds it unlocked.
pub(crate) fn own_frames(pages: &Path, session: &str) -> Result<(PathBuf, fs::File), String> {
    fs::create_dir_all(pages).map_err(|e| e.to_string())?;
    let making = pages.join(format!(".{session}.new"));
    fs::create_dir_all(&making).map_err(|e| e.to_string())?;
    let owner = fs::OpenOptions::new().create(true).truncate(false).write(true).open(making.join(".owner")).map_err(|e| e.to_string())?;
    fs2::FileExt::try_lock_exclusive(&owner).map_err(|e| e.to_string())?;
    let dir = pages.join(session);
    fs::rename(&making, &dir).map_err(|e| e.to_string())?;
    Ok((dir, owner))
}

/// Takes away the folders whose process has ended: one whose lock can be taken has no owner, whatever pid the system has given
/// since (the lock goes with the process, not with its number). A folder still being made, or one that cannot be asked, stays
/// until it has been left for PAGE_KEPT; a copy of the old single folder goes once no frame has used it for PAGE_KEPT.
pub(crate) fn reap(pages: &Path, own: &Path) {
    let Ok(entries) = fs::read_dir(pages) else { return };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if path == own {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let idle = meta.modified().ok().and_then(|at| now.duration_since(at).ok()).unwrap_or_default();
        if !meta.is_dir() {
            if idle > PAGE_KEPT {
                let _ = fs::remove_file(&path);
            }
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let ended = !name.starts_with('.')
            && fs::OpenOptions::new().write(true).open(path.join(".owner")).is_ok_and(|owner| fs2::FileExt::try_lock_exclusive(&owner).is_ok());
        if ended || idle > PAGE_KEPT && name.starts_with('.') {
            let _ = fs::remove_dir_all(&path);
        }
    }
}

/// This process's frames folder in `base`, made, locked and the ended ones reaped on first use.
fn frames(base: &Path) -> Result<PathBuf, String> {
    static FRAMES: Mutex<Vec<(PathBuf, PathBuf, fs::File)>> = Mutex::new(Vec::new());
    let mut known = FRAMES.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((_, dir, _)) = known.iter().find(|(b, _, _)| b == base) {
        return Ok(dir.clone());
    }
    let pages = folder(base, PAGES)?;
    let (dir, owner) = own_frames(&pages, session())?;
    reap(&pages, &dir);
    known.push((base.to_path_buf(), dir.clone(), owner));
    Ok(dir)
}

/// Writes the copy a frame loads (publish), as a write naming no frame that shows a copy: what the tests write.
#[cfg(test)]
pub(crate) fn write_page(base: &Path, page: &str, key: &str, html: &str) -> Result<PathBuf, String> {
    publish_in(&frames(base)?, page, key, html, &[], PAGES_BOUND)
}

/// Writes the copy a frame loads, in this process's own folder.
pub(crate) fn publish(base: &Path, page: &str, key: &str, html: &str, shown: &[String], bound: u64) -> Result<PathBuf, String> {
    publish_in(&frames(base)?, page, key, html, shown, bound)
}

/// Writes the copy a frame loads, named for this version of the page, through a temporary file of its own. A copy a frame
/// writes or opens again is made new. Then the folder is swept, every page id in it (0.3-R fix 2 #21): the copy just written
/// and every copy a frame in the window shows (`shown`, by file name) stay; another is cleared once no frame has written or
/// opened it for PAGE_KEPT (0.3-R), so a late write from a frame of an older version, on this board or another, never takes
/// away a copy a frame is opening; and past `bound` bytes the oldest of the rest not used within PAGE_FRESH go first. One
/// write and its sweep at a time (0.3-R fix 3 #14), so a copy found there is still there when it is made new.
pub(crate) fn publish_in(dir: &Path, page: &str, key: &str, html: &str, shown: &[String], bound: u64) -> Result<PathBuf, String> {
    static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());
    if page.is_empty() || page.len() > 200 || !page.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("invalid page id".into());
    }
    if key.is_empty() || key.len() > 40 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("invalid page key".into());
    }
    if html.len() > 8_000_000 {
        return Err("that page is too large to draw".into());
    }
    let _one = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
    let name = format!("{page}~{key}.html");
    let dest = dir.join(&name);
    let now = std::time::SystemTime::now();
    if dest.exists() {
        let _ = fs::File::options().append(true).open(&dest).and_then(|f| f.set_modified(now));
    } else {
        let temp = dir.join(format!(".{name}.{}.tmp", crate::agent::random_token()));
        if let Err(e) = fs::write(&temp, html).and_then(|_| fs::rename(&temp, &dest)) {
            let _ = fs::remove_file(&temp);
            return Err(e.to_string());
        }
    }
    sweep(dir, &name, shown, now, bound);
    Ok(dest)
}

fn sweep(dir: &Path, written: &str, shown: &[String], now: std::time::SystemTime, bound: u64) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let (mut total, mut rest) = (0u64, Vec::new());
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let other = entry.file_name().to_string_lossy().to_string();
        if other == ".owner" {
            continue;
        }
        let idle = meta.modified().ok().and_then(|at| now.duration_since(at).ok()).unwrap_or_default();
        if other == written || shown.iter().any(|s| *s == other) {
            total += meta.len();
            continue;
        }
        if idle > PAGE_KEPT {
            let _ = fs::remove_file(entry.path());
            continue;
        }
        total += meta.len();
        // Another write's temporary file, or a copy written a moment ago for a frame about to show it, is left to its own time.
        if idle > PAGE_FRESH && !other.starts_with('.') {
            rest.push((idle, meta.len(), entry.path()));
        }
    }
    rest.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, len, path) in rest {
        if total <= bound {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total -= len;
        }
    }
}

#[tauri::command]
pub fn board_media_begin(app: AppHandle) -> Result<String, String> {
    begin(&base(&app)?)
}

/// One piece of a dropped file, sent as raw bytes with the upload's id in a header.
#[tauri::command]
pub fn board_media_chunk(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<u64, String> {
    let id = request.headers().get("upload-id").and_then(|v| v.to_str().ok()).ok_or("no upload id")?.to_string();
    let tauri::ipc::InvokeBody::Raw(piece) = request.body() else { return Err("a piece is raw bytes".into()) };
    append(&base(&app)?, &id, piece)
}

#[tauri::command]
pub async fn board_media_finish(app: AppHandle, id: String) -> Result<Stored, String> {
    finish(&base(&app)?, &id)
}

/// An agent's media_add: a file on this Mac by its path, or a picture in the image library by its id. `stage` holds a file
/// it is the first to bring until the batch lands or is refused (board_media_release).
#[tauri::command]
pub async fn board_media_import(app: AppHandle, path: Option<String>, library_id: Option<String>, project: Option<String>, stage: Option<bool>) -> Result<Stored, String> {
    let from = match (path, library_id) {
        (Some(path), None) => {
            let path = PathBuf::from(path);
            if !path.is_absolute() {
                return Err("path is an absolute path to a file on this Mac.".into());
            }
            path
        }
        (None, Some(id)) => crate::image_library::library_file(&app, &id, project.as_deref()).ok_or(format!("no image {id} in the library; take an id from aphrodite_list_images."))?,
        _ => return Err("name the file with path, or a library picture with library_id, not both.".into()),
    };
    if stage.unwrap_or(false) {
        store_staged(&base(&app)?, &from, session())
    } else {
        store(&base(&app)?, &from)
    }
}

/// The files an agent's batch staged, kept when it landed and let go of when it was refused (0.3-R fix 2 #20).
#[tauri::command]
pub fn board_media_release(app: AppHandle, shas: Vec<String>, keep: bool) -> Result<(), String> {
    if shas.len() > 64 {
        return Err("a batch brings at most 64 files".into());
    }
    release(&base(&app)?, &shas, keep, session());
    Ok(())
}

#[tauri::command]
pub fn board_media_path(app: AppHandle, sha: String) -> Result<Option<String>, String> {
    Ok(media_file(&base(&app)?, &sha).map(|p| p.to_string_lossy().to_string()))
}

/// A board's file by its kind and size, for an export to be measured before anything is read.
#[tauri::command]
pub fn board_media_stat(app: AppHandle, sha: String) -> Result<Option<Stored>, String> {
    Ok(media_stat(&base(&app)?, &sha))
}

/// A board's file, whole, for a page or a board the person exports. Read off the command workers.
#[tauri::command]
pub async fn board_media_read(app: AppHandle, sha: String) -> Result<tauri::ipc::Response, String> {
    let path = media_file(&base(&app)?, &sha).ok_or("this board has no such file")?;
    let bytes = tauri::async_runtime::spawn_blocking(move || fs::read(path)).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// `shown`: the file names of the copies the window's frames show now, which a sweep never clears (0.3-R fix 2 #21).
#[tauri::command]
pub fn free_page_write(app: AppHandle, page: String, key: String, html: String, shown: Option<Vec<String>>) -> Result<String, String> {
    let shown = shown.unwrap_or_default();
    if shown.len() > 1024 {
        return Err("a window shows at most 1,024 frames".into());
    }
    Ok(publish(&base(&app)?, &page, &key, &html, &shown, PAGES_BOUND)?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

    #[test]
    fn a_board_shows_six_kinds_known_by_their_first_bytes() {
        assert_eq!(sniff(&PNG), Some("image/png"));
        assert_eq!(sniff(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(sniff(b"GIF89a.."), Some("image/gif"));
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff(b"\0\0\0\x20ftypisom"), Some("video/mp4"));
        assert_eq!(sniff(&[0x1a, 0x45, 0xdf, 0xa3, 1]), Some("video/webm"));
        assert_eq!(sniff(b"<html><script>"), None);
        assert_eq!(sniff(b""), None);
    }

    #[test]
    fn a_file_is_kept_under_the_hash_of_its_bytes_once() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("shot.png");
        fs::write(&src, [&PNG[..], b"rest of the picture"].concat()).unwrap();
        let first = store(dir.path(), &src).unwrap();
        assert_eq!(first.mime, "image/png");
        assert_eq!(first.sha, format!("{:x}", Sha256::digest([&PNG[..], b"rest of the picture"].concat())));
        assert_eq!(store(dir.path(), &src).unwrap(), first);
        let kept = media_file(dir.path(), &first.sha).unwrap();
        assert_eq!(kept, dir.path().join(MEDIA).join(format!("{}.png", first.sha)));
        assert_eq!(fs::read_dir(dir.path().join(UPLOADS)).unwrap().count(), 0, "nothing is left on its way in");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_judged_by_the_file_it_names() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.png");
        fs::write(&real, [&PNG[..], b"x"].concat()).unwrap();
        let link = dir.path().join("link.png");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert_eq!(store(dir.path(), &link).unwrap().sha, store(dir.path(), &real).unwrap().sha);
        let to_dir = dir.path().join("dir.png");
        std::os::unix::fs::symlink(dir.path(), &to_dir).unwrap();
        assert!(store(dir.path(), &to_dir).unwrap_err().contains("not a file"));
        let dangling = dir.path().join("gone.png");
        std::os::unix::fs::symlink(dir.path().join("nothing"), &dangling).unwrap();
        assert!(store(dir.path(), &dangling).unwrap_err().contains("no file"));
    }

    #[test]
    fn a_file_that_is_not_a_picture_or_a_video_leaves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("notes.png");
        fs::write(&src, b"#!/bin/sh\necho hi").unwrap();
        assert!(store(dir.path(), &src).unwrap_err().contains("not a PNG"));
        assert!(store(dir.path(), dir.path()).unwrap_err().contains("not a file"));
        assert!(store(dir.path(), &dir.path().join("missing.png")).unwrap_err().contains("no file"));
        assert_eq!(fs::read_dir(dir.path().join(UPLOADS)).unwrap().count(), 0);
        assert!(!dir.path().join(MEDIA).exists() || fs::read_dir(dir.path().join(MEDIA)).unwrap().count() == 0);
    }

    #[test]
    fn a_dropped_file_arrives_in_pieces_and_is_refused_past_the_cap_before_it_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let id = begin(dir.path()).unwrap();
        append(dir.path(), &id, &PNG).unwrap();
        append(dir.path(), &id, b"more").unwrap();
        let stored = finish(dir.path(), &id).unwrap();
        assert_eq!(stored.bytes, 12);
        assert!(media_file(dir.path(), &stored.sha).is_some());
        let big = begin(dir.path()).unwrap();
        let path = upload_path(dir.path(), &big).unwrap();
        fs::OpenOptions::new().write(true).open(&path).unwrap().set_len(MAX_MEDIA_BYTES - 2).unwrap();
        assert!(append(dir.path(), &big, b"abc").unwrap_err().contains("at most 500 MB"));
        assert!(!path.exists(), "the refused upload is gone");
        assert_eq!(append(dir.path(), "../../etc/passwd", b"x").unwrap_err(), "no such upload");
        assert!(finish(dir.path(), &"0".repeat(48)).is_err());
    }

    #[test]
    fn a_kept_file_is_told_by_its_kind_and_size_without_reading_it() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("a.png");
        let mut bytes = PNG.to_vec();
        bytes.extend_from_slice(&[7; 93]);
        fs::write(&from, &bytes).unwrap();
        let kept = store(dir.path(), &from).unwrap();
        assert_eq!(media_stat(dir.path(), &kept.sha), Some(Stored { sha: kept.sha.clone(), mime: "image/png".into(), bytes: 101 }));
        assert_eq!(media_stat(dir.path(), &"0".repeat(64)), None);
        assert_eq!(media_stat(dir.path(), "../a"), None);
    }

    #[test]
    fn only_a_whole_hash_names_a_file() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["../x", "", &"a".repeat(63), &"A".repeat(64), &format!("{}/", "a".repeat(63))] {
            assert_eq!(media_file(dir.path(), bad), None, "{bad}");
        }
    }

    /// 0.3-R ⑥ (Codex P3 Part B): a frame of an older version that finishes writing after the current one must not take the
    /// current one's copy away, on this board or another with the same page id. Only a copy no frame has written or
    /// opened for a while is cleared, and every frame that opens its copy writes it again, which makes it new.
    #[test]
    fn a_late_write_of_an_older_version_leaves_the_current_copy_and_only_a_copy_left_unused_is_cleared() {
        let dir = tempfile::tempdir().unwrap();
        let current = write_page(dir.path(), "page-1", "cd34", "<p>current</p>").unwrap();
        let stale = write_page(dir.path(), "page-1", "ab12", "<p>older, written late</p>").unwrap();
        assert!(current.exists(), "the current frame's copy is still there");
        assert!(stale.exists());
        let long_ago = std::time::SystemTime::now() - PAGE_KEPT - std::time::Duration::from_secs(60);
        fs::File::options().append(true).open(&stale).unwrap().set_modified(long_ago).unwrap();
        write_page(dir.path(), "page-1", "cd34", "<p>current</p>").unwrap();
        assert!(!stale.exists(), "a copy no frame has used for a while is cleared");
        fs::File::options().append(true).open(&current).unwrap().set_modified(long_ago).unwrap();
        write_page(dir.path(), "page-1", "cd34", "<p>current</p>").unwrap();
        write_page(dir.path(), "page-1", "ef56", "<p>next</p>").unwrap();
        assert!(current.exists(), "a frame opening its copy again makes it new, so it is not cleared under it");
    }

    #[test]
    fn a_page_copy_is_named_for_its_version_and_replaces_the_older_one() {
        let dir = tempfile::tempdir().unwrap();
        let one = write_page(dir.path(), "page-1", "ab12", "<p>one</p>").unwrap();
        fs::File::options().append(true).open(&one).unwrap().set_modified(std::time::SystemTime::now() - PAGE_KEPT - std::time::Duration::from_secs(60)).unwrap();
        let two = write_page(dir.path(), "page-1", "cd34", "<p>two</p>").unwrap();
        write_page(dir.path(), "page-10", "ef56", "<p>other</p>").unwrap();
        assert!(!one.exists());
        assert_eq!(fs::read_to_string(&two).unwrap(), "<p>two</p>");
        assert!(frames(dir.path()).unwrap().join("page-10~ef56.html").exists(), "another page's copy stays");
        for (page, key) in [("../x", "ab"), ("p", "../x"), ("", "ab"), ("p", "")] {
            assert!(write_page(dir.path(), page, key, "x").is_err(), "{page} {key}");
        }
    }
    /* 0.3-R fix 2 #20: an agent's batch stages the files it copies. Refused, it lets go of only the ones it was the first to
       bring and nothing has taken since; a file that was there already, or that anything else has put since, stays. */
    #[test]
    fn a_refused_batch_lets_go_only_of_the_files_it_was_first_to_bring() {
        let dir = tempfile::tempdir().unwrap();
        let file = |name: &str, rest: &[u8]| { let p = dir.path().join(name); fs::write(&p, [&PNG[..], rest].concat()).unwrap(); p };
        let (there, fresh, taken, kept) = (file("there.png", b"there"), file("fresh.png", b"fresh"), file("taken.png", b"taken"), file("kept.png", b"kept"));
        let there = { store(dir.path(), &there).unwrap(); store_staged(dir.path(), &there, "a").unwrap() };
        let fresh = store_staged(dir.path(), &fresh, "a").unwrap();
        let taken_path = taken.clone();
        let taken = store_staged(dir.path(), &taken, "a").unwrap();
        store(dir.path(), &taken_path).unwrap();
        let kept = store_staged(dir.path(), &kept, "a").unwrap();
        release(dir.path(), &[kept.sha.clone()], true, "a");
        release(dir.path(), &[there.sha.clone(), fresh.sha.clone(), taken.sha.clone(), kept.sha.clone()], false, "a");
        assert!(media_file(dir.path(), &there.sha).is_some(), "a file that was there already stays");
        assert!(media_file(dir.path(), &fresh.sha).is_none(), "the batch's own new file goes");
        assert!(media_file(dir.path(), &taken.sha).is_some(), "a file something else put since stays");
        assert!(media_file(dir.path(), &kept.sha).is_some(), "a file of a batch that landed stays");
    }
    /* 0.3-R fix 2 #21: a copy a frame in the window still shows is never cleared, however long it has been open; copies of
       every page id are swept, not only the one being written; the folder is held to a size, oldest first, never taking a
       shown one; and each write goes through a temporary file of its own. */
    #[test]
    fn a_shown_copy_stays_every_page_is_swept_and_the_folder_is_held_to_a_size() {
        let dir = tempfile::tempdir().unwrap();
        let long_ago = std::time::SystemTime::now() - PAGE_KEPT - std::time::Duration::from_secs(60);
        let age = |p: &Path, at: std::time::SystemTime| fs::File::options().append(true).open(p).unwrap().set_modified(at).unwrap();
        let open = write_page(dir.path(), "page-1", "ab12", "<p>open an hour</p>").unwrap();
        let gone = write_page(dir.path(), "page-2", "cd34", "<p>deleted page</p>").unwrap();
        age(&open, long_ago);
        age(&gone, long_ago);
        publish(dir.path(), "page-1", "ef56", "<p>another copy of the board</p>", &["page-1~ab12.html".to_string()], PAGES_BOUND).unwrap();
        assert!(open.exists(), "a copy a frame shows stays, however long it has been open");
        assert!(!gone.exists(), "a copy of a page id never written again is swept");
        let names = ["a1", "b2", "c3", "d4"].map(|k| { publish(dir.path(), "page-3", k, &"x".repeat(100), &["page-1~ab12.html".to_string()], PAGES_BOUND).unwrap() });
        for (i, p) in names.iter().enumerate() {
            age(p, std::time::SystemTime::now() - std::time::Duration::from_secs(400 - i as u64 * 100));
        }
        publish(dir.path(), "page-4", "e5", &"x".repeat(100), &["page-3~a1.html".to_string(), "page-1~ab12.html".to_string()], 450).unwrap();
        assert!(names[0].exists(), "the oldest is shown, so it stays");
        assert!(!names[1].exists() && !names[2].exists(), "the oldest not shown go until the folder fits");
        assert!(names[3].exists());
        let total: u64 = fs::read_dir(frames(dir.path()).unwrap()).unwrap().flatten().filter(|e| e.file_name() != ".owner").map(|e| e.metadata().unwrap().len()).sum();
        assert!(total <= 450, "{total}");
        fs::create_dir(frames(dir.path()).unwrap().join(".page-5~f6.html.tmp")).unwrap();
        assert!(write_page(dir.path(), "page-5", "f6", "<p>a temporary name of its own</p>").is_ok(), "a write does not share its temporary file");
    }
    /* 0.3-R fix 3 #15: a file one Aphrodite staged and another has since brought in, from its own process, is not removed when
       the first one's batch is refused; a session lets go only of what it marked itself. */
    #[test]
    fn a_file_another_process_took_stays_when_the_batch_that_staged_it_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let file = |name: &str, rest: &[u8]| { let p = dir.path().join(name); fs::write(&p, [&PNG[..], rest].concat()).unwrap(); p };
        let (shared, alone) = (file("shared.png", b"shared"), file("alone.png", b"alone"));
        let shared_path = shared.clone();
        let shared = store_staged(dir.path(), &shared, "a").unwrap();
        store(dir.path(), &shared_path).unwrap();
        release(dir.path(), &[shared.sha.clone()], false, "a");
        assert!(media_file(dir.path(), &shared.sha).is_some(), "the other one took it, so it stays");
        let alone = store_staged(dir.path(), &alone, "a").unwrap();
        release(dir.path(), &[alone.sha.clone()], false, "b");
        assert!(media_file(dir.path(), &alone.sha).is_some(), "another session's refusal does not touch it");
        release(dir.path(), &[alone.sha.clone()], false, "a");
        assert!(media_file(dir.path(), &alone.sha).is_none(), "its own refusal does");
    }

    /* 0.3-R fix 3 #14: each Aphrodite keeps the copies its frames load in a folder of its own, held by a lock for as long as
       it runs. Another one's write never sweeps it; a folder whose owner has ended goes at the next start, whatever pid the
       system has given since, since the lock goes with the process and not with its number. */
    #[test]
    fn each_process_sweeps_only_its_own_copies_and_a_folder_whose_owner_ended_goes() {
        let dir = tempfile::tempdir().unwrap();
        let pages = dir.path().join(PAGES);
        let long_ago = std::time::SystemTime::now() - PAGE_KEPT - std::time::Duration::from_secs(60);
        let (mine, _mine) = own_frames(&pages, "111-aaaa").unwrap();
        let (theirs, owner) = own_frames(&pages, "222-bbbb").unwrap();
        let open = publish_in(&theirs, "page-1", "ab12", "<p>theirs, open an hour</p>", &[], PAGES_BOUND).unwrap();
        fs::File::options().append(true).open(&open).unwrap().set_modified(long_ago).unwrap();
        publish_in(&mine, "page-2", "cd34", "<p>mine</p>", &[], PAGES_BOUND).unwrap();
        assert!(open.exists(), "another one's copy is never swept by this one's write");
        reap(&pages, &mine);
        assert!(open.exists(), "nor reaped while its owner runs");
        let (again, _again) = own_frames(&pages, "222-cccc").unwrap();
        drop(owner);
        reap(&pages, &again);
        assert!(!theirs.exists(), "a folder whose owner ended goes, though a process with the same pid runs");
        assert!(mine.exists() && again.exists());
    }
}
