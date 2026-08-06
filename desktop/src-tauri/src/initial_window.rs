//! First-frame window reveal helpers.

use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "macos")]
pub(crate) const INITIAL_RENDER_READY_EVENT: &str = "initial-render-ready";

#[cfg(target_os = "macos")]
pub(crate) fn schedule_initial_window_reveal<R: Runtime>(window: tauri::Window<R>) {
    use tauri::Listener as _;

    set_initial_window_backing(&window);

    let (initial_render_tx, initial_render_rx) = tokio::sync::oneshot::channel();
    window
        .app_handle()
        .once(INITIAL_RENDER_READY_EVENT, move |_| {
            let _ = initial_render_tx.send(());
        });

    tauri::async_runtime::spawn(async move {
        wait_for_stable_initial_window_geometry(&window).await;

        if tokio::time::timeout(std::time::Duration::from_secs(5), initial_render_rx)
            .await
            .is_err()
        {
            eprintln!("buzz-desktop: initial render did not commit before reveal timeout");
        }

        reveal_initial_window(&window);
        clear_initial_window_backing(&window).await;
    });
}

pub(crate) fn reveal_initial_window<R: Runtime>(window: &tauri::Window<R>) {
    if let Err(error) = window.show() {
        eprintln!("buzz-desktop: failed to reveal main window: {error}");
        return;
    }
    if let Err(error) = window.set_focus() {
        eprintln!("buzz-desktop: failed to focus main window: {error}");
    }
}

/// Restores and focuses the existing main window after an activation request.
pub(crate) fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window.unminimize() {
        eprintln!("buzz-desktop: failed to restore main window: {error}");
        return;
    }
    if let Err(error) = window.show() {
        eprintln!("buzz-desktop: failed to show main window: {error}");
        return;
    }
    if let Err(error) = window.set_focus() {
        eprintln!("buzz-desktop: failed to focus main window: {error}");
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn set_initial_window_backing<R: Runtime>(window: &tauri::Window<R>) {
    // The window remains transparent at runtime for vibrancy. Use an opaque
    // native backing only across the first visible frames so the previous app
    // cannot show through before WebKit has submitted its first surface.
    if let Err(error) = window.set_background_color(Some(tauri::window::Color(17, 21, 24, 255))) {
        eprintln!("buzz-desktop: failed to set initial window backing: {error}");
    }
}

#[cfg(target_os = "macos")]
pub(crate) async fn clear_initial_window_backing<R: Runtime>(window: &tauri::Window<R>) {
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    if let Err(error) = window.set_background_color(None) {
        eprintln!("buzz-desktop: failed to clear initial window backing: {error}");
    }
}

#[cfg(target_os = "macos")]
pub(crate) async fn wait_for_stable_initial_window_geometry<R: Runtime>(window: &tauri::Window<R>) {
    const MAX_POLLS: usize = 120;
    const REQUIRED_STABLE_POLLS: usize = 4;

    let mut previous_bounds = None;
    let mut stable_polls = 0;

    for _ in 0..MAX_POLLS {
        // Accept whatever geometry the window-state plugin restores — maximized
        // or a normal saved size. macOS applies the restore asynchronously, so
        // consecutive identical outer bounds are enough to know it settled.
        let bounds = match (window.outer_position(), window.outer_size()) {
            (Ok(position), Ok(size)) => Some((position.x, position.y, size.width, size.height)),
            _ => None,
        };

        if bounds.is_some() && bounds == previous_bounds {
            stable_polls += 1;
            if stable_polls >= REQUIRED_STABLE_POLLS {
                return;
            }
        } else {
            stable_polls = 0;
        }
        previous_bounds = bounds;

        tokio::time::sleep(std::time::Duration::from_millis(16)).await;
    }

    eprintln!("buzz-desktop: initial window geometry did not settle before reveal timeout");
}
