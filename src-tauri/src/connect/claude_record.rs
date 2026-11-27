//! Aphrodite's own per-profile state. Readers see either generation of an atomic rename.
use super::{cli_process::controlled, files, hash, Code, Engine, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
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

fn record_path(e: &Engine) -> Result<PathBuf> {
    let dir = e.claude_config_dir.as_ref().unwrap_or(&e.home);
    let mut ancestor = dir.as_path();
    let base = loop {
        match ancestor.canonicalize() {
            Ok(base) => break base,
            Err(err) if err.kind() == io::ErrorKind::NotFound => {
                ancestor = ancestor.parent().ok_or(Code::InvalidPath)?;
            }
            Err(_) => return Err(Code::InvalidPath),
        }
    };
    let mut profile = base;
    for part in dir
        .strip_prefix(ancestor)
        .map_err(|_| Code::InvalidPath)?
        .components()
    {
        match part {
            std::path::Component::Normal(name) => profile.push(name),
            std::path::Component::ParentDir => {
                profile.pop();
            }
            _ => (),
        }
    }
    let key = hash(profile.join(".claude.json").as_os_str().as_encoded_bytes());
    Ok(e.app_data
        .join("connect")
        .join(format!("claude-{key}.json")))
}

fn private_file(meta: &fs::Metadata) -> bool {
    meta.is_file()
        && meta.nlink() == 1
        && meta.uid() == unsafe { libc::geteuid() }
        && meta.mode() & 0o777 == 0o600
}

fn open_lock(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    if !path.try_exists().map_err(|_| Code::Io)? {
        match options.clone().create_new(true).open(path) {
            Ok(file) => {
                files::make_private(&file)?;
                return Ok(file);
            }
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err(Code::Io),
        }
    }
    let before = fs::symlink_metadata(path).map_err(|_| Code::Io)?;
    if !private_file(&before) || !controlled(path) {
        return Err(Code::InvalidPath);
    }
    let file = options.open(path).map_err(|_| Code::Io)?;
    let after = file.metadata().map_err(|_| Code::Io)?;
    if !private_file(&after) || (after.dev(), after.ino()) != (before.dev(), before.ino()) {
        return Err(Code::Changed);
    }
    Ok(file)
}

pub(super) struct Store {
    path: PathBuf,
    lock: File,
}
impl Store {
    pub fn lock(e: &Engine) -> Result<Self> {
        let path = record_path(e)?;
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
        let lock = open_lock(&path.with_extension("lock"))?;
        let deadline = Instant::now() + Duration::from_millis(750);
        loop {
            match fs2::FileExt::try_lock_exclusive(&lock) {
                Ok(()) => return Ok(Self { path, lock }),
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        return Err(Code::CliBusy);
                    }
                    thread::sleep(Duration::from_millis(10));
                }
                Err(_) => return Err(Code::Io),
            }
        }
    }
    fn read_path(path: &Path) -> Result<Record> {
        let before = match fs::symlink_metadata(path) {
            Ok(m) => m,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Record::default()),
            Err(_) => return Err(Code::Io),
        };
        if !controlled(path) || !private_file(&before) {
            return Err(Code::InvalidPath);
        }
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| Code::Io)?;
        let after = file.metadata().map_err(|_| Code::Io)?;
        if !private_file(&after) || (before.dev(), before.ino()) != (after.dev(), after.ino()) {
            return Err(Code::Changed);
        }
        let value: Record =
            serde_json::from_reader(file.take(64 * 1024)).map_err(|_| Code::RecordFailed)?;
        if !value.valid() {
            return Err(Code::RecordFailed);
        }
        Ok(value)
    }
    pub fn peek(e: &Engine) -> Result<Record> {
        Self::read_path(&record_path(e)?)
    }
    pub fn read(&self) -> Result<Record> {
        let mut record = Self::read_path(&self.path)?;
        if self.lock.metadata().map_err(|_| Code::RecordFailed)?.len() != 0 {
            record.registered = None;
        }
        Ok(record)
    }
    // The lock inode survives receipt replacement, including when the directory is
    // read-only. A nonempty lock suspends the old ownership claim across restarts.
    pub fn revoke(&self, revoked: bool) -> Result<()> {
        let len = u64::from(revoked);
        if self.lock.metadata().map_err(|_| Code::RecordFailed)?.len() != len {
            self.lock
                .set_len(len)
                .and_then(|()| self.lock.sync_all())
                .map_err(|_| Code::RecordFailed)?;
        }
        Ok(())
    }
    pub fn save(&self, record: &Record) -> Result<()> {
        if Self::read_path(&self.path).as_ref() == Ok(record) {
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
