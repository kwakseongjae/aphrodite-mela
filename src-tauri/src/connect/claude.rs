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

use super::{Action, Proposal, Tool};

#[derive(Serialize)]
pub struct Invocation {
    argv: Vec<String>,
    line: String,
}

fn quote(word: &str) -> String {
    if !word.is_empty() && word.bytes().all(|b| b.is_ascii_alphanumeric() || b"/_-.".contains(&b)) {
        word.to_owned()
    } else {
        format!("'{}'", word.replace('\'', "'\"'\"'"))
    }
}
impl Invocation {
    fn new(program: &Program, args: &[&str]) -> Self {
        let argv: Vec<String> = std::iter::once(program.path.to_str().unwrap())
            .chain(args.iter().copied()).map(str::to_owned).collect();
        let line = argv.iter().map(|arg| quote(arg)).collect::<Vec<_>>().join(" ");
        Self { argv, line }
    }
    fn add(program: &Program, path: &str) -> Self {
        Self::new(program, &["mcp","add","--transport","stdio","--scope","user","aphrodite","--",path])
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPreview {
    tool: Tool,
    action: Action,
    commands: Vec<Invocation>,
    on_add_failure: Option<Invocation>,
    will_repoint: bool,
    replacement_required: bool,
    confirmation_required: bool,
    fingerprint: String,
}

impl State {
    fn fingerprint(&self, e: &Engine, action: Action) -> String {
        hash(serde_json::to_vec(&(Tool::ClaudeCode, action, &e.exe, &e.home, &e.claude_config_dir,
            e.location, &self.program, &self.recorded, self.entry.as_ref().map(|v| &v.digest))).unwrap())
    }
    fn plan(&self, e: &Engine, action: Action) -> Result<CommandPreview, CommandResult> {
        if e.executable().is_empty() || e.executable().contains(char::is_control) ||
            self.program.path.to_str().unwrap().contains(char::is_control) {
            return Err(Code::InvalidPath.into());
        }
        let exists = self.entry.is_some();
        let owned = self.owned(e);
        let here = self.points_here(e);
        let foreign = exists && !owned;
        if action == Action::Remove {
            if !exists { return Err(Code::NoEntry.into()); }
            if foreign && !here { return Err(Code::ForeignEntry.into()); }
        }
        let mut commands = vec![];
        let noop = action == Action::Connect && owned && here;
        if exists && !noop {
            commands.push(Invocation::new(&self.program, &["mcp","remove","--scope","user","aphrodite"]));
        }
        if action == Action::Connect && !noop {
            commands.push(Invocation::add(&self.program, e.executable()));
        }
        let will_repoint = action == Action::Connect && owned && !here;
        Ok(CommandPreview {
            tool: Tool::ClaudeCode, action, commands,
            on_add_failure: self.recorded.as_ref().filter(|_| will_repoint)
                .map(|path| Invocation::add(&self.program, path)),
            will_repoint, replacement_required: action == Action::Connect && foreign,
            confirmation_required: foreign, fingerprint: self.fingerprint(e, action),
        })
    }
}

pub(super) fn prepare(e: &Engine, action: Action) -> super::Result<Proposal> {
    e.validate_location()?;
    let Some(program) = Program::find(e) else {
        return e.proposal(Tool::ClaudeCode, Err(Code::CliNotFound));
    };
    let home = files::root(&e.home)?.into_std_file();
    Ok(match State::inspect(e, program, &home).and_then(|s| s.plan(e, action)) {
        Ok(plan) => Proposal::Command(plan),
        Err(result) => Proposal::Outcome(result),
    })
}
