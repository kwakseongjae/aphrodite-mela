//! Local fonts. Reading: the families already installed on this Mac, so a project can be set in a
//! typeface the person owns. Writing: copying a freely licensed font file into the user's own
//! font folder — never a system folder, never with elevated rights.
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_FONT_BYTES: u64 = 24 * 1024 * 1024;

#[derive(Serialize)]
pub struct InstalledFont {
    family: String,
    installed_here: bool,
}

fn user_font_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Library").join("Fonts"))
}

fn font_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/System/Library/Fonts"),
        PathBuf::from("/Library/Fonts"),
    ];
    if let Some(dir) = user_font_dir() {
        dirs.push(dir);
    }
    dirs
}

fn be16(b: &[u8], at: usize) -> u16 {
    u16::from_be_bytes([b[at], b[at + 1]])
}
fn be32(b: &[u8], at: usize) -> u32 {
    u32::from_be_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

/// Pulls family names out of a font's `name` table. Handles the Mac Roman and the UTF-16BE
/// encodings the platform actually ships, and both name id 1 (family) and 16 (typographic family).
fn families_in_font(bytes: &[u8], offset: usize, into: &mut BTreeSet<String>) {
    if bytes.len() < offset + 12 {
        return;
    }
    let tables = be16(bytes, offset + 4) as usize;
    let mut name_table = None;
    for i in 0..tables {
        let rec = offset + 12 + i * 16;
        if bytes.len() < rec + 16 {
            return;
        }
        if &bytes[rec..rec + 4] == b"name" {
            name_table = Some(be32(bytes, rec + 8) as usize);
            break;
        }
    }
    let Some(name) = name_table else { return };
    if bytes.len() < name + 6 {
        return;
    }
    let count = be16(bytes, name + 2) as usize;
    let storage = name + be16(bytes, name + 4) as usize;
    for i in 0..count {
        let rec = name + 6 + i * 12;
        if bytes.len() < rec + 12 {
            return;
        }
        let platform = be16(bytes, rec);
        let name_id = be16(bytes, rec + 6);
        if name_id != 1 && name_id != 16 {
            continue;
        }
        let len = be16(bytes, rec + 8) as usize;
        let at = storage + be16(bytes, rec + 10) as usize;
        if len == 0 || bytes.len() < at + len {
            continue;
        }
        let raw = &bytes[at..at + len];
        let text = if platform == 1 {
            raw.iter().map(|b| *b as char).collect::<String>()
        } else {
            let units: Vec<u16> = raw.chunks(2).filter(|c| c.len() == 2).map(|c| be16(c, 0)).collect();
            String::from_utf16_lossy(&units)
        };
        let text = text.trim().trim_matches('\u{0}').trim().to_string();
        if !text.is_empty() && text.len() <= 60 && !text.starts_with('.') {
            into.insert(text);
        }
    }
}

fn read_families(path: &Path, into: &mut BTreeSet<String>) {
    let Ok(meta) = fs::metadata(path) else { return };
    if !meta.is_file() || meta.len() > MAX_FONT_BYTES {
        return;
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "otc") {
        return;
    }
    let Ok(bytes) = fs::read(path) else { return };
    if bytes.len() < 12 {
        return;
    }
    if &bytes[0..4] == b"ttcf" {
        // A collection: each member font has its own table directory.
        let members = be32(&bytes, 8) as usize;
        for i in 0..members.min(64) {
            let at = 12 + i * 4;
            if bytes.len() < at + 4 {
                break;
            }
            let offset = be32(&bytes, at) as usize;
            families_in_font(&bytes, offset, into);
        }
    } else {
        families_in_font(&bytes, 0, into);
    }
}

/// Every family this Mac can render, with a flag for the ones in the user's own folder.
#[tauri::command]
pub fn fonts_installed() -> Result<Value, String> {
    let mut shared: BTreeSet<String> = BTreeSet::new();
    let mut mine: BTreeSet<String> = BTreeSet::new();
    let user_dir = user_font_dir();
    for dir in font_dirs() {
        let is_user = Some(&dir) == user_dir.as_ref();
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            read_families(&entry.path(), if is_user { &mut mine } else { &mut shared });
        }
    }
    let mut fonts: Vec<InstalledFont> = Vec::new();
    for family in mine.iter() {
        fonts.push(InstalledFont { family: family.clone(), installed_here: true });
    }
    for family in shared.iter() {
        if !mine.contains(family) {
            fonts.push(InstalledFont { family: family.clone(), installed_here: false });
        }
    }
    fonts.sort_by(|a, b| a.family.to_lowercase().cmp(&b.family.to_lowercase()));
    Ok(json!({"dir": user_dir.map(|d| d.to_string_lossy().to_string()).unwrap_or_default(), "fonts": fonts}))
}

/// True when this family is already available, so the app can hide an install button.
#[tauri::command]
pub fn fonts_has_family(family: String) -> Result<bool, String> {
    let wanted = family.trim().to_lowercase();
    let listing = fonts_installed()?;
    Ok(listing["fonts"]
        .as_array()
        .map(|all| all.iter().any(|f| f["family"].as_str().map(|s| s.to_lowercase()) == Some(wanted.clone())))
        .unwrap_or(false))
}

/// Downloads one font file and writes it into the user's font folder. The caller has already shown
/// the licence; this only accepts https, a known font extension, and a real font header.
#[tauri::command]
pub fn fonts_install(url: String, family: String, file_name: String) -> Result<Value, String> {
    if !url.starts_with("https://") {
        return Err("fonts install only over https".into());
    }
    let safe_name: String = file_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .take(80)
        .collect();
    let ext = safe_name.rsplit('.').next().unwrap_or("").to_lowercase();
    if !matches!(ext.as_str(), "ttf" | "otf") || safe_name.starts_with('.') || safe_name.contains("..") {
        return Err("expected a .ttf or .otf file name".into());
    }
    let dir = user_font_dir().ok_or("no home directory")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(&safe_name);
    if target.exists() {
        return Ok(json!({"family": family, "path": target.to_string_lossy(), "alreadyThere": true}));
    }
    let bytes = fetch(&url)?;
    if bytes.len() as u64 > MAX_FONT_BYTES {
        return Err("font file is larger than 24 MB".into());
    }
    if !looks_like_font(&bytes) {
        return Err("that download is not a TrueType or OpenType font".into());
    }
    fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    Ok(json!({"family": family, "path": target.to_string_lossy(), "bytes": bytes.len(), "alreadyThere": false}))
}

/// Removes a font this app installed. Only files inside the user's own folder are touched.
#[tauri::command]
pub fn fonts_uninstall(file_name: String) -> Result<Value, String> {
    let dir = user_font_dir().ok_or("no home directory")?;
    let safe_name: String = file_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .take(80)
        .collect();
    if safe_name.is_empty() || safe_name.contains("..") {
        return Err("bad file name".into());
    }
    let target = dir.join(&safe_name);
    if !target.exists() {
        return Err("that font is not in your font folder".into());
    }
    fs::remove_file(&target).map_err(|e| e.to_string())?;
    Ok(json!({"removed": safe_name}))
}

fn looks_like_font(b: &[u8]) -> bool {
    b.len() >= 12
        && (b.starts_with(&[0x00, 0x01, 0x00, 0x00]) // TrueType
            || b.starts_with(b"OTTO")               // CFF OpenType
            || b.starts_with(b"true")
            || b.starts_with(b"ttcf"))
}

/// A deliberately small HTTPS GET: the app never talks to the network from the webview, and this is
/// the only outbound call it makes, on an explicit click, to a URL from the built-in catalogue.
fn fetch(url: &str) -> Result<Vec<u8>, String> {
    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(60))
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let mut bytes: Vec<u8> = Vec::new();
    response
        .into_reader()
        .take(MAX_FONT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal TrueType file carrying a `name` table with one family entry.
    fn font_with_family(family: &str) -> Vec<u8> {
        let utf16: Vec<u8> = family.encode_utf16().flat_map(|u| u.to_be_bytes()).collect();
        let name_table = {
            let mut t = Vec::new();
            t.extend_from_slice(&0u16.to_be_bytes()); // format
            t.extend_from_slice(&1u16.to_be_bytes()); // count
            t.extend_from_slice(&18u16.to_be_bytes()); // storage offset
            t.extend_from_slice(&3u16.to_be_bytes()); // platform: windows
            t.extend_from_slice(&1u16.to_be_bytes()); // encoding
            t.extend_from_slice(&0x0409u16.to_be_bytes()); // language
            t.extend_from_slice(&1u16.to_be_bytes()); // name id: family
            t.extend_from_slice(&(utf16.len() as u16).to_be_bytes());
            t.extend_from_slice(&0u16.to_be_bytes()); // string offset
            t.extend_from_slice(&utf16);
            t
        };
        let mut f = Vec::new();
        f.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]);
        f.extend_from_slice(&1u16.to_be_bytes()); // one table
        f.extend_from_slice(&[0; 6]);
        f.extend_from_slice(b"name");
        f.extend_from_slice(&0u32.to_be_bytes()); // checksum
        f.extend_from_slice(&28u32.to_be_bytes()); // offset
        f.extend_from_slice(&(name_table.len() as u32).to_be_bytes());
        f.extend_from_slice(&name_table);
        f
    }

    #[test]
    fn reads_a_family_name_from_a_name_table() {
        let mut found = BTreeSet::new();
        families_in_font(&font_with_family("Gowun Dodum"), 0, &mut found);
        assert!(found.contains("Gowun Dodum"), "{found:?}");
    }

    #[test]
    fn reads_a_hangul_family_name() {
        let mut found = BTreeSet::new();
        families_in_font(&font_with_family("나눔명조"), 0, &mut found);
        assert!(found.contains("나눔명조"), "{found:?}");
    }

    #[test]
    fn truncated_and_junk_files_are_ignored_rather_than_panicking() {
        let full = font_with_family("Inter");
        for cut in [0, 4, 11, 20, 30, full.len() - 1] {
            let mut found = BTreeSet::new();
            families_in_font(&full[..cut.min(full.len())], 0, &mut found);
        }
        let mut found = BTreeSet::new();
        families_in_font(b"not a font at all", 0, &mut found);
        assert!(found.is_empty());
    }

    #[test]
    fn only_real_font_headers_are_accepted() {
        assert!(looks_like_font(&font_with_family("Inter")));
        assert!(looks_like_font(b"OTTO________"));
        assert!(!looks_like_font(b"<!DOCTYPE html><html>"));
        assert!(!looks_like_font(b"PK\x03\x04______"));
        assert!(!looks_like_font(b""));
    }
}
