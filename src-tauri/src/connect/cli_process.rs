//! The only program selected by this runner is claude. Neither its path, environment,
//! working directory nor any argument is accepted from IPC.
use super::{claude::CommandResult, spawn::Child, Code, Engine};
use rustix::fs::{access, fcntl_setfl, Access, OFlags};
use serde::Serialize;
use std::io::BufRead;
use std::{
    ffi::CString,
    fs,
    io::{self, Read},
    os::{
        fd::AsFd,
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(super) struct Program {
    pub path: PathBuf,
    identity: Identity,
    pub trusted: bool,
    #[serde(skip)]
    interpreter: Vec<(PathBuf, Identity)>,
    #[serde(skip)]
    search_path: Vec<PathBuf>,
    #[serde(skip)]
    interpreter_args: Vec<String>,
}

#[derive(Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Identity {
    device: u64,
    inode: u64,
    size: u64,
    mtime_seconds: i64,
    mtime_nanos: i64,
}
impl From<&fs::Metadata> for Identity {
    fn from(m: &fs::Metadata) -> Self {
        Self {
            device: m.dev(),
            inode: m.ino(),
            size: m.len(),
            mtime_seconds: m.mtime(),
            mtime_nanos: m.mtime_nsec(),
        }
    }
}

// Callers pass a resolved path. Every component, including the filesystem root, matters.
pub(super) fn controlled(path: &Path) -> bool {
    let user = unsafe { libc::geteuid() };
    path.is_absolute()
        && path.ancestors().all(|p| {
            fs::symlink_metadata(p).is_ok_and(|m| {
                !m.is_symlink()
                    && (m.uid() == user || m.uid() == 0)
                    && m.mode() & 0o022 == 0
                    && super::files::acl_controlled(p)
            })
        })
}

fn safe_to_inspect(e: &Engine, path: &Path, meta: &fs::Metadata) -> bool {
    if path.file_name().and_then(|s| s.to_str()).is_some_and(|s| {
        [".claude.json", "auth.json", ".credentials.json"]
            .iter()
            .any(|name| s.eq_ignore_ascii_case(name))
    }) {
        return false;
    }
    if super::files::exclude_settings((meta.dev(), meta.ino()), &e.claude_settings()).is_err() {
        return false;
    }
    if meta.nlink() == 1 {
        return true;
    }
    super::files::exclude_settings(
        (meta.dev(), meta.ino()),
        &[
            e.codex_home.join("auth.json"),
            e.home.join(".claude/.credentials.json"),
        ],
    )
    .is_ok()
}

impl Identity {
    fn object_path(&self) -> Option<PathBuf> {
        let path = PathBuf::from(format!("/.vol/{}/{}", self.device, self.inode));
        fs::metadata(&path)
            .is_ok_and(|m| Self::from(&m) == *self)
            .then_some(path)
    }
    fn open(&self, e: &Engine, path: &Path) -> super::Result<fs::File> {
        let file = fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| Code::Changed)?;
        let m = file.metadata().map_err(|_| Code::Changed)?;
        if Self::from(&m) != *self || !safe_to_inspect(e, path, &m) {
            return Err(Code::Changed);
        }
        Ok(file)
    }
}

impl Program {
    fn at(e: &Engine, selected: PathBuf) -> Option<Self> {
        let path = selected.canonicalize().ok()?;
        let m = fs::metadata(&path).ok()?;
        if !m.is_file()
            || access(&path, Access::EXEC_OK).is_err()
            || path.to_str()?.contains(char::is_control)
        {
            return None;
        }
        let search_path = selected
            .parent()
            .into_iter()
            .chain(
                [
                    "/usr/bin",
                    "/bin",
                    "/usr/sbin",
                    "/sbin",
                    "/opt/homebrew/bin",
                    "/usr/local/bin",
                ]
                .map(Path::new),
            )
            .filter_map(|dir| dir.canonicalize().ok())
            .filter(|dir| dir.to_str().is_some() && controlled(dir))
            .collect::<Vec<_>>();
        let mut program = Self {
            identity: (&m).into(),
            trusted: selected.parent().is_some_and(|dir| {
                dir.ancestors()
                    .all(|p| p.canonicalize().is_ok_and(|resolved| controlled(&resolved)))
            }) && controlled(&path)
                && safe_to_inspect(e, &path, &m),
            path,
            interpreter: vec![],
            interpreter_args: vec![],
            search_path,
        };
        if program.trusted {
            program.trusted = program.check_interpreter(e).is_some();
        }
        Some(program)
    }

    fn check_interpreter(&mut self, e: &Engine) -> Option<()> {
        // Only inspect trusted files. A native binary has no shebang.
        let mut prefix = Vec::new();
        std::io::BufReader::new(self.identity.open(e, &self.path).ok()?.take(512))
            .read_until(b'\n', &mut prefix)
            .ok()?;
        let Some(line) = prefix.strip_prefix(b"#!") else {
            return Some(());
        };
        let mut words = std::str::from_utf8(line).ok()?.split_ascii_whitespace();
        let interpreter = Path::new(words.next()?);
        if !interpreter.is_absolute() || !controlled(interpreter.parent()?) {
            return None;
        }
        let pinned = self.pin_interpreter(e, interpreter)?;
        let env = fs::metadata("/usr/bin/env").ok()?;
        if pinned == (env.dev(), env.ino()) {
            let name = words.next()?;
            if name.starts_with('-') || name.contains(['/', '=']) || words.next().is_some() {
                return None;
            }
            let selected = self
                .search_path
                .iter()
                .map(|dir| dir.join(name))
                .find(|p| access(p, Access::EXEC_OK).is_ok())?;
            self.pin_interpreter(e, &selected)?;
        } else {
            self.interpreter_args.extend(words.map(str::to_owned));
        }
        Some(())
    }

    fn pin_interpreter(&mut self, e: &Engine, selected: &Path) -> Option<(u64, u64)> {
        let path = selected.canonicalize().ok()?;
        let m = fs::metadata(&path).ok()?;
        if !controlled(&path) || !m.is_file() || access(&path, Access::EXEC_OK).is_err() {
            return None;
        }
        if path.to_str().is_none() || !safe_to_inspect(e, &path, &m) {
            return None;
        }
        // A PATH-resolved interpreter must itself be a native Darwin image. An env
        // wrapper must not introduce a second shebang lookup or shell fallback.
        let mut magic = [0; 4];
        Identity::from(&m)
            .open(e, &path)
            .ok()?
            .read_exact(&mut magic)
            .ok()?;
        let native = [u32::from_be_bytes(magic), u32::from_le_bytes(magic)]
            .iter()
            .any(|m| matches!(m, 0xfeedface | 0xfeedfacf | 0xcafebabe | 0xcafebabf));
        if !native {
            return None;
        }
        self.interpreter.push((path, (&m).into()));
        Some((m.dev(), m.ino()))
    }

    pub fn find(engine: &Engine) -> Option<Self> {
        engine
            .cli_dirs
            .iter()
            .chain(&engine.claude_dirs)
            .filter(|dir| dir.is_absolute())
            .find_map(|dir| Self::at(engine, dir.join("claude")))
    }

    pub fn binding(&self) -> Result<String, Code> {
        serde_json::to_vec(&(
            self,
            &self.interpreter,
            &self.interpreter_args,
            &self.search_path,
        ))
        .map(super::hash)
        .map_err(|_| Code::InvalidPath)
    }

    pub fn run(&self, engine: &Engine, args: &[&str]) -> Result<Output, CommandResult> {
        if !self.trusted {
            return Err(Code::CliUntrusted.into());
        }
        let path = std::env::join_paths(&self.search_path).map_err(|_| Code::InvalidPath)?;
        let cwd = private_cwd(&user_temp()?)?;
        let script = self.identity.open(engine, &self.path)?;
        let interpreter = self.interpreter.last();
        let (image_path, image_id) = interpreter
            .map(|(p, id)| (p, id))
            .unwrap_or((&self.path, &self.identity));
        let native = interpreter
            .map(|_| image_id.open(engine, image_path))
            .transpose()?;
        // Darwin spawn takes a pathname. volfs provides a stable object name on
        // supporting volumes. The open file keeps its inode from being recycled.
        let object = image_id.object_path();
        let launch_path = object.as_ref().unwrap_or(image_path);
        let script_object = interpreter.and_then(|_| self.identity.object_path());
        let script_path = script_object.as_deref().unwrap_or(Path::new("/dev/fd/3"));
        let launch_path = CString::new(launch_path.as_os_str().as_encoded_bytes())
            .map_err(|_| Code::InvalidPath)?;
        let argv = std::iter::once(image_path.as_os_str().as_encoded_bytes())
            .chain(self.interpreter_args.iter().map(|s| s.as_bytes()))
            .chain(interpreter.map(|_| script_path.as_os_str().as_encoded_bytes()))
            .chain(args.iter().map(|a| a.as_bytes()))
            .map(CString::new)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| Code::InvalidPath)?;
        let mut env = vec![];
        for (key, value) in [
            ("HOME", Some(engine.home.as_os_str())),
            ("PATH", Some(path.as_os_str())),
            ("LC_ALL", Some("C".as_ref())),
            ("NO_COLOR", Some("1".as_ref())),
            ("COLUMNS", Some("32767".as_ref())),
            (
                "CLAUDE_CONFIG_DIR",
                engine.profile()?.map(std::ffi::OsStr::new),
            ),
        ] {
            if let Some(value) = value {
                let bytes = [key.as_bytes(), b"=", value.as_encoded_bytes()].concat();
                env.push(CString::new(bytes).map_err(|_| Code::InvalidPath)?);
            }
        }
        let cwd_path = CString::new(cwd.path().as_os_str().as_encoded_bytes())
            .map_err(|_| Code::InvalidPath)?;
        let (child, out, err) = Child::start(
            &launch_path,
            &argv,
            &env,
            &cwd_path,
            interpreter
                .filter(|_| script_object.is_none())
                .map(|_| &script),
            || {
                if Self::find(engine).as_ref() != Some(self) {
                    return Err(Code::Changed);
                }
                let image = native.as_ref().unwrap_or(&script);
                if Identity::from(&image.metadata().map_err(|_| Code::Changed)?) != *image_id {
                    return Err(Code::Changed);
                }
                Ok(())
            },
        )?;
        capture(&child, out, err, engine.cli_timeout)
            .map_err(|code| CommandResult::new(code, child.terminate()))
    }
}

// Ask Darwin for the user's temporary folder even if the GUI inherited a project TMPDIR.
fn user_temp() -> Result<PathBuf, Code> {
    use std::os::unix::ffi::OsStrExt;
    let mut buf = [0u8; libc::PATH_MAX as usize];
    let len = unsafe {
        libc::confstr(
            libc::_CS_DARWIN_USER_TEMP_DIR,
            buf.as_mut_ptr().cast(),
            buf.len(),
        )
    };
    if len < 2 || len > buf.len() {
        return Err(Code::InvalidPath);
    }
    Ok(PathBuf::from(std::ffi::OsStr::from_bytes(&buf[..len - 1])))
}

pub(super) fn private_cwd(parent: &Path) -> Result<tempfile::TempDir, Code> {
    let parent = parent.canonicalize().map_err(|_| Code::InvalidPath)?;
    if !controlled(&parent) {
        return Err(Code::InvalidPath);
    }
    for ancestor in parent.ancestors() {
        for name in [
            ".mcp.json",
            ".git",
            ".claude",
            "CLAUDE.md",
            "CLAUDE.local.md",
        ] {
            match fs::symlink_metadata(ancestor.join(name)) {
                Err(e) if e.kind() == io::ErrorKind::NotFound => (),
                _ => return Err(Code::InvalidPath),
            }
        }
    }
    tempfile::Builder::new()
        .prefix("aphrodite-mcp-")
        .permissions(fs::Permissions::from_mode(0o700))
        .tempdir_in(parent)
        .map_err(|_| Code::Io)
}

pub(super) struct Output {
    pub status: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

const LIMIT: usize = 64 * 1024;
struct Pipe<R> {
    reader: R,
    data: Vec<u8>,
    eof: bool,
}
impl<R: AsFd + Read> Pipe<R> {
    fn new(reader: R) -> Result<Self, Code> {
        fcntl_setfl(&reader, OFlags::NONBLOCK).map_err(|_| Code::Io)?;
        Ok(Self {
            reader,
            data: vec![],
            eof: false,
        })
    }
    fn read(&mut self) -> Result<bool, Code> {
        if self.eof {
            return Ok(false);
        }
        let mut buf = [0; 8192];
        match self.reader.read(&mut buf) {
            Ok(0) => self.eof = true,
            Ok(n) => {
                if self.data.len() + n > LIMIT {
                    return Err(Code::CliOutputLimit);
                }
                self.data.extend_from_slice(&buf[..n]);
                return Ok(true);
            }
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                ) =>
            {
                ()
            }
            Err(_) => return Err(Code::Io),
        }
        Ok(false)
    }
}

fn capture(
    child: &Child,
    stdout: io::PipeReader,
    stderr: io::PipeReader,
    timeout: Duration,
) -> Result<Output, Code> {
    let deadline = Instant::now() + timeout;
    let mut stdout = Pipe::new(stdout)?;
    let mut stderr = Pipe::new(stderr)?;
    loop {
        if Instant::now() >= deadline {
            return Err(Code::CliTimeout);
        }
        let out = stdout.read()?;
        let err = stderr.read()?;
        // Keep the child waitable until both pipes close, including on timeout.
        if stdout.eof && stderr.eof {
            if let Some(status) = child.wait(libc::WNOHANG)? {
                return Ok(Output {
                    status: status.code(),
                    stdout: stdout.data,
                    stderr: stderr.data,
                });
            }
        }
        if !out && !err {
            thread::sleep(Duration::from_millis(5));
        }
    }
}
