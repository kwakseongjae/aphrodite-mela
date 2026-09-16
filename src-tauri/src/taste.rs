//! `taste.md` on disk.
//!
//! Deliberately thin: this reads and writes one Markdown file and deletes it on request. Everything
//! about *what goes in it* is decided in `src/design/taste.ts`, where it can be tested, and the file
//! itself is the record — a person can open it in any editor, cross a line out, and the app will
//! respect that.
//!
//! Two scopes, the same shape as the picture library and the reference archive: one shared file, and
//! one filed with a single project.
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::image_library::safe_scope;

const FILE: &str = "taste.md";
/// A file this size is no longer something a person reads, which is the only reason it exists.
const MAX_BYTES: usize = 256 * 1024;

fn taste_path(app: &AppHandle, project: Option<&str>) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = match project {
        None => base,
        Some(id) => base.join("vault").join(safe_scope(id).ok_or("invalid project id")?),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

/// The file as it stands, or an empty string when there is none. Never an error: no file is the
/// normal state, because consent starts off.
#[tauri::command]
pub fn taste_read(app: AppHandle, project: Option<String>) -> Result<Value, String> {
    let path = taste_path(&app, project.as_deref())?;
    let text = fs::read_to_string(&path).unwrap_or_default();
    Ok(json!({"path": path.to_string_lossy(), "markdown": text, "exists": path.exists()}))
}

#[tauri::command]
pub fn taste_write(app: AppHandle, project: Option<String>, markdown: String) -> Result<Value, String> {
    if markdown.len() > MAX_BYTES {
        return Err("that is larger than a file anyone would read".into());
    }
    let path = taste_path(&app, project.as_deref())?;
    let dir = path.parent().ok_or("no folder for taste.md")?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(markdown.as_bytes()).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(&path).map_err(|e| e.to_string())?;
    Ok(json!({"path": path.to_string_lossy()}))
}

/// "Forget it" has to actually delete the file, not blank its contents.
#[tauri::command]
pub fn taste_forget(app: AppHandle, project: Option<String>) -> Result<Value, String> {
    let path = taste_path(&app, project.as_deref())?;
    let existed = path.exists();
    if existed {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(json!({"forgotten": existed}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_id_can_never_become_a_path() {
        // taste_path joins the id straight onto the vault folder, so the guard is the whole defence.
        assert!(safe_scope("../../etc").is_none());
        assert!(safe_scope("a/b").is_none());
        assert!(safe_scope("").is_none());
        assert!(safe_scope("0ecac7a3-5e33-426b-a258-72738cc58f58").is_some());
    }

    #[test]
    fn the_cap_is_on_bytes_not_characters() {
        // A Korean taste file is three bytes a character; the limit has to be generous enough that
        // nobody hits it by writing in their own language.
        assert!(MAX_BYTES > 60_000, "roughly 80k Korean characters");
    }
}
