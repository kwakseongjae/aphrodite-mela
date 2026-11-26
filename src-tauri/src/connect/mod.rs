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
    UnsupportedLayout,
    DirectoryMissing,
    NoExtendedAttributes,
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
    ReadOnly,
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
    config_exists: Option<bool>,
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
    #[serde(skip)]
    changes: Vec<Change>,
    text: String,
    line: usize,
    creates_file: bool,
    backup: Option<PathBuf>,
    deletes_file: bool,
    replacement_required: bool,
    confirmation_required: bool,
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
fn entry_hash(layout: &Layout, source: &str) -> Option<String> {
    let [range] = layout.entry.as_slice() else {
        return None;
    };
    Some(hash(source.get(range.clone())?.as_bytes()))
}

// This receipt is an extended attribute of the new inode. The config and the proof we wrote it
// become visible in the same rename. The only copy of replaced text is the person's adjacent backup.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct Receipt {
    tool: Tool,
    path: PathBuf,
    exe: String,
    stamp: u128,
    original: Option<String>,
    // Delimiters and whitespace inserted around a newly created entry.
    // A replacement of an existing definition has no wrapper.
    wrapper: Option<(String, String)>,
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
            && Some(&receipt.entry) == entry_hash(layout, source).as_ref())
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
            config_exists: None,
            entry_exists: None,
            points_here: None,
            owned: None,
            error: None,
        };
        if tool == Tool::ClaudeCode {
            return Ok(out);
        }
        let inspect = || -> Result<(bool, bool, bool, bool)> {
            let root = files::root(&self.home)?;
            let relative = files::resolve(&root, &self.home, &path)?;
            files::parent(&root, &relative)?;
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
                out.config_exists = Some(seen);
                out.entry_exists = Some(exists);
                out.points_here = Some(points);
                out.owned = Some(owned);
            }
            Err(Code::DirectoryMissing) => {
                out.installed = false;
                out.config_exists = Some(false);
                out.entry_exists = Some(false);
                out.points_here = Some(false);
                out.owned = Some(false);
            }
            Err(code) => out.error = Some(code),
        }
        Ok(out)
    }
    fn validate(&self, tool: Tool) -> Result<()> {
        if matches!(
            self.location,
            Location::Translocated | Location::DiskImage | Location::ReadOnly
        ) {
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
        let history = files::history(root, relative)?;
        let prior = owner.or(history.as_ref());
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
                if foreign && layout.command.as_deref() != Some(self.executable()) {
                    return Err(Code::ForeignEntry);
                }
                self.undo(tool, source, layout, prior, foreign)?
            }
        };
        let target = self.home.join(relative);
        let backup = if action == Action::Connect
            && prior.is_none()
            && f.text.is_some()
            && !changes.is_empty()
        {
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
                &f.protection,
                files::identity(&files::parent(root, relative)?)?,
                &f.receipt,
                &history,
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
            text: changes.iter().map(|c| c.after.as_str()).collect(),
            line: 1 + source[..changes
                .iter()
                .find(|c| !c.after.is_empty())
                .or(changes.first())
                .map_or(0, |c| c.start)]
                .bytes()
                .filter(|&b| b == b'\n')
                .count(),
            creates_file: f.text.is_none(),
            changes,
            deletes_file,
            replacement_required: foreign && action == Action::Connect,
            confirmation_required: foreign,
            backup,
            fingerprint: format!("{stamp}-{digest}"),
        };
        if !deletes_file && !preview.changes.is_empty() {
            let candidate = preview.edited(source)?;
            let after = edit::layout(tool, Some(&candidate), self.executable())?;
            if (action == Action::Connect && after.command.as_deref() != Some(self.executable()))
                || (action == Action::Remove && !after.entry.is_empty())
            {
                return Err(Code::InvalidConfig);
            }
        }
        Ok(preview)
    }
    fn undo(
        &self,
        tool: Tool,
        source: &str,
        layout: Layout,
        prior: Option<&Receipt>,
        foreign: bool,
    ) -> Result<(Vec<Change>, bool)> {
        if let Some(r) = prior.filter(|r| Some(&r.entry) == entry_hash(&layout, source).as_ref()) {
            if let (Some((prefix, suffix)), [entry]) = (&r.wrapper, layout.entry.as_slice()) {
                if source[..entry.start].ends_with(prefix)
                    && source[entry.end..].starts_with(suffix)
                {
                    let change = Change::at(
                        source,
                        entry.start - prefix.len()..entry.end + suffix.len(),
                        String::new(),
                    );
                    let result = edit::edited(source, std::slice::from_ref(&change))?;
                    let original = r
                        .original
                        .as_ref()
                        .map_or(result.is_empty(), |h| *h == hash(&result));
                    let deletes = original && r.original.is_none();
                    if (!foreign || original)
                        && (deletes || edit::layout(tool, Some(&result), self.executable()).is_ok())
                    {
                        return Ok((vec![change], deletes));
                    }
                }
                if !foreign && prefix.ends_with("\"mcpServers\":{") {
                    if let Some(changes) = layout.remove_container {
                        return Ok((changes, false));
                    }
                }
            }
        }
        Ok((layout.remove, false))
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
        if preview.confirmation_required && !confirm {
            return Err(Code::ConfirmationRequired);
        }
        if preview.changes.is_empty() {
            return Ok(preview);
        }
        let source = file.text.as_deref().unwrap_or("");
        let candidate = preview.edited(source)?;
        let history = files::history(&root, &rel)?;
        let before = edit::layout(tool, file.text.as_deref(), self.executable())?;
        let owned = self.owner(tool, &rel, &file, &before);
        let prior = owned.or(history.as_ref());
        let receipt = if action == Action::Connect {
            let layout = edit::layout(tool, Some(&candidate), self.executable())?;
            let wrapper = if before.entry.is_empty() {
                let c = &preview.changes[0];
                let entry = &layout.entry[0];
                Some((
                    candidate[c.start..entry.start].into(),
                    candidate[entry.end..c.start + c.after.len()].into(),
                ))
            } else {
                prior
                    .filter(|r| Some(&r.entry) == entry_hash(&before, source).as_ref())
                    .and_then(|r| r.wrapper.clone())
            };
            Some(Receipt {
                tool,
                path: rel.clone(),
                exe: self.executable().into(),
                stamp: prior.map_or(stamp, |r| r.stamp),
                original: prior
                    .map_or_else(|| file.text.as_ref().map(hash), |r| r.original.clone()),
                wrapper,
                entry: entry_hash(&layout, &candidate).ok_or(Code::UnsupportedLayout)?,
            })
        } else {
            None
        };
        let dir = files::parent(&root, &rel)?;
        let name = rel.file_name().ok_or(Code::InvalidPath)?;
        let reachable = || {
            if rel != files::resolve(&root, &self.home, &path)? {
                return Err(Code::Changed);
            }
            files::check_parent(&root, &rel, &dir)
        };
        reachable()?;
        let temp = file.temp(&dir, &candidate, receipt.as_ref())?;
        let unchanged = || -> Result<()> {
            reachable()?;
            let now = FileState::read(&dir, Path::new(name))?;
            if now.protection != file.protection
                || now.revision != file.revision
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
            if let Some(r) = &receipt {
                files::set_history(&dir, name, Some(r))?;
            }

            temp.publish_checked(name, &file, preview.deletes_file, reachable)
        });
        if let Err(code) = result {
            if receipt.is_some() {
                files::set_history(&dir, name, history.as_ref())?;
            }
            if let Some(name) = backup {
                let _ = dir.remove_file(name);
            }
            return Err(code);
        }
        if action == Action::Remove {
            if let Some(r) = prior.filter(|r| {
                r.original
                    .as_ref()
                    .map_or(preview.deletes_file, |h| *h == hash(&candidate))
            }) {
                if r.original.is_some() {
                    let backup = files::backup_name(&rel, r.stamp)?;
                    match dir.remove_file(backup) {
                        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(Code::Io),
                        _ => (),
                    }
                }
                files::set_history(&dir, name, None)?;
            }
        }
        Ok(preview)
    }
}

fn mounted_image(volume: &Path, info: &plist::Value) -> bool {
    info.as_dictionary()
        .and_then(|d| d.get("images"))
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .filter_map(|i| i.as_dictionary()?.get("system-entities")?.as_array())
        .flatten()
        .filter_map(|e| e.as_dictionary()?.get("mount-point")?.as_string())
        .any(|mount| volume == Path::new(mount))
}
fn mount_location(
    exe: &Path,
    mount: &Path,
    read_only: bool,
    info: Option<&plist::Value>,
) -> Location {
    if mount
        .components()
        .any(|c| c.as_os_str() == OsStr::new("AppTranslocation"))
    {
        return Location::Translocated;
    }
    if read_only {
        return Location::ReadOnly;
    }
    let Some(info) = info else {
        return Location::Unknown;
    };
    if mounted_image(mount, info) {
        return Location::DiskImage;
    }
    if exe.parent().is_some_and(|p| p.ends_with("Contents/MacOS")) {
        Location::Installed
    } else {
        Location::Development
    }
}
fn location(exe: &Path) -> Location {
    use std::{
        ffi::CStr,
        os::{fd::AsRawFd, unix::ffi::OsStrExt},
    };
    let Ok(file) = std::fs::File::open(exe) else {
        return Location::Unknown;
    };
    let mut stat = std::mem::MaybeUninit::uninit();
    if unsafe { libc::fstatfs(file.as_raw_fd(), stat.as_mut_ptr()) } != 0 {
        return Location::Unknown;
    }
    let stat = unsafe { stat.assume_init() };
    let mount = Path::new(OsStr::from_bytes(
        unsafe { CStr::from_ptr(stat.f_mntonname.as_ptr()) }.to_bytes(),
    ));
    let info = std::process::Command::new("/usr/bin/hdiutil")
        .env_clear()
        .args(["info", "-plist"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| plist::Value::from_reader(std::io::Cursor::new(o.stdout)).ok());
    mount_location(
        exe,
        mount,
        stat.f_flags & libc::MNT_RDONLY as u32 != 0,
        info.as_ref(),
    )
}
