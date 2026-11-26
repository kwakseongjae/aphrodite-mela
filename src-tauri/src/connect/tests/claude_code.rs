use super::*;
use serde_json::{json, Value};
use std::{
    process::{Command, Stdio},
    time::{Duration, Instant},
};

const CLAUDE: Tool = Tool::ClaudeCode;
const SCRIPT: &str = include_str!("../../../../tests/support/claude-registration.sh");

struct Fixture(Home);
impl Fixture {
    fn new() -> Self {
        let mut home = Home::new();
        let dir = home.engine.home.join("tools 'and spaces'");
        fs::create_dir(&dir).unwrap();
        let fixtures = home.engine.home.join("fixtures");
        fs::create_dir(&fixtures).unwrap();
        for file in fs::read_dir(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/claude-code"
        ))
        .unwrap()
        {
            let file = file.unwrap();
            fs::copy(file.path(), fixtures.join(file.file_name())).unwrap();
        }
        let program = dir.join("playback");
        fs::write(&program, SCRIPT).unwrap();
        fs::set_permissions(&program, fs::Permissions::from_mode(0o700)).unwrap();
        symlink(program, dir.join("claude")).unwrap();
        fs::write(home.engine.home.join("fake-cli-home"), []).unwrap();
        home.engine.exe = "/Applications/Art's \"Studio\".app/Contents/MacOS/aphrodite-mcp".into();
        home.engine.cli_dirs = vec![dir];
        Self(home)
    }
    fn e(&self) -> &Engine {
        &self.0.engine
    }
    fn state(&self, path: &str, args: &str) {
        let template = include_str!("../../../../tests/fixtures/claude-code/get-stdio.txt");
        let args = if args.is_empty() {
            String::new()
        } else {
            format!(" {args}")
        };
        fs::write(
            self.e().home.join("entry"),
            template
                .split_once('\n')
                .unwrap()
                .1
                .replace("{args}", &args)
                .replace("{command}", path),
        )
        .unwrap();
    }
    fn override_reply(&self, verb: &str, reply: Value) {
        fs::write(
            self.e().home.join(format!("{verb}-reply")),
            reply.to_string(),
        )
        .unwrap();
    }
    fn calls(&self) -> Vec<Value> {
        fs::read_to_string(self.e().home.join("calls"))
            .unwrap_or_default()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }
    fn status(&self) -> Value {
        json!(self.e().ask_claude().unwrap())
    }
    fn proposal(&self, action: Action) -> Value {
        wire(self.e().prepare(CLAUDE, action, 123))
    }
    fn apply(&self, action: Action, preview: &Value, confirm: bool) -> Value {
        wire(self.e().execute(
            CLAUDE,
            action,
            preview["fingerprint"].as_str().unwrap(),
            confirm,
        ))
    }
}
fn wire(result: Result<Proposal>) -> Value {
    let data = match result {
        Ok(p) => json!(p),
        Err(code) => json!({"code":code}),
    };
    assert!(!data.to_string().contains("private-neighbor"), "{data}");
    data
}

#[test]
fn command_preview_is_the_exact_pasteable_argv_and_only_get_runs_before_consent() {
    let f = Fixture::new();
    let preview = f.proposal(Action::Connect);
    let argv = &preview["commands"][0]["argv"];
    assert_eq!(argv[0], json!(f.e().cli_dirs[0].join("playback")));
    assert_eq!(argv[8], "--");
    assert_eq!(argv[9], f.e().executable());
    assert_eq!(f.calls().len(), 1);
    assert_eq!(f.calls()[0]["args"], json!(["mcp", "get", "aphrodite"]));
    let cwd = tempdir().unwrap();
    let shell = Command::new("/bin/sh")
        .env_clear()
        .env("HOME", &f.e().home)
        .current_dir(cwd.path())
        .arg("-c")
        .arg(preview["commands"][0]["line"].as_str().unwrap())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert!(shell.success());
    assert_eq!(f.calls()[1]["args"], json!(&argv.as_array().unwrap()[1..]));
}

#[test]
fn owned_repoint_restores_the_recorded_path_if_add_fails_after_remove() {
    let mut f = Fixture::new();
    let old = f.e().exe.clone();
    let first = f.proposal(Action::Connect);
    assert_eq!(
        f.apply(Action::Connect, &first, false)["code"],
        "registered"
    );
    assert_eq!(f.status()["owned"], true);
    f.0.engine.exe = "/Applications/Moved.app/Contents/MacOS/aphrodite-mcp".into();
    let status = f.status();
    assert_eq!(
        (status["owned"].clone(), status["pointsHere"].clone()),
        (json!(true), json!(false))
    );
    let p = f.proposal(Action::Connect);
    assert_eq!(p["willRepoint"], true);
    assert_eq!(p["confirmationRequired"], false);
    assert_eq!(p["commands"][0]["argv"][2], "remove");
    assert_eq!(p["commands"][1]["argv"][2], "add");
    assert_eq!(p["onAddFailure"]["argv"][9], json!(old));
    f.override_reply(
        "add",
        json!({"exit":17,"err":"private-neighbor","once":true}),
    );
    let result = f.apply(Action::Connect, &p, false);
    assert_eq!(result["code"], "repoint_restored");
    assert_eq!(result["exitStatus"], 17);
    assert_eq!(result["restoreExitStatus"], 0);
    assert_eq!(f.status()["owned"], true);
    assert!(fs::read_to_string(f.e().home.join("entry"))
        .unwrap()
        .contains(old.to_str().unwrap()));
    let p = f.proposal(Action::Connect);
    let result = f.apply(Action::Connect, &p, false);
    assert_eq!(result["code"], "registered");
    assert_eq!(result["exitStatus"], 0);
    assert_eq!(f.status()["pointsHere"], true);
    let p = f.proposal(Action::Connect);
    assert_eq!(p["commands"], json!([]));
    assert_eq!(
        f.apply(Action::Connect, &p, false)["code"],
        "already_connected"
    );
    let p = f.proposal(Action::Remove);
    assert_eq!(f.apply(Action::Remove, &p, false)["code"], "removed");
    assert_eq!(f.status()["entryExists"], false);
    for call in f.calls() {
        let cwd = Path::new(call["cwd"].as_str().unwrap());
        assert!(cli_process::controlled(cwd.parent().unwrap()));
        assert!(!cwd.exists());
        for key in call["env"].as_array().unwrap() {
            assert!(
                [
                    "HOME",
                    "PATH",
                    "LC_ALL",
                    "COLUMNS",
                    "NO_COLOR",
                    "PWD",
                    "SHLVL",
                    "_",
                    "__CF_USER_TEXT_ENCODING"
                ]
                .contains(&key.as_str().unwrap()),
                "unexpected environment key {key}"
            );
        }
    }
}

#[test]
fn foreign_entries_require_bound_confirmation_and_removal_requires_this_executable() {
    let f = Fixture::new();
    f.state("/private-neighbor", "--existing");
    let p = f.proposal(Action::Connect);
    assert_eq!(p["replacementRequired"], true);
    assert_eq!(p["confirmationRequired"], true);
    assert_eq!(f.proposal(Action::Remove)["code"], "foreign_entry");
    assert_eq!(
        f.apply(Action::Connect, &p, false)["code"],
        "confirmation_required"
    );
    f.state("/private-neighbor", "--edited");
    assert_eq!(f.apply(Action::Connect, &p, true)["code"], "changed");
    assert!(f.calls().iter().all(|c| c["args"][1] == "get"));
    let p = f.proposal(Action::Connect);
    assert_eq!(f.apply(Action::Connect, &p, true)["code"], "registered");
    f.state(f.e().executable(), "--customized");
    assert_eq!(f.status()["owned"], false);
    let p = f.proposal(Action::Remove);
    assert_eq!(
        f.apply(Action::Remove, &p, false)["code"],
        "confirmation_required"
    );
    assert_eq!(f.apply(Action::Remove, &p, true)["code"], "removed");
}

#[test]
fn discovery_skips_non_executables_and_dangling_links_and_notices_a_retargeted_link() {
    let f = Fixture::new();
    let path = f.e().cli_dirs[0].join("claude");
    assert!(fs::symlink_metadata(&path).unwrap().is_symlink());
    let p = f.proposal(Action::Connect);
    let new = f.e().home.join("new-cli");
    fs::copy(&path, &new).unwrap();
    fs::remove_file(&path).unwrap();
    symlink(&new, &path).unwrap();
    assert_eq!(f.apply(Action::Connect, &p, true)["code"], "changed");
    fs::set_permissions(&new, fs::Permissions::from_mode(0o600)).unwrap();
    assert_eq!(f.status()["installed"], false);
    assert_eq!(f.proposal(Action::Connect)["code"], "cli_not_found");
    fs::remove_file(new).unwrap();
    assert_eq!(f.status()["installed"], false);
    assert!(f.calls().iter().all(|c| c["args"][1] == "get"));
}

#[test]
fn hanging_or_oversized_get_and_generic_get_failure_never_mean_missing() {
    let mut f = Fixture::new();
    f.0.engine.cli_timeout = Duration::from_millis(250);
    let start = Instant::now();
    f.override_reply("get", json!({"hang":true,"exit":0}));
    assert_eq!(f.status()["error"], "cli_timeout");
    assert!(start.elapsed() < Duration::from_secs(3));
    f.0.engine.cli_timeout = Duration::from_secs(5);
    for stream in ["err", "out"] {
        f.override_reply(
            "get",
            json!({(stream): "private-neighbor".repeat(20000), "exit":1}),
        );
        let s = f.status();
        assert_eq!(s["error"], "cli_output_limit");
        assert_eq!(s["entryExists"], Value::Null);
        assert!(!s.to_string().contains("private-neighbor"));
    }
    for exit in [1, 8] {
        f.override_reply("get", json!({"exit":exit,"err":"private-neighbor"}));
        let p = f.proposal(Action::Connect);
        assert_eq!(p["code"], "cli_get_failed");
        assert_eq!(p["exitStatus"], exit);
    }
}

#[test]
fn only_the_named_user_stanza_can_establish_ownership_and_health_is_not_configuration() {
    let f = Fixture::new();
    f.state(f.e().executable(), "");
    let path = f.e().home.join("entry");
    let entry = fs::read_to_string(&path).unwrap();
    let p = f.proposal(Action::Remove);
    fs::write(
        &path,
        include_str!("../../../../tests/fixtures/claude-code/get-stdio-issue.txt")
            .split_once('\n')
            .unwrap()
            .1
            .replace("{args}", "")
            .replace("{command}", f.e().executable()),
    )
    .unwrap();
    assert_eq!(f.proposal(Action::Remove)["fingerprint"], p["fingerprint"]);
    for text in [
        entry.replace("aphrodite:", "private-neighbor:"),
        entry.replace(
            "User config (available in all your projects)",
            "Project config (shared via .mcp.json)",
        ),
        entry.replace("  Args:", "  Args: \nambiguous continuation\n  Args:"),
    ] {
        fs::write(&path, text).unwrap();
        let s = f.status();
        assert_ne!(s["owned"], true);
        assert!(!s.to_string().contains("private-neighbor"));
        assert_ne!(f.apply(Action::Remove, &p, true)["code"], "removed");
    }
    fs::write(
        &path,
        include_str!("../../../../tests/fixtures/claude-code/get-http.txt")
            .split_once('\n')
            .unwrap()
            .1,
    )
    .unwrap();
    assert_eq!(f.status()["owned"], false);
    assert_eq!(f.proposal(Action::Connect)["confirmationRequired"], true);
    assert_eq!(f.proposal(Action::Remove)["code"], "foreign_entry");
}

#[test]
fn failed_add_remove_and_restore_preserve_exit_status_and_stop_the_sequence() {
    let mut f = Fixture::new();
    let p = f.proposal(Action::Connect);
    f.override_reply(
        "add",
        json!({"exit":7,"err":"private-neighbor","once":true}),
    );
    let err = f.apply(Action::Connect, &p, false);
    assert_eq!(err["code"], "cli_add_failed");
    assert_eq!(err["exitStatus"], 7);
    assert_eq!(err["tail"], Value::Null);
    let added = f.apply(Action::Connect, &p, false);
    assert!(added["tail"].as_str().unwrap().contains(f.e().executable()));
    let removed = f.proposal(Action::Remove);
    f.override_reply(
        "remove",
        json!({"exit":1,"err":"No MCP server named \"aphrodite\" in user scope","once":true}),
    );
    let err = f.apply(Action::Remove, &removed, false);
    assert_eq!(err["code"], "cli_remove_failed");
    assert_eq!(err["exitStatus"], 1);
    f.0.engine.exe = "/Applications/Moved.app/Contents/MacOS/aphrodite-mcp".into();
    let p = f.proposal(Action::Connect);
    f.override_reply(
        "remove",
        json!({"exit":13,"err":"private-neighbor","once":true}),
    );
    let err = f.apply(Action::Connect, &p, false);
    assert_eq!(err["code"], "cli_remove_failed");
    assert_eq!(f.calls().last().unwrap()["args"][1], "get");
    f.override_reply("add", json!({"exit":9,"err":"private-neighbor"}));
    let err = f.apply(Action::Connect, &p, false);
    assert_eq!(err["code"], "repoint_restore_failed");
    assert_eq!(err["exitStatus"], 9);
    assert_eq!(err["restoreExitStatus"], 9);
    assert!(!f.e().home.join("entry").exists());
    f.state("/private-neighbor", "");
    let foreign = f.proposal(Action::Connect);
    let err = f.apply(Action::Connect, &foreign, true);
    assert_eq!(err["code"], "foreign_removed_add_failed");
    assert_eq!(err["exitStatus"], 9);
    assert_eq!(err["restoreExitStatus"], Value::Null);
}

#[test]
fn all_registration_writes_recheck_the_runtime_location_before_running_a_cli() {
    let mut f = Fixture::new();
    f.state(f.e().executable(), "");
    let connect = f.proposal(Action::Connect);
    let remove = f.proposal(Action::Remove);
    let before = f.calls().len();
    for loc in [
        Location::Translocated,
        Location::DiskImage,
        Location::ReadOnly,
        Location::NotInApplications,
    ] {
        f.0.engine.location = loc;
        for (action, p) in [(Action::Remove, &remove), (Action::Connect, &connect)] {
            assert_eq!(f.proposal(action)["code"], "move_to_applications");
            assert_eq!(f.apply(action, p, true)["code"], "move_to_applications");
        }
    }
    assert_eq!(f.calls().len(), before);
}

#[test]
fn a_receipt_is_scoped_to_the_cli_profile_and_cleared_on_remove() {
    let mut f = Fixture::new();
    let old = f.e().exe.clone();
    let first = f.proposal(Action::Connect);
    assert_eq!(
        f.apply(Action::Connect, &first, false)["code"],
        "registered"
    );
    f.0.engine.exe = "/Applications/New.app/Contents/MacOS/aphrodite-mcp".into();
    let p = f.proposal(Action::Remove);
    f.0.engine.claude_config_dir = Some(f.e().home.join("another-profile"));
    assert_eq!(f.status()["owned"], false);
    assert_eq!(f.apply(Action::Remove, &p, true)["code"], "changed");
    f.0.engine.claude_config_dir = None;
    assert_eq!(f.apply(Action::Remove, &p, false)["code"], "removed");
    f.state(old.to_str().unwrap(), "");
    assert_eq!(f.status()["owned"], false);
}

#[test]
fn a_success_line_with_extra_text_is_not_a_safe_tail() {
    let f = Fixture::new();
    let p = f.proposal(Action::Connect);
    let line = format!(
        "Added stdio MCP server aphrodite with command: {}  to user config",
        f.e().executable()
    );
    f.override_reply(
        "add",
        json!({"out":format!("{line} private-neighbor"), "exit":0}),
    );
    let reply = f.apply(Action::Connect, &p, false);
    assert_eq!(reply["exitStatus"], 0);
    assert_eq!(reply["tail"], Value::Null);
}

#[test]
fn the_copy_fallback_for_an_absent_program_matches_the_requested_action() {
    let f = Fixture::new();
    fs::remove_file(f.e().cli_dirs[0].join("claude")).unwrap();
    let connect = f.proposal(Action::Connect);
    let remove = f.proposal(Action::Remove);
    assert_eq!(
        connect["snippet"],
        claude::snippet(f.e(), Action::Connect).unwrap()
    );
    assert_eq!(remove["code"], "cli_not_found");
    assert_eq!(
        remove["snippet"],
        "claude mcp remove --scope user aphrodite"
    );
    assert!(f.calls().is_empty());
}

#[test]
fn opus_1_a_fresh_real_format_registration_reads_back_as_ours() {
    let f = Fixture::new();
    let preview = f.proposal(Action::Connect);
    assert_eq!(
        f.apply(Action::Connect, &preview, false)["code"],
        "registered"
    );
    assert_eq!(f.status()["owned"], true);
}

#[test]
fn opus_2_only_the_real_two_space_add_acknowledgment_is_returned() {
    let f = Fixture::new();
    let preview = f.proposal(Action::Connect);
    assert_eq!(
        f.apply(Action::Connect, &preview, false)["tail"],
        format!(
            "Added stdio MCP server aphrodite with command: {}  to user config",
            f.e().executable()
        )
    );
}

#[test]
fn astra_4_ambiguous_fields_and_controls_never_establish_the_command() {
    let f = Fixture::new();
    f.state(f.e().executable(), "");
    let path = f.e().home.join("entry");
    let base = fs::read_to_string(&path).unwrap();
    for suffix in [
        "\r",
        "\t",
        "\u{85}",
        "\n  Args: extra",
        "\n  Command: second",
        "\ncontinuation",
    ] {
        fs::write(
            &path,
            base.replace(
                f.e().executable(),
                &format!("{}{suffix}", f.e().executable()),
            ),
        )
        .unwrap();
        let status = f.status();
        assert_eq!(status["pointsHere"], Value::Null);
        assert_eq!(status["owned"], Value::Null);
        assert_eq!(f.proposal(Action::Remove)["code"], "cli_unrecognized");
    }
    for extra in [
        "  Other: value",
        "  Environment:",
        "  Status: ✓ Connected",
        "  Args:",
    ] {
        fs::write(
            &path,
            base.replace("  Environment:", &format!("  Environment:\n{extra}")),
        )
        .unwrap();
        assert_eq!(f.status()["pointsHere"], Value::Null);
    }
}

#[test]
fn opus_4_astra_1_passive_discovery_never_asks_the_program() {
    let f = Fixture::new();
    let look = json!(f.e().status(CLAUDE).unwrap());
    assert!(f.calls().is_empty());
    assert_eq!(look["installed"], true);
    assert_eq!(look["entryExists"], Value::Null);
    assert_eq!(f.status()["entryExists"], false);
    assert_eq!(f.calls().len(), 1);
}

#[test]
fn astra_1_a_changed_program_is_refused_before_even_get_runs() {
    let f = Fixture::new();
    f.state(f.e().executable(), "");
    let connect = f.proposal(Action::Connect);
    let remove = f.proposal(Action::Remove);
    let calls = f.calls().len();
    let link = f.e().cli_dirs[0].join("claude");
    let other = f.e().cli_dirs[0].join("other");
    fs::copy(&link, &other).unwrap();
    fs::remove_file(&link).unwrap();
    symlink(&other, &link).unwrap();
    for (action, preview) in [(Action::Connect, connect), (Action::Remove, remove)] {
        assert_eq!(f.apply(action, &preview, true)["code"], "changed");
        assert_eq!(calls, f.calls().len());
    }
}

#[test]
fn opus_4_a_writable_program_or_ancestor_is_found_but_never_run() {
    let f = Fixture::new();
    let real = f.e().cli_dirs[0].join("claude").canonicalize().unwrap();
    for path in [&real, &f.e().home] {
        let original = fs::metadata(path).unwrap().permissions();
        fs::set_permissions(path, fs::Permissions::from_mode(0o775)).unwrap();
        let look = json!(f.e().status(CLAUDE).unwrap());
        assert_eq!(look["program"], json!(real));
        assert_eq!(look["trusted"], false);
        assert_eq!(f.status()["error"], "cli_untrusted");
        assert_eq!(f.proposal(Action::Connect)["code"], "cli_untrusted");
        assert!(f.calls().is_empty());
        fs::set_permissions(path, original).unwrap();
    }
}
#[test]
fn astra_2_text_without_an_interpreter_fails_to_start() {
    let f = Fixture::new();
    fs::write(f.e().cli_dirs[0].join("claude"), "exit 0\n").unwrap();
    assert_eq!(f.status()["error"], "cli_start_failed");
}

#[test]
fn astra_8_non_utf8_profile_is_rejected_before_a_get() {
    use std::os::unix::ffi::OsStringExt;
    let mut f = Fixture::new();
    f.0.engine.claude_config_dir = Some(f.e().home.join(std::ffi::OsString::from_vec(vec![0xff])));
    assert_eq!(f.proposal(Action::Connect)["code"], "invalid_path");
    assert!(f.calls().is_empty());
}

#[test]
fn opus_3_get_runs_below_a_private_nonproject_ancestry() {
    let f = Fixture::new();
    assert_eq!(f.status()["entryExists"], false);
    let calls = f.calls();
    let cwd = Path::new(calls[0]["cwd"].as_str().unwrap());
    assert!(!cwd.starts_with("/private/tmp"));
    assert!(super::super::cli_process::controlled(cwd.parent().unwrap()));
    assert!(!cwd.exists());
}

#[test]
fn opus_3_an_ancestor_project_or_shared_parent_prevents_launch() {
    let h = Home::new();
    let p = h.engine.home.join("scratch");
    fs::create_dir(&p).unwrap();
    let cwd = cli_process::private_cwd(&p).unwrap();
    assert_eq!(
        fs::metadata(cwd.path()).unwrap().permissions().mode() & 0o777,
        0o700
    );
    for marker in [
        ".git",
        ".mcp.json",
        ".claude",
        "CLAUDE.md",
        "CLAUDE.local.md",
    ] {
        fs::write(h.engine.home.join(marker), []).unwrap();
        assert_eq!(cli_process::private_cwd(&p).unwrap_err(), Code::InvalidPath);
        fs::remove_file(h.engine.home.join(marker)).unwrap();
    }
    fs::set_permissions(&p, fs::Permissions::from_mode(0o777)).unwrap();
    assert_eq!(cli_process::private_cwd(&p).unwrap_err(), Code::InvalidPath);
}

#[test]
fn astra_9_fake_profiles_and_post_write_failures_are_independent() {
    let mut f = Fixture::new();
    let preview = f.proposal(Action::Connect);
    f.apply(Action::Connect, &preview, false);
    f.0.engine.claude_config_dir = Some(f.e().home.join("another-profile"));
    assert_eq!(f.status()["entryExists"], false);
    f.0.engine.claude_config_dir = None;
    f.override_reply("remove", json!({"afterWrite":true, "exit":17}));
    let remove = f.proposal(Action::Remove);
    assert_eq!(f.apply(Action::Remove, &remove, false)["exitStatus"], 17);
    assert_eq!(f.status()["entryExists"], false);
}

#[test]
fn opus_5_astra_3_opus_9_every_preview_line_round_trips_in_three_shells() {
    for shell in ["/bin/sh", "/bin/zsh", "/bin/bash"] {
        let mut f = Fixture::new();
        let profile = f.e().home.join(r#"한글 ' " $default \ 폴더"#);
        f.0.engine.claude_config_dir = Some(profile.clone());
        f.0.engine.exe = r#"/old 쌀 $ \ ' ".app/sidecar"#.into();
        let preview = f.proposal(Action::Connect);
        f.apply(Action::Connect, &preview, false);
        f.0.engine.exe = r#"/new 쌀 $ \ ' ".app/sidecar"#.into();
        let preview = f.proposal(Action::Connect);
        let cmds = preview["commands"].as_array().unwrap();
        assert_eq!(
            claude::snippet(f.e(), Action::Remove).unwrap(),
            cmds[0]["line"]
        );
        assert_eq!(
            claude::snippet(f.e(), Action::Connect).unwrap(),
            cmds[1]["line"]
        );
        for cmd in [&cmds[0], &cmds[1], &cmds[0], &preview["onAddFailure"]] {
            let line = cmd["line"].as_str().unwrap();
            assert!(line.starts_with("CLAUDE_CONFIG_DIR='"), "{line}");
            let result = Command::new(shell)
                .env_clear()
                .env("HOME", &f.e().home)
                .env("CLAUDE_CONFIG_DIR", f.e().home.join("wrong"))
                .arg("-c")
                .arg(line)
                .output()
                .unwrap();
            assert!(result.status.success());
            let calls = f.calls();
            let call = calls.last().unwrap();
            assert_eq!(call["profile"], json!(profile));
            assert_eq!(call["args"], json!(&cmd["argv"].as_array().unwrap()[1..]));
        }
    }
}

fn record_path(f: &Fixture) -> PathBuf {
    let key = hash(f.e().path(CLAUDE).as_os_str().as_encoded_bytes());
    f.e()
        .home
        .join("Library/Application Support/studio.aphrodite.mela/connect")
        .join(format!("claude-{key}.json"))
}

#[test]
fn opus_6_private_profile_records_are_atomic_and_use_a_bounded_lock() {
    use fs2::FileExt;
    use std::os::unix::fs::MetadataExt;
    let f = Fixture::new();
    let preview = f.proposal(Action::Connect);
    let path = record_path(&f);
    assert_eq!(
        f.apply(Action::Connect, &preview, false)["code"],
        "registered"
    );
    let receipt = fs::File::open(&path).unwrap();
    assert_eq!(receipt.metadata().unwrap().mode() & 0o777, 0o600);
    let lock = fs::File::open(path.with_extension("lock")).unwrap();
    lock.lock_exclusive().unwrap();
    let start = Instant::now();
    assert_eq!(f.proposal(Action::Remove)["code"], "cli_busy");
    assert!(start.elapsed() < Duration::from_secs(3));
    drop(lock);
    let remove = f.proposal(Action::Remove);
    f.apply(Action::Remove, &remove, false);
    assert!(!path.exists());
    let add = f.proposal(Action::Connect);
    f.apply(Action::Connect, &add, false);
    assert_ne!(
        receipt.metadata().unwrap().ino(),
        fs::metadata(path).unwrap().ino()
    );
}

#[test]
fn astra_6_a_press_repairs_a_missing_record_and_observed_absence_forgets_the_old_path() {
    let mut f = Fixture::new();
    let path = record_path(&f);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let p = f.proposal(Action::Connect);
    fs::set_permissions(path.parent().unwrap(), fs::Permissions::from_mode(0o500)).unwrap();
    let added = f.apply(Action::Connect, &p, false);
    fs::set_permissions(path.parent().unwrap(), fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(added["code"], "registered_record_missing");
    assert_eq!(added["exitStatus"], 0);
    let p = f.proposal(Action::Connect);
    assert_eq!(
        f.apply(Action::Connect, &p, false)["code"],
        "already_connected"
    );
    assert!(path.is_file());
    let old = f.e().exe.clone();
    f.0.engine.exe = "/Applications/Moved.app/Contents/MacOS/aphrodite-mcp".into();
    assert_eq!(f.status()["owned"], true);
    fs::remove_file(f.e().home.join("entry")).unwrap();
    assert_eq!(f.status()["entryExists"], false);
    assert!(!path.exists());
    f.state(old.to_str().unwrap(), "");
    assert_eq!(f.status()["owned"], false);
}

#[test]
fn opus_9_add_and_remove_limits_recheck_what_the_program_actually_changed() {
    for (over, cause) in [
        (json!({"hang":true}), "cli_timeout"),
        (json!({"out":"x".repeat(70_000)}), "cli_output_limit"),
        (json!({"signal":9}), "signal"),
        (json!({"exit":23}), "nonzero"),
    ] {
        let mut f = Fixture::new();
        f.0.engine.cli_timeout = Duration::from_secs(2);
        for (action, verb) in [(Action::Connect, "add"), (Action::Remove, "remove")] {
            let p = f.proposal(action);
            let mut reply = json!({"exit":0,"afterWrite":true,"once":true});
            reply
                .as_object_mut()
                .unwrap()
                .extend(over.as_object().unwrap().clone());
            f.override_reply(verb, reply);
            let r = f.apply(action, &p, false);
            assert_eq!(
                r["observed"]["entryExists"],
                action == Action::Connect,
                "{cause} {verb}: {r}"
            );
            assert_eq!(r["observed"]["pointsHere"], action == Action::Connect);
            assert_eq!(f.calls().last().unwrap()["args"][1], "get");
            match cause {
                "nonzero" => assert_eq!(r["exitStatus"], 23),
                "signal" => assert_eq!(r["exitStatus"], Value::Null),
                _ => assert_eq!(
                    r["cause"].as_str().unwrap_or(r["code"].as_str().unwrap()),
                    cause
                ),
            }
        }
    }
}

#[test]
fn opus_7_an_add_that_wrote_before_timeout_never_restores_over_the_new_entry() {
    let mut f = Fixture::new();
    let p = f.proposal(Action::Connect);
    f.apply(Action::Connect, &p, false);
    f.0.engine.exe = "/new path/aphrodite-mcp".into();
    f.0.engine.cli_timeout = Duration::from_secs(2);
    let p = f.proposal(Action::Connect);
    f.override_reply(
        "add",
        json!({"afterWrite":true, "hang":true, "once":true, "exit":0}),
    );
    let start = f.calls().len();
    let r = f.apply(Action::Connect, &p, false);
    assert_eq!(r["observed"]["pointsHere"], true);
    assert_eq!(
        f.calls()[start..]
            .iter()
            .filter(|c| c["args"][1] == "add")
            .count(),
        1
    );
    assert_eq!(f.status()["unfinishedRepoint"], false);
    f.state("/someone/else", "");
    assert_eq!(
        f.proposal(Action::Connect)["cannotRestoreReplacement"],
        true
    );
}

#[test]
fn astra_5_interrupted_repoint_survives_relaunch_and_requires_a_fresh_press() {
    let mut f = Fixture::new();
    let old = f.e().exe.clone();
    let p = f.proposal(Action::Connect);
    f.apply(Action::Connect, &p, false);
    f.0.engine.exe = "/moved/aphrodite-mcp".into();
    let p = f.proposal(Action::Connect);
    f.override_reply(
        "remove",
        json!({"afterWrite":true,"snapshot":true,"once":true,"exit":17}),
    );
    let r = f.apply(Action::Connect, &p, false);
    assert_eq!(r["code"], "repoint_restored");
    let mut fresh = Fixture::new();
    fresh.0.engine.exe = f.e().exe.clone();
    let path = record_path(&fresh);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::copy(f.e().home.join("repoint-snapshot"), &path).unwrap();
    let look = json!(fresh.e().status(CLAUDE).unwrap());
    assert_eq!(look["unfinishedRepoint"], true);
    assert!(fresh.calls().is_empty());
    let resume = fresh.proposal(Action::Connect);
    assert_eq!(resume["onAddFailure"]["argv"][9], json!(old));
    assert_eq!(fresh.calls().len(), 1);
    fresh.state("/someone/else", "");
    assert_eq!(
        fresh.apply(Action::Connect, &resume, false)["code"],
        "changed"
    );
    fs::remove_file(fresh.e().home.join("entry")).unwrap();
    let resume = fresh.proposal(Action::Connect);
    assert_eq!(
        fresh.apply(Action::Connect, &resume, false)["code"],
        "registered"
    );
    assert_eq!(fresh.status()["unfinishedRepoint"], false);
}

#[test]
fn astra_5_close_and_restart_wait_for_an_accepted_registration() {
    use crate::disk;
    use std::{
        future::Future,
        sync::mpsc,
        task::{Context, Waker},
    };
    use tauri::test::{mock_builder, mock_context, noop_assets};
    let _serial = disk::TEST_SERIAL.lock().unwrap();
    let app = mock_builder().build(mock_context(noop_assets())).unwrap();
    let web = tauri::WebviewWindowBuilder::new(&app, "connect", Default::default())
        .build()
        .unwrap();
    let f = Fixture::new();
    let p = f.proposal(Action::Connect);
    let (entered, started) = mpsc::channel();
    let (release, stalled) = mpsc::channel();
    let mut change = Box::pin(commands::mutation(
        move || {
            entered.send(()).unwrap();
            stalled.recv_timeout(Duration::from_secs(5)).unwrap();
            Ok(f.0.engine)
        },
        CLAUDE,
        Action::Connect,
        p["fingerprint"].as_str().unwrap().to_owned(),
        false,
    ));
    assert!(change
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
        .is_pending());
    started.recv_timeout(Duration::from_secs(5)).unwrap();
    tauri::async_runtime::block_on(async {
        let closes = disk::disk_begin_close(web.as_ref().window(), "restart".into(), 40)
            .await
            .unwrap();
        if closes {
            disk::release_close("connect", disk::Release::Cancelled("restart"));
        }
        release.send(()).unwrap();
        let result = wire(change.await);
        assert!(!closes);
        assert_eq!(result["code"], "registered");
    });
}

#[test]
fn opus_10_the_guide_uses_generated_setup_and_undo_and_explains_the_active_lookup() {
    let guide = include_str!("../../../../docs/AGENT-CONNECT.md");
    let mut f = Fixture::new();
    f.0.engine.cli_dirs.clear();
    f.0.engine.exe = "/Applications/Aphrodite.app/Contents/MacOS/aphrodite-mcp".into();
    for profile in [None, Some(PathBuf::from("/Users/ada/Claude Work"))] {
        f.0.engine.claude_config_dir = profile;
        for action in [Action::Connect, Action::Remove] {
            let line = claude::snippet(f.e(), action).unwrap();
            assert!(guide.lines().any(|l| l == line), "{line}");
        }
    }
    for term in [
        "connect_status",
        "connect_ask",
        "connect_apply",
        "connect_remove",
        "health-check",
        "registered_record_missing",
        "unfinishedRepoint",
    ] {
        assert!(guide.contains(term), "{term}");
    }
}

#[test]
fn astra_4_only_a_complete_missing_diagnostic_can_clear_ownership() {
    let f = Fixture::new();
    for name in [
        "get-missing",
        "get-missing-empty",
        "get-missing-suggestion",
        "get-missing-truncated",
    ] {
        let fixture =
            fs::read_to_string(f.e().home.join("fixtures").join(format!("{name}.txt"))).unwrap();
        f.override_reply(
            "get",
            json!({"exit":1, "err":fixture.split_once('\n').unwrap().1.trim_end_matches('\n')}),
        );
        assert_eq!(f.status()["entryExists"], false);
    }
    for text in [
        "No MCP server named \"aphrodite\". unrecognized reply",
        "No MCP server named \"aphrodite\". Configured servers: other\n  Command: ignored",
        "No MCP server named \"aphrodite\". Configured servers: other\r",
    ] {
        f.override_reply("get", json!({"exit":1, "err":text}));
        assert_eq!(f.status()["entryExists"], Value::Null);
    }
}
#[test]
fn opus_4_trust_accounts_for_write_acls_and_the_env_interpreter() {
    let f = Fixture::new();
    let dir = &f.e().cli_dirs[0];
    let real = dir.join("playback");
    assert!(Command::new("/bin/chmod")
        .args(["+a", "everyone allow write"])
        .arg(&real)
        .status()
        .unwrap()
        .success());
    assert_eq!(json!(f.e().status(CLAUDE).unwrap())["trusted"], false);
    assert!(Command::new("/bin/chmod")
        .arg("-N")
        .arg(&real)
        .status()
        .unwrap()
        .success());
    fs::write(&real, "#!/usr/bin/env fixture-runtime\n").unwrap();
    let interpreter = dir.join("fixture-runtime");
    fs::write(&interpreter, "exit 0\n").unwrap();
    fs::set_permissions(&interpreter, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(f.status()["error"], "cli_untrusted");
    assert!(f.calls().is_empty());
}

#[test]
fn astra_7_cli_discovery_also_refuses_a_link_to_the_settings_inode() {
    let f = Fixture::new();
    fs::hard_link(f.e().cli_dirs[0].join("playback"), f.e().path(CLAUDE)).unwrap();
    assert_eq!(f.status()["error"], "cli_untrusted");
    assert!(f.calls().is_empty());
}
#[test]
fn astra_6_readable_registration_survives_an_unreadable_record() {
    let f = Fixture::new();
    let p = f.proposal(Action::Connect);
    f.apply(Action::Connect, &p, false);
    fs::write(record_path(&f), "incomplete fixture").unwrap();
    let s = f.status();
    assert_eq!(s["entryExists"], true);
    assert_eq!(s["pointsHere"], true);
    assert_eq!(s["error"], "record_failed");
    let repair = f.proposal(Action::Connect);
    assert_eq!(
        f.apply(Action::Connect, &repair, false)["code"],
        "already_connected"
    );
    assert_eq!(f.status()["error"], Value::Null);
}

#[test]
fn astra_5_remove_that_commits_then_times_out_is_checked_before_restoration() {
    let mut f = Fixture::new();
    let p = f.proposal(Action::Connect);
    f.apply(Action::Connect, &p, false);
    f.0.engine.exe = "/moved/aphrodite-mcp".into();
    f.0.engine.cli_timeout = Duration::from_secs(2);
    let p = f.proposal(Action::Connect);
    f.override_reply(
        "remove",
        json!({"afterWrite":true,"hang":true,"once":true,"exit":0}),
    );
    let start = f.calls().len();
    let r = f.apply(Action::Connect, &p, false);
    assert_eq!(r["code"], "repoint_restored");
    assert_eq!(r["cause"], "cli_timeout");
    assert_eq!(r["observed"]["owned"], true);
    assert_eq!(r["observed"]["pointsHere"], false);
    let calls = f.calls();
    assert_eq!(
        calls[start..]
            .iter()
            .map(|c| c["args"][1].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["get", "remove", "get", "add", "get"]
    );
}

#[test]
fn astra_8_an_invalid_profile_still_allows_discovery_of_all_clients() {
    use std::os::unix::ffi::OsStringExt;
    let mut f = Fixture::new();
    f.0.engine.claude_config_dir = Some(f.e().home.join(std::ffi::OsString::from_vec(vec![0xff])));
    let all = TOOLS
        .iter()
        .map(|&t| f.e().status(t))
        .collect::<Result<Vec<_>>>()
        .unwrap();
    let rows = json!(all);
    assert_eq!(rows[0]["installed"], true);
    assert_eq!(rows[0]["path"], Value::Null);
    assert_eq!(rows[0]["error"], "invalid_path");
    assert!(f.calls().is_empty());
}

#[test]
fn opus_1_fake_health_uses_the_installed_macos_formatters_tick() {
    let f = Fixture::new();
    let p = f.proposal(Action::Connect);
    f.apply(Action::Connect, &p, false);
    let stanza = fs::read_to_string(f.e().home.join("entry")).unwrap();
    assert!(stanza.lines().any(|line| line == "  Status: ✔ Connected"));
}

#[test]
fn opus_1_supported_optional_fields_have_versioned_fixtures() {
    let f = Fixture::new();
    let path = f.e().home.join("entry");
    for (name, plain) in [("get-stdio-no-env", true), ("get-stdio-env-values", false)] {
        let fixture =
            fs::read_to_string(f.e().home.join("fixtures").join(format!("{name}.txt"))).unwrap();
        fs::write(
            &path,
            fixture
                .split_once('\n')
                .unwrap()
                .1
                .replace("{args}", "")
                .replace("{command}", f.e().executable()),
        )
        .unwrap();
        let s = f.status();
        assert_eq!(s["pointsHere"], true);
        assert_eq!(s["owned"], plain);
    }
    let url = include_str!("../../../../tests/fixtures/claude-code/get-url.txt")
        .split_once('\n')
        .unwrap()
        .1;
    for kind in ["http", "sse", "ws"] {
        fs::write(&path, url.replace("{transport}", kind)).unwrap();
        let s = f.status();
        assert_eq!(s["entryExists"], true);
        assert_eq!(s["pointsHere"], false);
    }
}

#[test]
fn astra_5_an_unwritable_journal_prevents_remove_and_an_unknown_result_keeps_recovery() {
    let mut f = Fixture::new();
    let p = f.proposal(Action::Connect);
    f.apply(Action::Connect, &p, false);
    f.0.engine.exe = "/moved/aphrodite-mcp".into();
    let p = f.proposal(Action::Connect);
    let path = record_path(&f);
    let dir = path.parent().unwrap();
    fs::set_permissions(dir, fs::Permissions::from_mode(0o500)).unwrap();
    let start = f.calls().len();
    let failed = f.apply(Action::Connect, &p, false);
    fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(failed["code"], "record_failed");
    assert!(f.calls()[start..].iter().all(|c| c["args"][1] == "get"));
    f.override_reply(
        "remove",
        json!({"afterWrite":true,"exit":17,"once":true,
        "nextGet":{"exit":12,"err":"private-neighbor","once":true}}),
    );
    let failed = f.apply(Action::Connect, &p, false);
    assert_eq!(failed["observed"]["error"], "cli_get_failed");
    assert_eq!(failed["observed"]["exitStatus"], 12);
    assert_eq!(failed["observed"]["entryExists"], Value::Null);
    assert_eq!(f.calls().last().unwrap()["args"][1], "get");
    assert_eq!(
        json!(f.e().status(CLAUDE).unwrap())["unfinishedRepoint"],
        true
    );
}

#[test]
fn astra_1_preview_displays_the_resolved_file_identity_and_detects_in_place_change() {
    use std::os::unix::fs::MetadataExt;
    let f = Fixture::new();
    let p = f.proposal(Action::Connect);
    let real = f.e().cli_dirs[0].join("playback");
    let m = fs::metadata(&real).unwrap();
    assert_eq!(p["program"]["path"], json!(real));
    assert!(p["program"].get("searchPath").is_none());
    assert!(p["program"].get("interpreter").is_none());
    assert_eq!(
        p["program"]["identity"],
        json!({"device":m.dev(), "inode":m.ino(), "size":m.size(),
        "mtimeSeconds":m.mtime(), "mtimeNanos":m.mtime_nsec()})
    );
    fs::write(real, format!("{SCRIPT}\n# newer fixture\n")).unwrap();
    let count = f.calls().len();
    assert_eq!(f.apply(Action::Connect, &p, false)["code"], "changed");
    assert_eq!(f.calls().len(), count);
}
#[test]
fn astra_1_an_env_symlink_still_checks_its_selected_interpreter() {
    let f = Fixture::new();
    let dir = &f.e().cli_dirs[0];
    let env = f.e().home.join("env");
    symlink("/usr/bin/env", &env).unwrap();
    fs::write(
        dir.join("playback"),
        format!("#!{} fixture-runtime\n", env.display()),
    )
    .unwrap();
    fs::write(dir.join("fixture-runtime"), []).unwrap();
    fs::set_permissions(
        dir.join("fixture-runtime"),
        fs::Permissions::from_mode(0o775),
    )
    .unwrap();
    assert_eq!(json!(f.e().status(CLAUDE).unwrap())["trusted"], false);
    assert!(f.calls().is_empty());
}
#[test]
fn astra_7_the_registration_lock_refuses_settings_aliases_before_opening() {
    let f = Fixture::new();
    let path = record_path(&f).with_extension("lock");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let settings = f.e().path(CLAUDE);
    fs::write(&settings, []).unwrap();
    fs::set_permissions(&settings, fs::Permissions::from_mode(0o400)).unwrap();
    fs::hard_link(settings, path).unwrap();
    assert_eq!(f.proposal(Action::Connect)["code"], "invalid_path");
    assert!(f.calls().is_empty());
}
