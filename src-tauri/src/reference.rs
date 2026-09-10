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
    let helper = app
        .path()
        .resolve("bin/aphrodite-vision", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    #[cfg(debug_assertions)]
    let helper = if helper.exists() {
        helper
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin/aphrodite-vision")
    };
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
