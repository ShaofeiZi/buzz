use std::sync::atomic::{AtomicU8, Ordering};

use tauri::{AppHandle, Runtime};

const LOCALE_EN: u8 = 0;
const LOCALE_ZH_CN: u8 = 1;

static CURRENT_LOCALE: AtomicU8 = AtomicU8::new(LOCALE_EN);

pub(crate) fn is_simplified_chinese() -> bool {
    CURRENT_LOCALE.load(Ordering::Relaxed) == LOCALE_ZH_CN
}

#[cfg(test)]
pub(crate) fn set_test_locale(locale: &str) {
    CURRENT_LOCALE.store(
        if locale == "zh-CN" {
            LOCALE_ZH_CN
        } else {
            LOCALE_EN
        },
        Ordering::Relaxed,
    );
}

pub(crate) fn text<'a>(english: &'a str, simplified_chinese: &'a str) -> &'a str {
    if is_simplified_chinese() {
        simplified_chinese
    } else {
        english
    }
}

#[tauri::command]
pub(crate) fn set_app_locale<R: Runtime>(app: AppHandle<R>, locale: String) -> Result<(), String> {
    CURRENT_LOCALE.store(
        if locale == "zh-CN" {
            LOCALE_ZH_CN
        } else {
            LOCALE_EN
        },
        Ordering::Relaxed,
    );

    crate::app_menu::refresh(&app)?;
    crate::tray_menu::refresh_locale(&app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{text, CURRENT_LOCALE, LOCALE_EN, LOCALE_ZH_CN};
    use std::sync::atomic::Ordering;

    #[test]
    fn returns_copy_for_active_native_locale() {
        CURRENT_LOCALE.store(LOCALE_ZH_CN, Ordering::Relaxed);
        assert_eq!(text("Window", "窗口"), "窗口");
        CURRENT_LOCALE.store(LOCALE_EN, Ordering::Relaxed);
        assert_eq!(text("Window", "窗口"), "Window");
    }
}
