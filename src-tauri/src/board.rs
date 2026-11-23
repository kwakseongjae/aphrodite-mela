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
use tauri::{AppHandle, Manager};

/// One file on a board holds at most this many bytes; past it, nothing is copied (src/free-page.ts holds the same number).
pub const MAX_MEDIA_BYTES: u64 = 500 * 1024 * 1024;
const MEDIA: &str = "board-media";
const PAGES: &str = "free-pages";
/// How long a page's copy is kept after a frame last wrote or opened it (write_page).
const PAGE_KEPT: std::time::Duration = std::time::Duration::from_secs(600);
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

/// Moves a file that has come in into `board-media/` under its hash; one already there stays as it is.
fn settle(base: &Path, incoming: &Path, sha: String, mime: &str, bytes: u64) -> Result<Stored, String> {
    let dest = folder(base, MEDIA)?.join(format!("{sha}.{}", extension(mime)));
    if dest.exists() {
        let _ = fs::remove_file(incoming);
    } else {
        fs::rename(incoming, &dest).map_err(|e| e.to_string())?;
    }
    Ok(Stored { sha, mime: mime.to_string(), bytes })
}

/// Copies a file an agent names onto the board: a regular file, of a kind a board shows, within the cap.
/// A link is followed to the file it names, and that file is what is judged and read. No folder is kept
/// out (hidden or system ones included): only an agent running on this Mac may name a path (the row's
/// `reads` in src/agent/commands.mjs), and it can read this Mac's files already; what it gets here is
/// a copy of a picture or a video, never anything else.
pub(crate) fn store(base: &Path, from: &Path) -> Result<Stored, String> {
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
    settle(base, &incoming, sha, mime, bytes)
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
    settle(base, &hashed, sha, mime, bytes)
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

/// Writes the copy a frame loads, named for this version of the page. A copy a frame writes or opens again is made new;
/// another version of the same page id is cleared only once no frame has written or opened it for PAGE_KEPT (0.3-R), so a
/// late write from a frame of an older version, on this board or another, never takes away the copy a frame is opening.
pub(crate) fn write_page(base: &Path, page: &str, key: &str, html: &str) -> Result<PathBuf, String> {
    if page.is_empty() || page.len() > 200 || !page.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("invalid page id".into());
    }
    if key.is_empty() || key.len() > 40 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("invalid page key".into());
    }
    if html.len() > 8_000_000 {
        return Err("that page is too large to draw".into());
    }
    let dir = folder(base, PAGES)?;
    let prefix = format!("{page}~");
    let name = format!("{prefix}{key}.html");
    let dest = dir.join(&name);
    let now = std::time::SystemTime::now();
    if dest.exists() {
        let _ = fs::File::options().append(true).open(&dest).and_then(|f| f.set_modified(now));
    } else {
        let temp = dir.join(format!(".{name}.tmp"));
        fs::write(&temp, html).map_err(|e| e.to_string())?;
        fs::rename(&temp, &dest).map_err(|e| e.to_string())?;
    }
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let other = entry.file_name().to_string_lossy().to_string();
            let unused = entry.metadata().and_then(|m| m.modified()).map(|at| now.duration_since(at).map(|d| d > PAGE_KEPT).unwrap_or(false)).unwrap_or(false);
            if other.starts_with(&prefix) && other != name && unused {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(dest)
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

/// An agent's media_add: a file on this Mac by its path, or a picture in the image library by its id.
#[tauri::command]
pub async fn board_media_import(app: AppHandle, path: Option<String>, library_id: Option<String>, project: Option<String>) -> Result<Stored, String> {
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
    store(&base(&app)?, &from)
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

#[tauri::command]
pub fn free_page_write(app: AppHandle, page: String, key: String, html: String) -> Result<String, String> {
    Ok(write_page(&base(&app)?, &page, &key, &html)?.to_string_lossy().to_string())
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
        assert!(dir.path().join(PAGES).join("page-10~ef56.html").exists(), "another page's copy stays");
        for (page, key) in [("../x", "ab"), ("p", "../x"), ("", "ab"), ("p", "")] {
            assert!(write_page(dir.path(), page, key, "x").is_err(), "{page} {key}");
        }
    }
}
