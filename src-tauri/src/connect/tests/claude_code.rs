use super::*;
use serde_json::{json, Value};
use std::{process::{Command, Stdio}, time::{Duration, Instant}};

const CLAUDE: Tool = Tool::ClaudeCode;
const SCRIPT: &str = include_str!("../../../../tests/support/claude-registration.py");

struct Fixture(Home);
impl Fixture {
    fn new() -> Self {
        let mut home = Home::new();
        let dir = home.engine.home.join("tools 'and spaces'");
        fs::create_dir(&dir).unwrap();
        let program = home.engine.home.join("playback");
        fs::write(&program, SCRIPT).unwrap();
        fs::set_permissions(&program, fs::Permissions::from_mode(0o700)).unwrap();
        symlink(program, dir.join("claude")).unwrap();
        fs::write(home.engine.home.join("fake-cli-home"), []).unwrap();
        home.engine.exe = "/Applications/Art's \"Studio\".app/Contents/MacOS/aphrodite-mcp".into();
        home.engine.cli_dirs = vec![dir];
        Self(home)
    }
    fn e(&self) -> &Engine { &self.0.engine }
    fn state(&self, path: &str, args: &str) {
        fs::write(self.e().home.join("entry"), format!("aphrodite:\n  Scope: User config (available in all your projects)\n  Status: Connected\n  Type: stdio\n  Command: {path}\n  Args: {args}\n")).unwrap();
    }
    fn override_reply(&self, verb: &str, reply: Value) {
        fs::write(self.e().home.join(format!("{verb}-reply")), reply.to_string()).unwrap();
    }
    fn calls(&self) -> Vec<Value> {
        fs::read_to_string(self.e().home.join("calls")).unwrap_or_default().lines()
            .map(|l| serde_json::from_str(l).unwrap()).collect()
    }
    fn status(&self) -> Value { json!(self.e().status(CLAUDE).unwrap()) }
    fn proposal(&self, action: Action) -> Value {
        wire(self.e().prepare(CLAUDE, action, 123))
    }
    fn apply(&self, action: Action, preview: &Value, confirm: bool) -> Value {
        wire(self.e().execute(CLAUDE, action, preview["fingerprint"].as_str().unwrap(), confirm))
    }
}
fn wire(result: Result<Proposal>) -> Value {
    let data = match result { Ok(p) => json!(p), Err(code) => json!({"code":code}) };
    assert!(!data.to_string().contains("private-neighbor"), "{data}");
    data
}

#[test]
fn command_preview_is_the_exact_pasteable_argv_and_only_get_runs_before_consent() {
    let f = Fixture::new();
    let preview = f.proposal(Action::Connect);
    let argv = &preview["commands"][0]["argv"];
    assert_eq!(argv[0], json!(f.e().cli_dirs[0].join("claude")));
    assert_eq!(argv[8], "--");
    assert_eq!(argv[9], f.e().executable());
    assert_eq!(f.calls().len(), 1);
    assert_eq!(f.calls()[0]["args"], json!(["mcp","get","aphrodite"]));
    let cwd = tempdir().unwrap();
    let shell = Command::new("/bin/sh").env_clear().env("HOME", &f.e().home)
        .current_dir(cwd.path()).arg("-c").arg(preview["commands"][0]["line"].as_str().unwrap())
        .stdout(Stdio::null()).stderr(Stdio::null()).status().unwrap();
    assert!(shell.success());
    assert_eq!(f.calls()[1]["args"], json!(&argv.as_array().unwrap()[1..]));
}
