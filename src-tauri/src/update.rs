//! Update check. The webview never talks to the network; this asks GitHub for the latest release,
//! compares it with the running version, and — only when the person clicks — downloads that
//! release's disk image to ~/Downloads and reveals it. The app never replaces itself behind anyone's
//! back, so what lands on disk is the same signed, notarized DMG the website serves.
use semver::Version;
use tauri_plugin_updater::{RemoteRelease, RemoteReleaseInner};
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const REPO: &str = "kwakseongjae/aphrodite-mela";
const MAX_DMG_BYTES: u64 = 200 * 1024 * 1024;

// Older releases also accepted a fourth numeric component. Keep that comparison for legacy tags.
fn version_parts(value: &str) -> Option<(Version, u64)> {
    let value = value.strip_prefix('v').unwrap_or(value);
    if let Ok(version) = Version::parse(value) {
        return Some((version, 0));
    }
    let (base, revision) = value.rsplit_once('.')?;
    let version = Version::parse(base).ok()?;
    (version.pre.is_empty() && version.build.is_empty()).then_some((version, revision.parse().ok()?))
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    let (Some((a, ar)), Some((b, br))) = (version_parts(candidate), version_parts(current)) else {
        return false;
    };
    a.cmp_precedence(&b).then(ar.cmp(&br)).is_gt()
}

fn preview_version(version: &Version) -> bool {
    version.pre.as_str().strip_prefix("preview.").is_some_and(|n| {
        !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())
    })
}

fn same_channel(current: &Version, candidate: &Version) -> bool {
    (current.pre.is_empty() && candidate.pre.is_empty()) ||
        (preview_version(current) && preview_version(candidate))
}

// Both channels use the same signing key. A signed stable binary is still the wrong app.
fn preview_archives(release: &RemoteRelease) -> bool {
    let RemoteReleaseInner::Static { platforms } = &release.data else { return false };
    let version = &release.version;
    platforms.len() == 2 && [("darwin-aarch64", "aarch64"), ("darwin-x86_64", "x64")].iter().all(|(key, arch)| {
        let expected = format!("https://github.com/{REPO}/releases/download/v{version}/Aphrodite_{version}_{arch}.app.tar.gz");
        platforms.get(*key).is_some_and(|p| p.url.as_str() == expected && !p.signature.trim().is_empty())
    })
}

pub fn can_install(current: Version, release: RemoteRelease) -> bool {
    same_channel(&current, &release.version) && release.version.cmp_precedence(&current).is_gt()
        && (current.pre.is_empty() || preview_archives(&release))
}

fn read_manifest(client: &ureq::Agent, endpoint: &str) -> Option<Value> {
    serde_json::from_str(&fetch_text(client, endpoint).ok()?).ok()
}

// The stable feed can announce a separate DMG to a preview user. Only the app's own feed
// can produce an in-place offer, and the updater plugin checks the channel again at install.
fn offer(current: &Version, manifest: &Value, stable_download: bool) -> Option<Value> {
    let tag = manifest["version"].as_str()?;
    let tag = tag.strip_prefix('v').unwrap_or(tag);
    let (candidate, _) = version_parts(tag)?;
    let accepted = if stable_download {
        preview_version(current) && candidate.pre.is_empty()
    } else if preview_version(current) {
        let release: RemoteRelease = serde_json::from_value(manifest.clone()).ok()?;
        can_install(current.clone(), release)
    } else {
        same_channel(current, &candidate)
    };
    if !accepted || !is_newer(tag, &current.to_string()) {
        return None;
    }
    let name = dmg_name(tag)?;
    Some(json!({
        "current": current.to_string(), "latest": tag, "newer": true, "stableDownload": stable_download,
        "name": name, "url": format!("https://github.com/{REPO}/releases/download/v{tag}/{name}"),
        "notes": format!("https://github.com/{REPO}/releases/tag/v{tag}"),
        "summary": release_summary(manifest["notes"].as_str().unwrap_or(""))
    }))
}

#[tauri::command(async)]
pub fn update_check(app: tauri::AppHandle) -> Result<Value, String> {
    let current = &app.package_info().version;
    let client = agent(current);
    if preview_version(current) {
        let stable = format!("https://github.com/{REPO}/releases/latest/download/latest.json");
        if let Some(notice) = read_manifest(&client, &stable).and_then(|manifest| offer(current, &manifest, true)) {
            return Ok(notice);
        }
    }
    let endpoint = app.config().plugins.0.get("updater")
        .and_then(|plugin| plugin["endpoints"][0].as_str());
    Ok(endpoint.and_then(|url| read_manifest(&client, url)).and_then(|manifest| offer(current, &manifest, false))
        .unwrap_or_else(|| json!({"current": current.to_string(), "newer": false})))
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

    let flush = |para: &mut String, out: &mut Vec<String>| {
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
pub fn update_download(app: tauri::AppHandle, url: String, name: String) -> Result<Value, String> {
    let home = std::env::var_os("HOME").ok_or("no home directory")?;
    download_dmg_into(&agent(&app.package_info().version), &PathBuf::from(home).join("Downloads"), &url, &name)
}

/// The download itself, given the folder to land in. Refuses anything that is not a release of this
/// app, writes under a temporary name, and only moves it into place once the bytes are a disk image.
fn download_dmg_into(client: &ureq::Agent, dir: &Path, url: &str, name: &str) -> Result<Value, String> {
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
    let bytes = fetch_bytes(client, url)?;
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

/// Opens a link out of a free page, once the person has seen its address and pressed Open (0.3-P2):
/// a web address or an email address, nothing that `open` would read as a file, an app or a flag.
#[tauri::command]
pub fn open_link(url: String) -> Result<String, String> {
    if !link_allowed(&url) {
        return Err("only a web address or an email address opens from a page".into());
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(url)
}

/// A web or mail address with nothing in it that hides where it goes, judged as the app judges it
/// (linkOut in src/free-page.ts; both read tests/support/link-addresses.json in their tests): read as
/// written, with no name or password (even an empty one) and nothing encoded before the host, and a mail
/// address that names who it goes to; then parsed (url, through tauri::Url) so a port out of range or a
/// host that is no host is refused too.
fn link_allowed(url: &str) -> bool {
    if url.len() > 2_000 || url.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '\'' | '<' | '>' | '\\' | '\u{200E}' | '\u{200F}' | '\u{061C}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')) {
        return false;
    }
    let lower = url.to_ascii_lowercase();
    let web = lower.starts_with("https://") || lower.starts_with("http://");
    if web {
        let rest = &url[url.find("://").map_or(0, |at| at + 3)..];
        let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
        if authority.is_empty() || authority.contains(['@', '%']) {
            return false;
        }
    } else if lower.starts_with("mailto:") {
        // Who it goes to ends where the query or the fragment begins, as the app reads it (src/free-page.ts linkOut).
        let to = url[7..].split(['?', '#']).next().unwrap_or("");
        let mut parts = to.split('@');
        let (name, host) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
        if name.is_empty() || host.is_empty() || parts.next().is_some() || to.contains('%') {
            return false;
        }
    } else {
        return false;
    }
    match tauri::Url::parse(url) {
        Ok(parsed) => !web || (parsed.host_str().is_some_and(|h| !h.is_empty()) && parsed.username().is_empty() && parsed.password().is_none()),
        Err(_) => false,
    }
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

fn agent(version: &Version) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .user_agent(&format!("Aphrodite/{version}"))
        .timeout_connect(std::time::Duration::from_secs(10))
        .build()
}

fn fetch_text(client: &ureq::Agent, url: &str) -> Result<String, String> {
    client
        .get(url)
        .set("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

fn fetch_bytes(client: &ureq::Agent, url: &str) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
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
    /// The same table the app's linkOut is held to (tests/free-frame.test.ts): the two must agree.
    #[test]
    fn open_link_gives_the_answers_of_the_shared_table() {
        let table: serde_json::Value = serde_json::from_str(include_str!("../../tests/support/link-addresses.json")).unwrap();
        for address in table["accept"].as_array().unwrap() {
            assert!(super::link_allowed(address.as_str().unwrap()), "accepts {address}");
        }
        for address in table["refuse"].as_array().unwrap() {
            assert!(!super::link_allowed(address.as_str().unwrap()), "refuses {address}");
        }
    }

    #[test]
    fn a_page_may_open_a_web_or_mail_address_and_nothing_else() {
        for ok in ["https://example.com/a?b=c#d", "http://example.com", "mailto:someone@example.com", "HTTPS://EXAMPLE.COM"] {
            assert!(super::link_allowed(ok), "{ok}");
        }
        for bad in ["https://trusted.example@evil.example/", "https://user:pass@example.com/", "https://example.com/\u{202E}gpj.exe", "https://example.com/\u{2066}x", "file:///etc/hosts", "/Applications/Calculator.app", "-a Calculator", "javascript:alert(1)", "https://example.com/a b", "https://example.com/\"x", "https://example.com/\nx", "ftp://example.com", "x-apple.systempreferences:", ""] {
            assert!(!super::link_allowed(bad), "{bad}");
        }
        assert!(!super::link_allowed(&format!("https://example.com/{}", "a".repeat(2_000))));
    }

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
        // Every notes file we ship, not one pinned example: the card reads whichever release is
        // newest, so a summary only has to break once, in the release nobody checked.
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs");
        let mut files: Vec<_> = std::fs::read_dir(&dir)
            .expect("docs/")
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
                    n.starts_with("RELEASE-NOTES-v") && n.ends_with(".md") && !n.contains("v0.1.")
                })
            })
            .collect();
        files.sort();
        assert!(!files.is_empty(), "no release notes found in {dir:?}");
        for file in files {
            let notes = std::fs::read_to_string(&file).expect("notes");
            let out = release_summary(&notes);
            let who = file.file_name().unwrap().to_string_lossy().to_string();
            assert_eq!(out.len(), 3, "{who}: {out:?}");
            for line in &out {
                assert!(line.chars().count() > 20, "{who}: a fragment, not a sentence: {line:?}");
                assert!(!line.contains(".dmg"), "{who}: a file name is not news: {line:?}");
                assert!(!line.ends_with(" by") && !line.ends_with(" the") && !line.ends_with(" and"),
                    "{who}: cut mid-clause, which is how a wrapped paragraph breaks: {line:?}");
                assert!(!line.starts_with('#') && !line.contains("**"), "{who}: markdown reached the card: {line:?}");
            }
        }
    }

    use super::*;

    #[test]
    fn newer_versions_are_recognised_in_order() {
        for (older, newer) in [
            ("0.2.8", "0.3.0-preview.1"), ("0.3.0-preview.1", "0.3.0-preview.2"),
            ("0.3.0-preview.2", "0.3.0-preview.10"), ("0.3.0-preview.10", "0.3.0"),
        ] {
            assert!(is_newer(newer, older));
            assert!(!is_newer(older, newer));
        }
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
    fn updates_stay_in_their_channel_and_stable_graduation_is_download_only() {
        let preview = Version::parse("0.3.0-preview.1").unwrap();
        let stable = Version::parse("0.2.8").unwrap();
        let version = "0.3.0-preview.2";
        let asset = |arch| json!({"url":format!("https://github.com/{REPO}/releases/download/v{version}/Aphrodite_{version}_{arch}.app.tar.gz"), "signature":"sig"});
        let next = json!({"version":version, "platforms":{"darwin-aarch64":asset("aarch64"), "darwin-x86_64":asset("x64")}});
        let final_release = json!({"version":"0.3.0"});
        assert!(offer(&stable, &next, false).is_none());
        assert!(offer(&preview, &final_release, false).is_none());
        assert!(offer(&preview, &next, true).is_none());
        assert_eq!(offer(&preview, &next, false).unwrap()["stableDownload"], false);
        assert_eq!(offer(&preview, &final_release, true).unwrap()["stableDownload"], true);
        assert!(offer(&preview, &json!({"version":"0.2.9"}), true).is_none());
        assert!(offer(&preview, &json!({"version":"0.3.0-beta.1"}), false).is_none());
    }

    #[test]
    fn a_preview_version_label_cannot_offer_a_stable_archive() {
        let current = Version::parse("0.3.0-preview.1").unwrap();
        let mixed = json!({"version":"0.3.0-preview.2","platforms":{
            "darwin-aarch64":{"url":format!("https://github.com/{REPO}/releases/download/v0.3.0/Aphrodite_aarch64.app.tar.gz"),"signature":"s"},
            "darwin-x86_64":{"url":format!("https://github.com/{REPO}/releases/download/v0.3.0-preview.2/Aphrodite_0.3.0-preview.2_x64.app.tar.gz"),"signature":"s"}
        }});
        assert!(offer(&current, &mixed, false).is_none());
        assert!(!can_install(current, serde_json::from_value(mixed).unwrap()));
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
        let body = fetch_text(&ureq::Agent::new(), &format!("https://github.com/{REPO}/releases/latest/download/latest.json"))
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
            assert!(download_dmg_into(&ureq::Agent::new(), dir.path(), url, name).is_err(), "{url}");
        }
        let good = format!("https://github.com/{REPO}/releases/download/v0.1.5/x.dmg");
        for name in ["../../escape.dmg", ".hidden.dmg", "notes.txt", "payload.sh"] {
            assert!(download_dmg_into(&ureq::Agent::new(), dir.path(), &good, name).is_err(), "{name}");
        }
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0, "nothing was written");
    }

    /// Downloads a real release. Network, so it stays out of the offline suite.
    #[test]
    #[ignore]
    fn live_download_lands_a_real_disk_image() {
        let dir = tempfile::tempdir().expect("temp dir");
        let url = format!("https://github.com/{REPO}/releases/download/v0.1.5/Aphrodite_0.1.5_aarch64.dmg");
        let got = download_dmg_into(&ureq::Agent::new(), dir.path(), &url, "Aphrodite_0.1.5_aarch64.dmg").expect("download");
        let path = PathBuf::from(got["path"].as_str().expect("a path"));
        assert!(path.is_file());
        assert!(fs::metadata(&path).unwrap().len() > 20_000_000);
        assert!(looks_like_dmg(&fs::read(&path).unwrap()));
        assert!(!dir.path().join("Aphrodite_0.1.5_aarch64.dmg.part").exists(), "the partial file is gone");
        let again = download_dmg_into(&ureq::Agent::new(), dir.path(), &url, "Aphrodite_0.1.5_aarch64.dmg").expect("second call");
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

