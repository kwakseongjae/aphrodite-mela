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
pub fn workspace_read<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<Value, String> {
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
pub async fn workspace_write(app: tauri::AppHandle, data: String, expected: u64) -> Result<u64, String> {
    crate::disk::write(move || {
        save_at(
            &app.path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("workspace-v1"),
            data,
            expected,
        )
    }).await
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
    fn recheck_6_a_workspace_save_waits_for_a_refused_or_late_close() {
        use crate::disk;
        use std::{future::Future, task::{Context, Waker}, time::Duration};
        use tauri::test::{mock_builder, mock_context, noop_assets};
        let _serial = disk::TEST_SERIAL.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = dir.path().to_str().unwrap().into();
        let app = mock_builder().build(context).unwrap();
        let web = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let root = dir.path().to_owned();
        let save = |revision| {
            let root = root.clone();
            disk::write(move || save_at(&root, r#"{"version":1,"entries":[]}"#.into(), revision))
        };
        tauri::async_runtime::block_on(async {
            for revision in 0..2 {
                let window = web.as_ref().window();
                assert!(disk::disk_begin_close(window.clone(), "leaving".into(), 1000).await.unwrap());
                let mut pending = Box::pin(save(revision));
                let first = pending.as_mut().poll(&mut Context::from_waker(Waker::noop()));
                assert!(first.is_pending(), "gate returned {first:?}");
                std::thread::sleep(Duration::from_millis(20));
                assert_eq!(read_at(&root).unwrap()["revision"], revision);
                if revision == 0 {
                    disk::disk_end_close(window, "leaving".into());
                }
                // A late close may never deliver its release. Both paths resume the queue.
                let (finished, completion) = std::sync::mpsc::channel();
                tauri::async_runtime::spawn(async move {
                    let _ = finished.send(pending.await);
                });
                let limit = Duration::from_secs(if revision == 0 { 2 } else { 12 });
                assert_eq!(completion.recv_timeout(limit).unwrap().unwrap(), revision+1);
            }
            assert_eq!(save(2).await.unwrap(), 3);
        });
    }
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
    /// 0.3-P3-fix2 #4: what the app sends is JSON.stringify's text, where half of a surrogate pair on its own is the
    /// escape \ud800. This save reads the library as serde_json::Value, which takes no such escape: a library holding
    /// one is not saved at all, and the pair-whole one is. (Test only; the save itself is 0.3-R's.)
    #[test]
    fn a_library_holding_half_a_surrogate_pair_is_not_saved() {
        let dir = tempfile::tempdir().unwrap();
        let lone = r#"{"version":1,"entries":[{"project":{"name":"a \ud800 b"}}]}"#;
        let whole = r#"{"version":1,"entries":[{"project":{"name":"a \ud83d\ude00 b"}}]}"#;
        let refused = save_at(dir.path(), lone.into(), 0).unwrap_err();
        assert!(refused.contains("hex escape") || refused.contains("surrogate"), "{refused}");
        assert!(read_at(dir.path()).unwrap()["data"].is_null(), "nothing was written");
        assert_eq!(save_at(dir.path(), whole.into(), 0).unwrap(), 1);
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
