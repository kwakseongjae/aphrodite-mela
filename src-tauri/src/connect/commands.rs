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

fn runtime(app: tauri::AppHandle) -> Result<Engine> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| Code::InvalidPath)?
        .canonicalize()
        .map_err(|_| Code::InvalidPath)?;
    let app_exe = env::current_exe().map_err(|_| Code::InvalidPath)?;
    let exe = sidecar(&app_exe)?;
    let mut e = Engine::new(home.clone(), exe);
    e.location = location(&app_exe, &home);
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
    work: impl FnOnce(Engine) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || work(runtime(app)?))
        .await
        .map_err(|_| Code::WorkerFailed)?
}
#[tauri::command]
pub async fn connect_status(app: tauri::AppHandle) -> Result<Vec<Status>> {
    run(app, |e| TOOLS.iter().map(|&t| e.status(t)).collect()).await
}
#[tauri::command]
pub async fn connect_ask(app: tauri::AppHandle) -> Result<Status> {
    run(app, |e| e.ask_claude()).await
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
                snippet: tool.snippet(self.executable()),
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
    run(app, move |e| {
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
#[tauri::command]
pub async fn connect_apply(
    app: tauri::AppHandle,
    tool: Tool,
    fingerprint: String,
    confirm_replacement: Option<bool>,
) -> Result<Proposal> {
    run(app, move |e| {
        e.execute(
            tool,
            Action::Connect,
            &fingerprint,
            confirm_replacement.unwrap_or(false),
        )
    })
    .await
}
#[tauri::command]
pub async fn connect_remove(
    app: tauri::AppHandle,
    tool: Tool,
    fingerprint: String,
    confirm_removal: Option<bool>,
) -> Result<Proposal> {
    run(app, move |e| {
        e.execute(
            tool,
            Action::Remove,
            &fingerprint,
            confirm_removal.unwrap_or(false),
        )
    })
    .await
}
#[derive(Serialize)]
pub struct Snippet {
    tool: Tool,
    text: String,
}
#[tauri::command]
pub async fn connect_snippet(tool: Tool) -> Result<Snippet> {
    tauri::async_runtime::spawn_blocking(move || {
        let exe = sidecar(&env::current_exe().map_err(|_| Code::InvalidPath)?)?;
        Ok(Snippet {
            tool,
            text: tool.snippet(exe.to_str().ok_or(Code::SidecarMissing)?),
        })
    })
    .await
    .map_err(|_| Code::WorkerFailed)?
}
