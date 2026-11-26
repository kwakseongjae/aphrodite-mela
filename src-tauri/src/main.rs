#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agent;
mod board;
mod connect;
mod disk;
mod fonts;
mod image_library;
mod import;
mod opened;
mod page_wall;
mod reference;
mod references;
mod snapshot;
mod taste;
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
                // The page wall goes in first, before any free page's frame can be made (src-tauri/src/page_wall.rs).
                // The app's own page may already be loading; it uses no WebRTC, and every frame made after this has none.
                let _ = page_wall::put_into(&window);
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .manage(agent::AgentBridge::default())
        .manage(opened::OpenedState(Default::default()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(import::plugin())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
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
            import::html_import_pick,
            import::html_import_take,
            import::html_import_read,
            import::html_import_media,
            opened::opened_take,
            opened::opened_file_read
        ])
        .on_window_event(|window,event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                disk::release_close(window.label(), disk::Release::WindowDestroyed);
            }
        })
        .build(tauri::generate_context!())
        .expect("Aphrodite could not start")
        .run(|app, event| {
            // A board file opened from Finder, or an aphrodite:// link pressed elsewhere (src-tauri/src/opened.rs).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let others = urls.into_iter().filter(|url| {
                    !import::route_file(url, |path| {
                        if !import::handed_html(path) { return false; }
                        import::hand_over(app, path);
                        true
                    })
                }).collect();
                opened::opened(app, others);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
