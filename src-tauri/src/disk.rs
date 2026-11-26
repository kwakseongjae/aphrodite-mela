//! A native save acknowledges the same result after its filesystem work finishes.
use std::sync::{Condvar, Mutex};
use std::time::Duration;

struct Writes {
    active: usize,
    closing: Option<(String, String)>,
}
static WRITES: Mutex<Writes> = Mutex::new(Writes {
    active: 0,
    closing: None,
});
static FINISHED: Condvar = Condvar::new();

struct Accepted;
impl Drop for Accepted {
    fn drop(&mut self) {
        let mut state = WRITES.lock().unwrap();
        state.active -= 1;
        if state.active == 0 {
            FINISHED.notify_all();
        }
    }
}
#[tauri::command]
pub async fn disk_begin_close<R: tauri::Runtime>(
    window: tauri::Window<R>,
    ticket: String,
    timeout_ms: u64,
) -> Result<bool, String> {
    let label = window.label().to_owned();
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms.min(10_000));
    tauri::async_runtime::spawn_blocking(move || {
        let (mut state, _) = FINISHED
            .wait_timeout_while(
                WRITES.lock().unwrap(),
                deadline.saturating_duration_since(std::time::Instant::now()),
                |s| s.active > 0,
            )
            .unwrap();
        if state.active != 0 || state.closing.is_some() {
            return false;
        }
        state.closing = Some((label, ticket));
        true
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn disk_end_close<R: tauri::Runtime>(window: tauri::Window<R>, ticket: String) {
    release_close(window.label(), Some(&ticket));
}
pub fn release_close(label: &str, ticket: Option<&str>) {
    let mut state = WRITES.lock().unwrap();
    if state
        .closing
        .as_ref()
        .is_some_and(|(owner, id)| owner == label && ticket.is_none_or(|t| t == id))
    {
        state.closing = None;
    }
}

pub async fn write<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let accepted = {
        let mut state = WRITES.lock().unwrap();
        if state.closing.is_some() {
            return Err("closing".into());
        }
        state.active += 1;
        Accepted
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _accepted = accepted;
        work()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
pub(crate) static TEST_SERIAL: Mutex<()> = Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        future::Future,
        sync::mpsc,
        task::{Context, Waker},
        time::Duration,
    };

    #[test]
    fn another_command_answers_while_a_write_is_stalled() {
        let _serial = TEST_SERIAL.lock().unwrap();
        let (started, running) = mpsc::channel();
        let (release, stalled) = mpsc::channel();
        let mut slow = Box::pin(write(move || {
            started.send(()).unwrap();
            stalled
                .recv_timeout(Duration::from_secs(5))
                .map_err(|e| e.to_string())
        }));
        // Poll on the command-dispatching thread itself. A synchronous write would stall this poll.
        assert!(slow
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
            .is_pending());
        running.recv_timeout(Duration::from_secs(5)).unwrap();
        tauri::async_runtime::block_on(async {
            assert_eq!(write(|| Ok(42)).await.unwrap(), 42);
            release.send(()).unwrap();
            slow.await.unwrap();
        });
    }
}
