use super::*;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
};
use tempfile::{tempdir, TempDir};

struct Home {
    _dir: TempDir,
    engine: Engine,
}
impl Home {
    fn new() -> Self {
        let dir = tempdir().unwrap();
        let home = dir.path().canonicalize().unwrap();
        let engine = Engine::new(
            home,
            PathBuf::from("/Applications/Design \"A\".app/Contents/MacOS/aphrodite-mcp"),
        );
        Self { _dir: dir, engine }
    }
    fn file(&self, tool: Tool, data: &str) -> PathBuf {
        let file = self.engine.path(tool);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, data).unwrap();
        file
    }
}
const JSON: &[&str] = &[
    "{}",
    "{ \"odd\" : [1,  true], \"mcpServers\" : {} }",
    "{\n  \"mcpServers\" : { \"도구\":{\"command\":\"x\"} }, \"custom\":null\n}\n",
];
const TOML: &[&str] = &[
    "",
    "# tools",
    "model = 'demo'\n\n[mcp_servers.other]\ncommand  = 'two' # note",
    "mcp_servers = { other = { command = 'hi' } }\n",
    "mcp_servers.other.command = 'hello'\n",
];

#[test]
fn every_splice_preserves_the_other_bytes_and_removal_restores_the_original() {
    for tool in [Tool::Codex, Tool::Cursor, Tool::ClaudeDesktop] {
        let mut fixtures = if tool == Tool::Codex {
            TOML.to_vec()
        } else {
            JSON.to_vec()
        };
        if tool == Tool::Cursor {
            fixtures.push("{/*keep*/\"mcpServers\":{\n// this is theirs\n\"c\":{},\n},}");
        }
        for fixture in fixtures {
            for nl in ["\n", "\r\n"] {
                for ending in ["", "\n", "  "] {
                    let original = format!("{fixture}{ending}").replace('\n', nl);
                    let home = Home::new();
                    let file = home.file(tool, &original);
                    let engine = &home.engine;
                    let preview = engine.preview(tool, Action::Connect, 1).unwrap();
                    assert_eq!(fs::read_to_string(&file).unwrap(), original);
                    let expected = preview.edited(&original).unwrap();
                    assert!(preview.changes.iter().all(|c| c.before.is_empty()));
                    engine
                        .commit(tool, Action::Connect, &preview.fingerprint, false)
                        .unwrap();
                    assert_eq!(fs::read_to_string(&file).unwrap(), expected);
                    assert_eq!(
                        fs::read_to_string(preview.backup.unwrap()).unwrap(),
                        original
                    );
                    assert_eq!(engine.status(tool).unwrap().points_here, Some(true));
                    let undo = engine.preview(tool, Action::Remove, 2).unwrap();
                    engine
                        .commit(tool, Action::Remove, &undo.fingerprint, false)
                        .unwrap();
                    assert_eq!(fs::read_to_string(file).unwrap(), original);
                }
            }
        }
    }
}

#[test]
fn every_tool_checks_malformed_readonly_and_symlinked_files_without_writing() {
    for tool in TOOLS {
        let h = Home::new();
        let e = &h.engine;
        let valid = if tool == Tool::Codex { "# toml" } else { "{}" };
        let file = h.file(tool, "{broken");
        assert_eq!(
            e.status(tool).unwrap().error.is_some(),
            tool != Tool::ClaudeCode
        );
        assert!(e.preview(tool, Action::Connect, 1).is_err());
        fs::write(&file, valid).unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o444)).unwrap();
        assert!(e.preview(tool, Action::Connect, 1).is_err());
        fs::remove_file(&file).unwrap();
        let outside = tempdir().unwrap();
        let stranger = outside.path().join("stranger");
        fs::write(&stranger, valid).unwrap();
        symlink(&stranger, &file).unwrap();
        assert!(e.preview(tool, Action::Connect, 1).is_err());
        assert_eq!(fs::read_to_string(&stranger).unwrap(), valid);
        fs::remove_file(&file).unwrap();
        let inside = e.home.join("inside");
        fs::write(&inside, valid).unwrap();
        symlink(&inside, &file).unwrap();
        if tool != Tool::ClaudeCode {
            let p = e.preview(tool, Action::Connect, 3).unwrap();
            e.commit(tool, Action::Connect, &p.fingerprint, false)
                .unwrap();
            assert!(fs::symlink_metadata(&file).unwrap().is_symlink());
            assert_eq!(
                fs::read_to_string(&inside).unwrap(),
                p.edited(valid).unwrap()
            );
        }
    }
}

#[test]
fn replacements_require_confirmation_and_stale_previews_leave_no_backup() {
    for tool in [Tool::Codex, Tool::Cursor, Tool::ClaudeDesktop] {
        let h = Home::new();
        let e = &h.engine;
        let source = if tool == Tool::Codex {
            "[mcp_servers.aphrodite]\ncommand='theirs'\nargs=['keep']\n[elsewhere]\nx=1"
        } else {
            r#"{"mcpServers":{"aphrodite":{"command":"theirs","args":["keep"]}}}"#
        };
        let file = h.file(tool, source);
        fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
        let p = e.preview(tool, Action::Connect, 1).unwrap();
        assert!(p.replacement_required);
        assert!(e.preview(tool, Action::Remove, 2).is_err());
        assert!(e
            .commit(tool, Action::Connect, &p.fingerprint, false)
            .is_err());
        fs::write(&file, format!("{source}\n")).unwrap();
        assert!(e
            .commit(tool, Action::Connect, &p.fingerprint, true)
            .is_err());
        assert!(!p.backup.unwrap().exists());
        let p = e.preview(tool, Action::Connect, 3).unwrap();
        e.commit(tool, Action::Connect, &p.fingerprint, true)
            .unwrap();
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o640
        );
        let undo = e.preview(tool, Action::Remove, 4).unwrap();
        e.commit(tool, Action::Remove, &undo.fingerprint, false)
            .unwrap();
        assert!(!fs::read_to_string(file).unwrap().contains("aphrodite"));
        assert_eq!(
            fs::read_to_string(p.backup.unwrap()).unwrap(),
            format!("{source}\n")
        );
    }
}

#[test]
fn only_documented_files_are_created_and_translocation_blocks_writes() {
    for tool in TOOLS {
        let h = Home::new();
        let mut e = h.engine;
        let file = e.path(tool);
        if tool == Tool::ClaudeCode {
            assert!(e.preview(tool, Action::Connect, 1).is_err());
            assert!(e.snippet(tool).contains("claude mcp add"));
            assert!(!file.exists());
            continue;
        }
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        let p = e.preview(tool, Action::Connect, 1).unwrap();
        assert!(!file.exists());
        assert!(p.backup.is_none());
        e.location = Location::Translocated;
        assert!(e
            .commit(tool, Action::Connect, &p.fingerprint, false)
            .is_err());
        e.location = Location::DiskImage;
        assert!(e
            .commit(tool, Action::Connect, &p.fingerprint, false)
            .is_err());
        e.location = Location::Installed;
        e.commit(tool, Action::Connect, &p.fingerprint, false)
            .unwrap();
        let undo = e.preview(tool, Action::Remove, 2).unwrap();
        e.commit(tool, Action::Remove, &undo.fingerprint, false)
            .unwrap();
        assert!(!file.exists());
    }
}

#[test]
fn removal_keeps_a_neighbor_added_after_the_previewed_installation() {
    for original in [None, Some("{}"), Some(r#"{"mcpServers":{}}"#)] {
        let h = Home::new();
        let e = &h.engine;
        let tool = Tool::Cursor;
        fs::create_dir_all(e.path(tool).parent().unwrap()).unwrap();
        if let Some(s) = original {
            h.file(tool, s);
        }
        let p = e.preview(tool, Action::Connect, 1).unwrap();
        e.commit(tool, Action::Connect, &p.fingerprint, false)
            .unwrap();
        let path = e.path(tool);
        let installed = fs::read_to_string(&path).unwrap();
        // Add a root-level preference without touching the installed entry or its receipt.
        let changed = format!(
            "{},\"theme\": \"blue\"}}",
            installed.strip_suffix('}').unwrap()
        );
        fs::write(&path, &changed).unwrap();
        let p = e.preview(tool, Action::Remove, 2).unwrap();
        e.commit(tool, Action::Remove, &p.fingerprint, false)
            .unwrap();
        let after = fs::read_to_string(&path).unwrap();
        assert!(after.contains("\"theme\": \"blue\""));
        assert!(!after.contains("\"aphrodite\""));
    }
}

#[test]
fn an_unowned_matching_command_is_reported_but_never_silently_claimed() {
    let h = Home::new();
    let e = &h.engine;
    for tool in TOOLS {
        let text = if tool == Tool::Codex {
            edit::toml_entry(e.executable(), "\r\n")
        } else {
            format!(
                r#"{{"mcpServers":{{"aphrodite":{}}},"unknown":4}}"#,
                edit::json_entry(tool, e.executable())
            )
        };
        let path = h.file(tool, &text);
        let s = e.status(tool).unwrap();
        if tool != Tool::ClaudeCode {
            assert_eq!(
                (s.entry_exists, s.points_here, s.owned),
                (Some(true), Some(true), Some(false))
            );
        }
        if tool != Tool::ClaudeCode {
            let p = e.preview(tool, Action::Connect, 1).unwrap();
            assert!(p.replacement_required);
            assert!(matches!(
                e.commit(tool, Action::Connect, &p.fingerprint, false),
                Err(Code::ConfirmationRequired)
            ));
            assert!(matches!(
                remove(e, tool, false),
                Err(Code::ConfirmationRequired)
            ));
        } else {
            assert!(matches!(
                e.preview(tool, Action::Connect, 1),
                Err(Code::CopyOnly)
            ));
        }
        assert_eq!(fs::read_to_string(path).unwrap(), text);
    }
}
#[test]
fn malformed_or_ambiguous_config_and_nonwritable_directories_leave_no_backup() {
    for tool in TOOLS {
        let h = Home::new();
        let e = &h.engine;
        let mut invalid = vec!["bad"];
        if tool == Tool::Codex {
            invalid.push("t=1\nt=2");
        } else {
            invalid.extend(["", "{ } { }", r#"{"mcpServers":{},"mcpServers":{}}"#]);
            if tool != Tool::Cursor {
                invalid.extend(["{/*c*/}", "{\"x\":1,}"]);
            }
        }
        for text in invalid {
            let file = h.file(tool, text);
            assert_eq!(
                e.status(tool).unwrap().error.is_some(),
                tool != Tool::ClaudeCode,
                "{tool:?} {text:?}"
            );
            assert!(e.preview(tool, Action::Connect, 3).is_err());
            assert_eq!(fs::read_to_string(file).unwrap(), text);
        }
    }
    let h = Home::new();
    let e = &h.engine;
    let f = h.file(Tool::Cursor, "{}");
    let p = e.preview(Tool::Cursor, Action::Connect, 1).unwrap();
    let dir = f.parent().unwrap();
    fs::set_permissions(dir, fs::Permissions::from_mode(0o555)).unwrap();
    assert!(matches!(
        e.commit(Tool::Cursor, Action::Connect, &p.fingerprint, false),
        Err(Code::NotWritable)
    ));
    fs::set_permissions(dir, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(fs::read_dir(dir).unwrap().count(), 1);
}
#[test]
fn a_parent_symlink_swap_and_two_simultaneous_applies_cannot_overwrite_another_file() {
    let h = Home::new();
    let e = &h.engine;
    let tool = Tool::Cursor;
    let path = h.file(tool, "{}");
    let p = e.preview(tool, Action::Connect, 1).unwrap();
    let parent = path.parent().unwrap();
    let moved = e.home.join("moved");
    fs::rename(parent, &moved).unwrap();
    let outside = tempdir().unwrap();
    symlink(outside.path(), parent).unwrap();
    assert!(matches!(
        e.commit(tool, Action::Connect, &p.fingerprint, false),
        Err(Code::OutsideHome)
    ));
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    fs::remove_file(parent).unwrap();
    fs::rename(&moved, parent).unwrap();
    std::thread::scope(|s| {
        let go = || e.commit(tool, Action::Connect, &p.fingerprint, false);
        let a = s.spawn(go);
        let b = s.spawn(go);
        assert_ne!(a.join().unwrap().is_ok(), b.join().unwrap().is_ok());
    });
    assert_eq!(fs::read_dir(parent).unwrap().count(), 2);
}

#[test]
fn codex_removes_only_replaced_server_blocks_and_keeps_the_original_backup() {
    for text in ["[mcp_servers.'aphrodite']\ncommand='old'\n[z]\nother=8\n[mcp_servers.aphrodite.env]\nNAME='v'",
        "mcp_servers.aphrodite.command='old'\nmcp_servers.other.command='other'\nmcp_servers.aphrodite.args=['x']",
        "mcp_servers={aphrodite={command='old'}, other={command='unchanged'}}",
        "[mcp_servers]\naphrodite = {command='old'}\nother={command='keep'}"] {
        let h=Home::new();let e=&h.engine;let tool=Tool::Codex;let f=h.file(tool,text);
        let p=e.preview(tool,Action::Connect,1).unwrap();
        e.commit(tool,Action::Connect,&p.fingerprint,true).unwrap();
        let preserved=p.backup.unwrap();
        let edited=fs::read_to_string(&f).unwrap();
        assert!(!edited.contains("'old'"));assert!(!edited.contains("NAME='v'"));
        let p=e.preview(tool,Action::Remove,2).unwrap();
        e.commit(tool,Action::Remove,&p.fingerprint,false).unwrap();
        let result=fs::read_to_string(f).unwrap();
        assert!(!result.contains("aphrodite"));
        assert!(result.contains("other"));
        assert_eq!(fs::read_to_string(preserved).unwrap(),text);
    }
}

#[test]
fn a_config_file_and_an_installed_tool_are_independent_signals() {
    let h = Home::new();
    let mut e = h.engine;
    let tool = Tool::Cursor;
    let path = e.path(tool);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, "{}").unwrap();
    assert!(!e.status(tool).unwrap().installed);
    let apps = e.home.join("Applications");
    fs::create_dir_all(apps.join("Cursor.app")).unwrap();
    e.app_dirs.push(apps);
    assert!(e.status(tool).unwrap().installed);
}
#[test]
fn disk_image_mounts_are_identified_by_component_and_regular_external_disks_are_distinct() {
    let info=plist::Value::from_reader_xml(br#"<plist version="1.0"><dict><key>images</key><array><dict><key>system-entities</key><array><dict><key>mount-point</key><string>/Volumes/Aphrodite</string></dict></array></dict></array></dict></plist>"#.as_slice()).unwrap();
    assert!(mounted_image(
        Path::new("/Volumes/Aphrodite"),
        OsStr::new("fixture"),
        &info
    ));
    assert!(!mounted_image(
        Path::new("/Volumes/Aphrodite External/Other.app"),
        OsStr::new("fixture"),
        &info
    ));
    assert_eq!(
        mount_location(
            Path::new("/A.app/Contents/MacOS/app"),
            Path::new("/private/tmp/AppTranslocation/abc/d"),
            OsStr::new("fixture"),
            true,
            None
        ),
        Location::Translocated
    );
}

#[test]
fn a_file_first_created_by_another_process_wins_even_at_the_final_rename() {
    use super::files::{root, FileState};
    let h = Home::new();
    let e = &h.engine;
    let dir = root(&e.home).unwrap();
    let name = Path::new("config.toml");
    let f = FileState::read(&dir, name).unwrap();
    let pending = f.temp(&dir, "our bytes", None).unwrap();
    dir.write(name, "their bytes").unwrap();
    assert!(pending
        .publish_checked(name.as_os_str(), &f, false, || Ok(()))
        .is_err());
    assert_eq!(dir.read_to_string(name).unwrap(), "their bytes");
}

#[test]
fn a_config_symlink_cannot_turn_a_client_credential_store_into_a_config_file() {
    for (tool, store) in [
        (Tool::Codex, ".codex/auth.json"),
        (Tool::ClaudeCode, ".claude/.credentials.json"),
    ] {
        let h = Home::new();
        let e = &h.engine;
        let f = e.path(tool);
        let credentials = e.home.join(store);
        fs::create_dir_all(credentials.parent().unwrap()).unwrap();
        fs::write(
            &credentials,
            if tool == Tool::Codex {
                "# synthetic"
            } else {
                "{}"
            },
        )
        .unwrap();
        symlink(&credentials, &f).unwrap();
        assert_eq!(
            e.status(tool).unwrap().error,
            (tool != Tool::ClaudeCode).then_some(Code::InvalidPath)
        );
    }
}

#[test]
fn opus_7_literal_provider_fields_stay_in_rust_and_allow_preview() {
    for (tool, source) in [
        (
            Tool::Cursor,
            r#"{"mcpServers":{"other":{"env":{"ANTHROPIC_API_KEY":"synthetic"}}}}"#,
        ),
        (
            Tool::Codex,
            "[mcp_servers.other.env]\nOPENAI_API_KEY='synthetic'",
        ),
    ] {
        let h = Home::new();
        let e = &h.engine;
        let path = h.file(tool, source);
        let p = e.preview(tool, Action::Connect, 1).unwrap();
        assert!(!serde_json::to_string(&p).unwrap().contains("synthetic"));
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }
}

#[test]
fn astra_5_the_serialized_preview_contains_only_our_inserted_text() {
    let h = Home::new();
    for (tool, source) in [
        (
            Tool::Cursor,
            r#"{"mcpServers":{"aphrodite":{"headers":{"Authorization":"fixture-only"}}}}"#,
        ),
        (
            Tool::Codex,
            "[model_providers.local]\nexperimental_bearer_token='fixture-only'",
        ),
    ] {
        h.file(tool, source);
        let preview = h.engine.preview(tool, Action::Connect, 11).unwrap();
        let public = serde_json::to_value(&preview).unwrap();
        assert!(!public.to_string().contains("fixture-only"));
        assert!(public["line"].is_number() && public["text"].is_string());
        h.engine
            .commit(tool, Action::Connect, &preview.fingerprint, true)
            .unwrap();
        let backup = preview.backup.unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), source);
        assert_eq!(
            fs::metadata(backup).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}

#[test]
fn astra_6_control_characters_are_invalid_in_desktop_json_and_cursor_jsonc() {
    for tool in [Tool::ClaudeDesktop, Tool::Cursor] {
        for input in ["{\"note\":\"left\nright\"}", "{\x0b\"note\":0}"] {
            assert!(edit::layout(tool, Some(input), "/app").is_err());
        }
    }
}

#[test]
fn astra_7_bom_is_outside_the_edit_and_inline_dotted_toml_offers_a_snippet() {
    let h = Home::new();
    for (tool, input) in [
        (Tool::Codex, "\u{feff}mcp_servers.aphrodite.command='old'"),
        (Tool::Cursor, "\u{feff}{}"),
    ] {
        h.file(tool, input);
        let p = h.engine.preview(tool, Action::Connect, 7).unwrap();
        assert!(p.edited(input).unwrap().starts_with('\u{feff}'));
    }
    let input = "mcp_servers = { aphrodite.command = 'old', other.command = 'keep' }";
    h.file(Tool::Codex, input);
    let code = h
        .engine
        .preview(Tool::Codex, Action::Connect, 8)
        .err()
        .unwrap();
    assert_eq!(serde_json::to_value(code).unwrap(), "unsupported_layout");
}

#[test]
fn opus_7_copy_only_status_and_missing_config_directories_need_no_file_access() {
    let h = Home::new();
    h.file(Tool::ClaudeCode, "unparseable private client state");
    let status = h.engine.status(Tool::ClaudeCode).unwrap();
    assert_eq!(
        (status.error, status.entry_exists, status.config_exists),
        (None, None, None)
    );
    for tool in [Tool::Cursor, Tool::ClaudeDesktop, Tool::Codex] {
        let p = h.engine.path(tool);
        assert!(!h.engine.status(tool).unwrap().installed);
        assert!(h.engine.preview(tool, Action::Connect, 1).is_err());
        assert!(!p.parent().unwrap().exists());
    }
}

const WRITTEN: [Tool; 3] = [Tool::Codex, Tool::Cursor, Tool::ClaudeDesktop];
fn connect(e: &Engine, tool: Tool, stamp: u128) -> Preview {
    let p = e.preview(tool, Action::Connect, stamp).unwrap();
    e.commit(
        tool,
        Action::Connect,
        &p.fingerprint,
        p.replacement_required,
    )
    .unwrap()
}
fn remove(e: &Engine, tool: Tool, confirm: bool) -> Result<Preview> {
    let p = e.preview(tool, Action::Remove, 90)?;
    e.commit(tool, Action::Remove, &p.fingerprint, confirm)
}
#[test]
fn opus_1_repoint_keeps_the_first_original_for_every_client() {
    for tool in WRITTEN {
        let mut h = Home::new();
        let original = if tool == Tool::Codex {
            "# before"
        } else {
            "{\n}"
        };
        let path = h.file(tool, original);
        let backup = connect(&h.engine, tool, 1).backup.unwrap();
        h.engine.exe = "/Applications/Moved.app/Contents/MacOS/aphrodite-mcp".into();
        assert!(connect(&h.engine, tool, 2).backup.is_none());
        remove(&h.engine, tool, false).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), original);
        assert!(!backup.exists());
    }
}
#[test]
fn astra_8_remove_after_two_paths_retires_a_config_we_created() {
    for tool in WRITTEN {
        let mut h = Home::new();
        let path = h.engine.path(tool);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        h.engine.exe = "/app/one".into();
        connect(&h.engine, tool, 1);
        h.engine.exe = "/app/two".into();
        connect(&h.engine, tool, 2);
        remove(&h.engine, tool, false).unwrap();
        assert!(!path.exists() && path.parent().unwrap().exists());
    }
}
#[test]
fn opus_2_removing_after_the_backup_is_deleted_needs_only_the_receipt() {
    for input in ["{}", r#"{"mcpServers":{"aphrodite":{"command":"old"}}}"#] {
        let h = Home::new();
        let path = h.file(Tool::Cursor, input);
        let p = connect(&h.engine, Tool::Cursor, 1);
        fs::remove_file(p.backup.unwrap()).unwrap();
        remove(&h.engine, Tool::Cursor, false).unwrap();
        let after = fs::read_to_string(path).unwrap();
        assert!(!after.contains("aphrodite"));
        if input == "{}" {
            assert_eq!(after, input);
        }
    }
}
#[test]
fn opus_3_confirmed_removal_after_editor_rename_restores_the_original_bytes() {
    for tool in WRITTEN {
        let h = Home::new();
        let original = if tool == Tool::Codex {
            "# keep"
        } else {
            "{\n  \"other\": true\n}"
        };
        let path = h.file(tool, original);
        let backup = connect(&h.engine, tool, 1).backup.unwrap();
        let editor = path.with_extension("new");
        fs::write(&editor, fs::read(&path).unwrap()).unwrap();
        fs::rename(editor, &path).unwrap();
        let status = h.engine.status(tool).unwrap();
        assert_eq!(
            (status.entry_exists, status.points_here, status.owned),
            (Some(true), Some(true), Some(false))
        );
        assert!(matches!(
            remove(&h.engine, tool, false),
            Err(Code::ConfirmationRequired)
        ));
        remove(&h.engine, tool, true).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), original);
        assert!(!backup.exists());
    }
}
#[test]
fn astra_4_receipts_distinguish_the_physical_spelling_of_an_entry_key() {
    let h = Home::new();
    let path = h.file(Tool::Cursor, "{}");
    connect(&h.engine, Tool::Cursor, 1);
    let installed = fs::read_to_string(&path).unwrap();
    fs::write(
        &path,
        installed.replace("\"aphrodite\"", r#""aphro\u0064ite""#),
    )
    .unwrap();
    assert_eq!(h.engine.status(Tool::Cursor).unwrap().owned, Some(false));
    assert!(matches!(
        remove(&h.engine, Tool::Cursor, false),
        Err(Code::ConfirmationRequired)
    ));
}

#[test]
fn astra_1_effective_access_and_preserved_acl_govern_the_replacement() {
    use std::process::Command;
    let h = Home::new();
    let path = h.file(Tool::Cursor, "{}");
    let user = std::env::var("USER").unwrap();
    let acl = |entry: &str| {
        assert!(Command::new("/bin/chmod")
            .args(["+a", &format!("{user} deny {entry}")])
            .arg(&path)
            .status()
            .unwrap()
            .success())
    };
    acl("write");
    assert!(matches!(
        h.engine.preview(Tool::Cursor, Action::Connect, 1),
        Err(Code::NotWritable)
    ));
    assert!(Command::new("/bin/chmod")
        .arg("-N")
        .arg(&path)
        .status()
        .unwrap()
        .success());
    acl("execute");
    xattr::set(&path, "studio.test.other", b"unchanged").unwrap();
    let listing = || {
        Command::new("/bin/ls")
            .arg("-le")
            .arg(&path)
            .output()
            .unwrap()
            .stdout
    };
    let acl_line = |bytes: Vec<u8>| {
        String::from_utf8(bytes)
            .unwrap()
            .lines()
            .skip(1)
            .collect::<Vec<_>>()
            .join("\n")
    };
    let before = acl_line(listing());
    assert!(before.contains("deny execute"));
    connect(&h.engine, Tool::Cursor, 1);
    assert_eq!(acl_line(listing()), before);
    assert_eq!(
        xattr::get(path, "studio.test.other").unwrap().unwrap(),
        b"unchanged"
    );
}

#[test]
fn astra_2_the_displaced_save_is_checked_for_connect_and_remove() {
    let h = Home::new();
    let dir = files::root(&h.engine.home).unwrap();
    let name = Path::new("local.json");
    for delete in [false, true] {
        dir.write(name, "first").unwrap();
        let expected = FileState::read(&dir, name).unwrap();
        let staged = expected.temp(&dir, "second", None).unwrap();
        dir.write(name, "editor").unwrap();
        assert!(matches!(
            staged.publish_checked(name.as_os_str(), &expected, delete, || Ok(())),
            Err(Code::Changed)
        ));
        assert_eq!(dir.read(name).unwrap(), b"editor");
    }
}

#[test]
fn astra_3_publication_requires_the_same_reachable_directory() {
    let h = Home::new();
    let path = h.file(Tool::Cursor, "{}");
    let root = files::root(&h.engine.home).unwrap();
    let relative = path.strip_prefix(&h.engine.home).unwrap();
    let handle = files::parent(&root, relative).unwrap();
    fs::rename(path.parent().unwrap(), h.engine.home.join("moved")).unwrap();
    fs::create_dir(path.parent().unwrap()).unwrap();
    assert!(matches!(
        files::check_parent(&root, relative, &handle),
        Err(Code::Changed)
    ));
}

#[test]
fn opus_8_unsupported_xattrs_leave_status_readable_and_apply_copy_only() {
    let unsupported = || Err(std::io::Error::from_raw_os_error(libc::ENOTSUP));
    let (receipt, supported) = files::read_receipt(unsupported()).unwrap();
    assert!(receipt.is_none() && !supported);
    let h = Home::new();
    let path = h.file(Tool::Cursor, "{}");
    let root = files::root(&h.engine.home).unwrap();
    let rel = path.strip_prefix(&h.engine.home).unwrap();
    let mut f = FileState::read(&root, rel).unwrap();
    f.xattrs = supported;
    assert!(matches!(
        h.engine
            .plan(&root, rel, Tool::Cursor, Action::Connect, 1, &f),
        Err(Code::NoExtendedAttributes)
    ));
}

#[test]
fn astra_9_mount_identity_covers_home_mounted_images_and_read_only_volumes() {
    let mount = Path::new("/Users/x/mnt/Aphrodite");
    let exe = mount.join("Aphrodite.app/Contents/MacOS/Aphrodite");
    let info=plist::Value::from_reader_xml(br#"<plist version="1.0"><dict><key>images</key><array><dict><key>system-entities</key><array><dict><key>mount-point</key><string>/Users/x/mnt/Aphrodite</string></dict></array></dict></array></dict></plist>"#.as_slice()).unwrap();
    assert_eq!(
        mount_location(&exe, mount, OsStr::new("fixture"), false, Some(&info)),
        Location::DiskImage
    );
    assert_eq!(
        mount_location(
            &exe,
            Path::new("/ReadOnly"),
            OsStr::new("fixture"),
            true,
            None
        ),
        Location::ReadOnly
    );
}

#[test]
fn astra_4_the_receipt_hash_is_the_digest_of_the_written_region_itself() {
    let h = Home::new();
    for tool in WRITTEN {
        let path = h.file(tool, if tool == Tool::Codex { "" } else { "{}" });
        connect(&h.engine, tool, 1);
        let source = fs::read_to_string(&path).unwrap();
        let layout = edit::layout(tool, Some(&source), h.engine.executable()).unwrap();
        let receipt: Receipt = serde_json::from_slice(
            &xattr::get(&path, "studio.aphrodite.mela.mcp-entry")
                .unwrap()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            receipt.entry,
            hash(&source.as_bytes()[layout.entry[0].clone()])
        );
    }
}
#[test]
fn astra_8_removal_keeps_a_new_root_preference_and_removes_the_container_we_added() {
    let h = Home::new();
    for tool in [Tool::Cursor, Tool::ClaudeDesktop] {
        let path = h.file(tool, "{}");
        connect(&h.engine, tool, 1);
        let installed = fs::read_to_string(&path).unwrap();
        fs::write(
            &path,
            format!(
                r#"{},"theme":"blue"}}"#,
                installed.strip_suffix('}').unwrap()
            ),
        )
        .unwrap();
        remove(&h.engine, tool, false).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"theme":"blue"}"#);
    }
}
#[test]
fn astra_9_a_directory_name_alone_does_not_establish_translocation() {
    let h = Home::new();
    let dir = h.engine.home.join("AppTranslocation/X.app/Contents/MacOS");
    fs::create_dir_all(&dir).unwrap();
    let exe = dir.join("fixture");
    fs::write(&exe, "fixture").unwrap();
    assert_ne!(location(&exe), Location::Translocated);
}

#[test]
fn astra_7_valid_toml_outside_the_splicers_grammar_offers_copy_in_ipc() {
    let h = Home::new();
    let source = "mcp_servers = { other.command='x',\n aphrodite.command='old', }";
    h.file(Tool::Codex, source);
    let proposal = h
        .engine
        .proposal(
            Tool::Codex,
            h.engine.preview(Tool::Codex, Action::Connect, 1),
        )
        .unwrap();
    let copy = serde_json::to_value(proposal).unwrap();
    assert_eq!(copy["code"], "unsupported_layout");
    assert_eq!(copy["snippet"], h.engine.snippet(Tool::Codex));
}

#[test]
fn astra_2_a_second_editor_save_remains_at_the_live_name_during_conflict_recovery() {
    use std::cell::Cell;
    let h = Home::new();
    let dir = files::root(&h.engine.home).unwrap();
    let name = Path::new("local.json");
    dir.write(name, "first").unwrap();
    let original = FileState::read(&dir, name).unwrap();
    let staged = original.temp(&dir, "connected", None).unwrap();
    let checked = Cell::new(false);
    let result = staged.publish_checked(name.as_os_str(), &original, false, || {
        if !checked.replace(true) {
            return Ok(());
        }
        dir.write("editor", "latest").unwrap();
        dir.rename("editor", &dir, name).unwrap();
        Err(Code::Changed)
    });
    assert!(matches!(result, Err(Code::Changed)));
    assert_eq!(dir.read(name).unwrap(), b"latest");
}

#[test]
fn astra_5_the_private_backup_drops_directory_inheritance_before_copying_content() {
    let h = Home::new();
    let path = h.file(Tool::Cursor, "{}");
    assert!(std::process::Command::new("/bin/chmod")
        .args(["+a", "everyone allow read,file_inherit"])
        .arg(path.parent().unwrap())
        .status()
        .unwrap()
        .success());
    let backup = connect(&h.engine, Tool::Cursor, 1).backup.unwrap();
    let result = std::process::Command::new("/bin/ls")
        .arg("-le")
        .arg(&backup)
        .output()
        .unwrap();
    assert_eq!(String::from_utf8(result.stdout).unwrap().lines().count(), 1);
    assert_eq!(fs::read_to_string(backup).unwrap(), "{}");
}

#[test]
fn astra_9_the_image_device_identifies_a_mount_reached_through_an_alias() {
    let info=plist::Value::from_reader_xml(br#"<plist version="1.0"><dict><key>images</key><array><dict><key>system-entities</key><array><dict><key>dev-entry</key><string>/dev/disk91s2</string><key>mount-point</key><string>/Users/x/mnt/image</string></dict></array></dict></array></dict></plist>"#.as_slice()).unwrap();
    assert!(mounted_image(
        Path::new("/System/Volumes/Data/Users/x/mnt/image"),
        OsStr::new("/dev/disk91s2"),
        &info
    ));
}
