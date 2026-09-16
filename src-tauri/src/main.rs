#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agent;
mod fonts;
mod image_library;
mod reference;
mod snapshot;
mod update;
mod vault;
mod workspace;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // A relaunch after an update starts us from the old process, and macOS does not hand
            // that child the front. The window came back behind everything — on a second display it
            // was never painted at all, so the app looked like it had opened blank. Whoever started
            // us, a window a person just asked for belongs in front.
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .manage(agent::AgentBridge::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            reference::recognize_reference,
            workspace::workspace_read,
            workspace::workspace_write,
            workspace::workspace_recovery,
            vault::vault_sync,
            vault::vault_document,
            vault::vault_read,
            agent::agent_bridge_start,
            agent::agent_bridge_reply,
            agent::agent_bridge_info,
            image_library::image_library_list,
            image_library::image_library_read,
            image_library::image_library_import,
            image_library::image_library_reveal,
            image_library::image_library_delete,
            fonts::fonts_installed,
            fonts::fonts_has_family,
            fonts::fonts_install,
            fonts::fonts_uninstall,
            update::update_check,
            update::update_download,
            update::update_open,
            update::update_reveal,
            update::update_notes,
            update::open_external,
            snapshot::render_page
        ])
        .run(tauri::generate_context!())
        .expect("Aphrodite could not start");
}
