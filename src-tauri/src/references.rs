//! The reference archive: what was looked at, kept where it can be read.
//!
//! Until now a project held exactly one reference — a single image, consumed by the analysis and
//! then gone. Everything else a person or an agent looked at vanished. This keeps them: an index of
//! entries beside a folder of bytes, addressed by content the way the image library is, in the same
//! two scopes (shared by every project, or kept with one).
//!
//! **What an entry says is data, not instruction.** Titles, notes and tags may be written by an
//! agent or lifted off a page, so anything reading this archive treats the text as material to look
//! at, never as a command to follow. The tool descriptions say so too.
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::image_library::{base64_decode, base64_encode, content_id, extension, safe_scope, sniff};

const FOLDER: &str = "references";
const INDEX: &str = "index.json";
/// A poster is a thumbnail, not an archive of the page. Anything larger is refused rather than
/// silently shrunk, so nobody discovers later that their picture was replaced.
const MAX_POSTER_BYTES: usize = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 2000;
const MAX_TITLE: usize = 300;
const MAX_NOTE: usize = 4000;
const MAX_URL: usize = 2000;
const MAX_TAGS: usize = 12;
const MAX_TAG: usize = 40;

fn archive_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(FOLDER);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The shared archive, or the one kept with a single project.
fn scope_dir(app: &AppHandle, project: Option<&str>) -> Result<PathBuf, String> {
    let base = archive_dir(app)?;
    let dir = match project {
        None => base,
        Some(id) => base.join("projects").join(safe_scope(id).ok_or("invalid project id")?),
    };
    fs::create_dir_all(dir.join("blobs")).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Both scopes, nearest first, so a project's own entry wins over a shared one with the same id.
fn scopes(app: &AppHandle, project: Option<&str>) -> Result<Vec<(String, PathBuf)>, String> {
    let mut out = Vec::new();
    if let Some(id) = project {
        out.push(("project".to_string(), scope_dir(app, Some(id))?));
    }
    out.push(("shared".to_string(), scope_dir(app, None)?));
    Ok(out)
}

/// A missing or unreadable index is an empty archive, never an error: the folder is the person's
/// and they may have emptied it by hand.
fn read_index(dir: &Path) -> Vec<Value> {
    let Ok(text) = fs::read_to_string(dir.join(INDEX)) else { return Vec::new() };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Array(items)) => items,
        Ok(Value::Object(map)) => map.get("entries").and_then(Value::as_array).cloned().unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn write_index(dir: &Path, entries: &[Value]) -> Result<(), String> {
    let body = serde_json::to_string_pretty(&json!({"schema": "aphrodite.references/1", "entries": entries}))
        .map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(body.as_bytes()).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(dir.join(INDEX)).map_err(|e| e.to_string())?;
    Ok(())
}

fn clamp(value: Option<&Value>, limit: usize) -> String {
    value.and_then(Value::as_str).unwrap_or("").chars().take(limit).collect()
}

/// Only addresses a person could have opened in a browser. `javascript:` and `file:` are the two
/// that turn a saved link into something else entirely.
pub(crate) fn safe_url(url: &str) -> bool {
    url.len() <= MAX_URL && (url.starts_with("https://") || url.starts_with("http://"))
}

pub(crate) fn clean_tags(value: Option<&Value>) -> Vec<String> {
    let Some(list) = value.and_then(Value::as_array) else { return Vec::new() };
    let mut out = Vec::new();
    for tag in list.iter().take(MAX_TAGS) {
        let text: String = tag.as_str().unwrap_or("").trim().chars().take(MAX_TAG).collect();
        if !text.is_empty() && !out.contains(&text) {
            out.push(text);
        }
    }
    out
}

/// Four kinds, and anything else is a note — an unknown kind must not become a path or a tag.
pub(crate) fn clean_kind(kind: &str) -> &'static str {
    match kind {
        "image" => "image",
        "link" => "link",
        "video" => "video",
        _ => "note",
    }
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // A plain UTC stamp, computed here rather than pulled in as a dependency.
    let days = secs / 86_400;
    let (mut y, mut d) = (1970i64, days as i64);
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        let len = if leap { 366 } else { 365 };
        if d < len {
            break;
        }
        d -= len;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let months = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    while m < 12 && d >= months[m] {
        d -= months[m];
        m += 1;
    }
    let rest = secs % 86_400;
    format!(
        "{y:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        m + 1,
        d + 1,
        rest / 3600,
        (rest % 3600) / 60,
        rest % 60
    )
}

/// Everything in both scopes, newest first.
#[tauri::command]
pub fn references_list(app: AppHandle, project: Option<String>) -> Result<Value, String> {
    let mut out: Vec<Value> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for (scope, dir) in scopes(&app, project.as_deref())? {
        for mut entry in read_index(&dir) {
            let Some(id) = entry.get("id").and_then(Value::as_str).map(str::to_string) else { continue };
            if seen.contains(&id) {
                continue;
            }
            seen.push(id);
            entry["scope"] = json!(scope);
            out.push(entry);
        }
    }
    out.sort_by(|a, b| {
        b.get("addedAt").and_then(Value::as_str).unwrap_or("")
            .cmp(a.get("addedAt").and_then(Value::as_str).unwrap_or(""))
    });
    Ok(json!({"entries": out}))
}

/// The bytes behind one entry's poster, as a data URL the webview can show.
#[tauri::command]
pub fn references_poster(app: AppHandle, id: String, project: Option<String>) -> Result<Value, String> {
    if safe_scope(&id).is_none() {
        return Err("invalid poster id".into());
    }
    for (_, dir) in scopes(&app, project.as_deref())? {
        let blobs = dir.join("blobs");
        let Ok(entries) = fs::read_dir(&blobs) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.file_stem().and_then(|s| s.to_str()) != Some(id.as_str()) {
                continue;
            }
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            let mime = sniff(&bytes).ok_or("that poster is not an image this app can show")?;
            return Ok(json!({"src": format!("data:{mime};base64,{}", base64_encode(&bytes))}));
        }
    }
    Err("no poster with that id".into())
}

/// Adds one entry. A poster, when given, is stored by the hash of its bytes, so the same picture
/// saved twice costs one file.
#[tauri::command]
pub fn references_add(app: AppHandle, item: Value, project: Option<String>) -> Result<Value, String> {
    let dir = scope_dir(&app, project.as_deref())?;
    let kind = clean_kind(item.get("kind").and_then(Value::as_str).unwrap_or("note"));
    let url = clamp(item.get("url"), MAX_URL);
    if !url.is_empty() && !safe_url(&url) {
        return Err("a reference address has to be http or https".into());
    }
    if kind == "link" && url.is_empty() {
        return Err("a link reference needs an address".into());
    }

    let mut poster = String::new();
    if let Some(encoded) = item.get("poster").and_then(Value::as_str) {
        let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
        let bytes = base64_decode(&cleaned).ok_or("the poster is not base64")?;
        if bytes.len() > MAX_POSTER_BYTES {
            return Err("that poster is larger than 8 MB".into());
        }
        let mime = sniff(&bytes).ok_or("a poster has to be a PNG, JPEG or WebP")?;
        let id = content_id(&bytes);
        let path = dir.join("blobs").join(format!("{id}.{}", extension(mime)));
        if !path.exists() {
            fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        }
        poster = id;
    }

    let title = clamp(item.get("title"), MAX_TITLE);
    let note = clamp(item.get("note"), MAX_NOTE);
    if kind == "note" && note.is_empty() && title.is_empty() {
        return Err("a note needs something written in it".into());
    }
    // Identity is the address for a link, the bytes for a picture, and the moment for a note.
    let id = if !url.is_empty() {
        content_id(url.as_bytes())
    } else if !poster.is_empty() {
        poster.clone()
    } else {
        content_id(format!("{title}{note}{}", now_iso()).as_bytes())
    };

    let entry = json!({
        "id": id,
        "kind": kind,
        "url": url,
        "title": title,
        "note": note,
        "poster": poster,
        "tags": clean_tags(item.get("tags")),
        "addedAt": now_iso(),
        "addedBy": clamp(item.get("addedBy"), 80),
        "alive": true,
    });

    let mut entries = read_index(&dir);
    // Saving the same thing twice updates it in place rather than growing a second card.
    entries.retain(|e| e.get("id").and_then(Value::as_str) != Some(id.as_str()));
    entries.push(entry.clone());
    if entries.len() > MAX_ENTRIES {
        let excess = entries.len() - MAX_ENTRIES;
        entries.drain(0..excess);
    }
    write_index(&dir, &entries)?;
    Ok(entry)
}

/// Removes an entry, and the poster with it when nothing else points at those bytes.
#[tauri::command]
pub fn references_delete(app: AppHandle, id: String, project: Option<String>) -> Result<Value, String> {
    let dir = scope_dir(&app, project.as_deref())?;
    let mut entries = read_index(&dir);
    let Some(position) = entries.iter().position(|e| e.get("id").and_then(Value::as_str) == Some(id.as_str())) else {
        return Err("no reference with that id in this scope".into());
    };
    let gone = entries.remove(position);
    write_index(&dir, &entries)?;

    if let Some(poster) = gone.get("poster").and_then(Value::as_str).filter(|p| !p.is_empty()) {
        let still_used = entries
            .iter()
            .any(|e| e.get("poster").and_then(Value::as_str) == Some(poster));
        if !still_used {
            if let Ok(blobs) = fs::read_dir(dir.join("blobs")) {
                for entry in blobs.flatten() {
                    if entry.path().file_stem().and_then(|s| s.to_str()) == Some(poster) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
    Ok(json!({"removed": id}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_addresses_a_browser_would_open_are_kept() {
        assert!(safe_url("https://example.com/a"));
        assert!(safe_url("http://example.com/a"));
        assert!(!safe_url("javascript:alert(1)"), "a saved link must not be able to run");
        assert!(!safe_url("file:///etc/passwd"), "the archive is not a way to reach the disk");
        assert!(!safe_url(&format!("https://e.com/{}", "a".repeat(3000))), "the address is capped");
    }

    #[test]
    fn an_unknown_kind_becomes_a_note_rather_than_a_new_path() {
        assert_eq!(clean_kind("image"), "image");
        assert_eq!(clean_kind("link"), "link");
        assert_eq!(clean_kind("video"), "video");
        assert_eq!(clean_kind("../../etc"), "note");
        assert_eq!(clean_kind(""), "note");
    }

    #[test]
    fn tags_are_trimmed_capped_and_deduplicated() {
        let tags = clean_tags(Some(&json!(["  lighting ", "lighting", "editorial", ""])));
        assert_eq!(tags, vec!["lighting", "editorial"], "blank and repeated tags are dropped");
        let many: Vec<Value> = (0..40).map(|i| json!(format!("t{i}"))).collect();
        assert_eq!(clean_tags(Some(&json!(many))).len(), 12, "a wall of tags is cut to twelve");
        let long = clean_tags(Some(&json!(["x".repeat(200)])));
        assert_eq!(long[0].chars().count(), 40);
    }

    #[test]
    fn the_stamp_is_an_iso_moment() {
        let stamp = now_iso();
        assert_eq!(stamp.len(), 20, "{stamp}");
        assert!(stamp.ends_with('Z'));
        assert!(stamp.starts_with("20"), "{stamp}");
        let month: u32 = stamp[5..7].parse().unwrap();
        let day: u32 = stamp[8..10].parse().unwrap();
        assert!((1..=12).contains(&month), "{stamp}");
        assert!((1..=31).contains(&day), "{stamp}");
    }

    #[test]
    fn an_empty_or_broken_index_reads_as_an_empty_archive() {
        let dir = std::env::temp_dir().join(format!("aphrodite-refs-{}", content_id(b"empty")));
        let _ = fs::create_dir_all(&dir);
        assert!(read_index(&dir).is_empty(), "a missing index is not an error");
        fs::write(dir.join(INDEX), "{{ not json").unwrap();
        assert!(read_index(&dir).is_empty(), "a damaged index is not an error either");
        fs::write(dir.join(INDEX), r#"{"entries":[{"id":"a"}]}"#).unwrap();
        assert_eq!(read_index(&dir).len(), 1);
        fs::write(dir.join(INDEX), r#"[{"id":"a"},{"id":"b"}]"#).unwrap();
        assert_eq!(read_index(&dir).len(), 2, "a bare array is read too");
        let _ = fs::remove_dir_all(&dir);
    }
}
