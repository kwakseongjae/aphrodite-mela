//! Aphrodite's own per-profile state. Readers see either generation of an atomic rename.
use super::{claude_textual_dir, cli_process::controlled, files, hash, Code, Engine, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::unix::fs::{DirBuilderExt, FileExt, MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub(super) struct Record {
    pub registered: Option<String>,
    pub pending: Option<Repoint>,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub(super) struct Repoint {
    pub previous: String,
    pub target: String,
}
impl Record {
    fn valid(&self) -> bool {
        self.registered
            .iter()
            .chain(self.pending.iter().flat_map(|p| [&p.previous, &p.target]))
            .all(|p| Path::new(p).is_absolute() && !p.contains(char::is_control))
    }
}

fn profile_dir(e: &Engine) -> Result<PathBuf> {
    let dir = claude_textual_dir(e.claude_config_dir.as_ref().unwrap_or(&e.home));
    let mut ancestor = dir.as_path();
    let mut profile = loop {
        match ancestor.canonicalize() {
            Ok(base) => break base,
            Err(err) if err.kind() == io::ErrorKind::NotFound => {
                ancestor = ancestor.parent().ok_or(Code::InvalidPath)?;
            }
            Err(_) => return Err(Code::InvalidPath),
        }
    };
    let suffix = dir.strip_prefix(ancestor).map_err(|_| Code::InvalidPath)?;
    profile.extend(suffix.components());
    Ok(profile)
}

fn record_path(app_data: &Path, profile: &Path) -> PathBuf {
    let key = hash(profile.join(".claude.json").as_os_str().as_encoded_bytes());
    app_data.join("connect").join(format!("claude-{key}.json"))
}

fn private_file(meta: &fs::Metadata, owner: u32) -> bool {
    meta.is_file() && meta.nlink() == 1 && meta.uid() == owner && meta.mode() & 0o777 == 0o600
}

fn open_lock(path: &Path, settings: &[PathBuf], owner: u32) -> Result<Option<File>> {
    if fs::symlink_metadata(path).is_err_and(|e| e.kind() == io::ErrorKind::NotFound) {
        match OpenOptions::new()
            .read(true)
            .write(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .create_new(true)
            .open(path)
        {
            Ok(file) => {
                let m = file.metadata().map_err(|_| Code::Io)?;
                files::exclude_settings((m.dev(), m.ino()), settings)?;
                files::make_private(&file)?;
                return Ok(Some(file));
            }
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err(Code::Io),
        }
    }
    open_existing_lock(path, settings, owner)
}

fn open_existing_lock(path: &Path, settings: &[PathBuf], owner: u32) -> Result<Option<File>> {
    let before = fs::symlink_metadata(path).map_err(|_| Code::Io)?;
    if !private_file(&before, owner) || !controlled(path) {
        return Ok(None);
    }
    files::exclude_settings((before.dev(), before.ino()), settings)?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(|_| Code::Io)?;
    let after = file.metadata().map_err(|_| Code::Io)?;
    if !private_file(&after, owner) || (after.dev(), after.ino()) != (before.dev(), before.ino()) {
        return Err(Code::Changed);
    }
    files::exclude_settings((after.dev(), after.ino()), settings)?;
    Ok(Some(file))
}

// Every Store holds a shared lock on the directory while it uses a profile lock.
// Repair takes the directory exclusively so nobody can still be using the old inode.
fn wait_for_lock(
    file: &File,
    deadline: Instant,
    try_lock: fn(&File) -> io::Result<()>,
) -> Result<()> {
    loop {
        match try_lock(file) {
            Ok(()) => return Ok(()),
            Err(err) if err.kind() == io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(Code::CliBusy);
                }
                thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return Err(Code::Io),
        }
    }
}

const REPAIRED: u8 = 1;

fn replace_lock(dir: &Path, path: &Path) -> Result<()> {
    let mut fresh = tempfile::Builder::new()
        .prefix(".damaged-claude-lock-")
        .tempfile_in(dir)
        .map_err(|_| Code::RecordFailed)?;
    files::make_private(fresh.as_file())?;
    // Publish the suspension and the new lock together, even across an interruption.
    fresh
        .write_all(&[REPAIRED])
        .and_then(|()| fresh.as_file().sync_all())
        .map_err(|_| Code::RecordFailed)?;
    use rustix::fs::{renameat_with, RenameFlags, CWD};
    renameat_with(CWD, fresh.path(), CWD, path, RenameFlags::EXCHANGE)
        .map_err(|_| Code::RecordFailed)?;
    fresh.disable_cleanup(true); // Its temporary name now holds the displaced lock.
    File::open(dir)
        .and_then(|f| f.sync_all())
        .map_err(|_| Code::RecordFailed)?;
    // The fresh lock is already in place, so tidying the displaced name is best effort.
    if fs::symlink_metadata(fresh.path()).is_ok_and(|m| m.is_file() || m.is_symlink()) {
        let _ = fs::remove_file(fresh.path());
    }
    Ok(())
}

pub(super) struct Store {
    path: PathBuf,
    lock: File,
    _directory_lock: File,
    pub lock_warning: Option<Code>,
    settings: Vec<PathBuf>,
    pub record_profile: Option<PathBuf>,
}
impl Store {
    pub fn lock(e: &Engine) -> Result<Self> {
        Self::lock_for_user(e, unsafe { libc::geteuid() })
    }
    pub(super) fn lock_for_user(e: &Engine, existing_owner: u32) -> Result<Self> {
        let profile = profile_dir(e)?;
        let path = record_path(&e.app_data, &profile);
        let dir = path.parent().ok_or(Code::InvalidPath)?;
        // Create only below an existing controlled ancestor. Never follow a pre-existing symlink.
        let ancestor = dir
            .ancestors()
            .find(|p| fs::symlink_metadata(p).is_ok())
            .ok_or(Code::Io)?;
        if !controlled(ancestor) {
            return Err(Code::InvalidPath);
        }
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .map_err(|_| Code::Io)?;
        if !controlled(dir) {
            return Err(Code::InvalidPath);
        }
        let settings = e.claude_settings();
        let lock_path = path.with_extension("lock");
        let directory = File::open(dir).map_err(|_| Code::Io)?;
        let deadline = Instant::now() + Duration::from_millis(750);
        use fs2::FileExt as Lock;
        wait_for_lock(&directory, deadline, Lock::try_lock_shared)?;
        let lock = match open_lock(&lock_path, &settings, existing_owner)? {
            Some(file) => file,
            None => {
                Lock::unlock(&directory).map_err(|_| Code::Io)?;
                wait_for_lock(&directory, deadline, Lock::try_lock_exclusive)?;
                if open_existing_lock(&lock_path, &settings, existing_owner)?.is_none() {
                    replace_lock(dir, &lock_path)?;
                }
                // Convert directly. macOS flock can admit another holder during
                // conversion, so reopen the current name under the shared lock.
                wait_for_lock(&directory, deadline, Lock::try_lock_shared)?;
                open_existing_lock(&lock_path, &settings, unsafe { libc::geteuid() })?
                    .ok_or(Code::Changed)?
            }
        };
        wait_for_lock(&lock, deadline, Lock::try_lock_exclusive)?;
        let mut marker = [0];
        lock.read_at(&mut marker, 0)
            .map_err(|_| Code::RecordFailed)?;
        Ok(Self {
            path,
            lock,
            _directory_lock: directory,
            lock_warning: (marker[0] == REPAIRED).then_some(Code::RecordFailed),
            settings,
            record_profile: e.claude_config_dir.as_ref().map(|_| profile),
        })
    }
    fn read_path(path: &Path, settings: &[PathBuf]) -> Result<Record> {
        let before = match fs::symlink_metadata(path) {
            Ok(m) => m,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Record::default()),
            Err(_) => return Err(Code::Io),
        };
        if !controlled(path) || !private_file(&before, unsafe { libc::geteuid() }) {
            return Err(Code::InvalidPath);
        }
        files::exclude_settings((before.dev(), before.ino()), settings)?;
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| Code::Io)?;
        let after = file.metadata().map_err(|_| Code::Io)?;
        if !private_file(&after, unsafe { libc::geteuid() })
            || (before.dev(), before.ino()) != (after.dev(), after.ino())
        {
            return Err(Code::Changed);
        }
        files::exclude_settings((after.dev(), after.ino()), settings)?;
        if after.len() > 64 * 1024 {
            return Err(Code::RecordFailed);
        }
        let value: Record =
            serde_json::from_reader(file.take(64 * 1024)).map_err(|_| Code::RecordFailed)?;
        if !value.valid() {
            return Err(Code::RecordFailed);
        }
        Ok(value)
    }
    pub fn peek(e: &Engine) -> Result<Record> {
        Self::peek_in(e, &e.app_data)
    }
    fn peek_in(e: &Engine, app_data: &Path) -> Result<Record> {
        Self::read_path(
            &record_path(app_data, &profile_dir(e)?),
            &e.claude_settings(),
        )
    }
    // A sibling journal can identify a path for confirmed removal. Only the
    // current installation's locked record participates in the ownership check.
    pub fn other_installation_registered(e: &Engine, command: &str) -> bool {
        let Some(id) = e.app_data.file_name().and_then(|s| s.to_str()) else {
            return false;
        };
        let other_id = match id.strip_suffix(".preview") {
            Some(stable_id) => stable_id.to_owned(),
            None => format!("{id}.preview"),
        };
        Self::peek_in(e, &e.app_data.with_file_name(other_id))
            .is_ok_and(|r| r.registered.as_deref() == Some(command))
    }
    pub fn read(&self) -> Result<(Record, Option<String>)> {
        let mut record = Self::read_path(&self.path, &self.settings)?;
        let suspended = if self.lock.metadata().map_err(|_| Code::RecordFailed)?.len() != 0 {
            record.registered.take()
        } else {
            None
        };
        // A repaired lock can retain the previous path as a hint for confirmed removal.
        Ok((record, self.lock_warning.and(suspended)))
    }
    // The lock inode survives receipt replacement, including when the directory is
    // read-only. A nonempty lock suspends the old ownership claim across restarts.
    pub fn revoke(&self, revoked: bool) -> Result<()> {
        let len = u64::from(revoked);
        let m = self.lock.metadata().map_err(|_| Code::RecordFailed)?;
        if m.len() != len {
            files::exclude_settings((m.dev(), m.ino()), &self.settings)?;
            self.lock
                .set_len(len)
                .and_then(|()| self.lock.sync_all())
                .map_err(|_| Code::RecordFailed)?;
        }
        Ok(())
    }
    pub fn save(&self, record: &Record) -> Result<()> {
        if let Ok(m) = fs::symlink_metadata(&self.path) {
            files::exclude_settings((m.dev(), m.ino()), &self.settings)?;
        }
        if Self::read_path(&self.path, &self.settings).as_ref() == Ok(record) {
            return self.revoke(false);
        }
        let dir = self.path.parent().ok_or(Code::InvalidPath)?;
        if record == &Record::default() {
            match fs::remove_file(&self.path) {
                Ok(()) => (),
                Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
                Err(_) => return Err(Code::RecordFailed),
            }
        } else {
            let mut temp = tempfile::NamedTempFile::new_in(dir).map_err(|_| Code::RecordFailed)?;
            files::make_private(temp.as_file())?;
            serde_json::to_writer(&mut temp, record).map_err(|_| Code::RecordFailed)?;
            temp.flush()
                .and_then(|()| temp.as_file().sync_all())
                .map_err(|_| Code::RecordFailed)?;
            temp.persist(&self.path).map_err(|_| Code::RecordFailed)?;
        }
        File::open(dir)
            .and_then(|f| f.sync_all())
            .map_err(|_| Code::RecordFailed)?;
        self.revoke(false)
    }
}
