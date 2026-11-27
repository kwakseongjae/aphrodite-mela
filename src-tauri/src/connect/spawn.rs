//! Darwin's absolute-path spawn interface returns ENOEXEC for an unrecognized image.
use super::{Code, Result};
use std::{
    ffi::{CStr, CString},
    fs::File,
    io::{self, PipeReader},
    os::{fd::AsRawFd, unix::process::ExitStatusExt},
    process::ExitStatus,
    ptr,
};

unsafe extern "C" {
    fn posix_spawn_file_actions_addchdir_np(
        actions: *mut libc::posix_spawn_file_actions_t,
        path: *const libc::c_char,
    ) -> libc::c_int;
}

fn check(rc: libc::c_int) -> Result<()> {
    if rc == 0 {
        Ok(())
    } else {
        Err(Code::CliStartFailed)
    }
}

struct Actions(libc::posix_spawn_file_actions_t);
impl Drop for Actions {
    fn drop(&mut self) {
        unsafe {
            libc::posix_spawn_file_actions_destroy(&mut self.0);
        }
    }
}
struct Attributes(libc::posix_spawnattr_t);
impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe {
            libc::posix_spawnattr_destroy(&mut self.0);
        }
    }
}

pub(super) struct Child(libc::pid_t);
impl Child {
    pub fn start(
        image: &CStr,
        argv: &[CString],
        env: &[CString],
        cwd: &CStr,
        script: Option<&File>,
        verify: impl FnOnce() -> Result<()>,
    ) -> Result<(Self, PipeReader, PipeReader)> {
        let stdin = File::open("/dev/null").map_err(|_| Code::Io)?;
        let (stdout, out) = io::pipe().map_err(|_| Code::Io)?;
        let (stderr, err) = io::pipe().map_err(|_| Code::Io)?;
        let pointers = |v: &[CString]| {
            v.iter()
                .map(|s| s.as_ptr().cast_mut())
                .chain([ptr::null_mut()])
                .collect::<Vec<_>>()
        };
        let args = pointers(argv);
        let vars = pointers(env);
        let mut pid = 0;
        // All strings, descriptors, file actions and attributes stay alive through spawn.
        unsafe {
            let mut actions = ptr::null_mut();
            check(libc::posix_spawn_file_actions_init(&mut actions))?;
            let mut actions = Actions(actions);
            check(posix_spawn_file_actions_addchdir_np(
                &mut actions.0,
                cwd.as_ptr(),
            ))?;
            for (from, to) in [
                (stdin.as_raw_fd(), 0),
                (out.as_raw_fd(), 1),
                (err.as_raw_fd(), 2),
            ] {
                check(libc::posix_spawn_file_actions_adddup2(
                    &mut actions.0,
                    from,
                    to,
                ))?;
            }
            if let Some(file) = script {
                check(libc::posix_spawn_file_actions_adddup2(
                    &mut actions.0,
                    file.as_raw_fd(),
                    3,
                ))?;
            }
            let mut attr = ptr::null_mut();
            check(libc::posix_spawnattr_init(&mut attr))?;
            let mut attr = Attributes(attr);
            check(libc::posix_spawnattr_setpgroup(&mut attr.0, 0))?;
            check(libc::posix_spawnattr_setflags(
                &mut attr.0,
                (libc::POSIX_SPAWN_SETPGROUP | libc::POSIX_SPAWN_CLOEXEC_DEFAULT) as i16,
            ))?;
            verify()?;
            check(libc::posix_spawn(
                &mut pid,
                image.as_ptr(),
                &actions.0,
                &attr.0,
                args.as_ptr(),
                vars.as_ptr(),
            ))?;
        }
        Ok((Self(pid), stdout, stderr))
    }
    pub fn wait(&self, flags: i32) -> Result<Option<ExitStatus>> {
        loop {
            let mut status = 0;
            let rc = unsafe { libc::waitpid(self.0, &mut status, flags) };
            if rc == self.0 {
                return Ok(Some(ExitStatus::from_raw(status)));
            }
            if rc == 0 {
                return Ok(None);
            }
            if io::Error::last_os_error().kind() != io::ErrorKind::Interrupted {
                return Err(Code::Io);
            }
        }
    }
    pub fn terminate(&self) -> Option<i32> {
        unsafe {
            libc::killpg(self.0, libc::SIGKILL);
        }
        self.wait(0).ok().flatten().and_then(|s| s.code())
    }
}
