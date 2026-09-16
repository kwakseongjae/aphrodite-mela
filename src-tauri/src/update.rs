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


/// Asks GitHub for the newest published release. Never errors loudly: a machine that is offline or
/// rate-limited simply reports that there is nothing newer. Off the main thread: a slow network
/// must never freeze the window.
#[tauri::command(async)]
pub fn update_check() -> Result<Value, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let quiet = json!({"current": current, "newer": false});
    // The updater's own manifest, not the API. /releases/latest/download/… is a plain file, so a
    // shared address — an office, a cafe — cannot spend the hour's sixty API calls and leave
    // everyone in the building unable to hear about a new version.
    let body = match fetch_text(&format!("https://github.com/{REPO}/releases/latest/download/latest.json")) {
        Ok(text) => text,
        Err(_) => return Ok(quiet),
    };
    let manifest: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return Ok(quiet),
    };
    let tag = manifest["version"].as_str().unwrap_or("").trim_start_matches('v').to_string();
    if tag.is_empty() || !is_newer(&tag, &current) {
        return Ok(json!({"current": current, "latest": tag, "newer": false}));
    }
    let Some(name) = dmg_name(&tag) else {
        return Ok(json!({"current": current, "latest": tag, "newer": false}));
    };
    Ok(json!({
        "current": current,
        "latest": tag,
        "newer": true,
        "name": name,
        "url": format!("https://github.com/{REPO}/releases/download/v{tag}/{name}"),
        "notes": format!("https://github.com/{REPO}/releases/tag/v{tag}"),
        "summary": release_summary(manifest["notes"].as_str().unwrap_or(""))
    }))
}

/// The disk image this Mac would want, named the way the release names it. Kept as a fallback for
/// anyone who would rather install by hand; the updater itself takes the tarball from the manifest.
fn dmg_name(version: &str) -> Option<String> {
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        return None;
    };
    Some(format!("Aphrodite_{version}_{arch}.dmg"))
}

/// What to show a person under "what changed". A release body is markdown written for the release
/// page — wrapped at eighty columns, opening with headings and a download list — so reading it
/// line by line produced fragments like "…the last one you install by" / "hand." and offered the
/// name of a disk image as news. Paragraphs are rejoined, the sections that are paperwork rather
/// than news are skipped, and what is left is bounded on both counts.
fn release_summary(body: &str) -> Vec<String> {
    // Sections that are paperwork rather than news. The document's own title is not one of them:
    // "Aphrodite v0.2.0 — release notes" once matched "release notes" and swallowed the opening
    // paragraph, which is the one sentence most worth showing.
    const PAPERWORK: [&str; 3] = ["download", "known limits", "다운로드"];
    let mut out: Vec<String> = Vec::new();
    let mut para = String::new();
    let mut fenced = false;
    let mut skipping = false;

    let mut flush = |para: &mut String, out: &mut Vec<String>| {
        let text = para.trim().to_string();
        para.clear();
        if text.chars().count() < 3 || out.len() >= 3 {
            return;
        }
        let text = if text.chars().count() > 120 {
            let cut: String = text.chars().take(119).collect();
            format!("{}…", cut.trim_end())
        } else {
            text
        };
        out.push(text);
    };

    for raw in body.lines() {
        let line = raw.trim();
        if line.starts_with("```") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        if let Some(heading) = line.strip_prefix('#') {
            flush(&mut para, &mut out);
            let name = heading.trim_start_matches('#').trim().to_lowercase();
            // The title is the whole document, not a section: it never turns skipping on.
            let title = raw.trim_start().starts_with("# ");
            skipping = !title && PAPERWORK.iter().any(|p| name.contains(p));
            continue;
        }
        if line.is_empty() || line.starts_with('|') || line.starts_with('<') {
            flush(&mut para, &mut out);
            continue;
        }
        if skipping || out.len() >= 3 {
            continue;
        }
        // A bullet starts something new; a bare line continues the paragraph it is wrapped from.
        let bullet = line.starts_with('-') || line.starts_with('*') || line.starts_with('+');
        if bullet {
            flush(&mut para, &mut out);
        }
        let text = line.trim_start_matches(['-', '*', '+']).trim().replace("**", "").replace('`', "");
        if !para.is_empty() {
            para.push(' ');
        }
        para.push_str(&text);
    }
    flush(&mut para, &mut out);
    out
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

/// Opens one of the app's own pages in the person's browser. A webview cannot follow a target=_blank
/// link, so a menu entry that looks like a link does nothing until it comes through here.
#[tauri::command]
pub fn open_external(url: String) -> Result<String, String> {
    if !url.starts_with(&format!("https://github.com/{REPO}")) || url.contains(['"', '\'', ' ', '\n']) {
        return Err("that link does not belong to this app".into());
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(url)
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
    #[test]
    fn a_release_body_becomes_three_sentences_a_person_would_read() {
        // Shaped like a real one: wrapped at eighty columns, download list before the news.
        let body = "# Aphrodite v0.2.0 — release notes\n\nThe release that makes an agent a first-class way to use\nAphrodite, and the last one you install by hand.\n\n## Download\n\n- Apple Silicon: `Aphrodite_0.2.0_aarch64.dmg`\n- Signed with Developer ID.\n\n## What's new\n\n**Updates install themselves**\n- Install and restart fetches the new version and\n  reopens Aphrodite on it.\n- Fifty-eight ways to lay out a section.\n- A fourth line nobody sees.\n";
        let out = release_summary(body);
        assert_eq!(out.len(), 3, "bounded: {out:?}");
        assert_eq!(out[0], "The release that makes an agent a first-class way to use Aphrodite, and the last one you install by hand.",
            "a wrapped paragraph is one sentence, not two fragments");
        assert!(!out.iter().any(|l| l.contains(".dmg")), "a download list is paperwork, not news: {out:?}");
        assert_eq!(out[1], "Updates install themselves");
        assert_eq!(out[2], "Install and restart fetches the new version and reopens Aphrodite on it.");

        assert!(release_summary("").is_empty(), "no body is no summary");
        assert!(release_summary("## Download\n\n- only paperwork here\n").is_empty(), "nothing but paperwork says nothing");
        let long = format!("- {}", "가".repeat(400));
        assert!(release_summary(&long)[0].chars().count() <= 120, "one very long line cannot run away");
    }

    /// The shipped notes, not a fixture I wrote. The hand-written one was clean and unwrapped, so
    /// it passed while the card was showing "…the last one you install by" / "hand." / the name of
    /// a disk image. This reads what CI actually puts in latest.json.
    #[test]
    fn the_notes_we_ship_read_as_sentences() {
        let notes = include_str!("../../docs/RELEASE-NOTES-v0.2.0.md");
        let out = release_summary(notes);
        assert_eq!(out.len(), 3, "{out:?}");
        for line in &out {
            assert!(line.chars().count() > 20, "a fragment, not a sentence: {line:?}");
            assert!(!line.contains(".dmg"), "a file name is not news: {line:?}");
            assert!(!line.ends_with(" by") && !line.ends_with(" the") && !line.ends_with(" and"),
                "cut mid-clause, which is how a wrapped paragraph breaks: {line:?}");
            assert!(!line.starts_with('#') && !line.contains("**"), "markdown reached the card: {line:?}");
        }
        assert!(out[0].contains("agent"), "the opening sentence is the one worth showing: {:?}", out[0]);
    }

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
    fn the_disk_image_is_named_for_this_architecture() {
        let name = dmg_name("0.2.0").expect("this machine has a disk image");
        assert!(name.starts_with("Aphrodite_0.2.0_"), "{name}");
        assert!(name.ends_with(".dmg"), "{name}");
        #[cfg(target_arch = "aarch64")]
        assert_eq!(name, "Aphrodite_0.2.0_aarch64.dmg");
        #[cfg(target_arch = "x86_64")]
        assert_eq!(name, "Aphrodite_0.2.0_x64.dmg");
    }

    /// Hits the real manifest, so it is not part of the offline suite. Run it with
    /// `cargo test -- --ignored` to confirm TLS, redirects and the manifest's shape still line up.
    /// This is a plain file rather than the API, so it costs nobody their hourly quota.
    #[test]
    #[ignore]
    fn live_release_manifest_parses() {
        let body = fetch_text(&format!("https://github.com/{REPO}/releases/latest/download/latest.json"))
            .expect("the manifest answers");
        let manifest: Value = serde_json::from_str(&body).expect("valid json");
        let version = manifest["version"].as_str().expect("a version");
        assert!(version.chars().next().is_some_and(|c| c.is_ascii_digit()), "{version}");
        assert!(manifest["platforms"].as_object().is_some_and(|p| !p.is_empty()), "platforms");
        assert!(!release_summary(manifest["notes"].as_str().unwrap_or("")).is_empty(), "notes carry something to show");
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
