#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agent;
mod reference;
mod vault;
mod workspace;

fn main() {
    tauri::Builder::default()
        .manage(agent::AgentBridge::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            agent::agent_bridge_info
        ])
        .run(tauri::generate_context!())
        .expect("Aphrodite could not start");
}
