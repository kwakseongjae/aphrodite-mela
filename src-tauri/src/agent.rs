//! Agent bridge: a loopback HTTP endpoint that lets an agent drive the app while Agent mode is on.
//! Requests are forwarded to the webview as `agent:command` events; the frontend executes them
//! (as untrusted DOM events, which the input gate lets through) and answers via `agent_bridge_reply`.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::mpsc::{channel, Sender};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Method, Response, Server};

#[derive(Default)]
pub struct AgentBridge {
    inner: Mutex<Option<Endpoint>>,
    pending: Arc<Mutex<HashMap<u64, Sender<Value>>>>,
    /// Pages waiting to be photographed. A hidden webview cannot carry an Authorization header, so
    /// each one is left behind an unguessable one-shot path on the loopback server instead.
    renders: Arc<Mutex<HashMap<String, String>>>,
}

/// Parks a page for the off-screen webview to fetch, and says where to find it. One fetch only.
pub fn stash_render(bridge: &AgentBridge, html: String) -> Result<String, String> {
    let endpoint = bridge.inner.lock().map_err(|e| e.to_string())?.clone().ok_or("the local channel is not running")?;
    let nonce = random_token();
    bridge.renders.lock().map_err(|e| e.to_string())?.insert(nonce.clone(), html);
    Ok(format!("http://127.0.0.1:{}/render/{nonce}", endpoint.port))
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

/// The name an agent gives itself, for the receipts. Cleaned to the same shape the app expects;
/// an empty result means "unknown", which the app turns into `unknown-agent`.
fn caller_label(headers: &[Header]) -> String {
    let raw = headers
        .iter()
        .find(|h| h.field.equiv("X-Aphrodite-Agent"))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default();
    raw.to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .take(32)
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Every route, in the order they are matched. The 404 answer lists exactly this, so a route can
/// never exist without being advertised — a test holds the two together.
pub const ROUTES: &[&str] = &[
    "GET /agent/state",
    "GET /agent/contract",
    "GET /agent/tokens",
    "GET /agent/render",
    "GET /agent/guide",
    "POST /agent/connect",
    "POST /agent/ui",
    "GET /agent/components",
    "POST /agent/apply",
    "POST /agent/act",
    "POST /agent/click",
    "POST /agent/type",
    "POST /agent/key",
    "POST /agent/command",
    "POST /agent/edit",
    "POST /agent/library",
    "POST /agent/end",
];

/// A GET route's query string as a payload object, so `?format=detailed` reaches the app the same
/// way a POST body would. Values are taken literally; the app validates every one of them.
fn query_params(query: &str) -> Value {
    let mut map = serde_json::Map::new();
    for pair in query.split('&').filter(|p| !p.is_empty()).take(10) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key.is_empty() || key.len() > 40 || value.len() > 300 {
            continue;
        }
        map.insert(key.to_string(), Value::String(value.to_string()));
    }
    Value::Object(map)
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
    let renders = bridge.renders.clone();
    let app_handle = app.clone();
    let expected = format!("Bearer {token}");
    std::thread::spawn(move || {
        // One thread per request. The loop used to do the waiting itself, which deadlocked the moment
        // a command made the app come back to this same server — rendering a page does exactly that.
        let next_id = Arc::new(AtomicU64::new(1));
        for mut request in server.incoming_requests() {
            // A page parked for the off-screen renderer. This sits above the bearer check on
            // purpose: a webview cannot carry an Authorization header, so the unguessable one-shot
            // path in the URL is the capability. Loopback only, served once, then forgotten.
            {
                let raw = request.url().to_string();
                let just_path = raw.split('?').next().unwrap_or("").to_string();
                if let Some(nonce) = just_path.strip_prefix("/render/") {
                    let html = renders.lock().ok().and_then(|mut map| map.remove(nonce));
                    match html {
                        Some(body) => {
                            let response = Response::from_string(body)
                                .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap());
                            let _ = request.respond(response);
                        }
                        None => respond(request, 404, json!({"error": "no such page"})),
                    }
                    continue;
                }
            }

            let authorized = request
                .headers()
                .iter()
                .any(|h| h.field.equiv("Authorization") && h.value.as_str() == expected);
            if !authorized {
                respond(request, 401, json!({"error": "missing or wrong bearer token"}));
                continue;
            }
            let caller = caller_label(request.headers());
            let url = request.url().to_string();
            let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
            let kind = match (request.method(), path) {
                (Method::Get, "/agent/state") => "state",
                (Method::Get, "/agent/contract") => "contract",
                (Method::Get, "/agent/tokens") => "tokens",
                (Method::Get, "/agent/render") => "render",
                (Method::Get, "/agent/guide") => "guide",
                (Method::Post, "/agent/connect") => "connect",
                (Method::Post, "/agent/ui") => "ui",
                (Method::Get, "/agent/components") => "components",
                (Method::Post, "/agent/apply") => "apply",
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
                        json!({"error": "unknown route", "routes": ROUTES}),
                    );
                    continue;
                }
            };
            let query_payload = query_params(query);
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);
            let payload: Value = if body.trim().is_empty() {
                query_payload
            } else {
                match serde_json::from_str(&body) {
                    Ok(v) => v,
                    Err(e) => {
                        respond(request, 400, json!({"error": format!("invalid JSON: {e}")}));
                        continue;
                    }
                }
            };
            let id = next_id.fetch_add(1, Ordering::SeqCst);
            let pending = pending.clone();
            let app_handle = app_handle.clone();
            let kind = kind.to_string();
            std::thread::spawn(move || {
                let (tx, rx) = channel::<Value>();
                if let Ok(mut map) = pending.lock() {
                    map.insert(id, tx);
                }
                if app_handle
                    .emit("agent:command", json!({"id": id, "kind": kind, "payload": payload, "caller": caller}))
                    .is_err()
                {
                    respond(request, 500, json!({"error": "webview unavailable"}));
                    return;
                }
                // Long enough for a page to be laid out and photographed, which is the slowest thing
                // the app is asked to do.
                match rx.recv_timeout(Duration::from_secs(30)) {
                    Ok(result) => {
                        // The app decides the status; 409 stays the default refusal for older replies.
                        let asked = result.get("status").and_then(|v| v.as_u64()).unwrap_or(0);
                        let status = match (asked, result.get("error").is_some()) {
                            (403 | 409 | 423, _) => asked as u16,
                            (_, true) => 409,
                            (_, false) => 200,
                        };
                        respond(request, status, result);
                    }
                    Err(_) => {
                        if let Ok(mut map) = pending.lock() {
                            map.remove(&id);
                        }
                        respond(request, 504, json!({"error": "the app did not answer in 30s"}));
                    }
                }
            });
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

#[cfg(test)]
mod tests {
    use super::*;

    fn header(name: &str, value: &str) -> Header {
        Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("header")
    }

    #[test]
    fn the_caller_label_is_read_from_the_header_and_cleaned() {
        assert_eq!(caller_label(&[header("X-Aphrodite-Agent", "claude-code")]), "claude-code");
        assert_eq!(caller_label(&[header("x-aphrodite-agent", "Astra")]), "astra", "the field name is case-insensitive");
        assert_eq!(caller_label(&[header("X-Aphrodite-Agent", "my agent!")]), "myagent");
        assert_eq!(caller_label(&[header("X-Aphrodite-Agent", "-astra-")]), "astra");
        assert_eq!(caller_label(&[header("X-Aphrodite-Agent", &"x".repeat(80))]).len(), 32);
    }

    /// The matcher and the 404 list must stay the same set: a route that exists but is not advertised
    /// is a route agents never find, and one advertised but missing is a promise the app breaks.
    #[test]
    fn every_advertised_route_is_matched_and_every_matched_route_is_advertised() {
        let source = include_str!("agent.rs");
        let matcher = source
            .split("let kind = match (request.method(), path) {")
            .nth(1)
            .and_then(|rest| rest.split("_ => {").next())
            .expect("the route matcher");
        for route in ROUTES {
            let (method, path) = route.split_once(' ').expect("METHOD /path");
            let arm = format!("(Method::{}, \"{}\")", if method == "GET" { "Get" } else { "Post" }, path);
            assert!(matcher.contains(&arm), "{route} is advertised but not matched");
        }
        let matched = matcher.matches("(Method::").count();
        assert_eq!(matched, ROUTES.len(), "the matcher has {matched} routes but {} are advertised", ROUTES.len());
    }

    #[test]
    fn a_get_routes_query_string_becomes_the_payload() {
        assert_eq!(query_params("format=detailed&pageId=abc"), json!({"format": "detailed", "pageId": "abc"}));
        assert_eq!(query_params(""), json!({}));
        assert_eq!(query_params("flag"), json!({"flag": ""}));
        assert_eq!(query_params(&format!("big={}", "x".repeat(400))), json!({}), "an overlong value is dropped, not truncated into something else");
        assert_eq!(query_params("a=1&a=2"), json!({"a": "2"}), "the last one wins, as query strings usually go");
    }

    #[test]
    fn a_missing_or_empty_label_comes_back_empty_for_the_app_to_name() {
        assert_eq!(caller_label(&[]), "");
        assert_eq!(caller_label(&[header("Authorization", "Bearer abc")]), "");
        assert_eq!(caller_label(&[header("X-Aphrodite-Agent", "   ")]), "");
        assert_eq!(caller_label(&[header("X-Aphrodite-Agent", "!!!")]), "");
    }
}
