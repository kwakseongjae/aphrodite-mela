//! Rendering a page to an image.
//!
//! An agent that changes a design should be able to look at the result. The app's own window is the
//! wrong thing to photograph — it would return panels, a dock and whatever zoom the person happens to
//! be at — so this puts the exported page HTML into a webview of its own, off screen, at the width
//! being asked about, and photographs that. No browser to install: the same WebKit that draws the app
//! draws the picture.
#[cfg(target_os = "macos")]
use std::sync::mpsc::channel;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Wide enough for a desktop frame, small enough that a stray value cannot ask for a gigapixel.
const MIN_WIDTH: f64 = 240.0;
const MAX_WIDTH: f64 = 2_000.0;
const MAX_HEIGHT: f64 = 6_000.0;

fn clamp(value: f64, low: f64, high: f64) -> f64 {
    if value.is_finite() { value.max(low).min(high) } else { low }
}

/// Renders `html` off screen at `width` and answers with a PNG, base64 encoded.
#[tauri::command]
pub async fn render_page(app: AppHandle, html: String, width: f64, height: f64) -> Result<String, String> {
    let width = clamp(width, MIN_WIDTH, MAX_WIDTH);
    let height = clamp(height, 320.0, MAX_HEIGHT);
    if html.len() > 4_000_000 {
        return Err("that page is too large to render".into());
    }
    // A window of its own, never shown, closed as soon as the picture is taken.
    let label = format!("render-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    // WKWebView refuses to navigate to a top-level data: URL, so the page is parked on the app's own
    // loopback server and fetched from there.
    let url = crate::agent::stash_render(&app.state::<crate::agent::AgentBridge>(), html)?;
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url.parse().map_err(|_| "could not build the page url")?))
        .title("render")
        .inner_size(width, height)
        // A window that is never composited cannot be photographed: macOS gives back an empty image.
        // So it is a real window, drawn, but parked far outside any display and never focused.
        .visible(true)
        .focused(false)
        .decorations(false)
        .skip_taskbar(true)
        .position(-9_000.0, -9_000.0)
        .build()
        .map_err(|e| format!("could not open an off-screen webview: {e}"))?;

    // Let the page lay out and fetch what it needs before the shutter.
    tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(1_500))).await.ok();
    let png = snapshot(&window, width, height);
    let _ = window.close();
    png
}

/// Percent-encodes for a data URL. Only the characters that would end the URL or confuse the parser.
fn urlencode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() + 64);
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => out.push(*byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn snapshot(window: &tauri::WebviewWindow, width: f64, height: f64) -> Result<String, String> {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};

    let (tx, rx) = channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |platform| {
            let webview: &WKWebView = unsafe { &*(platform.inner() as *const WKWebView) };
            // Everything here runs on the main thread: that is where with_webview puts us.
            let marker = unsafe { objc2_foundation::MainThreadMarker::new_unchecked() };
            let config = unsafe { WKSnapshotConfiguration::new(marker) };
            unsafe {
                config.setSnapshotWidth(Some(&objc2_foundation::NSNumber::new_f64(width)));
                // A window nobody can see never gets a screen update, so waiting for one waits for
                // ever and the picture comes back blank. Take what the render tree already holds.
                config.setAfterScreenUpdates(false);
            }
            let sender = tx.clone();
            let handler = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                if image.is_null() {
                    let _ = sender.send(Err(if error.is_null() { "the page did not render".into() } else { "the page did not render".into() }));
                    return;
                }
                let image: &NSImage = unsafe { &*image };
                let bytes = unsafe {
                    image.TIFFRepresentation().and_then(|tiff| {
                        NSBitmapImageRep::imageRepWithData(&tiff).and_then(|rep| {
                            rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
                        })
                    })
                };
                let _ = sender.send(match bytes {
                    Some(data) => Ok(data.to_vec()),
                    None => Err("could not encode the picture".into()),
                });
            });
            unsafe {
                webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &handler);
            }
            let _ = (height, std::mem::size_of::<Retained<AnyObject>>());
        })
        .map_err(|e| format!("could not reach the webview: {e}"))?;

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(bytes)) => Ok(base64(&bytes)),
        Ok(Err(message)) => Err(message),
        Err(_) => Err("the page did not render in time".into()),
    }
}

#[cfg(not(target_os = "macos"))]
fn snapshot(_window: &tauri::WebviewWindow, _width: f64, _height: f64) -> Result<String, String> {
    Err("rendering a page to an image is macOS only for now".into())
}

fn base64(bytes: &[u8]) -> String {
    const SET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(SET[(n >> 18) as usize & 63] as char);
        out.push(SET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { SET[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { SET[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_width_is_kept_inside_what_can_be_drawn() {
        assert_eq!(clamp(1440.0, MIN_WIDTH, MAX_WIDTH), 1440.0);
        assert_eq!(clamp(10.0, MIN_WIDTH, MAX_WIDTH), MIN_WIDTH);
        assert_eq!(clamp(99_999.0, MIN_WIDTH, MAX_WIDTH), MAX_WIDTH);
        assert_eq!(clamp(f64::NAN, MIN_WIDTH, MAX_WIDTH), MIN_WIDTH);
        assert_eq!(clamp(f64::INFINITY, MIN_WIDTH, MAX_WIDTH), MIN_WIDTH);
    }

    #[test]
    fn the_page_survives_becoming_a_url() {
        assert_eq!(urlencode("<h1>hi</h1>"), "%3Ch1%3Ehi%3C%2Fh1%3E");
        assert_eq!(urlencode("빛"), "%EB%B9%9B", "Hangul travels as utf-8 bytes");
        assert!(!urlencode("a#b&c?d").contains('#'), "nothing that would cut the url short survives");
        assert!(!urlencode("a#b&c?d").contains('&'));
    }

    #[test]
    fn base64_matches_the_usual_padding() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"a"), "YQ==");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"abc"), "YWJj");
        assert_eq!(base64(&[0x89, b'P', b'N', b'G']), "iVBORw==");
    }
}
