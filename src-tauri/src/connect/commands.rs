use super::*;
use std::{
    env,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

fn sidecar(app_exe: &Path) -> Result<PathBuf> {
    let exe = app_exe.with_file_name("aphrodite-mcp");
    if !exe.is_file() || exe.to_str().is_none() {
        return Err(Code::SidecarMissing);
    }
    Ok(exe)
}

fn runtime(app: tauri::AppHandle, inspect_images: bool) -> Result<Engine> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| Code::InvalidPath)?
        .canonicalize()
        .map_err(|_| Code::InvalidPath)?;
    let app_exe = env::current_exe().map_err(|_| Code::InvalidPath)?;
    let exe = sidecar(&app_exe)?;
    let mut e = Engine::new(home.clone(), exe, &app.config().identifier);
    e.app_data = app.path().app_data_dir().map_err(|_| Code::InvalidPath)?;
    e.location = location(&app_exe, inspect_images);
    if let Some(dir) = env::var_os("CODEX_HOME").filter(|v| !v.is_empty()) {
        e.codex_home = PathBuf::from(dir);
    }
    if let Some(dir) = env::var_os("CLAUDE_CONFIG_DIR").filter(|v| !v.is_empty()) {
        e.claude_config_dir = Some(dir.into());
    }
    e.cli_dirs = env::split_paths(&env::var_os("PATH").unwrap_or_default())
        .filter(|p| p.is_absolute())
        .collect();
    e.cli_dirs.extend([
        home.join(".local/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
    ]);
    e.claude_dirs.extend([
        home.join(".claude/local"),
        home.join(".npm-global/bin"),
        home.join(".volta/bin"),
        home.join(".local/share/fnm/aliases/default/bin"),
        home.join("Library/Application Support/fnm/aliases/default/bin"),
    ]);
    e.app_dirs = vec!["/Applications".into(), home.join("Applications")];
    Ok(e)
}

async fn run<T: Send + 'static>(
    app: tauri::AppHandle,
    inspect_images: bool,
    work: impl FnOnce(Engine) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || work(runtime(app, inspect_images)?))
        .await
        .map_err(|_| Code::WorkerFailed)?
}
#[tauri::command]
pub async fn connect_status(app: tauri::AppHandle) -> Result<Vec<Status>> {
    run(app, false, |e| TOOLS.iter().map(|&t| e.status(t)).collect()).await
}
#[tauri::command]
pub async fn connect_ask(app: tauri::AppHandle) -> Result<Status> {
    run(app, false, |e| e.ask_claude()).await
}
#[derive(Serialize)]
#[serde(untagged)]
pub enum Proposal {
    Edit(Preview),
    Command(claude::CommandPreview),
    Outcome(claude::CommandResult),
    Copy {
        tool: Tool,
        path: PathBuf,
        code: Code,
        snippet: String,
    },
}
impl Engine {
    pub(super) fn prepare(&self, tool: Tool, action: Action, stamp: u128) -> Result<Proposal> {
        if tool == Tool::ClaudeCode {
            return claude::prepare(self, action);
        }
        self.proposal(tool, self.preview(tool, action, stamp))
    }
    pub(super) fn execute(
        &self,
        tool: Tool,
        action: Action,
        fingerprint: &str,
        confirm: bool,
    ) -> Result<Proposal> {
        if tool == Tool::ClaudeCode {
            self.validate_location()?;
            return Ok(Proposal::Outcome(
                claude::execute(self, action, fingerprint, confirm)
                    .unwrap_or_else(|failure| failure),
            ));
        }
        self.proposal(tool, self.commit(tool, action, fingerprint, confirm))
    }
    pub(super) fn proposal(&self, tool: Tool, plan: Result<Preview>) -> Result<Proposal> {
        match plan {
            Ok(p) => Ok(Proposal::Edit(p)),
            Err(
                code @ (Code::UnsupportedLayout
                | Code::InvalidConfig
                | Code::Ambiguous
                | Code::CopyOnly
                | Code::DirectoryMissing
                | Code::NoExtendedAttributes),
            ) => Ok(Proposal::Copy {
                tool,
                path: self.path(tool),
                code,
                snippet: tool.file_snippet(self.executable()),
            }),
            Err(code) => Err(code),
        }
    }
}
#[tauri::command]
pub async fn connect_preview(
    app: tauri::AppHandle,
    tool: Tool,
    action: Action,
) -> Result<Proposal> {
    run(app, true, move |e| {
        e.prepare(
            tool,
            action,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| Code::Io)?
                .as_nanos(),
        )
    })
    .await
}
pub(super) fn execute_at(
    mut engine: Engine,
    tool: Tool,
    action: Action,
    fingerprint: &str,
    confirm: bool,
    probe: impl FnOnce() -> Location,
) -> Result<Proposal> {
    if tool == Tool::ClaudeCode {
        if let Err(code) = claude::verified_program(&engine, fingerprint) {
            return Ok(Proposal::Outcome(code.into()));
        }
    }
    engine.location = probe();
    engine.execute(tool, action, fingerprint, confirm)
}

pub(super) async fn mutation(
    probe: impl FnOnce() -> Location + Send + 'static,
    engine: impl FnOnce() -> Result<Engine> + Send + 'static,
    tool: Tool,
    action: Action,
    fingerprint: String,
    confirm: bool,
) -> Result<Proposal> {
    crate::disk::write(move || {
        Ok(engine().and_then(|e| execute_at(e, tool, action, &fingerprint, confirm, probe)))
    })
    .await
    .map_err(|err| {
        if err == "window_destroyed" {
            Code::WindowDestroyed
        } else {
            Code::WorkerFailed
        }
    })?
}
#[tauri::command]
pub async fn connect_apply(
    app: tauri::AppHandle,
    tool: Tool,
    fingerprint: String,
    confirm_replacement: Option<bool>,
) -> Result<Proposal> {
    mutation(
        || env::current_exe().map_or(Location::Unknown, |exe| location(&exe, true)),
        move || runtime(app, false),
        tool,
        Action::Connect,
        fingerprint,
        confirm_replacement.unwrap_or(false),
    )
    .await
}
#[tauri::command]
pub async fn connect_remove(
    app: tauri::AppHandle,
    tool: Tool,
    fingerprint: String,
    confirm_removal: Option<bool>,
) -> Result<Proposal> {
    mutation(
        || env::current_exe().map_or(Location::Unknown, |exe| location(&exe, true)),
        move || runtime(app, false),
        tool,
        Action::Remove,
        fingerprint,
        confirm_removal.unwrap_or(false),
    )
    .await
}
#[derive(Serialize)]
pub struct Snippet {
    tool: Tool,
    text: String,
}
pub(super) fn snippet_with(
    tool: Tool,
    action: Option<Action>,
    sidecar_path: impl FnOnce() -> Result<PathBuf>,
    engine: impl FnOnce() -> Result<Engine>,
) -> Result<Snippet> {
    let text = if tool == Tool::ClaudeCode {
        claude::snippet(&engine()?, action.unwrap_or(Action::Connect))?
    } else {
        tool.file_snippet(sidecar_path()?.to_str().ok_or(Code::InvalidPath)?)
    };
    Ok(Snippet { tool, text })
}

#[tauri::command]
pub async fn connect_snippet(
    app: tauri::AppHandle,
    tool: Tool,
    action: Option<Action>,
) -> Result<Snippet> {
    tauri::async_runtime::spawn_blocking(move || {
        snippet_with(
            tool,
            action,
            || sidecar(&env::current_exe().map_err(|_| Code::InvalidPath)?),
            || runtime(app, false),
        )
    })
    .await
    .map_err(|_| Code::WorkerFailed)?
}
