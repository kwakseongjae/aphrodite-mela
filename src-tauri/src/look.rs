//! The app's own look, on the main window only (src/theme.ts): light, dark or the Mac's.
//!
//! The theme setter tauri offers changes the whole application's appearance on macOS, and with it every
//! window this app opens, the off-screen one that renders a page for an agent included. So the look is put
//! on the main window by itself, and a window that draws the person's design is held light whatever the
//! app's look or the Mac's (render windows, src-tauri/src/snapshot.rs). The choice is also kept in a file
//! of its own, so the window is on its paper before it is shown, not after the page has read its storage.
use tauri::{AppHandle, Manager, WebviewWindow};

/// --ui-bg-app in each theme (src/ui/tokens.ts; tests/app-theme.test.ts holds the two to it).
pub const LIGHT_PAPER: (u8, u8, u8) = (247, 245, 239);
pub const DARK_PAPER: (u8, u8, u8) = (27, 26, 22);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Look {
    System,
    Light,
    Dark,
}

impl Look {
    pub fn parse(text: &str) -> Option<Look> {
        match text.trim() {
            "system" => Some(Look::System),
            "light" => Some(Look::Light),
            "dark" => Some(Look::Dark),
            _ => None,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Look::System => "system",
            Look::Light => "light",
            Look::Dark => "dark",
        }
    }
}

fn kept(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("look"))
}

/// The look kept from the last pick; the Mac's when there is none or it cannot be read.
pub fn saved(app: &AppHandle) -> Look {
    kept(app).and_then(|file| std::fs::read_to_string(file).ok()).and_then(|text| Look::parse(&text)).unwrap_or(Look::System)
}

/// The main window's appearance and paper for a look. Following the Mac clears the window's own
/// appearance, so it takes the application's, which nothing here ever sets.
pub fn apply(window: &WebviewWindow, look: Look) {
    appearance(window, match look {
        Look::System => None,
        Look::Light => Some("NSAppearanceNameAqua"),
        Look::Dark => Some("NSAppearanceNameDarkAqua"),
    });
    let dark = match look {
        Look::Dark => true,
        Look::Light => false,
        Look::System => matches!(window.theme(), Ok(tauri::Theme::Dark)),
    };
    let (r, g, b) = if dark { DARK_PAPER } else { LIGHT_PAPER };
    let _ = window.set_background_color(Some(tauri::window::Color(r, g, b, 255)));
}

/// A window that draws the person's design: light, whatever the app's look or the Mac's.
pub fn light_only(window: &WebviewWindow) {
    appearance(window, Some("NSAppearanceNameAqua"));
}

#[cfg(target_os = "macos")]
fn appearance(window: &WebviewWindow, name: Option<&'static str>) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || {
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};
        use objc2_foundation::NSString;
        let Ok(ns_window) = target.ns_window() else { return };
        let ns_window = ns_window as *mut AnyObject;
        if ns_window.is_null() {
            return;
        }
        unsafe {
            let chosen: *mut AnyObject = match name {
                Some(name) => {
                    let Some(class) = AnyClass::get(c"NSAppearance") else { return };
                    let name = NSString::from_str(name);
                    msg_send![class, appearanceNamed: &*name]
                }
                None => std::ptr::null_mut(),
            };
            let _: () = msg_send![ns_window, setAppearance: chosen];
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn appearance(_window: &WebviewWindow, _name: Option<&'static str>) {}

/// The person's pick (src/main.ts paintPaper): kept for the next launch, and put on the main window.
#[tauri::command]
pub fn window_look(app: AppHandle, look: String) -> Result<(), String> {
    let look = Look::parse(&look).ok_or("not a look: system, light or dark")?;
    if let Some(file) = kept(&app) {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(file, look.name());
    }
    if let Some(window) = app.get_webview_window("main") {
        apply(&window, look);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_look_reads_back_as_it_was_written_and_nothing_else_is_one() {
        for look in [Look::System, Look::Light, Look::Dark] {
            assert_eq!(Look::parse(look.name()), Some(look));
        }
        assert_eq!(Look::parse("dark\n"), Some(Look::Dark));
        assert_eq!(Look::parse("night"), None);
        assert_eq!(Look::parse(""), None);
    }
}
