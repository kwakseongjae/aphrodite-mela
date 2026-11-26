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
use std::os::unix::fs::MetadataExt;
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
const BOARD_FILES: &[(&str, &str)] = &[
    ("png", "image/png"), ("jpg", "image/jpeg"), ("gif", "image/gif"), ("webp", "image/webp"),
    ("video.mp4", "video/mp4"), ("webm", "video/webm"), ("woff2", "font/woff2"), ("woff", "font/woff"),
    ("ttf", "font/ttf"), ("otf", "font/otf"), ("wav", "audio/wav"), ("ogg", "audio/ogg"), ("mp3.bin", "audio/mpeg"),
];

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
    if head.len() >= 8 && head[0] == 0 && &head[4..8] == b"ftyp" {
        return Some("video/mp4");
    }
    if head.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        return Some("video/webm");
    }
    None
}

fn page_asset(head: &[u8]) -> Option<&'static str> {
    if let Some(mime) = sniff(head) { return Some(mime); }
    for (magic, mime) in [
        (&b"wOF2"[..], "font/woff2"), (b"wOFF", "font/woff"), (b"OTTO", "font/otf"),
        (b"\0\x01\0\0", "font/ttf"), (b"OggS", "audio/ogg"), (b"ID3", "audio/mpeg"),
    ] {
        if head.starts_with(magic) { return Some(mime); }
    }
    if head.starts_with(b"RIFF") && head.get(8..12) == Some(b"WAVE") { return Some("audio/wav"); }
    if matches!(head, [0xff, 0xfb | 0xf3 | 0xf2, _, ..]) { return Some("audio/mpeg"); }
    None
}

pub(crate) fn media_extension(ext: &str) -> bool {
    matches!(ext, "jpeg" | "mp3" | "mp4") || BOARD_FILES.iter().any(|(e, _)| *e == ext)
}

fn extension(mime: &str) -> &'static str {
    BOARD_FILES.iter().find(|(_, kind)| *kind == mime).expect("recognized board file").0
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
fn copy_hashed(mut from: impl Read, to: &Path, identify: fn(&[u8]) -> Option<&'static str>) -> Result<(String, &'static str, u64), String> {
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
                mime = Some(identify(&buffer[..n]).ok_or(UNKNOWN)?);
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

/// Clears the marks a batch of `session` left on the files it staged, as the batch ends, under the lock every move takes. The
/// files stay, whether it landed or was refused (0.3-R fix 7 #1): a file placed in `board-media/` is never removed by the app,
/// since a saved board may name the same bytes by their hash.
pub(crate) fn release(base: &Path, shas: &[String], session: &str) {
    let Ok(_held) = settling(base) else { return };
    for sha in shas {
        let Some(path) = published_file(base, sha) else { continue };
        let Ok(marked) = mark(base, &path) else { continue };
        if fs::read_to_string(&marked).ok().as_deref() != Some(session) {
            continue;
        }
        let _ = fs::remove_file(&marked);
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
    let (sha, mime, bytes) = copy_hashed(file, &incoming, sniff)?;
    settle(base, &incoming, sha, mime, bytes, stage)
}

#[derive(Serialize)]
pub(crate) struct ImportAsset {
    #[serde(flatten)]
    pub stored: Stored,
    pub receipt: Option<String>,
}

/// Discard abandoned private names, including receipts whose other hard link was published.
pub(crate) fn sweep_imports(base: &Path) {
    const KEPT: std::time::Duration = std::time::Duration::from_secs(24 * 3600);
    let pending = base.join(UPLOADS).join("importing");
    if !pending.is_dir() { return; }
    let Ok(_held) = settling(base) else { return };
    let Ok(entries) = fs::read_dir(pending) else { return };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_file() && meta.modified().ok().and_then(|at| at.elapsed().ok()).is_some_and(|age| age >= KEPT) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

fn import_marker(base: &Path, dest: &Path) -> PathBuf {
    base.join(UPLOADS).join("importing").join(dest.file_name().expect("board media filename"))
}

fn remove_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Uncommitted files live in the private upload folder. A receipt links the bytes to one import.
pub(crate) fn stage_page_asset(base: &Path, from: impl Read, expected: u64) -> Result<ImportAsset, &'static str> {
    let pending = folder(&base.join(UPLOADS), "importing").map_err(|_| "io")?;
    let incoming = tempfile::NamedTempFile::new_in(pending).map_err(|_| "io")?.into_temp_path();
    let (sha, mime, bytes) = copy_hashed(from, &incoming, page_asset).map_err(|e| {
        if e == UNKNOWN { "unsupported" } else if e == "the file is empty." { "empty" }
        else if e.starts_with("the file is ") { "too_large" } else { "io" }
    })?;
    if bytes != expected { return Err("changed"); }
    let stored = Stored {sha, mime: mime.to_string(), bytes};
    let filename = format!("{}.{}", stored.sha, extension(mime));
    let dest = base.join(MEDIA).join(&filename);
    let marker = import_marker(base, &dest);
    let _held = settling(base).map_err(|_| "io")?;
    if dest.try_exists().map_err(|_| "io")? { return Ok(ImportAsset {stored, receipt: None}); }
    let new = !marker.try_exists().map_err(|_| "io")?;
    if new {
        fs::rename(&incoming, &marker).map_err(|_| "io")?;
    } else {
        // All outstanding receipts share the marker's modification time.
        fs::File::open(&marker).and_then(|f| f.set_modified(std::time::SystemTime::now())).map_err(|_| "io")?;
    }
    let ticket = format!("{}.{}", filename, crate::agent::random_token());
    if fs::hard_link(&marker, marker.with_file_name(&ticket)).is_err() {
        if new { let _ = fs::remove_file(&marker); }
        return Err("io");
    }
    Ok(ImportAsset {stored, receipt: Some(ticket)})
}

/// Under the settlement lock, publish by rename or release only private uploads.
pub(crate) fn finish_import(base: &Path, receipt: &str, keep: bool) -> Result<(), String> {
    let (filename, token) = receipt.rsplit_once('.').ok_or("invalid_name")?;
    let (sha, ext) = filename.split_once('.').ok_or("invalid_name")?;
    if !is_sha(sha) || !BOARD_FILES.iter().any(|(e, _)| *e == ext)
        || token.len() != 48 || !token.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("invalid_name".into()); }
    let dest = base.join(MEDIA).join(format!("{sha}.{ext}"));
    let marker = import_marker(base, &dest);
    let claim = marker.with_file_name(receipt);
    let _held = settling(base)?;
    if !claim.try_exists().map_err(|e| e.to_string())? {
        if keep && !dest.try_exists().map_err(|e| e.to_string())? { return Err("missing".into()); }
        return Ok(());
    }
    if marker.try_exists().map_err(|e| e.to_string())? {
        if keep && !dest.try_exists().map_err(|e| e.to_string())? {
            fs::rename(&marker, &dest).map_err(|e| e.to_string())?;
        } else if fs::metadata(&marker).map_err(|e| e.to_string())?.nlink() == 2 {
            remove_if_present(&marker)?;
        }
    }
    remove_if_present(&claim)
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
    let result = copy_hashed(file, &hashed, page_asset);
    let _ = fs::remove_file(&path);
    let (sha, mime, bytes) = result?;
    settle(base, &hashed, sha, mime, bytes, None)
}

/// Where a board's file is, when this Mac has it.
fn published_file(base: &Path, sha: &str) -> Option<PathBuf> {
    if !is_sha(sha) { return None; }
    BOARD_FILES.iter().map(|(ext, _)| base.join(MEDIA).join(format!("{sha}.{ext}"))).find(|p| p.is_file())
}

/// Readers can only look up files that have already been published.
pub(crate) fn media_file(base: &Path, sha: &str) -> Option<PathBuf> {
    if let Some(path) = published_file(base, sha) { return Some(path); }
    if !is_sha(sha) { return None; }
    let previous = [("mp4", "video/mp4"), ("mp3", "audio/mpeg")].map(|(ext, mime)|
        (base.join(MEDIA).join(format!("{sha}.{ext}")), mime));
    if !previous.iter().any(|(p, _)| p.is_file()) { return None; }
    let _held = settling(base).ok()?;
    if let Some(path) = published_file(base, sha) { return Some(path); }
    // Earlier versions stored these suffixes with broader signatures. Keep their paths for
    // existing readers, and link verified bytes under the suffix the current scope serves.
    for (path, mime) in previous {
        let Ok(file) = fs::File::open(&path) else { continue };
        let mut head = Vec::new();
        file.take(16).read_to_end(&mut head).ok()?;
        if page_asset(&head) == Some(mime) {
            let dest = base.join(MEDIA).join(format!("{sha}.{}", extension(mime)));
            fs::hard_link(path, &dest).ok()?;
            return Some(dest);
        }
    }
    None
}

/// What a board's file is, by its name here: its kind and its size, without reading it.
pub(crate) fn media_stat(base: &Path, sha: &str) -> Option<Stored> {
    let path = media_file(base, sha)?;
    let (_, ext) = path.file_name()?.to_str()?.split_once('.')?;
    let mime = BOARD_FILES.iter().find(|(e, _)| *e == ext)?.1;
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

/// Clears the marks of an agent's batch as it ends; its files stay (0.3-R fix 2 #20, fix 7 #1).
#[tauri::command]
pub fn board_media_release(app: AppHandle, shas: Vec<String>) -> Result<(), String> {
    if shas.len() > 64 {
        return Err("a batch brings at most 64 files".into());
    }
    release(&base(&app)?, &shas, session());
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
    #[test]
    fn refused_imports_release_only_their_own_uncommitted_copies() {
        let dir = tempfile::tempdir().unwrap();
        let stage = || stage_page_asset(dir.path(), &PNG[..], PNG.len() as u64).unwrap();
        let first = stage();
        let second = stage();
        let permanent = dir.path().join(MEDIA).join(format!("{}.png", first.stored.sha));
        assert!(!permanent.exists(), "unaccepted copies are private uploads");
        let file = || media_file(dir.path(), &first.stored.sha);
        finish_import(dir.path(), &first.receipt.unwrap(), false).unwrap();
        assert!(!permanent.exists(), "another import still holds its private copy");
        finish_import(dir.path(), &second.receipt.unwrap(), false).unwrap();
        assert!(file().is_none());
        let accepted = stage();
        let refused = stage();
        finish_import(dir.path(), &accepted.receipt.unwrap(), true).unwrap();
        finish_import(dir.path(), &refused.receipt.unwrap(), false).unwrap();
        assert!(file().is_some(), "the accepted copy stays");
        assert!(stage().receipt.is_none(), "a previously carried file needs no lease");

        let reading = tempfile::tempdir().unwrap();
        let staged = stage_page_asset(reading.path(), &PNG[..], PNG.len() as u64).unwrap();
        assert!(media_file(reading.path(), &staged.stored.sha).is_none());
        assert!(media_stat(reading.path(), &staged.stored.sha).is_none());
        finish_import(reading.path(), &staged.receipt.unwrap(), false).unwrap();
        assert!(media_file(reading.path(), &staged.stored.sha).is_none());

        let other = tempfile::tempdir().unwrap();
        let held = stage_page_asset(other.path(), &PNG[..], PNG.len() as u64).unwrap();
        let upload = begin(other.path()).unwrap();
        append(other.path(), &upload, &PNG).unwrap();
        finish(other.path(), &upload).unwrap();
        finish_import(other.path(), &held.receipt.unwrap(), false).unwrap();
        assert!(media_file(other.path(), &held.stored.sha).is_some(), "a received board claimed the copy");
    }

    #[test]
    fn an_interrupted_copy_is_already_in_the_private_sweep_directory_before_it_has_a_receipt() {
        struct Interrupted<'a>(&'a Path);
        impl Read for Interrupted<'_> {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                assert_eq!(fs::read_dir(self.0).unwrap().count(), 1, "in-flight temporary file");
                Err(std::io::Error::other("interrupted copy"))
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let pending = dir.path().join(UPLOADS).join("importing");
        assert_eq!(stage_page_asset(dir.path(), Interrupted(&pending), 8).err(), Some("io"));
    }

    #[test]
    fn sweeping_interrupted_imports_only_unlinks_old_private_copies_and_receipts() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path();
        let stage = |bytes: &[u8]| stage_page_asset(base, bytes, bytes.len() as u64).unwrap();
        let old = stage(&PNG);
        let pending = base.join(UPLOADS).join("importing");
        let ticket = old.receipt.unwrap();
        let old_receipt = pending.join(&ticket);
        let long_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(48 * 3600);
        let age = |p: &Path| fs::File::open(p).unwrap().set_modified(long_ago).unwrap();
        age(&old_receipt);
        let partial = pending.join(".unfinished");
        fs::write(&partial, b"partial").unwrap();
        age(&partial);
        let fresh = stage(b"GIF89a");
        let renewed = stage(b"GIF87a");
        age(&pending.join(renewed.receipt.unwrap()));
        let renewed = stage(b"GIF87a");
        let public = stage(b"ID3public");
        // A second receipt shares this inode even after the first is published.
        let abandoned = stage(b"ID3public");
        finish_import(base, &public.receipt.unwrap(), true).unwrap();
        let published = media_file(base, &public.stored.sha).unwrap();
        age(&published);

        sweep_imports(base);
        assert!(!pending.join(format!("{}.png", old.stored.sha)).exists());
        assert!(!partial.exists());
        assert!(!old_receipt.exists());
        assert_eq!(finish_import(base, &ticket, true).unwrap_err(), "missing");
        assert!(!pending.join(abandoned.receipt.unwrap()).exists());
        assert_eq!(fs::read(published).unwrap(), b"ID3public");
        for asset in [fresh, renewed] {
            assert!(media_file(base, &asset.stored.sha).is_none());
            finish_import(base, &asset.receipt.unwrap(), true).unwrap();
            assert!(media_file(base, &asset.stored.sha).is_some());
        }
    }

    #[test]
    fn previously_stored_mp4_and_mp3_files_enter_the_asset_scope_only_after_validation() {
        let dir = tempfile::tempdir().unwrap();
        let media = folder(dir.path(), MEDIA).unwrap();
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let scope = config["app"]["security"]["assetProtocol"]["scope"].as_array().unwrap();
        for (ext, valid, refused) in [
            ("mp4", &b"\0\0\0\x18ftypisom"[..], &b"testftypinvalid"[..]),
            ("mp3", &b"\xff\xf3sample"[..], &b"\xff\xe3invalid"[..]),
        ] {
            assert!(!scope.contains(&serde_json::json!(format!("$APPDATA/board-media/*.{ext}"))));
            for (content, recognized) in [(valid, true), (refused, false)] {
                let sha = format!("{:x}", Sha256::digest(content));
                let old = media.join(format!("{sha}.{ext}"));
                fs::write(&old, content).unwrap();
                let path = media_file(dir.path(), &sha);
                assert_eq!(path.is_some(), recognized);
                if let Some(path) = path {
                    assert_ne!(old, path);
                    assert_eq!(fs::metadata(old).unwrap().ino(), fs::metadata(path).unwrap().ino());
                }
            }
        }
    }

    #[test]
    fn all_four_mp3_heads_have_a_safe_actual_asset_response_and_keep_their_board_type() {
        use tauri::utils::mime_type::MimeType;
        let dir = tempfile::tempdir().unwrap();
        for head in [&b"ID3"[..], b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"] {
            let bytes = [head, b"<p>sample</p>"].concat();
            let held = stage_page_asset(dir.path(), bytes.as_slice(), bytes.len() as u64).unwrap();
            finish_import(dir.path(), &held.receipt.unwrap(), true).unwrap();
            let path = media_file(dir.path(), &held.stored.sha).unwrap();
            assert_ne!(MimeType::parse(&fs::read(&path).unwrap(), path.to_str().unwrap()), "text/html");
            assert_eq!(media_stat(dir.path(), &held.stored.sha).unwrap().mime, "audio/mpeg");
        }
    }

    #[test]
    fn stored_font_and_sound_signatures_cannot_be_served_as_html() {
        use tauri::utils::mime_type::MimeType;
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let scope = config["app"]["security"]["assetProtocol"]["scope"].as_array().unwrap();
        let mut covered = std::collections::BTreeSet::new();
        for (ext, heads) in [
            ("png", vec![&PNG[..]]), ("jpg", vec![&b"\xff\xd8\xff"[..]]),
            ("gif", vec![&b"GIF87a"[..], b"GIF89a"]), ("webp", vec![&b"RIFF0000WEBP"[..]]),
            ("video.mp4", vec![&b"\0\0\0\x20ftyp"[..]]), ("webm", vec![&b"\x1a\x45\xdf\xa3"[..]]),
            ("ogg", vec![&b"OggS"[..]]), ("wav", vec![&b"RIFF0000WAVE"[..]]),
            ("mp3.bin", vec![&b"ID3"[..], b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"\xff\xfa", b"\xff\xe3", b"\xff\xe2"]),
            ("woff", vec![&b"wOFFXXXX"[..], b"wOFFOTTO"]), ("woff2", vec![&b"wOF2font"[..]]),
            ("ttf", vec![&b"\0\x01\0\0"[..]]), ("otf", vec![&b"OTTO"[..]]),
        ] {
            covered.insert(ext);
            let served = scope.contains(&serde_json::json!(format!("$APPDATA/board-media/*.{ext}")));
            for head in heads {
                let bytes = [head, b"<p>sample</p>"].concat();
                let accepted = page_asset(&bytes);
                if BOARD_FILES.iter().any(|(e, mime)| *e == ext && mime.starts_with("font/")) {
                    assert!(!served);
                    assert!(accepted.is_some());
                } else {
                    assert!(served, "{ext} missing from scope");
                    let detected = MimeType::parse(&bytes, &format!("x.{ext}"));
                    if [b"\xff\xfa".as_slice(), b"\xff\xe3", b"\xff\xe2"].contains(&head) { assert!(accepted.is_none(), "{head:?}"); }
                    else { assert!(accepted.is_some()); assert_ne!(detected, "text/html", "{ext}"); }
                }
            }
        }
        assert_eq!(covered, BOARD_FILES.iter().map(|(ext, _)| *ext).collect());
        assert_eq!(scope.len(), BOARD_FILES.len() - 4 + 1);
        assert!(scope.contains(&serde_json::json!("$APPDATA/free-pages/**")));
    }

    #[test]
    fn a_font_can_be_held_by_hash_and_read_back() {
        let dir = tempfile::tempdir().unwrap();
        let first = stage_page_asset(dir.path(), &b"wOF2font"[..], 8).unwrap();
        finish_import(dir.path(), &first.receipt.unwrap(), true).unwrap();
        let one = first.stored;
        let two = stage_page_asset(dir.path(), &b"wOF2font"[..], 8).unwrap().stored;
        assert_eq!(one, two);
        assert_eq!(one.mime, "font/woff2");
        assert_eq!(media_stat(dir.path(), &one.sha), Some(one));
        assert!(sniff(b"wOF2font").is_none());
        assert_eq!(page_asset(b"\0\x01\0\0ftypisom"), Some("video/mp4"));
    }

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
    /* 0.3-R fix 2 #20, fix 7 #1: an agent's batch stages the files it copies and clears its marks as it ends; every file stays,
       one it was the first to bring included. */
    #[test]
    fn a_batch_that_ends_clears_its_marks_and_every_file_stays() {
        let dir = tempfile::tempdir().unwrap();
        let file = |name: &str, rest: &[u8]| { let p = dir.path().join(name); fs::write(&p, [&PNG[..], rest].concat()).unwrap(); p };
        let (there, fresh, taken, kept) = (file("there.png", b"there"), file("fresh.png", b"fresh"), file("taken.png", b"taken"), file("kept.png", b"kept"));
        let there = { store(dir.path(), &there).unwrap(); store_staged(dir.path(), &there, "a").unwrap() };
        let fresh = store_staged(dir.path(), &fresh, "a").unwrap();
        let taken_path = taken.clone();
        let taken = store_staged(dir.path(), &taken, "a").unwrap();
        store(dir.path(), &taken_path).unwrap();
        let kept = store_staged(dir.path(), &kept, "a").unwrap();
        release(dir.path(), &[kept.sha.clone()], "a");
        release(dir.path(), &[there.sha.clone(), fresh.sha.clone(), taken.sha.clone(), kept.sha.clone()], "a");
        assert!(media_file(dir.path(), &there.sha).is_some(), "a file that was there already stays");
        assert!(media_file(dir.path(), &fresh.sha).is_some(), "the batch's own new file stays too (0.3-R fix 7 #1)");
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
        release(dir.path(), &[shared.sha.clone()], "a");
        assert!(media_file(dir.path(), &shared.sha).is_some(), "the other one took it, so it stays");
        let alone = store_staged(dir.path(), &alone, "a").unwrap();
        release(dir.path(), &[alone.sha.clone()], "b");
        assert!(media_file(dir.path(), &alone.sha).is_some(), "another session's refusal does not touch it");
        release(dir.path(), &[alone.sha.clone()], "a");
        assert!(media_file(dir.path(), &alone.sha).is_some(), "nor does its own: a placed file stays (0.3-R fix 7 #1)");
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
    /* 0.3-R fix 7 #1: a saved board names a picture by its hash and came without its bytes; a batch brings those very bytes and
       is refused. The picture stays: a refused batch clears its marks, and no placed file is removed. */
    #[test]
    fn a_refused_batch_leaves_the_file_a_saved_board_names_by_its_hash() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("named.png");
        fs::write(&src, [&PNG[..], b"named by a saved board"].concat()).unwrap();
        let named = store_staged(dir.path(), &src, "a").unwrap();
        let kept = media_file(dir.path(), &named.sha).unwrap();
        assert!(mark(dir.path(), &kept).unwrap().exists());
        release(dir.path(), &[named.sha.clone()], "a");
        assert!(kept.exists(), "the picture stays");
        assert!(!mark(dir.path(), &kept).unwrap().exists(), "its mark is cleared");
    }
}
