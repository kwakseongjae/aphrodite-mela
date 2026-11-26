//! All config and backup operations are relative to a directory handle rooted in the person's home.
use super::{Code, Receipt, Result};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions, OpenOptionsExt},
};
use std::{
    ffi::OsString,
    fs::File,
    io::{self, Read, Write},
    os::unix::fs::{MetadataExt, PermissionsExt},
    path::{Component, Path, PathBuf},
};
use xattr::FileExt;

const RECEIPT: &str = "studio.aphrodite.mela.mcp-entry";
fn io_code(e: io::Error) -> Code {
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
        return Ok(resolved);
    }
    Err(Code::InvalidPath)
}

pub struct FileState {
    pub text: Option<String>,
    pub mode: u32,
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
        let attr = file.get_xattr(RECEIPT).map_err(io_code)?;
        Ok(Self {
            text: Some(source),
            mode: meta.mode() & 0o7777,
            revision: (meta.ino(), meta.mtime(), meta.mtime_nsec()),
            receipt: attr.and_then(|v| serde_json::from_slice(&v).ok()),
            file: Some(file),
        })
    }
    pub fn writable(&self, root: &Dir, target: &Path) -> Result<()> {
        if self.mode & 0o222 == 0 {
            return Err(Code::NotWritable);
        }
        let mut parent = target.parent().ok_or(Code::InvalidPath)?;
        loop {
            let dir = if parent.as_os_str().is_empty() {
                root.try_clone()
            } else {
                root.open_dir(parent)
            };
            match dir {
                Ok(dir) => {
                    let dir = dir.into_std_file();
                    if dir.metadata().map_err(io_code)?.permissions().mode() & 0o222 == 0 {
                        return Err(Code::NotWritable);
                    }
                    // Honor ACLs as well as mode bits without creating a probe file during preview.
                    use std::os::fd::AsRawFd;
                    if unsafe {
                        libc::faccessat(dir.as_raw_fd(), c".".as_ptr(), libc::W_OK | libc::X_OK, 0)
                    } != 0
                    {
                        return Err(Code::NotWritable);
                    }
                    return Ok(());
                }
                Err(e) if e.kind() == io::ErrorKind::NotFound => {
                    parent = parent.parent().ok_or(Code::InvalidPath)?
                }
                Err(e) => return Err(io_code(e)),
            }
        }
    }
    pub fn temp<'d>(
        &self,
        dir: &'d Dir,
        data: &str,
        receipt: Option<&Receipt>,
    ) -> Result<cap_tempfile::TempFile<'d>> {
        let mut temp = cap_tempfile::TempFile::new(dir).map_err(io_code)?;
        let file = temp.as_file().try_clone().map_err(io_code)?.into_std();
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(io_code)?;
        temp.write_all(data.as_bytes()).map_err(io_code)?;
        if let Some(original) = &self.file {
            for key in original.list_xattr().map_err(io_code)? {
                if key == RECEIPT {
                    continue;
                }
                if let Some(value) = original.get_xattr(&key).map_err(io_code)? {
                    file.set_xattr(&key, &value).map_err(io_code)?;
                }
            }
        }
        if let Some(r) = receipt {
            file.set_xattr(RECEIPT, &serde_json::to_vec(r).unwrap())
                .map_err(io_code)?;
        }
        file.set_permissions(std::fs::Permissions::from_mode(self.mode))
            .map_err(io_code)?;
        file.sync_all().map_err(io_code)?;
        Ok(temp)
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
    root.create_dir_all(parent).map_err(io_code)?;
    root.open_dir(parent).map_err(io_code)
}
