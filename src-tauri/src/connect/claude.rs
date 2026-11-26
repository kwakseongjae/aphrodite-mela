//! User-scope registration through Claude Code's CLI. Raw CLI output stays here.
use super::{
    claude_record::{Record, Repoint, Store},
    cli_process::Program,
    hash, Action, Code, Engine, Proposal, Status, Tool,
};
use serde::Serialize;

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
    #[serde(skip_serializing_if = "Option::is_none")]
    observed: Option<Observation>,
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
            observed: None,
        }
    }
}
impl From<Code> for CommandResult {
    fn from(code: Code) -> Self {
        Self::new(code, None)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Observation {
    entry_exists: Option<bool>,
    owned: Option<bool>,
    points_here: Option<bool>,
    error: Option<Code>,
    exit_status: Option<i32>,
}
struct Entry {
    command: Option<String>,
    plain_stdio: bool,
    digest: String,
}
struct State {
    program: Program,
    entry: Option<Entry>,
    record: Record,
    record_error: Option<Code>,
    get_exit: Option<i32>,
}

fn missing(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let Some(reason) = text
        .strip_suffix('\n')
        .unwrap_or(text)
        .strip_prefix("No MCP server named \"aphrodite\". ")
    else {
        return false;
    };
    if reason == "Run `claude mcp add` to add one." {
        return true;
    }
    let name = |s: &str| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
    };
    if let Some(suggestion) = reason
        .strip_prefix("Did you mean \"")
        .and_then(|s| s.strip_suffix("\"? Run `claude mcp list` to see all."))
    {
        return name(suggestion);
    }
    let Some(list) = reason.strip_prefix("Configured servers: ") else {
        return false;
    };
    let names = if let Some((names, tail)) = list.split_once(" (and ") {
        let more = tail
            .strip_suffix(" more — run `claude mcp list` to see all)")
            .and_then(|n| n.parse::<usize>().ok());
        if !more.is_some_and(|n| n > 0) || names.split(", ").count() != 8 {
            return false;
        }
        names
    } else {
        list
    };
    names.split(", ").count() <= 8 && names.split(", ").all(name)
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
    fn inspect(e: &Engine, program: Program, store: &Store) -> Result<Self, CommandResult> {
        let (record, warning) = match store.read() {
            Ok(record) => (record, None),
            Err(code) => (Record::default(), Some(code)),
        };
        let mut state = Self::query(e, program, record)?;
        state.record_error = warning;
        if state.entry.is_none() && state.record.registered.take().is_some() {
            state.record_error = store.save(&state.record).err();
        }
        Ok(state)
    }
    fn query(e: &Engine, program: Program, record: Record) -> Result<Self, CommandResult> {
        let output = program.run(e, &["mcp", "get", "aphrodite"])?;
        let entry = match output.status {
            Some(0) => Some(
                entry(&output.stdout).map_err(|code| CommandResult::new(code, output.status))?,
            ),
            Some(1)
                if (output.stdout.iter().all(|b| *b == b'\n') && missing(&output.stderr))
                    || (output.stderr.iter().all(|b| *b == b'\n') && missing(&output.stdout)) =>
            {
                None
            }
            _ => return Err(CommandResult::new(Code::CliGetFailed, output.status)),
        };
        Ok(Self {
            program,
            entry,
            record,
            record_error: None,
            get_exit: output.status,
        })
    }
    fn points_here(&self, e: &Engine) -> bool {
        self.entry.as_ref().and_then(|v| v.command.as_deref()) == Some(e.executable())
    }
    fn owned(&self, e: &Engine) -> bool {
        self.entry.as_ref().is_some_and(|v| {
            v.plain_stdio
                && (self.points_here(e) || v.command.as_ref() == self.record.registered.as_ref())
        })
    }
}

pub(super) fn status(e: &Engine, out: &mut Status, ask: bool) -> super::Result<()> {
    let profile_error = e.profile().err();
    if profile_error.is_some() {
        out.path = None;
        out.error = profile_error;
    } else {
        match Store::peek(e) {
            Ok(record) => out.unfinished_repoint = Some(record.pending.is_some()),
            Err(code) => out.error = Some(code),
        }
    }
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
    if !ask || profile_error.is_some() {
        return Ok(());
    }
    let inspection = match Store::lock(e) {
        Ok(store) => State::inspect(e, program, &store),
        Err(Code::CliBusy) => Err(Code::CliBusy.into()),
        Err(code) => State::query(e, program, Record::default()).map(|mut state| {
            state.record_error = Some(code);
            state
        }),
    };
    match inspection {
        Ok(state) => {
            out.error = state.record_error;
            out.unfinished_repoint = state
                .record_error
                .is_none()
                .then_some(state.record.pending.is_some());
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
    cannot_restore_replacement: bool,
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
                e.home.as_os_str().as_encoded_bytes(),
                &e.claude_config_dir,
                e.location,
                &self.program,
                &self.record,
                self.record_error,
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
        if let Some(code) = self.record_error {
            // A press can repair a malformed receipt for a recognized current entry.
            if !(code == Code::RecordFailed && action == Action::Connect && owned && here) {
                return Err(code.into());
            }
        }
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
        let previous = if action == Action::Connect && owned && !here {
            self.record.registered.as_deref()
        } else if action == Action::Connect && !exists {
            self.record.pending.as_ref().map(|p| p.previous.as_str())
        } else {
            None
        };
        let will_repoint = previous.is_some();
        Ok(CommandPreview {
            program: self.program.clone(),
            tool: Tool::ClaudeCode,
            action,
            commands,
            on_add_failure: previous.map(|p| lines.for_action(Action::Connect, p)),
            cannot_restore_replacement: action == Action::Connect && foreign,
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
    if !program.trusted {
        return Err(Code::CliUntrusted);
    }
    let store = Store::lock(e)?;
    Ok(
        match State::inspect(e, program, &store).and_then(|s| s.plan(e, action)) {
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
                .any(|line| line == expected.as_bytes())
        {
            result.tail = Some(expected);
        }
        Ok(result)
    }
}

fn save_record(
    store: &Store,
    registered: Option<&str>,
    mut result: CommandResult,
) -> CommandResult {
    if store
        .save(&Record {
            registered: registered.map(str::to_owned),
            pending: None,
        })
        .is_err()
    {
        result.code = if registered.is_some() {
            Code::RegisteredRecordMissing
        } else {
            Code::RecordFailed
        };
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
    let store = Store::lock(e)?;
    let mut state = State::inspect(e, program, &store)?;
    if state.fingerprint(e, action) != digest {
        return Err(Code::Changed.into());
    }
    let plan = state.plan(e, action)?;
    if plan.confirmation_required && !confirm {
        return Err(Code::ConfirmationRequired.into());
    }
    let Some(first) = plan.commands.first() else {
        let result = Code::AlreadyConnected.into();
        return Ok(
            if state.record.registered.as_deref() == Some(e.executable())
                && state.record.pending.is_none()
            {
                result
            } else {
                save_record(&store, Some(e.executable()), result)
            },
        );
    };

    if state.entry.is_some() {
        if plan.on_add_failure.is_some() {
            let previous = state.record.registered.clone().ok_or(Code::RecordFailed)?;
            state.record.pending = Some(Repoint {
                previous,
                target: e.executable().to_owned(),
            });
            store.save(&state.record)?;
        }
        let removed = first
            .run(e, &state.program, Action::Remove)
            .map_err(|err| state.reconcile(e, &store, &plan, Action::Remove, err))?;
        if action == Action::Remove {
            return Ok(save_record(&store, None, removed));
        }
    }
    let add = plan.commands.last().unwrap();
    add.run(e, &state.program, Action::Connect)
        .map(|added| save_record(&store, Some(e.executable()), added))
        .map_err(|err| state.reconcile(e, &store, &plan, Action::Connect, err))
}

impl State {
    fn observe(&self, e: &Engine, result: &mut CommandResult) -> Option<State> {
        match State::query(e, self.program.clone(), self.record.clone()) {
            Ok(now) => {
                result.observed = Some(Observation {
                    entry_exists: Some(now.entry.is_some()),
                    owned: Some(now.owned(e)),
                    points_here: Some(now.points_here(e)),
                    error: None,
                    exit_status: now.get_exit,
                });
                Some(now)
            }
            Err(err) => {
                result.observed = Some(Observation {
                    entry_exists: None,
                    owned: None,
                    points_here: None,
                    error: Some(err.code),
                    exit_status: err.exit_status,
                });
                None
            }
        }
    }

    fn reconcile(
        &self,
        e: &Engine,
        store: &Store,
        plan: &CommandPreview,
        failed_step: Action,
        mut failure: CommandResult,
    ) -> CommandResult {
        let Some(now) = self.observe(e, &mut failure) else {
            return failure;
        };
        if let Some(entry) = &now.entry {
            if entry.plain_stdio && now.points_here(e) {
                return save_record(store, Some(e.executable()), failure);
            }
            // A failed remove may have left the old definition intact. An intervening
            // definition remains untouched and the next press requires a fresh preview.
            if self.record.pending.is_some()
                && self
                    .entry
                    .as_ref()
                    .is_some_and(|old| old.digest == entry.digest)
            {
                return save_record(store, self.record.registered.as_deref(), failure);
            }
            return failure;
        }
        let Some(restore) = &plan.on_add_failure else {
            if plan.replacement_required && failed_step == Action::Connect {
                failure.cause = Some(failure.code);
                failure.code = Code::ForeignRemovedAddFailed;
            }
            return save_record(store, None, failure);
        };
        // Preserve the journal, but a witnessed absence ends the old ownership claim.
        let mut absent = self.record.clone();
        absent.registered = None;
        if store.save(&absent).is_err() {
            failure.cause = Some(failure.code);
            failure.code = Code::RecordFailed;
            return failure;
        }
        // Only the confirmed recovery command may run, and only after observing absence.
        failure.cause = Some(failure.code);
        match restore.run(e, &self.program, Action::Connect) {
            Ok(result) => failure.restore_exit_status = result.exit_status,
            Err(err) => {
                failure.restore_exit_status = err.exit_status;
                failure.restore_error = Some(err.code);
            }
        }
        let Some(after) = self.observe(e, &mut failure) else {
            return failure;
        };
        let previous = self.record.pending.as_ref().map(|p| p.previous.as_str());
        if after
            .entry
            .as_ref()
            .is_some_and(|v| v.plain_stdio && v.command.as_deref() == previous)
        {
            failure.code = Code::RepointRestored;
            if let Some(observed) = &mut failure.observed {
                observed.owned = Some(true);
            }
            save_record(store, previous, failure)
        } else {
            failure.code = Code::RepointRestoreFailed;
            failure
        }
    }
}
