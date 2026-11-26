//! A path enters only from a native picker or an OS hand-over. IPC carries an expiring capability
//! and names relative to it. The directory handle, not a second lookup of its name, bounds each open.
use cap_std::fs::Dir;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use rustix::fs::{openat, Mode, OFlags};
use serde::Serialize;
use std::{collections::{BTreeSet, VecDeque}, fs, io::Read, path::{Component, Path, PathBuf}, sync::{Arc, Mutex}, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

type Code = &'static str;
const LIFETIME: Duration = Duration::from_secs(300);
// The board-file reader allows three UTF-8 bytes per UTF-16 unit. The page itself is checked after decoding.
const MAX_TEXT_BYTES: u64 = 3 * 2_000_000;

fn html_name(path: &Path) -> bool {
    path.extension().and_then(|s| s.to_str()).is_some_and(|s| s.eq_ignore_ascii_case("html") || s.eq_ignore_ascii_case("htm"))
}

fn token() -> Result<String, Code> {
    let mut bytes = [0u8; 24];
    fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes)).map_err(|_| "io")?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

#[derive(Clone, Serialize)]
pub struct Chosen { grant: String, names: Vec<String>, overflow: usize }

struct Budget { read: u64, copy: u64 }

struct Grant {
    dir: Dir,
    handed_path: PathBuf,
    budget: Mutex<Budget>,
}

fn io_code(error: std::io::Error) -> Code {
    if error.raw_os_error() == Some(libc::ELOOP) { return "symlink"; }
    match error.kind() {
        std::io::ErrorKind::NotFound => "missing",
        std::io::ErrorKind::PermissionDenied => "denied",
        _ => "io",
    }
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind { Document, Style, Script, Media }

impl Kind {
    fn accepts(self, path: &Path) -> bool {
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        match self {
            Self::Document => html_name(path),
            Self::Style => ext == "css",
            Self::Script => matches!(ext.as_str(), "js" | "mjs" | "cjs"),
            Self::Media => crate::board::media_extension(&ext),
        }
    }
}

fn open_root(path: &Path, expected: &fs::Metadata) -> Result<Dir, Code> {
    if expected.is_symlink() { return Err("symlink"); }
    let file = fs::OpenOptions::new().read(true).custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
        .open(path).map_err(io_code)?;
    let actual = file.metadata().map_err(io_code)?;
    if (actual.dev(), actual.ino()) != (expected.dev(), expected.ino()) { return Err("changed"); }
    Ok(Dir::from_std_file(file))
}

fn selected_in(parent: Dir, name: &std::ffi::OsStr) -> Result<(Dir, bool), Code> {
    use cap_std::fs::MetadataExt as CapMetadataExt;
    let selected = parent.symlink_metadata(name).map_err(io_code)?;
    if selected.is_symlink() { return Err("symlink"); }
    if selected.is_dir() {
        let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
        let child: fs::File = openat(&parent, name, flags, Mode::empty()).map_err(|e| io_code(e.into()))?.into();
        let actual = child.metadata().map_err(io_code)?;
        if (selected.dev(), selected.ino()) != (actual.dev(), actual.ino()) { return Err("changed"); }
        return Ok((Dir::from_std_file(child), true));
    }
    if name.as_encoded_bytes().starts_with(b".") { return Err("hidden"); }
    if !selected.is_file() || !html_name(Path::new(name)) { return Err("not_html"); }
    Ok((parent, false))
}

impl Grant {
    fn reader(&self, name: &str, kind: Kind, limit: u64) -> Result<(std::io::Take<fs::File>, u64), Code> {
        let media = matches!(kind, Kind::Media);
        let (file, size) = self.open_kind(name, kind, if media { crate::board::MAX_MEDIA_BYTES } else { MAX_TEXT_BYTES })?;
        let mut budget = self.budget.lock().unwrap();
        if size > budget.read { return Err("read_limit"); }
        if media && (size > budget.copy || size > limit) { return Err("copy_limit"); }
        if size > limit { return Err("read_limit"); }
        budget.read -= size;
        if media { budget.copy -= size; }
        Ok((file.take(size), size))
    }

    /// Inspect each link from the held directory. Even a broken link leading out is refused before
    /// looking up its target. cap-std repeats confinement on the final open in case names changed.
    fn resolve(&self, path: &Path) -> Result<PathBuf, Code> {
        let mut remaining: VecDeque<_> = path.iter().map(|s| s.to_owned()).collect();
        let mut relative = PathBuf::new();
        let mut links = 0;
        while let Some(part) = remaining.pop_front() {
            if part == "." { continue; }
            if part == ".." {
                if !relative.pop() { return Err("outside"); }
                continue;
            }
            if part.as_encoded_bytes().starts_with(b".") { return Err("hidden"); }
            relative.push(part);
            let meta = self.dir.symlink_metadata(&relative).map_err(io_code)?;
            if meta.is_symlink() {
                links += 1;
                if links > 40 { return Err("invalid_name"); }
                let link = self.dir.read_link_contents(&relative).map_err(io_code)?;
                relative.pop();
                let target = if link.is_absolute() {
                    relative.clear();
                    link.strip_prefix(&self.handed_path).map_err(|_| "outside")?
                } else { &link };
                for component in target.iter().rev() { remaining.push_front(component.to_owned()); }
            }
        }
        Ok(relative)
    }

    fn open_kind(&self, name: &str, kind: Kind, limit: u64) -> Result<(fs::File, u64), Code> {
        let path = Path::new(name);
        if name.is_empty() || name.contains(['\\', '\0']) || name.split('/').next().unwrap_or("").contains(':')
            || path.components().any(|part| !matches!(part, Component::Normal(_) | Component::CurDir)) {
            return Err("outside");
        }
        if name.split('/').any(|part| part.starts_with('.')) { return Err("hidden"); }
        if !kind.accepts(path) { return Err("unsupported"); }
        let relative = self.resolve(path)?;
        if !kind.accepts(&relative) { return Err("unsupported"); }
        let check = |regular: bool, len: u64| {
            if !regular { Err("not_file") } else if len > limit { Err("too_large") } else { Ok(()) }
        };
        // Walk the resolved names again with no-follow descriptors. A replacement link cannot
        // redirect the final open to another kind of file or a hidden member of this same grant.
        let mut dir = self.dir.try_clone().map_err(io_code)?.into_std_file();
        let flags = OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC | OFlags::NONBLOCK;
        let mut parts = relative.iter().peekable();
        let file = loop {
            let part = parts.next().ok_or("invalid_name")?;
            let mode = if parts.peek().is_some() { flags | OFlags::DIRECTORY } else { flags };
            let opened: fs::File = openat(&dir, part, mode, Mode::empty()).map_err(|e| io_code(e.into()))?.into();
            if parts.peek().is_none() { break opened; }
            dir = opened;
        };
        let meta = file.metadata().map_err(io_code)?;
        check(meta.is_file(), meta.len())?;
        Ok((file, meta.len()))
    }
}

struct Entry { chosen: Chosen, root: Arc<Grant>, until: Instant, waiting: bool }
#[derive(Default)]
struct Grants(VecDeque<Entry>);
impl Grants {
    fn give(&mut self, path: &Path, now: Instant, waiting: bool) -> Result<Chosen, Code> {
        if !path.is_absolute() { return Err("outside"); }
        let parent = path.parent().unwrap_or(path);
        let held = open_root(parent, &fs::symlink_metadata(parent).map_err(io_code)?)?;
        let (dir, directory) = match path.file_name() {
            Some(name) => selected_in(held, name)?,
            None if path == Path::new("/") => (held, true),
            None => return Err("invalid_name"),
        };
        let handed_path = if directory { path } else { parent }.to_owned();
        if waiting && handed_path.file_name().is_some_and(|n| n.as_encoded_bytes().starts_with(b".")) {
            return Err("hidden");
        }
        const MAX_DOCUMENTS: usize = 128;
        let mut overflow = 0;
        let names = if directory {
            let mut names = BTreeSet::new();
            for (index, entry) in dir.entries().map_err(io_code)?.enumerate() {
                if index == 4096 { return Err("folder_limit"); }
                let entry = entry.map_err(io_code)?;
                let name = entry.file_name();
                if !name.as_encoded_bytes().starts_with(b".") && html_name(Path::new(&name)) && !entry.file_type().map_err(io_code)?.is_dir() {
                    names.insert(name.into_string().map_err(|_| "invalid_name")?);
                    if names.len() > MAX_DOCUMENTS { names.pop_last(); overflow += 1; }
                }
            }
            names.into_iter().collect()
        } else {
            vec![path.file_name().and_then(|s| s.to_str()).ok_or("invalid_name")?.to_owned()]
        };
        let chosen = Chosen { grant: token()?, names, overflow };
        self.0.retain(|e| e.until > now);
        if self.0.len() >= 20 { self.0.pop_front(); }
        self.0.push_back(Entry { chosen: chosen.clone(), root: Arc::new(Grant {dir, handed_path, budget: Mutex::new(Budget {read: 128 << 20, copy: 100 << 20})}), until: now + LIFETIME, waiting });
        Ok(chosen)
    }

    fn get(&self, id: &str, now: Instant) -> Result<Arc<Grant>, Code> {
        let entry = self.0.iter().find(|e| e.chosen.grant == id).ok_or("invalid_grant")?;
        if now >= entry.until { return Err("expired_grant"); }
        Ok(entry.root.clone())
    }
}

pub struct ImportState { grants: Mutex<Grants>, shell: String }
impl ImportState {
    fn shell<R: tauri::Runtime>(&self, window: &WebviewWindow<R>, shell: &str) -> Result<(), Code> {
        if window.label() == "main" && shell == self.shell { Ok(()) } else { Err("person_only") }
    }
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let key = token().expect("native randomness");
    tauri::plugin::Builder::new("html-import")
        // Tauri installs js_init_script only in the main frame. A page, including a render's page,
        // receives neither the shell credential nor any grant through the frame message protocol.
        .js_init_script(format!("if(window===top)Object.defineProperty(window,'__APHRODITE_IMPORT__',{{value:'{key}'}});"))
        .setup(move |app, _| {
            app.manage(ImportState { grants: Mutex::default(), shell: key });
            if let Ok(base) = app.path().app_data_dir() {
                tauri::async_runtime::spawn_blocking(move || crate::board::sweep_imports(&base));
            }
            Ok(())
        })
        .build()
}

/// Called only by native event handlers. A hand-over waiting before the shell starts listening is kept.
pub fn hand_over(app: &AppHandle, path: &Path) -> bool {
    let state = app.state::<ImportState>();
    if state.grants.lock().unwrap().give(path, Instant::now(), true).is_ok() {
        let _ = app.emit_to("main", "aphrodite-html-opened", ());
        return true;
    }
    false
}

pub fn route_file(url: &tauri::Url, inspect: impl FnOnce(&Path) -> bool) -> bool {
    url.scheme() == "file" && url.to_file_path().is_ok_and(|path| inspect(&path))
}

#[tauri::command]
pub async fn html_import_pick(window: WebviewWindow, state: tauri::State<'_, ImportState>, shell: String, folder: bool) -> Result<Option<Chosen>, Code> {
    state.shell(&window, &shell)?;
    let dialog = window.app_handle().dialog().file().set_parent(&window);
    let path = tauri::async_runtime::spawn_blocking(move || {
        if folder { dialog.blocking_pick_folder() } else { dialog.blocking_pick_file() }
    }).await.map_err(|_| "io")?;
    path.map(|p| state.grants.lock().unwrap().give(&p.into_path().map_err(|_| "outside")?, Instant::now(), false)).transpose()
}

#[tauri::command]
pub fn html_import_take(window: WebviewWindow, state: tauri::State<'_, ImportState>, shell: String) -> Result<Vec<Chosen>, Code> {
    state.shell(&window, &shell)?;
    let mut grants = state.grants.lock().unwrap();
    grants.0.retain(|e| e.until > Instant::now());
    Ok(grants.0.iter_mut().filter_map(|e| std::mem::take(&mut e.waiting).then(|| e.chosen.clone())).collect())
}

fn read_text(file: impl Read) -> Result<Vec<u8>, Code> {
    let mut bytes = Vec::new();
    file.take(MAX_TEXT_BYTES + 1).read_to_end(&mut bytes).map_err(io_code)?;
    if bytes.len() as u64 > MAX_TEXT_BYTES { Err("too_large") } else { Ok(bytes) }
}

#[tauri::command]
pub async fn html_import_read(window: WebviewWindow, state: tauri::State<'_, ImportState>, shell: String, grant: String, name: String, kind: Kind, limit: u64) -> Result<tauri::ipc::Response, Code> {
    state.shell(&window, &shell)?;
    let dir = state.grants.lock().unwrap().get(&grant, Instant::now())?;
    if matches!(kind, Kind::Media) { return Err("unsupported"); }
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let (file, size) = dir.reader(&name, kind, limit)?;
        let bytes = read_text(file)?;
        if bytes.len() as u64 != size { return Err("changed"); }
        Ok(bytes)
    }).await.map_err(|_| "io")??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn html_import_media<R: tauri::Runtime>(window: WebviewWindow<R>, state: tauri::State<'_, ImportState>, shell: String, grant: String, name: String, limit: u64) -> Result<crate::board::ImportAsset, String> {
    state.shell(&window, &shell)?;
    let dir = state.grants.lock().unwrap().get(&grant, Instant::now())?;
    let base = window.path().app_data_dir().map_err(|_| "io")?;
    crate::disk::write(move || {
        let (file, size) = dir.reader(&name, Kind::Media, limit)?;
        crate::board::stage_page_asset(&base, file, size).map_err(String::from)
    }).await
}

/// Settle after the final fit, including when reading failed or the person switched boards.
#[tauri::command]
pub async fn html_import_finish(window: WebviewWindow, state: tauri::State<'_, ImportState>, shell: String, receipts: Vec<(String, bool)>) -> Result<(), String> {
    state.shell(&window, &shell)?;
    let base = window.path().app_data_dir().map_err(|_| "io")?;
    crate::disk::write(move || {
        crate::board::sweep_imports(&base);
        for (ticket, keep) in receipts { crate::board::finish_import(&base, &ticket, keep)?; }
        Ok(())
    }).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, fs, os::unix::fs::symlink};

    #[test]
    fn close_waits_for_an_accepted_html_sibling_copy() {
        use std::{future::Future, task::{Context, Waker}};
        use tauri::test::{mock_builder, mock_context, noop_assets};
        let _serial = crate::disk::TEST_SERIAL.lock().unwrap();
        let root = tempfile::tempdir().unwrap();
        let app_data = tempfile::tempdir().unwrap();
        fs::write(root.path().join("photo.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        let mut grants = Grants::default();
        let chosen = grants.give(root.path(), Instant::now(), false).unwrap();
        let grant = grants.get(&chosen.grant, Instant::now()).unwrap();
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = app_data.path().to_str().unwrap().into();
        let app = mock_builder().manage(ImportState {grants: Mutex::new(grants), shell: "test".into()}).build(context).unwrap();
        let web = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        tauri::async_runtime::block_on(async {
            let lock = grant.budget.lock().unwrap();
            let mut copy = Box::pin(html_import_media(web.clone(), app.state(), "test".into(), chosen.grant, "photo.png".into(), 64));
            assert!(copy.as_mut().poll(&mut Context::from_waker(Waker::noop())).is_pending());
            let closed = crate::disk::disk_begin_close(web.as_ref().window(), "test".into(), 50).await.unwrap();
            drop(lock);
            if closed { crate::disk::disk_end_close(web.as_ref().window(), "test".into()); }
            let copied = copy.await.unwrap();
            assert_eq!(copied.stored.bytes, 8);
            assert!(!closed, "an accepted import write still holds the window");
        });
    }

    #[test]
    fn a_file_under_a_symlinked_parent_is_refused_as_a_symlink() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("one.html"), "").unwrap();
        let alias = root.path().join("alias");
        symlink(root.path(), &alias).unwrap();
        let mut grants = Grants::default();
        assert_eq!(grants.give(&alias.join("one.html"), Instant::now(), true).err(), Some("symlink"));
        assert!(grants.0.is_empty());
    }

    #[test]
    fn an_os_handover_cannot_grant_a_hidden_root() {
        let root = tempfile::tempdir().unwrap();
        let hidden = root.path().join(".private");
        fs::create_dir(&hidden).unwrap();
        let file = hidden.join("one.html");
        fs::write(&file, "").unwrap();
        let mut grants = Grants::default();
        for path in [&hidden, &file] {
            assert_eq!(grants.give(path, Instant::now(), true).err(), Some("hidden"));
        }
        assert!(grants.0.is_empty());
    }

    #[test]
    fn bounded_enumeration_keeps_the_first_128_documents_and_counts_the_rest() {
        let root = tempfile::tempdir().unwrap();
        for i in (0..150).rev() { fs::write(root.path().join(format!("{i:03}.html")), "").unwrap(); }
        let chosen = Grants::default().give(root.path(), Instant::now(), false).unwrap();
        assert_eq!(chosen.names.len(), 128);
        assert_eq!(chosen.names.last().unwrap(), "127.html");
        assert_eq!(chosen.overflow, 22);
    }

    #[test]
    fn byte_budgets_refuse_at_the_file_handle_before_any_read_or_copy() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.html"), "12345").unwrap();
        fs::write(root.path().join("p.png"), "1234").unwrap();
        let mut grants = Grants::default();
        let chosen = grants.give(root.path(), Instant::now(), false).unwrap();
        let grant = grants.get(&chosen.grant, Instant::now()).unwrap();
        let (checked, size) = grant.open_kind("a.html", Kind::Document, 5).unwrap();
        fs::write(root.path().join("a.html"), "123456").unwrap();
        assert_eq!(std::io::copy(&mut checked.take(size), &mut std::io::sink()).unwrap(), 5);
        fs::write(root.path().join("a.html"), "12345").unwrap();
        *grant.budget.lock().unwrap() = Budget { read: 8, copy: 3 };
        assert!(matches!(grant.reader("p.png", Kind::Media, 9), Err("copy_limit")));
        assert!(matches!(grant.reader("a.html", Kind::Document, 4), Err("read_limit")));
        let (mut first, _) = grant.reader("a.html", Kind::Document, 5).unwrap();
        fs::write(root.path().join("a.html"), "123456").unwrap();
        assert_eq!(std::io::copy(&mut first, &mut std::io::sink()).unwrap(), 5);
        assert!(matches!(grant.reader("a.html", Kind::Document, 9), Err("read_limit")));
    }

    #[test]
    fn a_file_handover_classifies_the_selection_from_its_held_parent() {
        let temp = tempfile::tempdir().unwrap();
        let parent = temp.path().join("chosen");
        fs::create_dir(&parent).unwrap();
        fs::write(parent.join("one.html"), "first").unwrap();
        let held = open_root(&parent, &fs::metadata(&parent).unwrap()).unwrap();
        fs::rename(&parent, temp.path().join("original")).unwrap();
        fs::create_dir(&parent).unwrap();
        fs::create_dir(parent.join("one.html")).unwrap();
        let (root, is_folder) = selected_in(held, std::ffi::OsStr::new("one.html")).unwrap();
        assert!(!is_folder);
        assert_eq!(root.read("one.html").unwrap(), b"first");
    }

    #[test]
    fn a_handed_folder_link_and_a_substituted_directory_cannot_become_grants() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("folder");
        fs::create_dir(&dir).unwrap();
        let link = temp.path().join("alias");
        symlink(&dir, &link).unwrap();
        let mut grants = Grants::default();
        assert!(grants.give(&link, Instant::now(), true).is_err());
        let identity = fs::symlink_metadata(&dir).unwrap();
        fs::rename(&dir, temp.path().join("previous")).unwrap();
        fs::create_dir(&dir).unwrap();
        assert!(open_root(&dir, &identity).is_err());
        assert!(grants.0.is_empty());
    }

    #[test]
    fn hidden_names_and_files_of_the_wrong_kind_are_refused_even_through_links() {
        let temp = tempfile::tempdir().unwrap();
        for name in ["a.html", ".env", "notes.txt", "data.csv", ".inside.js"] {
            fs::write(temp.path().join(name), "test").unwrap();
        }
        symlink("notes.txt", temp.path().join("notes.js")).unwrap();
        symlink(".inside.js", temp.path().join("visible.js")).unwrap();
        let mut grants = Grants::default();
        let chosen = grants.give(temp.path(), Instant::now(), false).unwrap();
        let root = grants.get(&chosen.grant, Instant::now()).unwrap();
        for (name, kind) in [(".env", Kind::Script), ("notes.txt", Kind::Script), ("data.csv", Kind::Style),
            ("a.html", Kind::Media), ("notes.js", Kind::Script), ("visible.js", Kind::Script)] {
            assert!(root.open_kind(name, kind, MAX_TEXT_BYTES).is_err(), "{name}");
        }
    }

    #[test]
    fn non_file_links_make_zero_filesystem_calls_and_queue_zero_grants() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("one.html");
        fs::write(&file, "<p>one</p>").unwrap();
        let mut grants = Grants::default();
        let calls = Cell::new(0);
        for path in [file.as_path(), root.path()] {
            let url = tauri::Url::parse(&format!("aphrodite://{}", path.display())).unwrap();
            assert!(!route_file(&url, |path| {
                calls.set(calls.get() + 1);
                grants.give(path, Instant::now(), true).is_ok()
            }));
        }
        assert_eq!(calls.get(), 0);
        assert_eq!(grants.0.len(), 0);
    }

    #[test]
    fn only_a_live_grant_opens_a_regular_sibling_within_its_limit() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("chosen");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("index.html"), b"<p>inside").unwrap();
        fs::write(temp.path().join("outside.js"), b"outside").unwrap();
        symlink("../outside.js", root.join("away.js")).unwrap();
        symlink("../absent.js", root.join("absent.js")).unwrap();
        symlink(temp.path(), root.join("away")).unwrap();
        symlink(root.join("index.html"), root.join("inside.html")).unwrap();
        fs::File::create(root.join("big.js")).unwrap().set_len(MAX_TEXT_BYTES + 1).unwrap();
        let mut grants = Grants::default();
        let now = Instant::now();
        let chosen = grants.give(&root, now, false).unwrap();
        assert_eq!(chosen.names, ["index.html", "inside.html"]);
        let reads = Cell::new(0);
        let read = |id: &str, name: &str, at| -> Result<Vec<u8>, Code> {
            let grant = grants.get(id, at)?;
            let kind = if html_name(Path::new(name)) { Kind::Document } else { Kind::Script };
            let (f, _) = grant.open_kind(name, kind, MAX_TEXT_BYTES)?;
            reads.set(reads.get() + 1);
            read_text(f)
        };
        for (name, code) in [("../outside.js", "outside"), ("/outside.js", "outside"), ("file:///outside.js", "outside"),
            ("away.js", "outside"), ("absent.js", "outside"), ("away/outside.js", "outside"), ("missing.js", "missing"), ("big.js", "too_large")] {
            assert_eq!(read(&chosen.grant, name, now), Err(code), "{name}");
        }
        assert_eq!(read("made-up", "index.html", now), Err("invalid_grant"));
        assert_eq!(read(&chosen.grant, "index.html", now + LIFETIME), Err("expired_grant"));
        assert_eq!(reads.get(), 0);
        assert_eq!(read(&chosen.grant, "inside.html", now).unwrap(), b"<p>inside");
        assert_eq!(reads.get(), 1);
    }
}
