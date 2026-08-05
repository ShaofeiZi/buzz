//! The macOS application menu.
//!
//! Buzz never called `Builder::menu()`, so Tauri installed `Menu::default()`
//! for us (`tauri::app::Builder::build`, macOS arm). That default puts a
//! `close_window` item in both the File and Window submenus, and muda gives
//! that item a Cmd+W key equivalent bound to `performClose:`.
//!
//! Two consequences, both wrong for Buzz:
//!
//! 1. `CloseRequested` on the main window is intercepted in `lib.rs` and turned
//!    into hide-to-tray, so Cmd+W never closed a window -- it hid the whole
//!    app. That is already redundant with Cmd+H (Hide), which stays.
//! 2. macOS resolves a menu key equivalent before the webview receives any key
//!    event, so Buzz Term could never bind Cmd+W to "close this terminal tab"
//!    while the accelerator was claimed here.
//!
//! So this module builds the standard menu minus both `close_window` items.
//! Everything else matches `Menu::default()` deliberately: the goal is to drop
//! one item, not to design a menu.
//!
//! If hide-on-Cmd+W is ever wanted back in Buzz mode, the revisit path is to
//! restore the item and disable it while the terminal owns input (a disabled
//! item does not consume its key equivalent) -- at the cost of an owner->Rust
//! IPC hop this approach does not need.

#[cfg(target_os = "macos")]
use crate::native_i18n::text;
#[cfg(target_os = "macos")]
use tauri::menu::{
    AboutMetadata, Menu, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
#[cfg(target_os = "macos")]
use tauri::AppHandle;
use tauri::{Builder, Runtime};

/// Installs Buzz's menu, replacing the `Menu::default()` Tauri would otherwise
/// auto-install. A no-op off macOS, where that default is never created and
/// the Cmd+W accelerator does not exist.
pub fn install<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    #[cfg(target_os = "macos")]
    let builder = builder.menu(build);
    builder
}

pub fn refresh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.set_menu(build(app).map_err(|error| error.to_string())?)
        .map(|_| ())
        .map_err(|error| error.to_string())?;

    Ok(())
}

/// Mirrors `Menu::default()` with every `close_window` item omitted.
///
/// The Window and Help submenus keep Tauri's well-known ids: `init_app_menu`
/// looks them up by id to call `set_as_windows_menu_for_nsapp` and
/// `set_as_help_menu_for_nsapp`, and a plain `with_items` submenu would skip
/// both silently -- no error, just a Window menu AppKit no longer manages.
#[cfg(target_os = "macos")]
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                pkg_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(
                        app,
                        Some(text("About Buzz", "关于 Buzz")),
                        Some(about_metadata),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, Some(text("Services", "服务")))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some(text("Hide Buzz", "隐藏 Buzz")))?,
                    &PredefinedMenuItem::hide_others(
                        app,
                        Some(text("Hide Others", "隐藏其他应用")),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some(text("Quit Buzz", "退出 Buzz")))?,
                ],
            )?,
            // `Menu::default()`'s File submenu holds exactly one item on macOS
            // -- close_window -- so dropping that item drops the submenu too.
            &Submenu::with_items(
                app,
                text("Edit", "编辑"),
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some(text("Undo", "撤销")))?,
                    &PredefinedMenuItem::redo(app, Some(text("Redo", "重做")))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some(text("Cut", "剪切")))?,
                    &PredefinedMenuItem::copy(app, Some(text("Copy", "复制")))?,
                    &PredefinedMenuItem::paste(app, Some(text("Paste", "粘贴")))?,
                    &PredefinedMenuItem::select_all(app, Some(text("Select All", "全选")))?,
                ],
            )?,
            &Submenu::with_items(
                app,
                text("View", "显示"),
                true,
                &[&PredefinedMenuItem::fullscreen(
                    app,
                    Some(text("Enter Full Screen", "进入全屏幕")),
                )?],
            )?,
            &Submenu::with_id_and_items(
                app,
                WINDOW_SUBMENU_ID,
                text("Window", "窗口"),
                true,
                &[
                    &PredefinedMenuItem::minimize(app, Some(text("Minimize", "最小化")))?,
                    &PredefinedMenuItem::maximize(app, Some(text("Zoom", "缩放")))?,
                ],
            )?,
            // Empty upstream too on macOS: About lives in the app submenu.
            &Submenu::with_id_and_items(app, HELP_SUBMENU_ID, text("Help", "帮助"), true, &[])?,
        ],
    )
}
