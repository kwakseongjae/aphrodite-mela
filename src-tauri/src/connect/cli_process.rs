//! The only program selected by this runner is claude. Neither its path, environment,
//! working directory nor any argument is accepted from IPC.
use super::{claude::CommandResult, Code, Engine};
use rustix::fs::{access, fcntl_setfl, Access, OFlags};
use serde::Serialize;
use std::io::BufRead;
use std::{
    fs,
    io::{self, Read},
    os::{
        fd::AsFd,
        unix::{
            fs::{MetadataExt, PermissionsExt},
            process::CommandExt,
        },
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
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
        let cwd = tempfile::Builder::new()
            .prefix("aphrodite-mcp-")
            .permissions(fs::Permissions::from_mode(0o700))
            .tempdir_in("/private/tmp")
            .map_err(|_| Code::Io)?;
        let mut command = Command::new(&self.path);
        command
            .args(args)
            .env_clear()
            .env("HOME", &engine.home)
            .env("PATH", path)
            .env("LC_ALL", "C")
            .env("NO_COLOR", "1")
            .env("COLUMNS", "32767")
            .current_dir(cwd.path())
            .process_group(0)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = &engine.claude_config_dir {
            if !dir.is_absolute() {
                return Err(Code::InvalidPath.into());
            }
            command.env("CLAUDE_CONFIG_DIR", dir);
        }
        let mut child = command.spawn().map_err(|_| Code::CliStartFailed)?;
        let captured = capture(&mut child, engine.cli_timeout);
        captured.map_err(|code| {
            // A health check or interpreter can leave a descendant holding either pipe.
            unsafe {
                libc::killpg(child.id() as i32, libc::SIGKILL);
            }
            let exit = child.wait().ok().and_then(|status| status.code());
            CommandResult::new(code, exit)
        })
    }
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

fn capture(child: &mut Child, timeout: Duration) -> Result<Output, Code> {
    let deadline = Instant::now() + timeout;
    let mut stdout = Pipe::new(child.stdout.take().ok_or(Code::Io)?)?;
    let mut stderr = Pipe::new(child.stderr.take().ok_or(Code::Io)?)?;
    loop {
        if Instant::now() >= deadline {
            return Err(Code::CliTimeout);
        }
        let out = stdout.read()?;
        let err = stderr.read()?;
        // Keep the child waitable until both pipes close, including on timeout.
        if stdout.eof && stderr.eof {
            if let Some(status) = child.try_wait().map_err(|_| Code::Io)? {
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
