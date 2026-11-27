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
    record_error: Option<Code>,
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
            record_error: None,
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
    user_scope: bool,
    command: Option<String>,
    remote: bool,
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

// Only the first line establishes presence. The remaining text is a human-readable
// hint. Keep its fields local, including any other server names or settings.
fn entry(stdout: &[u8]) -> Result<Entry, Code> {
    let mut lines = stdout.split(|&b| b == b'\n');
    if lines.next() != Some(b"aphrodite:") {
        return Err(Code::CliUnrecognized);
    }
    let mut entry = Entry {
        user_scope: false,
        command: None,
        remote: false,
        plain_stdio: false,
        digest: hash(stdout),
    };
    let mut fields = Vec::<(&str, String)>::new();
    for bytes in lines {
        let Ok(line) = std::str::from_utf8(bytes) else {
            return Ok(entry);
        };
        if line.chars().any(char::is_control) {
            return Ok(entry);
        }
        if line.starts_with("To remove this server, run:") {
            break;
        }
        if let Some((key, value)) = line.strip_prefix("  ").and_then(|s| s.split_once(':')) {
            if !key.is_empty() && key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
                fields.push((key, value.trim().to_owned()));
                continue;
            }
        }
        if let Some((_, value)) = fields.last_mut() {
            if !line.trim().is_empty() {
                value.push('\n');
                value.push_str(line.trim());
            }
        }
    }
    let field = |name| {
        let mut found = fields.iter().filter(|(key, _)| *key == name);
        let value = &found.next()?.1;
        found.next().is_none().then_some(value)
    };
    entry.user_scope = field("Scope")
        .is_some_and(|s| display_matches(s, "User config (available in all your projects)"));
    if entry.user_scope {
        if field("Type").is_some_and(|s| display_matches(s, "stdio")) {
            entry.command = field("Command").filter(|s| !s.is_empty()).cloned();
            let env_count = fields.iter().filter(|(k, _)| *k == "Environment").count();
            entry.plain_stdio = field("Args").is_some_and(|s| s.is_empty())
                && (env_count == 0 || field("Environment").is_some_and(|s| s.is_empty()));
        } else {
            entry.remote = field("Type")
                .is_some_and(|s| ["http", "sse", "ws"].iter().any(|t| display_matches(s, t)));
        }
    }
    fields.retain(|(k, _)| !matches!(*k, "Status" | "Issue"));
    entry.digest = hash(serde_json::to_vec(&fields).map_err(|_| Code::CliUnrecognized)?);
    Ok(entry)
}

// A line break can split a word or replace spaces. Match against one known path
// without guessing a wrap width or reconstructing someone else's command.
fn display_matches(display: &str, expected: &str) -> bool {
    let normalized = expected
        .split(' ')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let mut rest = normalized.as_str();
    for line in display.lines() {
        let part = line
            .split(' ')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        let Some(tail) = rest.trim_start_matches(' ').strip_prefix(&part) else {
            return false;
        };
        rest = tail;
    }
    rest.is_empty()
}

impl Entry {
    fn points_at(&self, path: &str) -> Option<bool> {
        if self.remote {
            Some(false)
        } else {
            self.command.as_ref().map(|s| display_matches(s, path))
        }
    }
}
impl State {
    fn inspect(e: &Engine, program: Program, store: &Store) -> Result<Self, CommandResult> {
        let (record, warning) = match store.read() {
            Ok(record) => (record, None),
            Err(code) => (Record::default(), Some(code)),
        };
        // Arm invalidation before asking. A crash or failed receipt save cannot
        // leave an old claim usable after we have witnessed the entry disappear.
        let had_claim = record.registered.is_some();
        if had_claim || warning.is_some() {
            store.revoke(true)?;
        }
        let mut state = Self::query(e, program, record)?;
        state.record_error = warning;
        if state.entry.is_none() && state.record.registered.take().is_some() {
            state.record_error = store.save(&state.record).err();
        } else if state.entry.is_some() && had_claim {
            store.revoke(false)?;
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
                if output
                    .stderr
                    .starts_with(b"No MCP server named \"aphrodite\".") =>
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
    fn points_here(&self, e: &Engine) -> Option<bool> {
        self.entry
            .as_ref()
            .map_or(Some(false), |v| v.points_at(e.executable()))
    }
    fn owned(&self) -> bool {
        self.entry.as_ref().is_some_and(|v| {
            v.plain_stdio
                && self
                    .record
                    .registered
                    .as_deref()
                    .is_some_and(|p| v.points_at(p) == Some(true))
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
        out.unavailable = Some(true);
        out.error = Some(Code::CliUntrusted);
        return Ok(());
    }
    if !ask || profile_error.is_some() {
        return Ok(());
    }
    let inspection = match Store::lock(e) {
        Ok(store) => State::inspect(e, program, &store),
        Err(code) => Err(code.into()),
    };
    match inspection {
        Ok(state) => {
            out.error = state.record_error;
            out.unfinished_repoint = state
                .record_error
                .is_none()
                .then_some(state.record.pending.is_some());
            out.entry_exists = Some(state.entry.is_some());
            out.points_here = state.points_here(e);
            out.owned = out.points_here.map(|_| state.owned());
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
        Ok(Self {
            program: program
                .filter(|p| p.trusted)
                .and_then(|p| p.path.to_str())
                .unwrap_or("claude"),
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
        let env = "/usr/bin/env -u CLAUDE_CODE_CUSTOM_OAUTH_URL";
        let line = match self.profile {
            Some(dir) => format!(
                "CLAUDE_CONFIG_DIR='{}' {env} {command}",
                dir.replace('\'', "'\"'\"'")
            ),
            None => format!("{env} -u CLAUDE_CONFIG_DIR {command}"),
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
    fn fingerprint(&self, e: &Engine, action: Action) -> super::Result<String> {
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
        .map(hash)
        .map_err(|_| Code::InvalidPath)
    }
    fn plan(&self, e: &Engine, action: Action) -> Result<CommandPreview, CommandResult> {
        let lines = Lines::new(e, Some(&self.program))?;
        let exists = self.entry.is_some();
        let owned = self.owned();
        let here = self.points_here(e) == Some(true);
        if self.entry.as_ref().is_some_and(|v| !v.user_scope) {
            return Err(Code::CliScopeUnknown.into());
        }
        let foreign = exists && !owned;
        if action == Action::Remove {
            if !exists && self.record.pending.is_none() {
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
        } else if action == Action::Connect && !noop {
            self.record
                .pending
                .as_ref()
                .filter(|p| {
                    self.entry
                        .as_ref()
                        .is_none_or(|v| v.plain_stdio && v.points_at(&p.previous) == Some(true))
                })
                .map(|p| p.previous.as_str())
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
            cannot_restore_replacement: action == Action::Connect && foreign && previous.is_none(),
            will_repoint,
            replacement_required: action == Action::Connect && foreign,
            confirmation_required: foreign,
            fingerprint: format!(
                "{}.{}",
                self.program.binding()?,
                self.fingerprint(e, action)?
            ),
        })
    }
}

pub(super) fn prepare(e: &Engine, action: Action) -> super::Result<Proposal> {
    e.validate_location()?;
    e.profile()?;
    let found = Program::find(e);
    let found_untrusted = found.is_some();
    let Some(program) = found.filter(|p| p.trusted) else {
        return Ok(Proposal::Copy {
            tool: Tool::ClaudeCode,
            path: e.path(Tool::ClaudeCode),
            code: if found_untrusted {
                Code::CliUntrusted
            } else {
                Code::CliNotFound
            },
            snippet: Lines::new(e, None)?.for_action(action, e.executable()).line,
        });
    };
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
        result.record_error = Some(if result.code == Code::Registered {
            Code::RegisteredRecordMissing
        } else {
            Code::RecordFailed
        });
    }
    result
}

pub(super) fn verified_program<'a>(
    e: &Engine,
    fingerprint: &'a str,
) -> super::Result<(Program, &'a str)> {
    e.profile()?;
    let (binding, digest) = fingerprint.split_once('.').ok_or(Code::Changed)?;
    let program = Program::find(e).ok_or(Code::Changed)?;
    if !program.trusted
        || binding != program.binding()?
        || digest.len() != 64
        || !digest.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(Code::Changed);
    }
    Ok((program, digest))
}

pub(super) fn execute(
    e: &Engine,
    action: Action,
    fingerprint: &str,
    confirm: bool,
) -> Result<CommandResult, CommandResult> {
    let (program, digest) = verified_program(e, fingerprint)?;
    let store = Store::lock(e)?;
    let mut state = State::inspect(e, program, &store)?;
    if state.fingerprint(e, action)? != digest {
        return Err(Code::Changed.into());
    }
    let plan = state.plan(e, action)?;
    if plan.confirmation_required && !confirm {
        return Err(Code::ConfirmationRequired.into());
    }
    let Some(first) = plan.commands.first() else {
        return Ok(match action {
            Action::Remove => save_record(&store, None, Code::Removed.into()),
            Action::Connect => {
                save_record(&store, Some(e.executable()), Code::AlreadyConnected.into())
            }
        });
    };

    if state.entry.is_some() {
        if let Some(recovery) = &plan.on_add_failure {
            let previous = recovery.argv.last().ok_or(Code::RecordFailed)?.clone();
            state.record.pending = Some(Repoint {
                previous,
                target: e.executable().to_owned(),
            });
            store.save(&state.record)?;
        }
        if state.record.registered.is_some() {
            store.revoke(true)?;
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
                    owned: now.points_here(e).map(|_| now.owned()),
                    points_here: now.points_here(e),
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
            if failed_step == Action::Remove
                && self
                    .entry
                    .as_ref()
                    .is_some_and(|old| old.digest == entry.digest)
            {
                // No mutation was observed. Preserve even an interrupted recovery.
                if self.owned() {
                    return save_record(store, self.record.registered.as_deref(), failure);
                }
                failure.record_error = store.save(&self.record).err();
            } else if failed_step == Action::Connect
                && entry.plain_stdio
                && now.points_here(e) == Some(true)
            {
                // A failed add and a concurrent author can produce the same display.
                // Report the observed path, without creating an ownership claim.
                return save_record(store, None, failure);
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
            failure.record_error = Some(Code::RecordFailed);
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
        if after.entry.as_ref().is_some_and(|v| {
            v.plain_stdio && previous.is_some_and(|p| v.points_at(p) == Some(true))
        }) {
            failure.code = Code::RepointRestored;
            let registered = previous.filter(|_| failure.restore_error.is_none());
            let mut result = save_record(store, registered, failure);
            if let Some(observed) = &mut result.observed {
                observed.owned = Some(registered.is_some() && result.record_error.is_none());
            }
            result
        } else {
            failure.code = Code::RepointRestoreFailed;
            failure
        }
    }
}
