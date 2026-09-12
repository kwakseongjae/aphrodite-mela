//! Local image library: a plain folder in the app data directory that the person — or their agent —
//! drops pictures into. Nothing is uploaded and nothing is fetched; the app only reads this folder.
//! Images are addressed by a hash of their bytes, so a project never stores a machine-specific path.
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 12 * 1024 * 1024;
const FOLDER: &str = "image-library";

#[derive(Serialize)]
pub struct LibraryImage {
    id: String,
    scope: String,
    name: String,
    bytes: u64,
    mime: String,
    width: u32,
    height: u32,
    modified: u64,
}

/// A project id is a scope, not a path: only these characters are allowed and they never nest.
fn safe_scope(scope: &str) -> Option<String> {
    if scope.is_empty() || scope.len() > 200 || !scope.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return None;
    }
    Some(scope.to_string())
}

fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(FOLDER);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Pictures shared by every project, or the ones kept with one project.
fn scope_dir(app: &AppHandle, project: Option<&str>) -> Result<PathBuf, String> {
    let base = library_dir(app)?;
    let dir = match project {
        None => base,
        Some(id) => base.join("projects").join(safe_scope(id).ok_or("invalid project id")?),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Reads one folder, ignoring subdirectories and anything that is not a renderable image.
fn scan(dir: &Path, scope: &str, seen: &mut Vec<String>, out: &mut Vec<LibraryImage>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        if let Some((mut image, _)) = read_entry(&path) {
            if seen.contains(&image.id) {
                continue;
            }
            seen.push(image.id.clone());
            image.scope = scope.to_string();
            out.push(image);
        }
    }
}

/// 64-bit FNV-1a over the whole file, rendered as 16 hex characters. Content addressing only,
/// never a security boundary: the bytes are already on this machine.
fn content_id(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Recognises the three formats the app renders, by magic bytes rather than by file extension.
fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

fn png_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 24 {
        return None;
    }
    Some((
        u32::from_be_bytes([b[16], b[17], b[18], b[19]]),
        u32::from_be_bytes([b[20], b[21], b[22], b[23]]),
    ))
}

fn jpeg_size(b: &[u8]) -> Option<(u32, u32)> {
    let mut i = 2usize;
    while i + 9 < b.len() {
        if b[i] != 0xff {
            i += 1;
            continue;
        }
        let marker = b[i + 1];
        // Start-of-frame markers carry the dimensions; skip the arithmetic-coded and restart ones.
        if (0xc0..=0xcf).contains(&marker) && !matches!(marker, 0xc4 | 0xc8 | 0xcc) {
            return Some((
                u16::from_be_bytes([b[i + 7], b[i + 8]]) as u32,
                u16::from_be_bytes([b[i + 5], b[i + 6]]) as u32,
            ));
        }
        let len = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
        if len < 2 {
            return None;
        }
        i += 2 + len;
    }
    None
}

fn webp_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 30 {
        return None;
    }
    match &b[12..16] {
        b"VP8X" => Some((
            (u32::from_le_bytes([b[24], b[25], b[26], 0]) & 0xff_ffff) + 1,
            (u32::from_le_bytes([b[27], b[28], b[29], 0]) & 0xff_ffff) + 1,
        )),
        b"VP8 " => Some((
            (u16::from_le_bytes([b[26], b[27]]) & 0x3fff) as u32,
            (u16::from_le_bytes([b[28], b[29]]) & 0x3fff) as u32,
        )),
        b"VP8L" => {
            let bits = u32::from_le_bytes([b[21], b[22], b[23], b[24]]);
            Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
        }
        _ => None,
    }
}

fn dimensions(mime: &str, bytes: &[u8]) -> (u32, u32) {
    let size = match mime {
        "image/png" => png_size(bytes),
        "image/jpeg" => jpeg_size(bytes),
        _ => webp_size(bytes),
    };
    size.unwrap_or((0, 0))
}

fn extension(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        _ => "webp",
    }
}

fn read_entry(path: &Path) -> Option<(LibraryImage, Vec<u8>)> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let mime = sniff(&bytes)?;
    let (width, height) = dimensions(mime, &bytes);
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some((
        LibraryImage {
            id: content_id(&bytes),
            scope: String::new(),
            name: path.file_name()?.to_string_lossy().to_string(),
            bytes: meta.len(),
            mime: mime.to_string(),
            width,
            height,
            modified,
        },
        bytes,
    ))
}

/// Lists the shared pictures and, when a project is named, that project's own.
#[tauri::command]
pub fn image_library_list(app: AppHandle, project: Option<String>) -> Result<Value, String> {
    let global = scope_dir(&app, None)?;
    let mut images: Vec<LibraryImage> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    if let Some(id) = project.as_deref() {
        let dir = scope_dir(&app, Some(id))?;
        scan(&dir, id, &mut seen, &mut images);
    }
    scan(&global, "global", &mut seen, &mut images);
    images.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.name.cmp(&b.name)));
    Ok(json!({"dir": global.to_string_lossy(), "images": images}))
}

/// Returns one picture's bytes as base64 so the webview can render it as a data URL.
#[tauri::command]
pub fn image_library_read(app: AppHandle, id: String, project: Option<String>) -> Result<Value, String> {
    for dir in scopes(&app, project.as_deref())? {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if let Some((image, bytes)) = read_entry(&entry.path()) {
                    if image.id == id {
                        return Ok(json!({"id": image.id, "mime": image.mime, "base64": base64_encode(&bytes)}));
                    }
                }
            }
        }
    }
    Err(format!("no image {id} in the library"))
}

/// The folders a lookup may touch: the project's own first, then the shared one.
fn scopes(app: &AppHandle, project: Option<&str>) -> Result<Vec<PathBuf>, String> {
    let mut dirs = Vec::new();
    if let Some(id) = project {
        dirs.push(scope_dir(app, Some(id))?);
    }
    dirs.push(scope_dir(app, None)?);
    Ok(dirs)
}

/// Writes bytes into the folder. Used by the file picker and by an agent that only has the channel.
#[tauri::command]
pub fn image_library_import(app: AppHandle, name: String, base64: String, project: Option<String>) -> Result<Value, String> {
    let bytes = base64_decode(&base64).ok_or("not valid base64")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("image is larger than 12 MB".into());
    }
    let mime = sniff(&bytes).ok_or("only PNG, JPEG and WebP are accepted")?;
    let id = content_id(&bytes);
    let dir = scope_dir(&app, project.as_deref())?;
    // The caller's name is a label, never a path: the file is named by its own hash.
    let stem: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect();
    let label = if stem.is_empty() { "image".to_string() } else { stem };
    let path = dir.join(format!("{label}-{id}.{}", extension(mime)));
    if !path.exists() {
        fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    }
    Ok(json!({"id": id, "mime": mime, "scope": project.unwrap_or_else(|| "global".into()), "name": path.file_name().map(|n| n.to_string_lossy().to_string())}))
}

/// Removes one picture from the library. The file is deleted; projects that used it show a gap.
#[tauri::command]
pub fn image_library_delete(app: AppHandle, id: String, project: Option<String>) -> Result<Value, String> {
    for dir in scopes(&app, project.as_deref())? {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some((image, _)) = read_entry(&path) {
                if image.id == id {
                    fs::remove_file(&path).map_err(|e| e.to_string())?;
                    return Ok(json!({"id": id, "removed": path.file_name().map(|n| n.to_string_lossy().to_string())}));
                }
            }
        }
    }
    Err(format!("no image {id} in the library"))
}

/// Opens the folder in Finder so a person can drop files in directly.
#[tauri::command]
pub fn image_library_reveal(app: AppHandle, project: Option<String>) -> Result<String, String> {
    let dir = scope_dir(&app, project.as_deref())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

fn base64_decode(text: &str) -> Option<Vec<u8>> {
    let mut buf = 0u32;
    let mut bits = 0u32;
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    for c in text.bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' {
            continue;
        }
        let v = B64.iter().position(|x| *x == c)? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut b = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        b.extend_from_slice(&[0, 0, 0, 13]);
        b.extend_from_slice(b"IHDR");
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&h.to_be_bytes());
        b
    }

    #[test]
    fn sniffs_only_the_three_supported_formats() {
        assert_eq!(sniff(&png(1, 1)), Some("image/png"));
        assert_eq!(sniff(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[0, 0, 0, 0]);
        webp.extend_from_slice(b"WEBP");
        assert_eq!(sniff(&webp), Some("image/webp"));
        assert_eq!(sniff(b"GIF89a......"), None);
        assert_eq!(sniff(b"<svg/>"), None);
        assert_eq!(sniff(b""), None);
    }

    #[test]
    fn reads_png_dimensions() {
        assert_eq!(dimensions("image/png", &png(1600, 900)), (1600, 900));
        assert_eq!(dimensions("image/png", &[0x89, b'P']), (0, 0));
    }

    #[test]
    fn reads_jpeg_dimensions_from_the_frame_header() {
        // SOI, then an APP0 segment to skip, then SOF0 carrying 480x640.
        let mut b = vec![0xff, 0xd8];
        b.extend_from_slice(&[0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
        b.extend_from_slice(&[0xff, 0xc0, 0x00, 0x11, 0x08]);
        b.extend_from_slice(&480u16.to_be_bytes());
        b.extend_from_slice(&640u16.to_be_bytes());
        b.extend_from_slice(&[0; 8]);
        assert_eq!(dimensions("image/jpeg", &b), (640, 480));
    }

    #[test]
    fn content_id_follows_the_bytes_not_the_name() {
        let a = content_id(b"one");
        assert_eq!(a, content_id(b"one"), "same bytes, same id");
        assert_ne!(a, content_id(b"two"));
        assert_eq!(a.len(), 16);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn base64_round_trips_including_padding() {
        for case in [&b""[..], b"a", b"ab", b"abc", b"abcd", &[0u8, 255, 128, 7][..]] {
            let encoded = base64_encode(case);
            assert_eq!(base64_decode(&encoded).as_deref(), Some(case), "{encoded}");
        }
        assert_eq!(base64_decode("!!!!"), None);
    }

    #[test]
    fn scope_names_cannot_escape_the_folder() {
        assert_eq!(safe_scope("abc-123_XYZ").as_deref(), Some("abc-123_XYZ"));
        for bad in ["", "../etc", "a/b", "a b", "a.b", "~", &"x".repeat(201)] {
            assert_eq!(safe_scope(bad), None, "{bad}");
        }
    }

    #[test]
    fn extensions_match_the_mime() {
        assert_eq!(extension("image/png"), "png");
        assert_eq!(extension("image/jpeg"), "jpg");
        assert_eq!(extension("image/webp"), "webp");
    }
}
