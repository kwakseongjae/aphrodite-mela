//! A native save acknowledges the same result after its filesystem work finishes.
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

// The frontend gives window destruction ten seconds after the saves have drained.
const WINDOW_CLOSE_LIMIT: Duration = Duration::from_secs(10);
struct Close {
    label: String,
    ticket: String,
    until: Instant,
}

struct Writes {
    active: usize,
    closing: Option<Close>,
}
impl Writes {
    fn close_remaining(&mut self) -> Option<Duration> {
        let remaining = self
            .closing
            .as_ref()?
            .until
            .saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            self.closing = None;
            None
        } else {
            Some(remaining)
        }
    }
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
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.min(10_000));
    tauri::async_runtime::spawn_blocking(move || {
        let (mut state, _) = FINISHED
            .wait_timeout_while(
                WRITES.lock().unwrap(),
                deadline.saturating_duration_since(Instant::now()),
                |s| s.active > 0,
            )
            .unwrap();
        if state.active != 0 || state.close_remaining().is_some() || Instant::now() >= deadline {
            return false;
        }
        state.closing = Some(Close {
            label,
            ticket,
            until: Instant::now() + WINDOW_CLOSE_LIMIT,
        });
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
        .is_some_and(|gate| gate.label == label && ticket.is_none_or(|t| t == gate.ticket))
    {
        state.closing = None;
        FINISHED.notify_all();
    }
}

pub async fn write<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (accepted, gated) = {
        let mut state = WRITES.lock().unwrap();
        state.active += 1;
        (Accepted, state.close_remaining().is_some())
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _accepted = accepted;
        if gated {
            let mut state = WRITES.lock().unwrap();
            while let Some(remaining) = state.close_remaining() {
                state = FINISHED.wait_timeout(state, remaining).unwrap().0;
            }
        }
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
