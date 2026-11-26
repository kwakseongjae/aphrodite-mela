//! The only program selected by this runner is claude. Neither its path, environment,
//! working directory nor any argument is accepted from IPC.
use super::{claude::CommandResult, Code, Engine};
use rustix::fs::{access, fcntl_setfl, Access, OFlags};
use serde::Serialize;
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

#[derive(Serialize, PartialEq)]
pub(super) struct Program {
    pub path: PathBuf,
    canonical: PathBuf,
    revision: (u64, u64, i64, i64),
}

impl Program {
    fn at(path: PathBuf) -> Option<Self> {
        let canonical = path.canonicalize().ok()?;
        let m = fs::metadata(&canonical).ok()?;
        if !m.is_file()
            || access(&canonical, Access::EXEC_OK).is_err()
            || path.to_str().is_none()
            || canonical.to_str().is_none()
        {
            return None;
        }
        Some(Self {
            path,
            canonical,
            revision: (m.dev(), m.ino(), m.ctime(), m.ctime_nsec()),
        })
    }

    pub fn find(engine: &Engine) -> Option<Self> {
        engine
            .cli_dirs
            .iter()
            .filter(|dir| dir.is_absolute())
            .find_map(|dir| Self::at(dir.join("claude")))
    }

    pub fn run(&self, engine: &Engine, args: &[&str]) -> Result<Output, CommandResult> {
        if Self::at(self.path.clone()).as_ref() != Some(self) {
            return Err(Code::Changed.into());
        }
        // The selected bin directory can supply node for an npm-installed CLI's shebang.
        let path = std::env::join_paths(
            self.path.parent().into_iter().chain(
                [
                    "/usr/bin",
                    "/bin",
                    "/usr/sbin",
                    "/sbin",
                    "/opt/homebrew/bin",
                    "/usr/local/bin",
                ]
                .map(Path::new),
            ),
        )
        .map_err(|_| Code::InvalidPath)?;
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
