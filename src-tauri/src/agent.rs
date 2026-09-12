//! Agent bridge: a loopback HTTP endpoint that lets an agent drive the app while Agent mode is on.
//! Requests are forwarded to the webview as `agent:command` events; the frontend executes them
//! (as untrusted DOM events, which the input gate lets through) and answers via `agent_bridge_reply`.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Method, Response, Server};

#[derive(Default)]
pub struct AgentBridge {
    inner: Mutex<Option<Endpoint>>,
    pending: Arc<Mutex<HashMap<u64, Sender<Value>>>>,
}

#[derive(Clone)]
struct Endpoint {
    port: u16,
    token: String,
}

fn random_token() -> String {
    let mut bytes = [0u8; 24];
    let seeded = std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .is_ok();
    if !seeded {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        for (i, b) in bytes.iter_mut().enumerate() {
            *b = ((t >> (i * 5)) & 0xff) as u8 ^ (i as u8).wrapping_mul(31);
        }
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn respond(request: tiny_http::Request, status: u16, body: Value) {
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap());
    let _ = request.respond(response);
}

fn write_endpoint_file(app: &AppHandle, port: u16, token: &str) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("agent-endpoint.json");
    let started = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let body = json!({
        "schema": "aphrodite.agent-endpoint/1",
        "port": port,
        "token": token,
        "base": format!("http://127.0.0.1:{port}"),
        "startedAt": started
    });
    std::fs::write(&path, body.to_string()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(path.to_string_lossy().to_string())
}

/// Starts (or returns) the loopback endpoint. Called when Agent mode begins.
#[tauri::command]
pub fn agent_bridge_start(app: AppHandle, bridge: State<'_, AgentBridge>) -> Result<Value, String> {
    if let Some(existing) = bridge.inner.lock().map_err(|e| e.to_string())?.clone() {
        let path = write_endpoint_file(&app, existing.port, &existing.token)?;
        return Ok(json!({"port": existing.port, "token": existing.token, "file": path}));
    }
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
        #[allow(unreachable_patterns)]
        _ => return Err("unsupported listener".into()),
    };
    let token = random_token();
    *bridge.inner.lock().map_err(|e| e.to_string())? = Some(Endpoint { port, token: token.clone() });
    let pending = bridge.pending.clone();
    let app_handle = app.clone();
    let expected = format!("Bearer {token}");
    std::thread::spawn(move || {
        let mut next_id: u64 = 1;
        for mut request in server.incoming_requests() {
            let authorized = request
                .headers()
                .iter()
                .any(|h| h.field.equiv("Authorization") && h.value.as_str() == expected);
            if !authorized {
                respond(request, 401, json!({"error": "missing or wrong bearer token"}));
                continue;
            }
            let url = request.url().to_string();
            let kind = match (request.method(), url.as_str()) {
                (Method::Get, "/agent/state") => "state",
                (Method::Post, "/agent/act") => "act",
                (Method::Post, "/agent/click") => "click",
                (Method::Post, "/agent/type") => "type",
                (Method::Post, "/agent/key") => "key",
                (Method::Post, "/agent/command") => "command",
                (Method::Post, "/agent/edit") => "edit",
                (Method::Post, "/agent/library") => "library",
                (Method::Post, "/agent/end") => "end",
                _ => {
                    respond(
                        request,
                        404,
                        json!({"error": "unknown route", "routes": ["GET /agent/state", "POST /agent/act", "POST /agent/click", "POST /agent/type", "POST /agent/key", "POST /agent/command", "POST /agent/edit", "POST /agent/library", "POST /agent/end"]}),
                    );
                    continue;
                }
            };
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);
            let payload: Value = if body.trim().is_empty() {
                json!({})
            } else {
                match serde_json::from_str(&body) {
                    Ok(v) => v,
                    Err(e) => {
                        respond(request, 400, json!({"error": format!("invalid JSON: {e}")}));
                        continue;
                    }
                }
            };
            let id = next_id;
            next_id += 1;
            let (tx, rx) = channel::<Value>();
            if let Ok(mut map) = pending.lock() {
                map.insert(id, tx);
            }
            if app_handle
                .emit("agent:command", json!({"id": id, "kind": kind, "payload": payload}))
                .is_err()
            {
                respond(request, 500, json!({"error": "webview unavailable"}));
                continue;
            }
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(result) => {
                    let status = if result.get("error").is_some() { 409 } else { 200 };
                    respond(request, status, result);
                }
                Err(_) => {
                    if let Ok(mut map) = pending.lock() {
                        map.remove(&id);
                    }
                    respond(request, 504, json!({"error": "the app did not answer in 15s"}));
                }
            }
        }
    });
    let path = write_endpoint_file(&app, port, &token)?;
    Ok(json!({"port": port, "token": token, "file": path}))
}

/// The webview answers a forwarded command.
#[tauri::command]
pub fn agent_bridge_reply(bridge: State<'_, AgentBridge>, id: u64, result: Value) -> Result<(), String> {
    let sender = bridge.pending.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(tx) = sender {
        let _ = tx.send(result);
    }
    Ok(())
}

#[tauri::command]
pub fn agent_bridge_info(bridge: State<'_, AgentBridge>) -> Result<Value, String> {
    Ok(match bridge.inner.lock().map_err(|e| e.to_string())?.clone() {
        Some(e) => json!({"port": e.port, "running": true}),
        None => json!({"running": false}),
    })
}
