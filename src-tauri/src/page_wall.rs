//! The page wall (0.3-P2-fix3): two WebKit settings that keep a free page off the network where its
//! frame's policy cannot. WebRTC reaches any address over UDP whatever `connect-src` says, and
//! `<link rel=preconnect>` opens a connection to a host of the page's choosing with no script at all; a
//! script in the page's own window cannot hold either (lab/review-board/evidence/reviews/2026-11-19-opus-
//! 0.3-P2-sandbox.md). WebKit can: with peer connections off, no document made afterwards has
//! `RTCPeerConnection`, frames inside frames included; with the `LinkPreconnect` feature off, preconnect
//! opens nothing. Both are private API, named in src-tauri/page-wall.json (scripts/verify-wall.mjs reads
//! the same file and measures them).
//!
//! Each setting is asked for before it is called and never set by key: a key WebKit does not have throws
//! an Objective-C exception, which unwinding cannot catch, and the app would die. A setting this WebKit
//! does not have is reported as `unavailable`, and the app then turns page scripts off (src/free-page.ts
//! pageScripts; the renderer here, scripts_off).
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Names {
    pub peer_connection: Pair,
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
}

impl Status {
    pub const UNKNOWN: Status = Status { rtc: Setting::Unavailable, preconnect: Setting::Unavailable };
    /// Whether page scripts may run: only when both settings read back off.
    pub fn holds(&self) -> bool {
        self.rtc == Setting::Off && self.preconnect == Setting::Off
    }
}

/// The page with every frame's scripts off: what is drawn when the wall does not hold. The render shell
/// and a section page name `allow-scripts` only in a frame's sandbox; a frame inside one without it
/// cannot get it back.
pub(crate) fn scripts_off(html: &str) -> String {
    html.replace("sandbox=\"allow-scripts\"", "sandbox=\"\"")
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

    /// Puts both settings into a webview's preferences, each only when WebKit says it has it, and reads them back.
    pub(crate) unsafe fn put(prefs: &AnyObject, names: &Names) -> Status {
        let class = prefs.class();
        let rtc = match (sel(&names.peer_connection.setter), sel(&names.peer_connection.getter)) {
            (Some(set), Some(get)) if class.responds_to(set) && class.responds_to(get) => {
                let _: () = unsafe { prefs.send_message(set, (Bool::NO,)) };
                let on: Bool = unsafe { prefs.send_message(get, ()) };
                if on.as_bool() { Setting::On } else { Setting::Off }
            }
            _ => Setting::Unavailable,
        };
        Status { rtc, preconnect: unsafe { features_off(prefs, class, names) } }
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

/// Puts the wall into a window's webview and says what it reads back. On the main thread, as with_webview runs.
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

/// Puts the wall into a window that has nothing loaded yet, then loads what `page` makes of what it read back:
/// the setting goes in before the page, by the shape of this function (the render window's shell makes its
/// frame in the same parse, so a wall put in after would be too late for it).
pub fn put_then_load(window: &tauri::WebviewWindow, page: impl FnOnce(Status) -> Result<tauri::Url, String>) -> Result<Status, String> {
    let status = put_into(window);
    let url = page(status)?;
    window.navigate(url).map_err(|e| format!("could not load the page: {e}"))?;
    Ok(status)
}

/// The wall as the calling window has it, put in again (it is the same either way) and read back.
#[tauri::command]
pub async fn page_wall_status(window: tauri::WebviewWindow) -> Status {
    put_into(&window)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_names_come_from_one_file_and_say_what_verify_wall_reads() {
        let n = names();
        assert_eq!(n.peer_connection.setter, "_setPeerConnectionEnabled:");
        assert_eq!(n.peer_connection.getter, "_peerConnectionEnabled");
        assert_eq!(n.features, vec!["LinkPreconnect".to_string()]);
        assert!(include_str!("../../scripts/verify-wall.mjs").contains("src-tauri/page-wall.json"));
    }

    #[test]
    fn scripts_may_run_only_when_both_settings_read_back_off() {
        assert!(Status { rtc: Setting::Off, preconnect: Setting::Off }.holds());
        for (rtc, preconnect) in [(Setting::On, Setting::Off), (Setting::Off, Setting::Unavailable), (Setting::Unavailable, Setting::Unavailable)] {
            assert!(!Status { rtc, preconnect }.holds());
        }
        assert!(!Status::UNKNOWN.holds());
        assert_eq!(serde_json::to_string(&Status::UNKNOWN).unwrap(), r#"{"rtc":"unavailable","preconnect":"unavailable"}"#);
    }

    #[test]
    fn without_the_wall_no_frame_may_run_scripts() {
        let shell = r#"<iframe sandbox="allow-scripts" srcdoc="&lt;iframe sandbox=&quot;allow-scripts&quot;&gt;"></iframe><iframe sandbox="allow-scripts"></iframe>"#;
        let off = scripts_off(shell);
        assert!(!off.contains(r#"sandbox="allow-scripts""#));
        assert_eq!(off.matches(r#"sandbox="""#).count(), 2);
    }
    // What this WebKit does with the names, the right ones and wrong ones, is measured by verify:wall in a real
    // WKWebView: a test thread here is not the main thread, and WebKit stops the process when a preferences
    // object is made off it.
}
