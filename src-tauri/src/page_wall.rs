//! The page wall (0.3-P2-fix3, fix6): WebKit settings that keep a free page off the network where its
//! frame's policy cannot. WebRTC reaches any address over UDP whatever `connect-src` says, and
//! `<link rel=preconnect>` opens a connection to a host of the page's choosing with no script at all; a
//! script in the page's own window cannot hold either (lab/review-board/evidence/reviews/2026-11-19-opus-
//! 0.3-P2-sandbox.md). WebKit can: with peer connections off, no document made afterwards has
//! `RTCPeerConnection`, frames inside frames included; with the `LinkPreconnect` feature off, preconnect
//! opens nothing. A third (0.3-P2-fix6) takes the media devices away: wry grants every request a page
//! makes for the camera or the microphone (wry_web_view_ui_delegate.rs), so with media devices off no
//! document has `navigator.mediaDevices` and none can ask. All are private API, named in
//! src-tauri/page-wall.json (scripts/verify-wall.mjs reads the same file and measures them).
//!
//! Each setting is asked for before it is called and never set by key: a key WebKit does not have throws
//! an Objective-C exception, which unwinding cannot catch, and the app would die. A setting this WebKit
//! does not have is reported as `unavailable`, and then no free page is put in any frame: the board and
//! Preview show a placeholder (src/free-page.ts pageWall) and a render is refused (may_render). Turning a
//! page's scripts off would not be enough: preconnect needs none (scripts/verify-wall.mjs measures it).
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Names {
    pub peer_connection: Pair,
    pub media_devices: Pair,
    pub features: Vec<String>,
    pub feature_list: String,
    pub feature_key: String,
    pub feature_setter: String,
    pub feature_getter: String,
}
#[derive(Deserialize)]
pub(crate) struct Pair {
    pub setter: String,
    pub getter: String,
}

pub(crate) fn names() -> Names {
    serde_json::from_str(include_str!("../page-wall.json")).expect("src-tauri/page-wall.json names the page wall's settings")
}

/// What a setting reads back as once it has been put in.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Setting {
    Off,
    On,
    Unavailable,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct Status {
    pub rtc: Setting,
    pub preconnect: Setting,
    pub capture: Setting,
}

impl Status {
    pub const UNKNOWN: Status = Status { rtc: Setting::Unavailable, preconnect: Setting::Unavailable, capture: Setting::Unavailable };
    /// Whether a free page may be framed: only when every setting reads back off.
    pub fn holds(&self) -> bool {
        self.rtc == Setting::Off && self.preconnect == Setting::Off && self.capture == Setting::Off
    }
}

/// Whether the render window may load a page once the wall has read back. A free page is drawn only
/// behind the wall; without it, it is refused, with where to read it instead. A section page is the app's
/// own markup and is drawn as before.
pub fn may_render(free: bool, wall: Status) -> Result<(), String> {
    if free && !wall.holds() {
        return Err("this Mac's macOS cannot keep a free page inside its frame (the page wall did not read back off), so it is not drawn. Read its words with aphrodite_get_page_text, or its html with aphrodite_get_page_html.".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{Names, Setting, Status};
    use objc2::runtime::{AnyClass, AnyObject, Bool, MessageReceiver, Sel};
    use objc2::msg_send;
    use objc2_foundation::NSString;
    use std::ffi::CString;

    fn sel(name: &str) -> Option<Sel> {
        CString::new(name).ok().map(|c| Sel::register(&c))
    }

    /// Puts every setting into a webview's preferences, each only when WebKit says it has it, and reads them back.
    pub(crate) unsafe fn put(prefs: &AnyObject, names: &Names) -> Status {
        let class = prefs.class();
        Status { rtc: unsafe { pair_off(prefs, class, &names.peer_connection) }, preconnect: unsafe { features_off(prefs, class, names) }, capture: unsafe { pair_off(prefs, class, &names.media_devices) } }
    }

    unsafe fn pair_off(prefs: &AnyObject, class: &AnyClass, pair: &super::Pair) -> Setting {
        match (sel(&pair.setter), sel(&pair.getter)) {
            (Some(set), Some(get)) if class.responds_to(set) && class.responds_to(get) => {
                let _: () = unsafe { prefs.send_message(set, (Bool::NO,)) };
                let on: Bool = unsafe { prefs.send_message(get, ()) };
                if on.as_bool() { Setting::On } else { Setting::Off }
            }
            _ => Setting::Unavailable,
        }
    }

    unsafe fn features_off(prefs: &AnyObject, class: &AnyClass, names: &Names) -> Setting {
        let (Some(list), Some(key), Some(set), Some(get)) = (sel(&names.feature_list), sel(&names.feature_key), sel(&names.feature_setter), sel(&names.feature_getter)) else { return Setting::Unavailable };
        let Some(preferences) = AnyClass::get(c"WKPreferences") else { return Setting::Unavailable };
        if preferences.class_method(list).is_none() || !class.responds_to(set) || !class.responds_to(get) {
            return Setting::Unavailable;
        }
        let features: *mut AnyObject = unsafe { preferences.send_message(list, ()) };
        let Some(features) = (unsafe { features.as_ref() }) else { return Setting::Unavailable };
        let count: usize = unsafe { msg_send![features, count] };
        let mut states = Vec::new();
        for wanted in &names.features {
            let mut found = Setting::Unavailable;
            for i in 0..count {
                let feature: *mut AnyObject = unsafe { msg_send![features, objectAtIndex: i] };
                let Some(feature) = (unsafe { feature.as_ref() }) else { continue };
                if !feature.class().responds_to(key) {
                    continue;
                }
                let name: *mut NSString = unsafe { feature.send_message(key, ()) };
                if unsafe { name.as_ref() }.map(|n| n.to_string()).as_deref() != Some(wanted.as_str()) {
                    continue;
                }
                let _: () = unsafe { prefs.send_message(set, (Bool::NO, feature)) };
                let on: Bool = unsafe { prefs.send_message(get, (feature,)) };
                found = if on.as_bool() { Setting::On } else { Setting::Off };
                break;
            }
            states.push(found);
        }
        if states.is_empty() || states.contains(&Setting::Unavailable) {
            Setting::Unavailable
        } else if states.contains(&Setting::On) {
            Setting::On
        } else {
            Setting::Off
        }
    }
}

/// Puts the wall into a window's webview and says what it reads back. On the main thread, as with_webview runs;
/// the caller waits up to five seconds for it, so a command does it through put_into_later.
#[cfg(target_os = "macos")]
pub fn put_into(window: &tauri::WebviewWindow) -> Status {
    use std::sync::mpsc::channel;
    use std::time::Duration;
    let (tx, rx) = channel();
    let names = names();
    let sent = window.with_webview(move |platform| {
        let webview: &objc2_web_kit::WKWebView = unsafe { &*(platform.inner() as *const objc2_web_kit::WKWebView) };
        let prefs = unsafe { webview.configuration().preferences() };
        let prefs: &objc2::runtime::AnyObject = prefs.as_ref();
        let _ = tx.send(unsafe { mac::put(prefs, &names) });
    });
    if sent.is_err() {
        return Status::UNKNOWN;
    }
    rx.recv_timeout(Duration::from_secs(5)).unwrap_or(Status::UNKNOWN)
}

#[cfg(not(target_os = "macos"))]
pub fn put_into(_window: &tauri::WebviewWindow) -> Status {
    Status::UNKNOWN
}

/// put_into for a command: the wait is on a thread kept for waiting, not on one of the workers commands run on.
pub async fn put_into_later(window: &tauri::WebviewWindow) -> Status {
    let window = window.clone();
    tauri::async_runtime::spawn_blocking(move || put_into(&window)).await.unwrap_or(Status::UNKNOWN)
}

/// Puts the wall into a window that has nothing loaded yet, then loads what `page` makes of what it read back:
/// the setting goes in before the page, by the shape of this function (the render window's shell makes its
/// frame in the same parse, so a wall put in after would be too late for it).
pub async fn put_then_load(window: &tauri::WebviewWindow, page: impl FnOnce(Status) -> Result<tauri::Url, String>) -> Result<Status, String> {
    let status = put_into_later(window).await;
    let url = page(status)?;
    window.navigate(url).map_err(|e| format!("could not load the page: {e}"))?;
    Ok(status)
}

/// The wall as the calling window has it, put in again (it is the same either way) and read back.
#[tauri::command]
pub async fn page_wall_status(window: tauri::WebviewWindow) -> Status {
    put_into_later(&window).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_names_come_from_one_file_and_say_what_verify_wall_reads() {
        let n = names();
        assert_eq!(n.peer_connection.setter, "_setPeerConnectionEnabled:");
        assert_eq!(n.peer_connection.getter, "_peerConnectionEnabled");
        assert_eq!(n.media_devices.setter, "_setMediaDevicesEnabled:");
        assert_eq!(n.media_devices.getter, "_mediaDevicesEnabled");
        assert_eq!(n.features, vec!["LinkPreconnect".to_string()]);
        assert!(include_str!("../../scripts/verify-wall.mjs").contains("src-tauri/page-wall.json"));
    }

    #[test]
    fn scripts_may_run_only_when_both_settings_read_back_off() {
        assert!(Status { rtc: Setting::Off, preconnect: Setting::Off, capture: Setting::Off }.holds());
        for (rtc, preconnect, capture) in [(Setting::On, Setting::Off, Setting::Off), (Setting::Off, Setting::Unavailable, Setting::Off), (Setting::Off, Setting::Off, Setting::On), (Setting::Off, Setting::Off, Setting::Unavailable), (Setting::Unavailable, Setting::Unavailable, Setting::Unavailable)] {
            assert!(!Status { rtc, preconnect, capture }.holds());
        }
        assert!(!Status::UNKNOWN.holds());
        assert_eq!(serde_json::to_string(&Status::UNKNOWN).unwrap(), r#"{"rtc":"unavailable","preconnect":"unavailable","capture":"unavailable"}"#);
    }

    #[test]
    fn a_free_page_is_rendered_only_behind_the_wall_and_otherwise_refused_with_where_to_read_it() {
        let off = Status { rtc: Setting::Off, preconnect: Setting::Off, capture: Setting::Off };
        assert!(may_render(true, off).is_ok());
        for (rtc, preconnect, capture) in [(Setting::On, Setting::Off, Setting::Off), (Setting::Off, Setting::Unavailable, Setting::Off), (Setting::Unavailable, Setting::Off, Setting::Off), (Setting::Off, Setting::Off, Setting::Unavailable)] {
            let refused = may_render(true, Status { rtc, preconnect, capture }).unwrap_err();
            assert!(refused.contains("aphrodite_get_page_text"), "{refused}");
        }
        // A section page is the app's own markup and draws as it did before the wall.
        assert!(may_render(false, Status::UNKNOWN).is_ok());
        // Nothing here reads or rewrites the page's markup to decide.
        assert!(!include_str!("page_wall.rs").contains(&["fn scripts", "_off("].concat()));
    }
    // What this WebKit does with the names, the right ones and wrong ones, is measured by verify:wall in a real
    // WKWebView: a test thread here is not the main thread, and WebKit stops the process when a preferences
    // object is made off it.
}
