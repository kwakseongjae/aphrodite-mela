//! All config and backup operations are relative to a directory handle rooted in the person's home.
use super::{Code, Receipt, Result};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions, OpenOptionsExt},
};
use std::{
    ffi::{OsStr, OsString},
    fs::File,
    io::{self, Read, Write},
    os::fd::AsRawFd,
    os::{macos::fs::MetadataExt as MacMetadataExt, unix::fs::MetadataExt},
    path::{Component, Path, PathBuf},
};
use xattr::FileExt;

const RECEIPT: &str = "studio.aphrodite.mela.mcp-entry";
fn io_code(e: io::Error) -> Code {
    if e.raw_os_error() == Some(libc::ENOTSUP) {
        return Code::NoExtendedAttributes;
    }
    match e.kind() {
        io::ErrorKind::PermissionDenied => Code::NotWritable,
        io::ErrorKind::AlreadyExists => Code::BackupExists,
        _ => Code::Io,
    }
}
pub fn root(home: &Path) -> Result<Dir> {
    Dir::open_ambient_dir(home, ambient_authority()).map_err(io_code)
}

// Accept absolute symlinks inside home, too. cap-std independently confines the eventual open/rename
// if another process exchanges a directory during this walk.
pub fn resolve(root: &Dir, home: &Path, path: &Path) -> Result<PathBuf> {
    let mut todo = path
        .strip_prefix(home)
        .map_err(|_| Code::OutsideHome)?
        .to_owned();
    'links: for _ in 0..40 {
        let mut resolved = PathBuf::new();
        let mut parts = todo.components();
        while let Some(part) = parts.next() {
            match part {
                Component::Normal(s) => resolved.push(s),
                Component::CurDir => continue,
                Component::ParentDir => {
                    if !resolved.pop() {
                        return Err(Code::OutsideHome);
                    }
                    continue;
                }
                _ => return Err(Code::OutsideHome),
            }
            match root.symlink_metadata(&resolved) {
                Ok(m) if m.is_symlink() => {
                    let dest = root.read_link_contents(&resolved).map_err(io_code)?;
                    resolved.pop();
                    if dest.is_absolute() {
                        resolved = dest
                            .strip_prefix(home)
                            .map_err(|_| Code::OutsideHome)?
                            .to_owned();
                    } else {
                        resolved.push(dest);
                    }
                    resolved.push(parts.as_path());
                    todo = resolved;
                    continue 'links;
                }
                Ok(_) => (),
                Err(e) if e.kind() == io::ErrorKind::NotFound => (),
                Err(e) => return Err(io_code(e)),
            }
        }
        if resolved.file_name().is_none() {
            return Err(Code::InvalidPath);
        }
        // Neither client's auth store is an MCP configuration, even when the config is a symlink.
        if resolved
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|name| {
                name.eq_ignore_ascii_case("auth.json")
                    || name.eq_ignore_ascii_case(".credentials.json")
            })
        {
            return Err(Code::InvalidPath);
        }
        return Ok(resolved);
    }
    Err(Code::InvalidPath)
}

pub(super) fn read_receipt(value: io::Result<Option<Vec<u8>>>) -> Result<(Option<Receipt>, bool)> {
    match value {
        Err(e) if e.raw_os_error() == Some(libc::ENOTSUP) => Ok((None, false)),
        result => Ok((
            result
                .map_err(io_code)?
                .and_then(|bytes| serde_json::from_slice(&bytes).ok()),
            true,
        )),
    }
}

// Darwin exposes ACLs separately from extended attributes. Compare their external
// representation as well as the mode and attributes after an exchange.
fn protections(file: &File) -> Result<String> {
    use std::ffi::c_void;
    unsafe extern "C" {
        fn acl_get_fd_np(fd: i32, kind: i32) -> *mut c_void;
        fn acl_to_text(acl: *mut c_void, len: *mut isize) -> *mut libc::c_char;
        fn acl_free(ptr: *mut c_void) -> i32;
    }
    let meta = file.metadata().map_err(io_code)?;
    let mut parts =
        vec![serde_json::to_vec(&(meta.mode(), meta.uid(), meta.gid(), meta.st_flags())).unwrap()];
    unsafe {
        let acl = acl_get_fd_np(file.as_raw_fd(), 0x100); // ACL_TYPE_EXTENDED
        if !acl.is_null() {
            let mut len = 0;
            let text = acl_to_text(acl, &mut len);
            acl_free(acl);
            if text.is_null() {
                return Err(Code::Io);
            }
            parts.push(std::slice::from_raw_parts(text.cast::<u8>(), len as usize).to_vec());
            acl_free(text.cast());
        } else if !matches!(
            io::Error::last_os_error().raw_os_error(),
            Some(libc::ENOENT | libc::ENOTSUP)
        ) {
            return Err(Code::Io);
        }
    }
    let mut keys: Vec<_> = file.list_xattr().map_err(io_code)?.collect();
    keys.sort();
    for key in keys {
        if key == RECEIPT {
            continue;
        }
        parts.push(key.as_encoded_bytes().to_vec());
        parts.push(file.get_xattr(key).map_err(io_code)?.ok_or(Code::Changed)?);
    }
    Ok(super::hash(serde_json::to_vec(&parts).unwrap()))
}

pub struct FileState {
    pub text: Option<String>,
    pub mode: u32,
    pub protection: String,
    pub xattrs: bool,
    pub revision: (u64, i64, i64),
    pub receipt: Option<Receipt>,
    file: Option<File>,
}
impl FileState {
    pub fn read(root: &Dir, relative: &Path) -> Result<Self> {
        let meta = match root.symlink_metadata(relative) {
            Ok(meta) => meta,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Ok(Self {
                    text: None,
                    mode: 0o600,
                    protection: String::new(),
                    xattrs: true,
                    revision: (0, 0, 0),
                    receipt: None,
                    file: None,
                })
            }
            Err(e) => return Err(io_code(e)),
        };
        if !meta.is_file() {
            return Err(Code::InvalidPath);
        }
        let mut opts = OpenOptions::new();
        opts.read(true)
            .custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW);
        let mut file = root.open_with(relative, &opts).map_err(io_code)?.into_std();
        let meta = file.metadata().map_err(io_code)?;
        if !meta.is_file() {
            return Err(Code::InvalidPath);
        }
        let mut source = String::new();
        file.read_to_string(&mut source)
            .map_err(|_| Code::InvalidConfig)?;
        let (receipt, xattrs) = read_receipt(file.get_xattr(RECEIPT))?;
        Ok(Self {
            text: Some(source),
            mode: meta.mode() & 0o7777,
            revision: (meta.ino(), meta.mtime(), meta.mtime_nsec()),
            receipt,
            xattrs,
            protection: if xattrs {
                protections(&file)?
            } else {
                String::new()
            },
            file: Some(file),
        })
    }
    pub fn writable(&self, root: &Dir, target: &Path) -> Result<()> {
        if !self.xattrs {
            return Err(Code::NoExtendedAttributes);
        }
        if self.file.is_some() {
            // Open with the effective user's credentials, without truncating or following links.
            let mut opts = OpenOptions::new();
            opts.write(true)
                .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
            let check = root.open_with(target, &opts).map_err(io_code)?.into_std();
            if check.metadata().map_err(io_code)?.ino() != self.revision.0 {
                return Err(Code::Changed);
            }
        }
        use std::os::fd::AsRawFd;
        let dir = parent(root, target)?;
        if unsafe {
            libc::faccessat(
                dir.as_raw_fd(),
                c".".as_ptr(),
                libc::W_OK | libc::X_OK,
                libc::AT_EACCESS,
            )
        } != 0
        {
            return Err(Code::NotWritable);
        }
        Ok(())
    }
    pub fn temp<'d>(
        &self,
        dir: &'d Dir,
        data: &str,
        receipt: Option<&Receipt>,
    ) -> Result<Staged<'d>> {
        let name = format!(".aphrodite-{}.tmp", uuid::Uuid::new_v4());
        let mut opts = OpenOptions::new();
        opts.write(true).create_new(true).mode(0o600);
        let mut file = dir.open_with(&name, &opts).map_err(io_code)?.into_std();
        let temp = Staged { dir, name };
        file.write_all(data.as_bytes()).map_err(io_code)?;
        if let Some(original) = &self.file {
            if unsafe {
                libc::fcopyfile(
                    original.as_raw_fd(),
                    file.as_raw_fd(),
                    std::ptr::null_mut(),
                    libc::COPYFILE_METADATA,
                )
            } != 0
            {
                return Err(io_code(io::Error::last_os_error()));
            }
            if file.get_xattr(RECEIPT).map_err(io_code)?.is_some() {
                file.remove_xattr(RECEIPT).map_err(io_code)?;
            }
            if protections(&file)? != self.protection {
                return Err(Code::Changed);
            }
        }
        if let Some(r) = receipt {
            file.set_xattr(RECEIPT, &serde_json::to_vec(r).unwrap())
                .map_err(io_code)?;
        }
        file.sync_all().map_err(io_code)?;
        Ok(temp)
    }
}
pub struct Staged<'d> {
    dir: &'d Dir,
    name: String,
}
fn rename(dir: &Dir, from: &OsStr, to: &OsStr, flags: rustix::fs::RenameFlags) -> Result<()> {
    rustix::fs::renameat_with(dir, from, dir, to, flags).map_err(|e| match e {
        rustix::io::Errno::EXIST | rustix::io::Errno::NOENT => Code::Changed,
        _ => io_code(e.into()),
    })
}

impl FileState {
    fn matches(&self, other: &Self) -> bool {
        self.text == other.text
            && self.revision == other.revision
            && self.protection == other.protection
            && self.receipt == other.receipt
    }
}

// Move a name aside exclusively before deleting it. If a later editor save occupies the
// name, return that save. If yet another writer wins recovery, keep both files on disk.
fn retire(dir: &Dir, name: &OsStr, expected: &FileState) -> Result<()> {
    use rustix::fs::RenameFlags;
    let recovery = format!(".aphrodite-{}.recovery", uuid::Uuid::new_v4());
    rename(dir, name, recovery.as_ref(), RenameFlags::NOREPLACE)?;
    if FileState::read(dir, Path::new(&recovery)).is_ok_and(|now| expected.matches(&now)) {
        return dir.remove_file(recovery).map_err(io_code);
    }
    rename(dir, recovery.as_ref(), name, RenameFlags::NOREPLACE)?;
    Err(Code::Changed)
}
impl Staged<'_> {
    pub fn publish_checked(
        mut self,
        name: &OsStr,
        expected: &FileState,
        delete: bool,
        reachable: impl Fn() -> Result<()>,
    ) -> Result<()> {
        use rustix::fs::RenameFlags;
        let ours = FileState::read(self.dir, Path::new(&self.name))?;
        reachable()?;
        if expected.text.is_none() {
            rename(self.dir, self.name.as_ref(), name, RenameFlags::NOREPLACE)?;
            self.name.clear();
            if reachable().is_err() {
                retire(self.dir, name, &ours)?;
                return Err(Code::Changed);
            }
            return Ok(());
        }
        rename(self.dir, self.name.as_ref(), name, RenameFlags::EXCHANGE)?;
        // Drop must never unlink the displaced file until we have identified it.
        let displaced = std::mem::take(&mut self.name);
        let correct = FileState::read(self.dir, Path::new(&displaced))
            .is_ok_and(|now| expected.matches(&now));
        if !correct || reachable().is_err() {
            rename(self.dir, displaced.as_ref(), name, RenameFlags::EXCHANGE)?;
            if FileState::read(self.dir, Path::new(&displaced)).is_ok_and(|now| ours.matches(&now))
            {
                self.dir.remove_file(displaced).map_err(io_code)?;
            }
            return Err(Code::Changed);
        }
        if delete {
            retire(self.dir, name, &ours)?;
        }
        self.dir.remove_file(displaced).map_err(io_code)
    }
}
impl Drop for Staged<'_> {
    fn drop(&mut self) {
        if !self.name.is_empty() {
            let _ = self.dir.remove_file(&self.name);
        }
    }
}
pub fn backup_name(target: &Path, stamp: u128) -> Result<OsString> {
    let mut name = target.file_name().ok_or(Code::InvalidPath)?.to_owned();
    name.push(format!(".aphrodite-{stamp}.bak"));
    Ok(name)
}
pub fn backup(dir: &Dir, name: &std::ffi::OsStr, data: &str) -> Result<()> {
    let mut opts = OpenOptions::new();
    opts.write(true).create_new(true).mode(0o600);
    let mut f = dir.open_with(name, &opts).map_err(io_code)?;
    if f.write_all(data.as_bytes())
        .and_then(|()| f.sync_all())
        .is_err()
    {
        let _ = dir.remove_file(name);
        return Err(Code::Io);
    }
    Ok(())
}
pub fn parent(root: &Dir, target: &Path) -> Result<Dir> {
    let parent = target.parent().ok_or(Code::InvalidPath)?;
    if parent.as_os_str().is_empty() {
        return root.try_clone().map_err(io_code);
    }
    root.open_dir(parent).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            Code::DirectoryMissing
        } else {
            io_code(e)
        }
    })
}

// An editor can replace the config inode. Keep the original digest and generated delimiters
// on its directory too, for a *confirmed* undo. Only the config inode can establish ownership.
fn history_key(name: &std::ffi::OsStr) -> String {
    format!("{RECEIPT}.{}", super::hash(name.as_encoded_bytes()))
}
pub fn history(root: &Dir, target: &Path) -> Result<Option<Receipt>> {
    let dir = parent(root, target)?.into_std_file();
    let key = history_key(target.file_name().ok_or(Code::InvalidPath)?);
    Ok(dir
        .get_xattr(key)
        .map_err(io_code)?
        .and_then(|v| serde_json::from_slice::<Receipt>(&v).ok())
        .filter(|r| r.path == target))
}
pub fn set_history(dir: &Dir, name: &std::ffi::OsStr, receipt: Option<&Receipt>) -> Result<()> {
    let file = dir.try_clone().map_err(io_code)?.into_std_file();
    let key = history_key(name);
    if let Some(r) = receipt {
        file.set_xattr(key, &serde_json::to_vec(r).unwrap())
            .map_err(io_code)
    } else {
        match file.remove_xattr(key) {
            Err(e) if e.raw_os_error() == Some(libc::ENOATTR) => Ok(()),
            r => r.map_err(io_code),
        }
    }
}

pub fn identity(dir: &Dir) -> Result<(u64, u64)> {
    let m = dir
        .try_clone()
        .map_err(io_code)?
        .into_std_file()
        .metadata()
        .map_err(io_code)?;
    Ok((m.dev(), m.ino()))
}
pub fn check_parent(root: &Dir, target: &Path, staged: &Dir) -> Result<()> {
    let current = parent(root, target).map_err(|_| Code::Changed)?;
    if identity(&current)? != identity(staged)? {
        return Err(Code::Changed);
    }
    Ok(())
}
