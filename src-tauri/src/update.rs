//! Update check. The webview never talks to the network; this asks GitHub for the latest release,
//! compares it with the running version, and — only when the person clicks — downloads that
//! release's disk image to ~/Downloads and reveals it. The app never replaces itself behind anyone's
//! back, so what lands on disk is the same signed, notarized DMG the website serves.
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const REPO: &str = "kwakseongjae/aphrodite-mela";
const MAX_DMG_BYTES: u64 = 200 * 1024 * 1024;

/// Compares two dotted version strings numerically. Missing segments count as zero, and anything
/// unparsable sorts as zero rather than throwing, so a malformed tag can never look newer.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    let part = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split(['.', '-', '+'])
            .take(4)
            .map(|s| s.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let (a, b) = (part(candidate), part(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

/// The disk image built for this machine's architecture.
fn wanted_asset(assets: &[Value]) -> Option<(String, String, u64)> {
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" };
    let pick = |needle: &str| {
        assets.iter().find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.ends_with(".dmg") && n.contains(needle))
                .unwrap_or(false)
        })
    };
    let asset = pick(arch).or_else(|| pick(".dmg"))?;
    Some((
        asset["name"].as_str()?.to_string(),
        asset["browser_download_url"].as_str()?.to_string(),
        asset["size"].as_u64().unwrap_or(0),
    ))
}

/// Asks GitHub for the newest published release. Never errors loudly: a machine that is offline or
/// rate-limited simply reports that there is nothing newer. Off the main thread: a slow network
/// must never freeze the window.
#[tauri::command(async)]
pub fn update_check() -> Result<Value, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let quiet = json!({"current": current, "newer": false});
    let body = match fetch_text(&format!("https://api.github.com/repos/{REPO}/releases/latest")) {
        Ok(text) => text,
        Err(_) => return Ok(quiet),
    };
    let release: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return Ok(quiet),
    };
    let tag = release["tag_name"].as_str().unwrap_or("").trim_start_matches('v').to_string();
    if tag.is_empty() || !is_newer(&tag, &current) {
        return Ok(json!({"current": current, "latest": tag, "newer": false}));
    }
    let empty: Vec<Value> = Vec::new();
    let assets = release["assets"].as_array().unwrap_or(&empty);
    let Some((name, url, size)) = wanted_asset(assets) else {
        return Ok(json!({"current": current, "latest": tag, "newer": false}));
    };
    Ok(json!({
        "current": current,
        "latest": tag,
        "newer": true,
        "name": name,
        "url": url,
        "size": size,
        "notes": release["html_url"].as_str().unwrap_or("")
    }))
}

/// Downloads the release disk image into ~/Downloads. Only a github.com release URL is accepted and
/// the bytes must actually be a disk image before anything is written where the person will click it.
/// Runs off the main thread, so the window stays alive for the length of the download.
#[tauri::command(async)]
pub fn update_download(url: String, name: String) -> Result<Value, String> {
    let home = std::env::var_os("HOME").ok_or("no home directory")?;
    download_dmg_into(&PathBuf::from(home).join("Downloads"), &url, &name)
}

/// The download itself, given the folder to land in. Refuses anything that is not a release of this
/// app, writes under a temporary name, and only moves it into place once the bytes are a disk image.
fn download_dmg_into(dir: &Path, url: &str, name: &str) -> Result<Value, String> {
    if !url.starts_with(&format!("https://github.com/{REPO}/releases/download/")) {
        return Err("that download does not come from this app's releases".into());
    }
    let safe_name: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .take(80)
        .collect();
    if !safe_name.ends_with(".dmg") || safe_name.contains("..") || safe_name.starts_with('.') {
        return Err("expected a .dmg file name".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let target = dir.join(&safe_name);
    if target.exists() {
        return Ok(json!({"path": target.to_string_lossy(), "alreadyThere": true}));
    }
    let bytes = fetch_bytes(url)?;
    if !looks_like_dmg(&bytes) {
        return Err("that download is not a macOS disk image".into());
    }
    let partial = dir.join(format!("{safe_name}.part"));
    fs::write(&partial, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&partial, &target).map_err(|e| e.to_string())?;
    Ok(json!({"path": target.to_string_lossy(), "bytes": bytes.len(), "alreadyThere": false}))
}

/// Shows the downloaded disk image in Finder so the person can open it and drag the app across.
#[tauri::command]
pub fn update_reveal(path: String) -> Result<String, String> {
    let target = downloaded_dmg(&path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("-R")
        .arg(&target)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(path)
}

/// Opens the downloaded disk image, which mounts it and shows the drag-to-Applications window.
/// Only a file this app put in Downloads is ever handed to the system.
#[tauri::command]
pub fn update_open(path: String) -> Result<String, String> {
    let target = downloaded_dmg(&path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(path)
}

/// Opens this release's notes in the browser. Only a page on this repository is accepted, so a
/// tampered feed cannot turn the button into a link to anywhere else.
#[tauri::command]
pub fn update_notes(url: String) -> Result<String, String> {
    if !url.starts_with(&format!("https://github.com/{REPO}/releases/")) || url.contains(['"', '\'', ' ']) {
        return Err("that link does not belong to this app's releases".into());
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(url)
}

/// A path is only handed to the system when it is a disk image this app downloaded: inside the
/// person's Downloads folder, no parent hops, and actually there.
fn downloaded_dmg(path: &str) -> Result<PathBuf, String> {
    let target = PathBuf::from(path);
    let home = std::env::var_os("HOME").ok_or("no home directory")?;
    let downloads = PathBuf::from(home).join("Downloads");
    if !target.starts_with(&downloads)
        || target.components().any(|c| c.as_os_str() == "..")
        || target.extension().map(|e| e.to_string_lossy().to_lowercase()) != Some("dmg".into())
        || !target.is_file()
    {
        return Err("that file is not an update this app downloaded".into());
    }
    Ok(target)
}

/// A UDIF disk image carries a `koly` trailer in its last 512 bytes.
fn looks_like_dmg(bytes: &[u8]) -> bool {
    bytes.len() > 512 && bytes[bytes.len() - 512..].starts_with(b"koly")
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(10))
        .build()
}

fn fetch_text(url: &str) -> Result<String, String> {
    agent()
        .get(url)
        .set("User-Agent", concat!("Aphrodite/", env!("CARGO_PKG_VERSION")))
        .set("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = agent()
        .get(url)
        .set("User-Agent", concat!("Aphrodite/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(600))
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_DMG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_DMG_BYTES {
        return Err("that download is unexpectedly large".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_versions_are_recognised_in_order() {
        assert!(is_newer("0.1.6", "0.1.5"));
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("v0.1.6", "0.1.5"), "a leading v is tolerated");
        assert!(is_newer("0.1.10", "0.1.9"), "segments compare numerically, not as text");
        assert!(!is_newer("0.1.5", "0.1.5"));
        assert!(!is_newer("0.1.4", "0.1.5"));
        assert!(!is_newer("0.1", "0.1.0"));
        assert!(is_newer("0.1.5.1", "0.1.5"));
    }

    #[test]
    fn a_malformed_tag_never_looks_newer() {
        for junk in ["", "latest", "nightly", "v", "..", "0.1.x"] {
            assert!(!is_newer(junk, "0.1.5"), "{junk}");
        }
    }

    #[test]
    fn the_asset_for_this_architecture_is_chosen() {
        let assets = vec![
            json!({"name": "Aphrodite_0.1.6_x64.dmg", "browser_download_url": "https://example.com/x64", "size": 10}),
            json!({"name": "Aphrodite_0.1.6_aarch64.dmg", "browser_download_url": "https://example.com/arm", "size": 20}),
            json!({"name": "notes.txt", "browser_download_url": "https://example.com/txt", "size": 1}),
        ];
        let (name, url, size) = wanted_asset(&assets).expect("an asset");
        if cfg!(target_arch = "aarch64") {
            assert_eq!((name.as_str(), url.as_str(), size), ("Aphrodite_0.1.6_aarch64.dmg", "https://example.com/arm", 20));
        } else {
            assert_eq!((name.as_str(), url.as_str(), size), ("Aphrodite_0.1.6_x64.dmg", "https://example.com/x64", 10));
        }
        assert!(wanted_asset(&[json!({"name": "notes.txt"})]).is_none(), "no disk image, no offer");
        assert!(wanted_asset(&[]).is_none());
    }

    /// Hits the real release feed, so it is not part of the offline suite. Run it with
    /// `cargo test -- --ignored` to confirm TLS, redirects and the feed's shape still line up.
    #[test]
    #[ignore]
    fn live_release_feed_parses() {
        let body = fetch_text(&format!("https://api.github.com/repos/{REPO}/releases/latest"))
            .expect("the release feed answers");
        let release: Value = serde_json::from_str(&body).expect("valid json");
        let tag = release["tag_name"].as_str().expect("a tag");
        assert!(tag.starts_with('v'), "{tag}");
        let assets = release["assets"].as_array().expect("assets");
        let (name, url, size) = wanted_asset(assets).expect("a disk image for this machine");
        assert!(name.ends_with(".dmg") && url.starts_with("https://github.com/") && size > 1_000_000);
    }

    #[test]
    fn a_download_from_anywhere_else_is_refused_before_any_request() {
        let dir = tempfile::tempdir().expect("temp dir");
        for (url, name) in [
            ("https://example.com/evil.dmg", "Aphrodite.dmg"),
            ("http://github.com/kwakseongjae/aphrodite-mela/releases/download/v1/a.dmg", "a.dmg"),
            ("https://github.com/someone-else/app/releases/download/v1/a.dmg", "a.dmg"),
        ] {
            assert!(download_dmg_into(dir.path(), url, name).is_err(), "{url}");
        }
        let good = format!("https://github.com/{REPO}/releases/download/v0.1.5/x.dmg");
        for name in ["../../escape.dmg", ".hidden.dmg", "notes.txt", "payload.sh"] {
            assert!(download_dmg_into(dir.path(), &good, name).is_err(), "{name}");
        }
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0, "nothing was written");
    }

    /// Downloads a real release. Network, so it stays out of the offline suite.
    #[test]
    #[ignore]
    fn live_download_lands_a_real_disk_image() {
        let dir = tempfile::tempdir().expect("temp dir");
        let url = format!("https://github.com/{REPO}/releases/download/v0.1.5/Aphrodite_0.1.5_aarch64.dmg");
        let got = download_dmg_into(dir.path(), &url, "Aphrodite_0.1.5_aarch64.dmg").expect("download");
        let path = PathBuf::from(got["path"].as_str().expect("a path"));
        assert!(path.is_file());
        assert!(fs::metadata(&path).unwrap().len() > 20_000_000);
        assert!(looks_like_dmg(&fs::read(&path).unwrap()));
        assert!(!dir.path().join("Aphrodite_0.1.5_aarch64.dmg.part").exists(), "the partial file is gone");
        let again = download_dmg_into(dir.path(), &url, "Aphrodite_0.1.5_aarch64.dmg").expect("second call");
        assert_eq!(again["alreadyThere"], json!(true), "a file already there is not downloaded twice");
    }

    #[test]
    fn only_a_real_disk_image_is_accepted() {
        let mut dmg = vec![0u8; 1024];
        dmg[512..516].copy_from_slice(b"koly");
        assert!(looks_like_dmg(&dmg));
        assert!(!looks_like_dmg(&[0u8; 1024]), "no trailer, not a disk image");
        assert!(!looks_like_dmg(b"<!DOCTYPE html>"), "an error page is not a disk image");
        assert!(!looks_like_dmg(&[]));
    }
}
