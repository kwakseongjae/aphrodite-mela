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
        unix::fs::{MetadataExt, PermissionsExt},
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
    interpreter: Vec<(PathBuf, Identity)>,
    search_path: Vec<PathBuf>,
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
                !m.is_symlink() && (m.uid() == user || m.uid() == 0) && m.mode() & 0o022 == 0
            })
        })
}

impl Program {
    fn at(selected: PathBuf) -> Option<Self> {
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
            trusted: controlled(&path),
            path,
            interpreter: vec![],
            search_path,
        };
        if program.trusted {
            program.trusted = program.check_interpreter().is_some();
        }
        Some(program)
    }

    fn check_interpreter(&mut self) -> Option<()> {
        // Only inspect trusted files. A native binary has no shebang.
        let mut prefix = Vec::new();
        std::io::BufReader::new(fs::File::open(&self.path).ok()?.take(512))
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
        self.pin_interpreter(interpreter)?;
        if interpreter == Path::new("/usr/bin/env") {
            let name = words.next()?;
            if name.starts_with('-') || name.contains(['/', '=']) || words.next().is_some() {
                return None;
            }
            let selected = self
                .search_path
                .iter()
                .map(|dir| dir.join(name))
                .find(|p| access(p, Access::EXEC_OK).is_ok())?;
            self.pin_interpreter(&selected)?;
        }
        Some(())
    }

    fn pin_interpreter(&mut self, selected: &Path) -> Option<()> {
        let path = selected.canonicalize().ok()?;
        let m = fs::metadata(&path).ok()?;
        if !controlled(&path) || !m.is_file() || access(&path, Access::EXEC_OK).is_err() {
            return None;
        }
        self.interpreter.push((path, (&m).into()));
        Some(())
    }

    pub fn find(engine: &Engine) -> Option<Self> {
        engine
            .cli_dirs
            .iter()
            .chain(&engine.claude_dirs)
            .filter(|dir| dir.is_absolute())
            .find_map(|dir| Self::at(dir.join("claude")))
    }

    pub fn binding(&self) -> String {
        super::hash(serde_json::to_vec(self).expect("validated executable paths"))
    }

    pub fn run(&self, engine: &Engine, args: &[&str]) -> Result<Output, CommandResult> {
        if !self.trusted {
            return Err(Code::CliUntrusted.into());
        }
        if Self::find(engine).as_ref() != Some(self) {
            return Err(Code::Changed.into());
        }
        let path = std::env::join_paths(&self.search_path).map_err(|_| Code::InvalidPath)?;
        let cwd = private_cwd(&user_temp()?)?;
        let argv = std::iter::once(self.path.as_os_str().as_encoded_bytes())
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
                engine.claude_config_dir.as_deref().map(Path::as_os_str),
            ),
        ] {
            if let Some(value) = value {
                let bytes = [key.as_bytes(), b"=", value.as_encoded_bytes()].concat();
                env.push(CString::new(bytes).map_err(|_| Code::InvalidPath)?);
            }
        }
        let cwd_path = CString::new(cwd.path().as_os_str().as_encoded_bytes())
            .map_err(|_| Code::InvalidPath)?;
        let (child, out, err) = Child::start(&argv, &env, &cwd_path)?;
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
        for name in [".mcp.json", ".git"] {
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
