//! User-scope registration through Claude Code's CLI. Raw CLI output stays here.
use super::{cli_process::Program, files, hash, Action, Code, Engine, Proposal, Status, Tool};
use serde::Serialize;
use std::{fs::File, path::Path};
use xattr::FileExt;

const REMOVE_ARGS: &[&str] = &["mcp", "remove", "--scope", "user", "aphrodite"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub code: Code,
    pub exit_status: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cause: Option<Code>,
    #[serde(skip_serializing_if = "Option::is_none")]
    restore_exit_status: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    restore_error: Option<Code>,
}
impl CommandResult {
    pub(super) fn new(code: Code, exit_status: Option<i32>) -> Self {
        Self {
            code,
            exit_status,
            tail: None,
            cause: None,
            restore_exit_status: None,
            restore_error: None,
        }
    }
}
impl From<Code> for CommandResult {
    fn from(code: Code) -> Self {
        Self::new(code, None)
    }
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
    format!(
        "studio.aphrodite.mela.claude-user.{}",
        hash(e.path(Tool::ClaudeCode).as_os_str().as_encoded_bytes())
    )
}

fn recorded(e: &Engine, home: &File) -> Result<Option<String>, Code> {
    match home.get_xattr(record_key(e)) {
        Ok(value) => Ok(value
            .and_then(|v| String::from_utf8(v).ok())
            .filter(|path| Path::new(path).is_absolute() && !path.contains(char::is_control))),
        Err(err) if err.raw_os_error() == Some(libc::ENOTSUP) => Ok(None),
        Err(_) => Err(Code::Io),
    }
}

fn missing(bytes: &[u8]) -> bool {
    // Some versions suggest similar names or list the person's other servers after the period.
    bytes
        .trim_ascii_start()
        .starts_with(b"No MCP server named \"aphrodite\".")
}

fn entry(stdout: &[u8]) -> Result<Entry, Code> {
    let text = std::str::from_utf8(stdout).map_err(|_| Code::CliUnrecognized)?;
    if text.chars().any(|c| c != '\n' && c.is_control()) {
        return Err(Code::CliUnrecognized);
    }
    let lines: Vec<_> = text
        .strip_suffix('\n')
        .unwrap_or(text)
        .split('\n')
        .collect();
    let ["aphrodite:", scope, status, body @ .., "", "To remove this server, run: claude mcp remove aphrodite -s user"] =
        lines.as_slice()
    else {
        return Err(Code::CliUnrecognized);
    };
    if *scope != "  Scope: User config (available in all your projects)" {
        return Err(Code::CliScopeUnknown);
    }
    if !status
        .strip_prefix("  Status: ")
        .is_some_and(|s| !s.is_empty())
    {
        return Err(Code::CliUnrecognized);
    }
    // The health check can add one Issue line. Neither it nor Status is configuration.
    let fields = match body {
        [issue, rest @ ..] if issue.starts_with("  Issue: ") => rest,
        fields => fields,
    };
    let (command, plain_stdio) = match fields {
        ["  Type: stdio", command, args, options @ ..] => {
            let path = command
                .strip_prefix("  Command: ")
                .filter(|p| !p.is_empty())
                .ok_or(Code::CliUnrecognized)?;
            let args = args
                .strip_prefix("  Args:")
                .filter(|s| s.is_empty() || s.starts_with(' '))
                .ok_or(Code::CliUnrecognized)?;
            let env = match options {
                [] => &[][..],
                ["  Environment:", pairs @ ..] if named_values(pairs, "=") => pairs,
                _ => return Err(Code::CliUnrecognized),
            };
            (
                Some(path.to_owned()),
                matches!(args, "" | " ") && env.is_empty(),
            )
        }
        ["  Type: http" | "  Type: sse" | "  Type: ws", url, options @ ..]
            if url.strip_prefix("  URL: ").is_some_and(|v| !v.is_empty())
                && (options.is_empty()
                    || matches!(options, ["  Headers:", pairs @ ..] if named_values(pairs, ": "))) =>
        {
            (None, false)
        }
        _ => return Err(Code::CliUnrecognized),
    };
    Ok(Entry {
        command,
        plain_stdio,
        digest: hash(fields.join("\n")),
    })
}

fn named_values(lines: &[&str], separator: &str) -> bool {
    let mut names = std::collections::HashSet::new();
    lines.iter().all(|line| {
        line.strip_prefix("    ")
            .and_then(|value| value.split_once(separator))
            .is_some_and(|(name, _)| {
                !name.is_empty() && !name.contains(char::is_whitespace) && names.insert(name)
            })
    })
}

impl State {
    fn inspect(e: &Engine, program: Program, home: &File) -> Result<Self, CommandResult> {
        let output = program.run(e, &["mcp", "get", "aphrodite"])?;
        let entry = match output.status {
            Some(0) => Some(
                entry(&output.stdout).map_err(|code| CommandResult::new(code, output.status))?,
            ),
            Some(1) if missing(&output.stderr) || missing(&output.stdout) => None,
            _ => return Err(CommandResult::new(Code::CliGetFailed, output.status)),
        };
        Ok(Self {
            program,
            entry,
            recorded: recorded(e, home)?,
            get_exit: output.status,
        })
    }
    fn points_here(&self, e: &Engine) -> bool {
        self.entry.as_ref().and_then(|v| v.command.as_deref()) == Some(e.executable())
    }
    fn owned(&self, e: &Engine) -> bool {
        self.entry.as_ref().is_some_and(|v| {
            v.plain_stdio && (self.points_here(e) || v.command.as_ref() == self.recorded.as_ref())
        })
    }
}

pub(super) fn status(e: &Engine, out: &mut Status, ask: bool) -> super::Result<()> {
    let Some(program) = Program::find(e) else {
        return Ok(());
    };
    out.installed = true;
    out.copy_only = false;
    out.program = Some(program.path.clone());
    out.trusted = Some(program.trusted);
    if !program.trusted {
        out.copy_only = true;
        out.error = Some(Code::CliUntrusted);
        return Ok(());
    }
    if !ask {
        return Ok(());
    }
    let home = files::root(&e.home)?.into_std_file();
    match State::inspect(e, program, &home) {
        Ok(state) => {
            out.entry_exists = Some(state.entry.is_some());
            out.points_here = Some(state.points_here(e));
            out.owned = Some(state.owned(e));
            out.exit_status = state.get_exit;
        }
        Err(result) => {
            out.error = Some(result.code);
            out.exit_status = result.exit_status;
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Invocation {
    argv: Vec<String>,
    line: String,
}

fn quote(word: &str) -> String {
    if !word.is_empty()
        && word
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/_-.".contains(&b))
    {
        word.to_owned()
    } else {
        format!("'{}'", word.replace('\'', "'\"'\"'"))
    }
}
struct Lines<'a> {
    program: &'a str,
    profile: Option<&'a str>,
}
impl<'a> Lines<'a> {
    fn new(e: &'a Engine, program: Option<&'a Program>) -> super::Result<Self> {
        if !e.exe.is_absolute()
            || e.executable().is_empty()
            || e.executable().contains(char::is_control)
        {
            return Err(Code::InvalidPath);
        }
        if program.is_some_and(|p| !p.trusted) {
            return Err(Code::CliUntrusted);
        }
        Ok(Self {
            program: program.and_then(|p| p.path.to_str()).unwrap_or("claude"),
            profile: e.profile()?,
        })
    }
    fn for_action(&self, action: Action, sidecar: &str) -> Invocation {
        let add = [
            "mcp",
            "add",
            "--transport",
            "stdio",
            "--scope",
            "user",
            "aphrodite",
            "--",
            sidecar,
        ];
        let args: &[&str] = match action {
            Action::Connect => &add,
            Action::Remove => REMOVE_ARGS,
        };
        let argv: Vec<_> = std::iter::once(self.program)
            .chain(args.iter().copied())
            .map(str::to_owned)
            .collect();
        let command = argv
            .iter()
            .map(|arg| quote(arg))
            .collect::<Vec<_>>()
            .join(" ");
        let line = match self.profile {
            Some(dir) => format!(
                "CLAUDE_CONFIG_DIR='{}' {command}",
                dir.replace('\'', "'\"'\"'")
            ),
            None => command,
        };
        Invocation { argv, line }
    }
}

pub(super) fn snippet(e: &Engine, action: Action) -> super::Result<String> {
    Ok(Lines::new(e, Program::find(e).as_ref())?
        .for_action(action, e.executable())
        .line)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPreview {
    program: Program,
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
        hash(
            serde_json::to_vec(&(
                Tool::ClaudeCode,
                action,
                &e.exe,
                &e.home,
                &e.claude_config_dir,
                e.location,
                &self.program,
                &self.recorded,
                self.entry.as_ref().map(|v| &v.digest),
            ))
            .unwrap(),
        )
    }
    fn plan(&self, e: &Engine, action: Action) -> Result<CommandPreview, CommandResult> {
        let lines = Lines::new(e, Some(&self.program))?;
        let exists = self.entry.is_some();
        let owned = self.owned(e);
        let here = self.points_here(e);
        let foreign = exists && !owned;
        if action == Action::Remove {
            if !exists {
                return Err(Code::NoEntry.into());
            }
            if foreign && !here {
                return Err(Code::ForeignEntry.into());
            }
        }
        let mut commands = vec![];
        let noop = action == Action::Connect && owned && here;
        if exists && !noop {
            commands.push(lines.for_action(Action::Remove, e.executable()));
        }
        if action == Action::Connect && !noop {
            commands.push(lines.for_action(Action::Connect, e.executable()));
        }
        let will_repoint = action == Action::Connect && owned && !here;
        Ok(CommandPreview {
            program: self.program.clone(),
            tool: Tool::ClaudeCode,
            action,
            commands,
            on_add_failure: self
                .recorded
                .as_ref()
                .filter(|_| will_repoint)
                .map(|path| lines.for_action(Action::Connect, path)),
            will_repoint,
            replacement_required: action == Action::Connect && foreign,
            confirmation_required: foreign,
            fingerprint: format!("{}.{}", self.program.binding(), self.fingerprint(e, action)),
        })
    }
}

pub(super) fn prepare(e: &Engine, action: Action) -> super::Result<Proposal> {
    e.validate_location()?;
    e.profile()?;
    let Some(program) = Program::find(e) else {
        return Ok(Proposal::Copy {
            tool: Tool::ClaudeCode,
            path: e.path(Tool::ClaudeCode),
            code: Code::CliNotFound,
            snippet: Lines::new(e, None)?.for_action(action, e.executable()).line,
        });
    };
    let home = files::root(&e.home)?.into_std_file();
    Ok(
        match State::inspect(e, program, &home).and_then(|s| s.plan(e, action)) {
            Ok(plan) => Proposal::Command(plan),
            Err(result) => Proposal::Outcome(result),
        },
    )
}

impl Invocation {
    fn run(
        &self,
        e: &Engine,
        program: &Program,
        action: Action,
    ) -> Result<CommandResult, CommandResult> {
        let args: Vec<_> = self.argv[1..].iter().map(String::as_str).collect();
        let output = program.run(e, &args)?;
        let (success, failure) = match action {
            Action::Connect => (Code::Registered, Code::CliAddFailed),
            Action::Remove => (Code::Removed, Code::CliRemoveFailed),
        };
        if output.status != Some(0) {
            return Err(CommandResult::new(failure, output.status));
        }
        let expected = match action {
            Action::Connect => format!(
                "Added stdio MCP server aphrodite with command: {}  to user config",
                args.last().unwrap()
            ),
            Action::Remove => "Removed MCP server aphrodite from user config".to_owned(),
        };
        let mut result = CommandResult::new(success, output.status);
        if expected.len() <= 256
            && output
                .stdout
                .split(|&b| b == b'\n')
                .any(|line| line.strip_suffix(b"\r").unwrap_or(line) == expected.as_bytes())
        {
            result.tail = Some(expected);
        }
        Ok(result)
    }
}

fn save_record(
    e: &Engine,
    home: &File,
    action: Action,
    mut result: CommandResult,
) -> CommandResult {
    let key = record_key(e);
    let write = match action {
        Action::Connect => home.set_xattr(key, e.executable().as_bytes()),
        Action::Remove => match home.remove_xattr(key) {
            Err(err) if err.raw_os_error() == Some(libc::ENOATTR) => Ok(()),
            other => other,
        },
    };
    if write.is_err() {
        result.code = Code::RecordFailed;
    }
    result
}

pub(super) fn execute(
    e: &Engine,
    action: Action,
    fingerprint: &str,
    confirm: bool,
) -> Result<CommandResult, CommandResult> {
    e.profile()?;
    let (binding, digest) = fingerprint.split_once('.').ok_or(Code::Changed)?;
    let program = Program::find(e).ok_or(Code::Changed)?;
    if !program.trusted || binding != program.binding() || digest.len() != 64 {
        return Err(Code::Changed.into());
    }
    let home = files::root(&e.home)?.into_std_file();
    // Serialize with other Aphrodite instances before the final get and through compensation.
    fs2::FileExt::lock_exclusive(&home).map_err(|_| Code::Io)?;
    let state = State::inspect(e, program, &home)?;
    if state.fingerprint(e, action) != digest {
        return Err(Code::Changed.into());
    }
    let plan = state.plan(e, action)?;
    if plan.confirmation_required && !confirm {
        return Err(Code::ConfirmationRequired.into());
    }
    let Some(first) = plan.commands.first() else {
        return Ok(Code::AlreadyConnected.into());
    };

    if state.entry.is_some() {
        let removed = first.run(e, &state.program, Action::Remove)?;
        if action == Action::Remove {
            return Ok(save_record(e, &home, action, removed));
        }
    }
    let add = plan.commands.last().unwrap();
    match add.run(e, &state.program, Action::Connect) {
        Ok(added) => Ok(save_record(e, &home, action, added)),
        Err(mut failure) => {
            if let Some(restore) = plan.on_add_failure {
                failure.cause = Some(failure.code);
                match restore.run(e, &state.program, Action::Connect) {
                    Ok(restored) => {
                        failure.code = Code::RepointRestored;
                        failure.restore_exit_status = restored.exit_status;
                    }
                    Err(err) => {
                        failure.code = Code::RepointRestoreFailed;
                        failure.restore_exit_status = err.exit_status;
                        failure.restore_error = Some(err.code);
                    }
                }
            } else if state.entry.is_some() {
                failure.cause = Some(failure.code);
                failure.code = Code::ForeignRemovedAddFailed;
            }
            Err(failure)
        }
    }
}
