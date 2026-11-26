//! A native save acknowledges the same result after its filesystem work finishes.
pub async fn write<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::mpsc, time::Duration};

    #[test]
    fn another_command_answers_while_a_write_is_stalled() {
        let (started, running) = mpsc::channel();
        let (release, stalled) = mpsc::channel();
        let slow = tauri::async_runtime::spawn(write(move || {
            started.send(()).unwrap();
            stalled.recv_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())
        }));
        running.recv_timeout(Duration::from_secs(5)).unwrap();
        tauri::async_runtime::block_on(async {
            assert_eq!(write(|| Ok(42)).await.unwrap(), 42);
            release.send(()).unwrap();
            slow.await.unwrap().unwrap();
        });
    }
}
