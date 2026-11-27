//! Stdio framing and a blocking loopback client. The application owns every permission decision.
mod wire;
use serde_json::{json, Map, Value};
use std::{
    collections::VecDeque,
    env, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};

fn manifest() -> &'static Value {
    static DATA: OnceLock<Value> = OnceLock::new();
    DATA.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src-tauri/bin/mcp-manifest.json")).unwrap()
    })
}

fn text(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}

fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
        Value::Number(n) => ryu_js::Buffer::new().format(n.as_f64().unwrap()).into(),
        _ => v.to_string(),
    }
}

fn field(v: &Value, key: &str) -> String {
    v.get(key)
        .map(js_string)
        .unwrap_or_else(|| "undefined".into())
}

fn caller(name: &Value) -> String {
    let mut clean = String::new();
    for c in text(name).to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            clean.push(c);
        } else if ((c.is_whitespace() && c != '\u{85}')
            || matches!(c, '_' | '.' | '-' | '\u{feff}'))
            && !clean.is_empty()
            && !clean.ends_with('-')
        {
            clean.push('-');
        }
        if clean.len() == 32 {
            break;
        }
    }
    let clean = clean.trim_end_matches('-');
    if clean.is_empty() || clean == "human" {
        text(&manifest()["fallbackCaller"]).into()
    } else {
        clean.into()
    }
}

fn query_escape(s: &str) -> String {
    let mut out = String::new();
    for &b in s.as_bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(char::from(b));
        } else {
            use std::fmt::Write;
            write!(out, "%{b:02X}").unwrap();
        }
    }
    out
}

fn endpoint(path: &Path) -> Option<(String, String)> {
    let bytes = wire::bytes(fs::File::open(path).ok()?, wire::limit("endpointBytes")).ok()?;
    let v = wire::parse(wire::decode(&bytes).ok()?).ok()?;
    let base = v["base"].as_str()?;
    let port = base.strip_prefix("http://127.0.0.1:")?;
    if !port.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    port.parse::<u16>().ok()?;
    let token = v["token"].as_str()?.to_owned();
    if token.is_empty() {
        return None;
    }
    if v["pid"].is_number() {
        let pid = i32::try_from(v["pid"].as_i64()?).ok()?;
        // Signal zero probes existence only; a process with a different owner also counts.
        if unsafe { libc::kill(pid, 0) } != 0
            && io::Error::last_os_error().raw_os_error() != Some(libc::EPERM)
        {
            return None;
        }
    }
    Some((base.into(), token))
}

fn answer(message: Value, error: bool) -> Value {
    json!({"content":[{"type":"text","text":message}],"isError":error})
}
fn offline(name: &str) -> Value {
    let guide = name == "aphrodite_guide";
    answer(
        manifest()[if guide { "offlineGuide" } else { "notRunning" }].clone(),
        !guide,
    )
}
fn fill(parts: &Value, args: &[String]) -> String {
    let mut s = String::new();
    for (i, part) in parts.as_array().unwrap().iter().enumerate() {
        if i > 0 {
            s.push_str(&args[i - 1]);
        }
        s.push_str(text(part));
    }
    s
}
fn refusal(payload: &Value, status: u16) -> Value {
    let said = payload["error"].as_str().map(str::to_owned)
        .unwrap_or_else(|| fill(&manifest()["refused"], &[status.to_string()]));
    let open = &payload["open"];
    if let Some(name) = open["name"].as_str() {
        let shorten =
            |s: &str| String::from_utf16_lossy(&s.encode_utf16().take(200).collect::<Vec<_>>());
        let mut args = vec![shorten(name)];
        let mut key = "board";
        if let Some(id) = open["project_id"].as_str() {
            args.push(shorten(id));
            key = "boardWithId";
        }
        return json!(said + &fill(&manifest()[key], &args));
    }
    json!(said)
}

fn call(params: &Value, who: &str, path: &Path, client: &ureq::Agent) -> Value {
    let name = field(params, "name");
    let route = &manifest()["routes"][&name];
    if route.is_null() {
        return answer(json!(format!("No such tool \"{name}\".")), true);
    }
    let Some((base, token)) = endpoint(path) else {
        return offline(&name);
    };
    let mut url = base + text(&route["path"]);
    let args = &params["arguments"];
    let mut fields = Map::new();
    for (key, rule) in route["fields"].as_object().unwrap() {
        let value = if let Some(k) = rule.as_str() {
            args.get(k)
        } else if let Some(constant) = rule.get("value") {
            Some(constant)
        } else {
            args.get(text(&rule["arg"]))
                .filter(|v| !v.is_null())
                .or(rule.get("fallback"))
        };
        if let Some(v) = value {
            fields.insert(key.clone(), v.clone());
        }
    }
    let post = route["method"] == "POST";
    if !post {
        let query = fields
            .iter()
            .filter(|(_, v)| v.as_str() != Some(""))
            .map(|(k, v)| format!("{k}={}", query_escape(&js_string(v))))
            .collect::<Vec<_>>();
        if !query.is_empty() {
            url.push('?');
            url.push_str(&query.join("&"));
        }
    }
    let req = client
        .request(text(&route["method"]), &url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json")
        .set("X-Aphrodite-Agent", who);
    let res = if post {
        req.send_string(&stringify(&Value::Object(fields), false))
    } else {
        req.call()
    };
    let res = match res {
        Ok(r) | Err(ureq::Error::Status(_, r)) => r,
        Err(ureq::Error::Transport(e)) => {
            use std::error::Error;
            if e.source()
                .and_then(|e| e.downcast_ref::<io::Error>())
                .is_some_and(|e| e.kind() == io::ErrorKind::TimedOut)
            {
                return answer(manifest()["timeout"].clone(), true);
            }
            return offline(&name);
        }
    };
    let status = res.status();
    if (300..400).contains(&status) {
        return offline(&name);
    }
    let bytes = match wire::bytes(res.into_reader(), wire::limit("responseBytes")) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::InvalidData => {
            return answer(manifest()["tooLarge"].clone(), true)
        }
        Err(e)
            if matches!(
                e.kind(),
                io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
            ) =>
        {
            return answer(manifest()["timeout"].clone(), true)
        }
        Err(_) => return offline(&name),
    };
    let unexpected = || {
        answer(
            json!(format!(
                "Aphrodite answered something unexpected (HTTP {status})."
            )),
            true,
        )
    };
    let Ok(text) = wire::decode(&bytes) else {
        return unexpected();
    };
    if !wire::fits_tree(text, wire::limit("responseTree")) {
        if wire::validate_raw(text).is_err() {
            return unexpected();
        }
        if (200..300).contains(&status) {
            return answer(json!(text), false);
        }
        let string_member = |object, key| {
            wire::raw_member(object, key).and_then(|raw| serde_json::from_str::<String>(raw).ok())
        };
        let open = wire::raw_member(text, "open").unwrap_or("");
        let fields = json!({
            "error": string_member(text, "error"),
            "open": {"name": string_member(open, "name"), "project_id": string_member(open, "project_id")}
        });
        return answer(refusal(&fields, status), true);
    }
    let Ok(mut payload) = serde_json::from_str::<Value>(text) else {
        return unexpected();
    };
    if !(200..300).contains(&status) {
        return answer(refusal(&payload, status), true);
    }
    if payload.is_null() {
        return Value::Null;
    }
    if payload["guide"].is_string() {
        return answer(payload["guide"].clone(), false);
    }
    if payload["png"].is_string() {
        let png = payload
            .as_object_mut()
            .unwrap()
            .shift_remove("png")
            .unwrap();
        let mime = payload
            .get("mime")
            .filter(|v| !v.is_null())
            .cloned()
            .unwrap_or(json!("image/png"));
        return json!({"content":[{"type":"image","data":png,"mimeType":mime},{"type":"text","text":stringify(&payload,true)}],"isError":false});
    }
    answer(json!(stringify(&payload, true)), false)
}

// JSON.stringify orders array-index keys numerically, and uses ECMAScript's spelling for doubles.
fn stringify(value: &Value, pretty: bool) -> String {
    fn emit(v: &Value, depth: usize, pretty: bool, out: &mut String) {
        let indent = |out: &mut String, d| {
            if !pretty {
                return;
            }
            out.push('\n');
            out.push_str(&"  ".repeat(d));
        };
        let object = v.is_object();
        let entries: Vec<(Option<&String>, &Value)> = if let Some(map) = v.as_object() {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort_by_key(|k| {
                k.parse::<u32>()
                    .ok()
                    .filter(|i| i.to_string() == k.as_str())
                    .unwrap_or(u32::MAX)
            });
            keys.into_iter().map(|k| (Some(k), &map[k])).collect()
        } else if let Some(a) = v.as_array() {
            a.iter().map(|v| (None, v)).collect()
        } else {
            if v.is_number() {
                out.push_str(&js_string(v));
            } else {
                out.push_str(&v.to_string());
            }
            return;
        };
        out.push(if object { '{' } else { '[' });
        for (i, (key, value)) in entries.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            indent(out, depth + 1);
            if let Some(k) = key {
                out.push_str(&serde_json::to_string(k).unwrap());
                out.push_str(if pretty { ": " } else { ":" });
            }
            emit(value, depth + 1, pretty, out);
        }
        if !entries.is_empty() {
            indent(out, depth);
        }
        out.push(if object { '}' } else { ']' });
    }
    let mut out = String::new();
    emit(value, 0, pretty, &mut out);
    out
}

fn send(msg: &Value, key: &str, value: Value) {
    let mut reply = json!({"jsonrpc":"2.0"});
    if let Some(id) = msg.get("id") {
        reply["id"] = id.clone();
    }
    reply[key] = value;
    let _ = writeln!(io::stdout().lock(), "{}", stringify(&reply, false));
}
fn error(msg: &Value, code: i32, message: String) {
    send(msg, "error", json!({"code":code,"message":message}));
}
fn main() {
    let data = manifest();
    let path = env::var_os("APHRODITE_ENDPOINT_FILE")
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            env::home_dir()
                .unwrap_or_default()
                .join("Library/Application Support")
                .join(option_env!("APHRODITE_BUILD_IDENTIFIER").unwrap_or_else(|| text(&data["identifier"])))
                .join("agent-endpoint.json")
        });
    let client = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(25))
        .build();
    let mut who = text(&data["fallbackCaller"]).to_owned();
    #[derive(Default)]
    struct Calls {
        active: usize,
        waiting: VecDeque<(Value, String)>,
    }
    let calls = Mutex::new(Calls::default());
    std::thread::scope(|workers| {
        let mut stdin = io::stdin().lock();
        while let Ok(Some(frame)) = wire::frame(&mut stdin, wire::limit("frameBytes")) {
            let parsed = frame
                .as_ref()
                .map_err(|_| ())
                .and_then(|b| wire::decode(b))
                .and_then(|line| {
                    if line.bytes().all(|b| matches!(b, b' ' | b'\t')) {
                        Ok(Value::Null)
                    } else {
                        wire::parse(line)
                    }
                });
            let Ok(msg) = parsed else {
                error(&json!({"id":null}), -32700, "Parse error".into());
                continue;
            };
            if !msg.is_object() {
                continue;
            }
            let p = &msg["params"];
            let result = match text(&msg["method"]) {
                "initialize" => {
                    who = caller(&p["clientInfo"]["name"]);
                    let versions = data["versions"].as_array().unwrap();
                    let asked = &p["protocolVersion"];
                    json!({"protocolVersion":if versions.contains(asked){asked}else{&versions[0]},
                  "capabilities":{"tools":{"listChanged":false},"prompts":{"listChanged":false}},
                  "serverInfo":{"name":"aphrodite","version":option_env!("APHRODITE_BUILD_VERSION").unwrap_or_else(|| text(&data["version"]))},"instructions":data["instructions"]})
                }
                "tools/list" => json!({"tools":data["tools"]}),
                "prompts/list" => json!({"prompts":data["prompts"]}),
                "prompts/get" => {
                    let name = field(p, "name");
                    let Some(prompt) = data["prompts"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|v| v["name"] == name)
                    else {
                        error(&msg, -32602, format!("Unknown prompt: {name}"));
                        continue;
                    };
                    let template = &data["templates"][&name];
                    let arg = &p["arguments"][text(&template["arg"])];
                    let body = if arg.is_null()
                        || arg == ""
                        || arg == false
                        || arg.as_f64() == Some(0.0)
                    {
                        text(&template["empty"]).into()
                    } else {
                        fill(&template["parts"], &[js_string(arg)])
                    };
                    json!({"description":prompt["description"],"messages":[{"role":"user","content":{"type":"text","text":body}}]})
                }
                "tools/call" => {
                    let name = field(p, "name");
                    if data["routes"].get(&name).is_none() {
                        send(
                            &msg,
                            "result",
                            answer(json!(format!("No such tool \"{name}\".")), true),
                        );
                        continue;
                    }
                    let mut state = calls.lock().unwrap();
                    if state.active == wire::limit("inFlight") {
                        if state.waiting.len() == wire::limit("queued") {
                            drop(state);
                            send(&msg, "result", answer(data["busy"].clone(), true));
                        } else {
                            state.waiting.push_back((msg, who.clone()));
                        }
                        continue;
                    }
                    let mut header = json!({});
                    if let Some(id) = msg.get("id") {
                        header["id"] = id.clone();
                    }
                    let (calls, path, client) = (&calls, &path, &client);
                    let mut job = (msg, who.clone());
                    let worker = std::thread::Builder::new().spawn_scoped(workers, move || loop {
                        let (msg, who) = job;
                        let result = call(&msg["params"], &who, path, client);
                        if !result.is_null() {
                            send(&msg, "result", result);
                        } else if !msg["id"].is_null() {
                            error(&msg, -32603, "Internal error".into());
                        }
                        let mut state = calls.lock().unwrap();
                        match state.waiting.pop_front() {
                            Some(next) => job = next,
                            None => {
                                state.active -= 1;
                                break;
                            }
                        }
                    });
                    if worker.is_ok() {
                        state.active += 1;
                    } else {
                        drop(state);
                        error(&header, -32603, "Internal error".into());
                    }
                    continue;
                }
                "ping" => json!({}),
                "notifications/initialized" | "notifications/cancelled" => continue,
                _ => {
                    if !msg["id"].is_null() {
                        error(
                            &msg,
                            -32601,
                            format!("Method not found: {}", field(&msg, "method")),
                        );
                    }
                    continue;
                }
            };
            send(&msg, "result", result);
        }
    });
}
