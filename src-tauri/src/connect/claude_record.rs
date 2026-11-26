//! Aphrodite's own per-profile state. Readers see either generation of an atomic rename.
use super::{cli_process::controlled, files, hash, Code, Engine, Result, Tool};
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
#[serde(deny_unknown_fields)]
pub(super) struct Record {
    pub registered: Option<String>,
}
impl Record {
    fn valid(&self) -> bool {
        self.registered
            .iter()
            .all(|p| Path::new(p).is_absolute() && !p.contains(char::is_control))
    }
}

fn record_path(e: &Engine) -> PathBuf {
    let key = hash(e.path(Tool::ClaudeCode).as_os_str().as_encoded_bytes());
    e.app_data
        .join("connect")
        .join(format!("claude-{key}.json"))
}

fn private_file(meta: &fs::Metadata) -> bool {
    meta.is_file()
        && meta.nlink() == 1
        && meta.uid() == unsafe { libc::geteuid() }
        && meta.mode() & 0o777 == 0o600
}

pub(super) struct Store {
    path: PathBuf,
    _lock: File,
}
impl Store {
    pub fn lock(e: &Engine) -> Result<Self> {
        let path = record_path(e);
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
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path.with_extension("lock"))
            .map_err(|_| Code::Io)?;
        if !private_file(&lock.metadata().map_err(|_| Code::Io)?) {
            return Err(Code::InvalidPath);
        }
        let deadline = Instant::now() + Duration::from_millis(750);
        loop {
            match fs2::FileExt::try_lock_exclusive(&lock) {
                Ok(()) => return Ok(Self { path, _lock: lock }),
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
    pub fn read(&self) -> Result<Record> {
        Self::read_path(&self.path)
    }
    pub fn save(&self, record: &Record) -> Result<()> {
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
            .map_err(|_| Code::RecordFailed)
    }
}
