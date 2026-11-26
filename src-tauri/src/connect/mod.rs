//! Person-facing commands only. The loopback bridge and the MCP command table have no route here.
mod commands;
mod edit;
mod files;
pub use commands::*;
#[cfg(test)]
mod tests;

use cap_std::fs::Dir;
use edit::{Change, Layout};
use files::FileState;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

type Result<T> = std::result::Result<T, Code>;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    InvalidConfig,
    Ambiguous,
    OutsideHome,
    InvalidPath,
    NotWritable,
    Io,
    Changed,
    CopyOnly,
    ConfirmationRequired,
    ForeignEntry,
    NoEntry,
    BackupExists,
    BackupChanged,
    MoveToApplications,
    SidecarMissing,
    UnknownLocation,
    WorkerFailed,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tool {
    ClaudeCode,
    Codex,
    Cursor,
    ClaudeDesktop,
}
const TOOLS: [Tool; 4] = [
    Tool::ClaudeCode,
    Tool::Codex,
    Tool::Cursor,
    Tool::ClaudeDesktop,
];
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Connect,
    Remove,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Location {
    Installed,
    Development,
    DiskImage,
    Translocated,
    Unknown,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    tool: Tool,
    installed: bool,
    path: PathBuf,
    executable: PathBuf,
    location: Location,
    copy_only: bool,
    entry_exists: Option<bool>,
    points_here: Option<bool>,
    owned: Option<bool>,
    error: Option<Code>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    tool: Tool,
    action: Action,
    path: PathBuf,
    target: PathBuf,
    changes: Vec<Change>,
    backup: Option<PathBuf>,
    deletes_file: bool,
    replacement_required: bool,
    fingerprint: String,
}
impl Preview {
    fn edited(&self, source: &str) -> Result<String> {
        edit::edited(source, &self.changes)
    }
}

fn hash(bytes: impl AsRef<[u8]>) -> String {
    format!("{:x}", Sha256::digest(bytes.as_ref()))
}
fn entry_hash(layout: &Layout, source: &str) -> String {
    hash(
        serde_json::to_vec(
            &layout
                .entry
                .iter()
                .map(|r| &source[r.clone()])
                .collect::<Vec<_>>(),
        )
        .unwrap(),
    )
}

// This receipt is an extended attribute of the new inode. The config and the proof we wrote it
// become visible in the same rename. The only copy of replaced text is the person's adjacent backup.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Receipt {
    tool: Tool,
    path: PathBuf,
    exe: String,
    stamp: u128,
    original: Option<String>,
    connected: String,
    entry: String,
}

struct Engine {
    home: PathBuf,
    exe: PathBuf,
    location: Location,
    codex_home: PathBuf,
    claude_file: PathBuf,
    cli_dirs: Vec<PathBuf>,
    app_dirs: Vec<PathBuf>,
}
impl Engine {
    fn new(home: PathBuf, exe: PathBuf) -> Self {
        Self {
            codex_home: home.join(".codex"),
            claude_file: home.join(".claude.json"),
            home,
            exe,
            location: Location::Installed,
            cli_dirs: vec![],
            app_dirs: vec![],
        }
    }
    fn path(&self, tool: Tool) -> PathBuf {
        match tool {
            Tool::ClaudeCode => self.claude_file.clone(),
            Tool::Codex => self.codex_home.join("config.toml"),
            Tool::Cursor => self.home.join(".cursor/mcp.json"),
            Tool::ClaudeDesktop => self
                .home
                .join("Library/Application Support/Claude/claude_desktop_config.json"),
        }
    }
    fn executable(&self) -> &str {
        self.exe.to_str().unwrap_or("")
    }
    fn snippet(&self, tool: Tool) -> String {
        let exe = self.executable();
        match tool {
            Tool::ClaudeCode => format!(
                "claude mcp add --transport stdio --scope user aphrodite -- '{}'",
                exe.replace('\'', "'\"'\"'")
            ),
            Tool::Codex => edit::toml_entry(exe, "\n"),
            _ => format!(
                r#"{{"mcpServers":{{"aphrodite":{}}}}}"#,
                edit::json_entry(tool, exe)
            ),
        }
    }
    fn installed(&self, tool: Tool) -> bool {
        let (cli, app) = match tool {
            Tool::ClaudeCode => (Some("claude"), None),
            Tool::Codex => (Some("codex"), Some("Codex.app")),
            Tool::Cursor => (Some("cursor"), Some("Cursor.app")),
            Tool::ClaudeDesktop => (None, Some("Claude.app")),
        };
        cli.is_some_and(|c| {
            self.cli_dirs
                .iter()
                .any(|p| std::fs::symlink_metadata(p.join(c)).is_ok())
        }) || app.is_some_and(|a| {
            self.app_dirs
                .iter()
                .any(|p| std::fs::symlink_metadata(p.join(a)).is_ok())
        })
    }
    fn owner<'a>(
        &self,
        tool: Tool,
        path: &Path,
        f: &'a FileState,
        layout: &Layout,
    ) -> Option<&'a Receipt> {
        let receipt = f.receipt.as_ref()?;
        let source = f.text.as_deref()?;
        (receipt.tool == tool
            && receipt.path == path
            && !layout.entry.is_empty()
            && receipt.entry == entry_hash(layout, source))
        .then_some(receipt)
    }
    fn status(&self, tool: Tool) -> Result<Status> {
        let path = self.path(tool);
        let mut out = Status {
            tool,
            installed: self.installed(tool),
            path: path.clone(),
            executable: self.exe.clone(),
            location: self.location,
            copy_only: tool == Tool::ClaudeCode,
            entry_exists: None,
            points_here: None,
            owned: None,
            error: None,
        };
        let inspect = || -> Result<(bool, bool, bool, bool)> {
            let root = files::root(&self.home)?;
            let relative = files::resolve(&root, &self.home, &path)?;
            let f = FileState::read(&root, &relative)?;
            let layout = edit::layout(tool, f.text.as_deref(), self.executable())?;
            Ok((
                f.text.is_some(),
                !layout.entry.is_empty(),
                layout.command.as_deref() == Some(self.executable()),
                self.owner(tool, &relative, &f, &layout).is_some(),
            ))
        };
        match inspect() {
            Ok((seen, exists, points, owned)) => {
                out.installed |= seen;
                out.entry_exists = Some(exists);
                out.points_here = Some(points);
                out.owned = Some(owned);
            }
            Err(code) => out.error = Some(code),
        }
        Ok(out)
    }
    fn validate(&self, tool: Tool) -> Result<()> {
        if matches!(self.location, Location::Translocated | Location::DiskImage) {
            return Err(Code::MoveToApplications);
        }
        if self.location == Location::Unknown {
            return Err(Code::UnknownLocation);
        }
        if tool == Tool::ClaudeCode {
            return Err(Code::CopyOnly);
        }
        Ok(())
    }
    fn plan(
        &self,
        root: &Dir,
        relative: &Path,
        tool: Tool,
        action: Action,
        stamp: u128,
        f: &FileState,
    ) -> Result<Preview> {
        self.validate(tool)?;
        f.writable(root, relative)?;
        let source = f.text.as_deref().unwrap_or("");
        let layout = edit::layout(tool, f.text.as_deref(), self.executable())?;
        let owner = self.owner(tool, relative, f, &layout);
        let foreign = !layout.entry.is_empty() && owner.is_none();
        let (changes, deletes_file) = match action {
            Action::Connect
                if owner.is_some() && layout.command.as_deref() == Some(self.executable()) =>
            {
                (vec![], false)
            }
            Action::Connect => (layout.connect, false),
            Action::Remove => {
                if layout.entry.is_empty() {
                    return Err(Code::NoEntry);
                }
                self.undo(
                    root,
                    relative,
                    tool,
                    source,
                    layout,
                    owner.ok_or(Code::ForeignEntry)?,
                )?
            }
        };
        let target = self.home.join(relative);
        let backup = if f.text.is_some() && !changes.is_empty() {
            Some(target.with_file_name(files::backup_name(relative, stamp)?))
        } else {
            None
        };
        let digest = hash(
            serde_json::to_vec(&(
                tool,
                action,
                self.executable(),
                relative,
                f.text.is_some(),
                hash(source),
                f.revision,
                f.mode,
                &f.receipt,
                &changes,
                stamp,
            ))
            .unwrap(),
        );
        let preview = Preview {
            tool,
            action,
            path: self.path(tool),
            target,
            changes,
            deletes_file,
            replacement_required: foreign,
            backup,
            fingerprint: format!("{stamp}-{digest}"),
        };
        if !deletes_file && !preview.changes.is_empty() {
            let candidate = preview.edited(source)?;
            let after = edit::layout(tool, Some(&candidate), self.executable())?;
            if action == Action::Connect && after.command.as_deref() != Some(self.executable()) {
                return Err(Code::InvalidConfig);
            }
        }
        Ok(preview)
    }
    fn undo(
        &self,
        root: &Dir,
        relative: &Path,
        tool: Tool,
        source: &str,
        layout: Layout,
        r: &Receipt,
    ) -> Result<(Vec<Change>, bool)> {
        let original = if let Some(digest) = &r.original {
            let b = relative.with_file_name(files::backup_name(relative, r.stamp)?);
            let old = FileState::read(root, &b)?.text.ok_or(Code::BackupChanged)?;
            if hash(&old) != *digest {
                return Err(Code::BackupChanged);
            }
            Some(old)
        } else {
            None
        };
        let old = original.as_deref().unwrap_or("");
        let previous = edit::layout(tool, original.as_deref(), &r.exe)?;
        let installed = edit::edited(old, &previous.connect)?;
        if hash(&installed) != r.connected {
            return Err(Code::BackupChanged);
        }
        let exact = installed == source;
        // Find the old edit relative to the parsed entry even if somebody edited a neighboring key.
        let old_layout = edit::layout(tool, Some(&installed), &r.exe)?;
        let shift = layout.entry[0].start as i128 - old_layout.entry[0].start as i128;
        let mut delta = 0i128;
        let mut inverse = vec![];
        for c in &previous.connect {
            let pos = c.start as i128 + delta + shift;
            let start = usize::try_from(pos).ok();
            if !exact
                && (previous.connect.len() != 1
                    || !start
                        .and_then(|at| source.get(at..))
                        .is_some_and(|s| s.starts_with(&c.after)))
            {
                // The container we inserted now holds another server. Take just our property out.
                if previous.entry.is_empty() {
                    return Ok((layout.remove, false));
                }
                return Err(Code::Changed);
            }
            inverse.push(Change {
                start: start.ok_or(Code::Changed)?,
                before: c.after.clone(),
                after: c.before.clone(),
            });
            delta += c.after.len() as i128 - c.before.len() as i128;
        }
        if !exact && previous.entry.is_empty() {
            // Another edit may have supplied a new comma, or added content around our former
            // whole-file insertion. A structurally invalid inverse is never written.
            let candidate = edit::edited(source, &inverse)?;
            if edit::layout(tool, Some(&candidate), &r.exe).is_err() {
                return Ok((layout.remove, false));
            }
        }
        Ok((inverse, exact && original.is_none()))
    }
    fn preview(&self, tool: Tool, action: Action, stamp: u128) -> Result<Preview> {
        self.validate(tool)?;
        let root = files::root(&self.home)?;
        let rel = files::resolve(&root, &self.home, &self.path(tool))?;
        self.plan(
            &root,
            &rel,
            tool,
            action,
            stamp,
            &FileState::read(&root, &rel)?,
        )
    }
    fn commit(
        &self,
        tool: Tool,
        action: Action,
        fingerprint: &str,
        confirm: bool,
    ) -> Result<Preview> {
        self.validate(tool)?;
        let stamp = fingerprint
            .split_once('-')
            .and_then(|(t, _)| t.parse().ok())
            .ok_or(Code::Changed)?;
        let root = files::root(&self.home)?;
        // All Aphrodite processes lock the same inode, including for a not-yet-created config.
        // No lockfile or configuration directory is created by a stale preview.
        let lock = root.try_clone().map_err(|_| Code::Io)?.into_std_file();
        lock.lock_exclusive().map_err(|_| Code::Io)?;
        let path = self.path(tool);
        let rel = files::resolve(&root, &self.home, &path)?;
        let file = FileState::read(&root, &rel)?;
        let preview = self.plan(&root, &rel, tool, action, stamp, &file)?;
        if preview.fingerprint != fingerprint {
            return Err(Code::Changed);
        }
        if preview.replacement_required && !confirm {
            return Err(Code::ConfirmationRequired);
        }
        if preview.changes.is_empty() {
            return Ok(preview);
        }
        let source = file.text.as_deref().unwrap_or("");
        let candidate = preview.edited(source)?;
        let receipt = if action == Action::Connect {
            let layout = edit::layout(tool, Some(&candidate), self.executable())?;
            Some(Receipt {
                tool,
                path: rel.clone(),
                exe: self.executable().into(),
                stamp,
                original: file.text.as_ref().map(hash),
                connected: hash(&candidate),
                entry: entry_hash(&layout, &candidate),
            })
        } else {
            None
        };
        let dir = files::parent(&root, &rel)?;
        let name = rel.file_name().ok_or(Code::InvalidPath)?;
        let temp = if preview.deletes_file {
            None
        } else {
            Some(file.temp(&dir, &candidate, receipt.as_ref())?)
        };
        let unchanged = || -> Result<()> {
            if rel != files::resolve(&root, &self.home, &path)? {
                return Err(Code::Changed);
            }
            let now = FileState::read(&dir, Path::new(name))?;
            if now.revision != file.revision
                || now.mode != file.mode
                || now.text != file.text
                || serde_json::to_vec(&now.receipt).unwrap()
                    != serde_json::to_vec(&file.receipt).unwrap()
            {
                return Err(Code::Changed);
            }
            Ok(())
        };
        unchanged()?;
        let backup = preview.backup.as_ref().and_then(|p| p.file_name());
        if let Some(name) = backup {
            files::backup(&dir, name, source)?;
        }
        let result = unchanged().and_then(|()| {
            if let Some(temp) = temp {
                temp.replace(name)
            } else {
                dir.remove_file(name)
            }
            .map_err(|_| Code::Io)
        });
        if let Err(code) = result {
            if let Some(name) = backup {
                let _ = dir.remove_file(name);
            }
            return Err(code);
        }
        Ok(preview)
    }
}

fn mounted_image(exe: &Path, info: &plist::Value) -> bool {
    info.as_dictionary()
        .and_then(|d| d.get("images"))
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .filter_map(|i| i.as_dictionary()?.get("system-entities")?.as_array())
        .flatten()
        .filter_map(|e| e.as_dictionary()?.get("mount-point")?.as_string())
        .any(|mount| exe.starts_with(mount))
}
fn location(exe: &Path) -> Location {
    if exe
        .components()
        .any(|c| c.as_os_str() == OsStr::new("AppTranslocation"))
    {
        return Location::Translocated;
    }
    if exe.starts_with("/Volumes") {
        let info = std::process::Command::new("/usr/bin/hdiutil")
            .args(["info", "-plist"])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| plist::Value::from_reader(std::io::Cursor::new(o.stdout)).ok());
        match info {
            Some(v) if mounted_image(exe, &v) => return Location::DiskImage,
            None => return Location::Unknown,
            _ => (),
        }
    }
    if exe.parent().is_some_and(|p| p.ends_with("Contents/MacOS")) {
        Location::Installed
    } else {
        Location::Development
    }
}
