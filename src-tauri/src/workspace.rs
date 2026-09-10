use fs2::FileExt;
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
use tauri::Manager;

fn read_at(root: &Path) -> Result<Value, String> {
    let path = root.join("library.json");
    if !path.exists() {
        return Ok(json!({"revision":0,"data":null}));
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 45_000_000 {
        return Err("Workspace too large".into());
    }
    let value: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Workspace needs recovery: {e}"))?;
    if !value["revision"].is_u64() || !value["data"].is_string() {
        return Err("Invalid workspace envelope; original preserved".into());
    }
    Ok(value)
}
fn atomic_write(root: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    let mut tmp = tempfile::NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(root.join(name)).map_err(|e| e.to_string())?;
    Ok(())
}
fn save_at(root: &Path, data: String, expected: u64) -> Result<u64, String> {
    if data.len() > 40_000_000 {
        return Err("Workspace exceeds 40MB; export large projects".into());
    }
    let parsed: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    if parsed["version"] != 1 || !parsed["entries"].is_array() {
        return Err("Invalid library".into());
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(root.join("workspace.lock"))
        .map_err(|e| e.to_string())?;
    lock.lock_exclusive().map_err(|e| e.to_string())?;
    let current = read_at(root)?;
    if current["revision"].as_u64() != Some(expected) {
        return Err(
            "Another window changed this workspace. Export unsaved work, then reopen the app."
                .into(),
        );
    }
    if !current["data"].is_null() {
        atomic_write(
            root,
            "library.previous.json",
            &serde_json::to_vec(&current).map_err(|e| e.to_string())?,
        )?;
    }
    let revision = expected.checked_add(1).ok_or("Revision overflow")?;
    atomic_write(
        root,
        "library.json",
        &serde_json::to_vec(&json!({"revision":revision,"data":data}))
            .map_err(|e| e.to_string())?,
    )?;
    Ok(revision)
}
#[tauri::command]
pub fn workspace_read(app: tauri::AppHandle) -> Result<Value, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace-v1");
    let mut value = read_at(&root)?;
    value["path"] = json!(root);
    Ok(value)
}
#[tauri::command]
pub fn workspace_write(app: tauri::AppHandle, data: String, expected: u64) -> Result<u64, String> {
    save_at(
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("workspace-v1"),
        data,
        expected,
    )
}
#[tauri::command]
pub fn workspace_recovery(app: tauri::AppHandle) -> Result<Value, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspace-v1");
    let mut out = json!({});
    for name in ["library.json", "library.previous.json"] {
        let path = root.join(name);
        if path.exists() {
            if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 45_000_000 {
                return Err("Recovery file too large".into());
            }
            out[name] = json!(fs::read_to_string(path).map_err(|e| e.to_string())?);
        }
    }
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_and_keeps_previous() {
        let dir = tempfile::tempdir().unwrap();
        let s = r#"{"version":1,"entries":[]}"#;
        assert_eq!(save_at(dir.path(), s.into(), 0).unwrap(), 1);
        assert_eq!(save_at(dir.path(), s.into(), 1).unwrap(), 2);
        let previous: Value =
            serde_json::from_slice(&fs::read(dir.path().join("library.previous.json")).unwrap())
                .unwrap();
        assert_eq!(previous["revision"], 1);
        assert_eq!(read_at(dir.path()).unwrap()["revision"], 2);
    }
    #[test]
    fn stale_writer_cannot_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let s = r#"{"version":1,"entries":[]}"#;
        save_at(dir.path(), s.into(), 0).unwrap();
        assert!(save_at(dir.path(), s.into(), 0).is_err());
        assert_eq!(read_at(dir.path()).unwrap()["revision"], 1);
    }
    #[test]
    fn corrupt_file_preserved() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("library.json"), b"broken").unwrap();
        assert!(save_at(dir.path(), r#"{"version":1,"entries":[]}"#.into(), 0).is_err());
        assert_eq!(
            fs::read(dir.path().join("library.json")).unwrap(),
            b"broken"
        );
    }
}
