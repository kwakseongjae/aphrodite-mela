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
    e.location = location(&app_exe);
    if let Some(dir) = env::var_os("CODEX_HOME").filter(|v| !v.is_empty()) {
        e.codex_home = PathBuf::from(dir);
    }
    if let Some(dir) = env::var_os("CLAUDE_CONFIG_DIR").filter(|v| !v.is_empty()) {
        e.claude_file = PathBuf::from(dir).join(".claude.json");
    }
    e.cli_dirs = env::split_paths(&env::var_os("PATH").unwrap_or_default())
        .filter(|p| p.is_absolute())
        .collect();
    e.cli_dirs.extend([
        home.join(".local/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
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
#[derive(Serialize)]
#[serde(untagged)]
pub enum Proposal {
    Edit(Preview),
    Copy {
        tool: Tool,
        path: PathBuf,
        code: Code,
        snippet: String,
    },
}
impl Engine {
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
        e.proposal(
            tool,
            e.preview(
                tool,
                action,
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|_| Code::Io)?
                    .as_nanos(),
            ),
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
        e.proposal(
            tool,
            e.commit(
                tool,
                Action::Connect,
                &fingerprint,
                confirm_replacement.unwrap_or(false),
            ),
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
        e.proposal(
            tool,
            e.commit(
                tool,
                Action::Remove,
                &fingerprint,
                confirm_removal.unwrap_or(false),
            ),
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
