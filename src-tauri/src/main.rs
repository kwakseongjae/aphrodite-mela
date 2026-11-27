#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agent;
mod board;
mod channel;
mod connect;
mod disk;
mod fonts;
mod image_library;
mod look;
mod opened;
mod page_wall;
mod reference;
mod references;
mod snapshot;
mod taste;
mod update;
mod vault;
mod workspace;

fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

fn main() {
    let context = context();
    let channel = channel::Channel::from_identifier(&context.config().identifier);
    tauri::Builder::default()
        .setup(|app| {
            // A relaunch after an update starts us from the old process, and macOS does not hand
            // that child the front. The window came back behind everything — on a second display it
            // was never painted at all, so the app looked like it had opened blank. Whoever started
            // us, a window a person just asked for belongs in front.
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                // The page wall goes in first, before any free page's frame can be made (src-tauri/src/page_wall.rs).
                // The app's own page may already be loading; it uses no WebRTC, and every frame made after this has none.
                let _ = page_wall::put_into(&window);
                // The window opens hidden (tauri.conf.json) and is put on the look the person last picked, or the
                // Mac's, and on that look's paper before it is shown: no other theme shows before the first paint.
                look::apply(&window, look::saved(app.handle()));
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .manage(agent::AgentBridge::default())
        .manage(opened::OpenedState(Default::default()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new()
            .default_version_comparator(move |current, release| update::can_install(channel, current, release)).build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            look::window_look,
            connect::connect_status,
            connect::connect_preview,
            connect::connect_apply,
            connect::connect_remove,
            connect::connect_snippet,
            reference::recognize_reference,
            disk::disk_begin_close,
            disk::disk_end_close,
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
            references::references_list,
            references::references_poster,
            references::references_add,
            references::references_delete,
            references::references_fetch,
            taste::taste_read,
            taste::taste_write,
            taste::taste_forget,
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
            update::open_link,
            snapshot::render_page,
            snapshot::render_free_page,
            page_wall::page_wall_status,
            board::board_media_begin,
            board::board_media_chunk,
            board::board_media_finish,
            board::board_media_stat,
            board::board_media_read,
            board::board_media_import,
            board::board_media_release,
            board::board_media_path,
            board::free_page_write,
            opened::opened_take,
            opened::opened_file_read
        ])
        .on_window_event(|window,event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                disk::release_close(window.label(), disk::Release::WindowDestroyed);
            }
        })
        .build(context)
        .expect("Aphrodite could not start")
        .run(|app, event| {
            // A board file opened from Finder, or an aphrodite:// link pressed elsewhere (src-tauri/src/opened.rs).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                opened::opened(app, urls);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

#[test]
fn the_compiled_context_uses_the_identity_and_updater_of_the_selected_build() {
    let context = context();
    let base: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let patch: serde_json::Value = serde_json::from_str(option_env!("TAURI_CONFIG").unwrap_or("{}")).unwrap();
    let expected = |key: &str| patch[key].as_str().or_else(|| base[key].as_str()).unwrap();
    let config = context.config();
    assert_eq!(config.identifier, expected("identifier"));
    assert_eq!(context.package_info().name, expected("productName"));
    assert_eq!(context.package_info().version.to_string(), expected("version"));
    let endpoint = "/plugins/updater/endpoints";
    assert_eq!(Some(&config.plugins.0["updater"]["endpoints"]), patch.pointer(endpoint).or_else(|| base.pointer(endpoint)));
}
