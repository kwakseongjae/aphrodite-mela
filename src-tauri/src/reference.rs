use base64::Engine;
use std::{
    io::Write,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use tauri::Manager;

#[tauri::command]
pub async fn recognize_reference(
    app: tauri::AppHandle,
    data_url: String,
) -> Result<serde_json::Value, String> {
    if data_url.len() > 2_700_000 {
        return Err("Reference exceeds 2MB".into());
    }
    let (prefix, payload) = data_url.split_once(',').ok_or("Invalid image")?;
    if ![
        "data:image/png;base64",
        "data:image/jpeg;base64",
        "data:image/webp;base64",
    ]
    .contains(&prefix)
    {
        return Err("Only raster images are supported".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|_| "Invalid base64")?;
    let helper = helper_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let input = dir.path().join("reference.raster");
        let output = dir.path().join("evidence.json");
        std::fs::File::create(&input)
            .and_then(|mut f| f.write_all(&bytes))
            .map_err(|e| e.to_string())?;
        let mut child = Command::new(helper)
            .arg(input)
            .arg(&output)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("OCR helper unavailable: {e}"))?;
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => break,
                Ok(Some(_)) => return Err("OCR could not read this image".into()),
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(e.to_string());
                }
                _ => {}
            }
            if start.elapsed() > Duration::from_secs(25) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("OCR timed out".into());
            }
            std::thread::sleep(Duration::from_millis(40));
        }
        let json = std::fs::read_to_string(output).map_err(|e| e.to_string())?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The OCR helper is a Tauri sidecar (`bundle.externalBin`): Tauri places it next to the app
/// binary as plain `aphrodite-vision` in both dev (target/<profile>/) and release
/// (Aphrodite.app/Contents/MacOS/) builds and signs it with the hardened runtime.
fn helper_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("aphrodite-vision"));
        }
    }
    if let Ok(res) = app
        .path()
        .resolve("bin/aphrodite-vision", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(res);
    }
    #[cfg(debug_assertions)]
    {
        let bin = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin");
        if let Ok(entries) = std::fs::read_dir(&bin) {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("aphrodite-vision")
                {
                    candidates.push(entry.path());
                }
            }
        }
    }
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| "OCR helper (aphrodite-vision sidecar) is missing from this build".to_string())
}
