//! User-scope registration through Claude Code's CLI. Raw CLI output stays here.
use super::{cli_process::Program, files, hash, Code, Engine, Status};
use serde::Serialize;
use std::{fs::File, path::Path};
use xattr::FileExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub code: Code,
    pub exit_status: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tail: Option<String>,
}
impl CommandResult {
    fn new(code: Code, exit_status: Option<i32>) -> Self {
        Self { code, exit_status, tail: None }
    }
}
impl From<Code> for CommandResult {
    fn from(code: Code) -> Self { Self::new(code, None) }
}

struct Entry {
    command: Option<String>,
    plain_stdio: bool,
    digest: String,
}
struct State {
    program: Program,
    entry: Option<Entry>,
    recorded: Option<String>,
    get_exit: Option<i32>,
}

fn record_key(e: &Engine) -> String {
    format!("studio.aphrodite.mela.claude-user.{}", hash(e.path(super::Tool::ClaudeCode).as_os_str().as_encoded_bytes()))
}

fn recorded(e: &Engine, home: &File) -> Result<Option<String>, Code> {
    match home.get_xattr(record_key(e)) {
        Ok(value) => Ok(value.and_then(|v| String::from_utf8(v).ok())
            .filter(|path| Path::new(path).is_absolute() && !path.contains(char::is_control))),
        Err(err) if err.raw_os_error() == Some(libc::ENOTSUP) => Ok(None),
        Err(_) => Err(Code::Io),
    }
}

fn missing(bytes: &[u8]) -> bool {
    // Some versions suggest similar names or list the person's other servers after the period.
    bytes.trim_ascii_start().starts_with(b"No MCP server named \"aphrodite\".")
}

fn entry(stdout: &[u8]) -> Result<Entry, Code> {
    let text = std::str::from_utf8(stdout).map_err(|_| Code::CliUnrecognized)?;
    let mut lines = text.lines().skip_while(|line| *line != "aphrodite:");
    lines.next().ok_or(Code::CliUnrecognized)?;
    let scope = lines.next().and_then(|s| s.strip_prefix("  Scope: ")).ok_or(Code::CliUnrecognized)?;
    if scope != "User config (available in all your projects)" {
        return Err(Code::CliScopeUnknown);
    }
    // Status and Issue vary with server health. Only the definition belongs in the fingerprint.
    let mut block = lines.take_while(|line| line.starts_with("  "))
        .skip_while(|line| line.starts_with("  Status: ") || line.starts_with("  Issue: "));
    let kind = block.next().and_then(|s| s.strip_prefix("  Type: ")).ok_or(Code::CliUnrecognized)?;
    let fields: Vec<_> = block.collect();
    let mut command = None;
    let mut plain_stdio = false;
    if kind == "stdio" {
        let path = fields.first().and_then(|s| s.strip_prefix("  Command: ")).ok_or(Code::CliUnrecognized)?;
        if !fields.get(1).is_some_and(|s| *s == "  Args:" || s.starts_with("  Args: ")) {
            return Err(Code::CliUnrecognized);
        }
        command = Some(path.to_owned());
        plain_stdio = fields.len() == 2 && matches!(fields[1], "  Args:" | "  Args: ");
    } else if !matches!(kind, "http" | "sse" | "ws") || !fields.first().is_some_and(|s| s.starts_with("  URL: ")) {
        return Err(Code::CliUnrecognized);
    }
    Ok(Entry {command, plain_stdio, digest: hash(serde_json::to_vec(&(kind, fields)).unwrap())})
}

impl State {
    fn inspect(e: &Engine, program: Program, home: &File) -> Result<Self, CommandResult> {
        let output = program.run(e, &["mcp", "get", "aphrodite"])?;
        let entry = match output.status {
            Some(0) => Some(entry(&output.stdout).map_err(|code| CommandResult::new(code, output.status))?),
            Some(1) if missing(&output.stderr) || missing(&output.stdout) => None,
            _ => return Err(CommandResult::new(Code::CliGetFailed, output.status)),
        };
        Ok(Self {program, entry, recorded: recorded(e, home)?, get_exit: output.status})
    }
    fn points_here(&self, e: &Engine) -> bool {
        self.entry.as_ref().and_then(|v| v.command.as_deref()) == Some(e.executable())
    }
    fn owned(&self, e: &Engine) -> bool {
        self.entry.as_ref().is_some_and(|v| v.plain_stdio &&
            (self.points_here(e) || v.command.as_ref() == self.recorded.as_ref()))
    }
}

pub(super) fn status(e: &Engine, out: &mut Status) -> super::Result<()> {
    let Some(program) = Program::find(e) else { return Ok(()); };
    out.installed = true;
    out.copy_only = false;
    out.program = Some(program.path.clone());
    let home = files::root(&e.home)?.into_std_file();
    match State::inspect(e, program, &home) {
        Ok(state) => {
            out.entry_exists = Some(state.entry.is_some());
            out.points_here = Some(state.points_here(e));
            out.owned = Some(state.owned(e));
            out.exit_status = state.get_exit;
        }
        Err(result) => { out.error = Some(result.code); out.exit_status = result.exit_status; }
    }
    Ok(())
}
