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
        assert!(e.status(tool).unwrap().error.is_some());
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
        assert_eq!(fs::read_to_string(file).unwrap(), format!("{source}\n"));
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
        assert_eq!(
            (s.entry_exists, s.points_here, s.owned),
            (Some(true), Some(true), Some(false))
        );
        if tool != Tool::ClaudeCode {
            let p = e.preview(tool, Action::Connect, 1).unwrap();
            assert!(p.replacement_required);
            assert!(matches!(
                e.commit(tool, Action::Connect, &p.fingerprint, false),
                Err(Code::ConfirmationRequired)
            ));
            assert!(matches!(
                e.preview(tool, Action::Remove, 2),
                Err(Code::ForeignEntry)
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
            assert!(e.status(tool).unwrap().error.is_some(), "{tool:?} {text:?}");
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
fn codex_can_restore_a_foreign_server_with_children_separated_by_other_tables() {
    for text in ["[mcp_servers.'aphrodite']\ncommand='old'\n[z]\nother=8\n[mcp_servers.aphrodite.env]\nNAME='v'",
        "mcp_servers.aphrodite.command='old'\nmcp_servers.other.command='other'\nmcp_servers.aphrodite.args=['x']",
        "mcp_servers={aphrodite={command='old'}, other={command='unchanged'}}",
        "[mcp_servers]\naphrodite = {command='old'}\nother={command='keep'}"] {
        let h=Home::new();let e=&h.engine;let tool=Tool::Codex;let f=h.file(tool,text);
        let p=e.preview(tool,Action::Connect,1).unwrap();
        e.commit(tool,Action::Connect,&p.fingerprint,true).unwrap();
        let edited=fs::read_to_string(&f).unwrap();
        assert!(!edited.contains("'old'"));assert!(!edited.contains("NAME='v'"));
        let p=e.preview(tool,Action::Remove,2).unwrap();
        e.commit(tool,Action::Remove,&p.fingerprint,false).unwrap();
        assert_eq!(fs::read_to_string(f).unwrap(),text);
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
        Path::new("/Volumes/Aphrodite/Aphrodite.app/Contents/MacOS/app"),
        &info
    ));
    assert!(!mounted_image(
        Path::new("/Volumes/Aphrodite External/Other.app"),
        &info
    ));
    assert_eq!(
        location(Path::new(
            "/private/tmp/AppTranslocation/abc/d/X.app/Contents/MacOS/app"
        )),
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
    assert!(pending.publish(name.as_os_str(), false).is_err());
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
        assert_eq!(e.status(tool).unwrap().error, Some(Code::InvalidPath));
    }
}

#[test]
fn a_literal_provider_credential_is_never_returned_in_a_preview_or_copied_to_a_backup() {
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
        assert!(e.preview(tool, Action::Connect, 1).is_err());
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }
}
