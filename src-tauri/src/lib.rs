// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{LogicalSize, Manager, Size, WebviewWindow};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

const BASELINE_MONITOR_WIDTH: f64 = 1920.0;
const BASELINE_MONITOR_HEIGHT: f64 = 1080.0;
const BASELINE_WINDOW_WIDTH: f64 = 400.0;
const BASELINE_WINDOW_HEIGHT: f64 = 300.0;
const WINDOW_SCALE_BOOST: f64 = 1.5;

#[cfg(target_os = "linux")]
fn gtk_scale_factor() -> f64 {
    ["GTK_SCALE", "GDK_SCALE"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .filter_map(|value| value.parse::<f64>().ok())
        .find(|value| *value > 0.0)
        .unwrap_or(1.0)
}

#[cfg(not(target_os = "linux"))]
fn gtk_scale_factor() -> f64 {
    1.0
}

fn startup_window_size(window: &WebviewWindow) -> (f64, f64) {
    let Some(monitor) = window.current_monitor().ok().flatten() else {
        return (BASELINE_WINDOW_WIDTH, BASELINE_WINDOW_HEIGHT);
    };

    let monitor_size = monitor.size();
    let monitor_scale = monitor.scale_factor().max(1.0);
    let gtk_scale = gtk_scale_factor();

    // Convert to logical pixels, then compensate for explicit GTK scaling.
    let monitor_logical_width = (monitor_size.width as f64 / monitor_scale) / gtk_scale;
    let monitor_logical_height = (monitor_size.height as f64 / monitor_scale) / gtk_scale;

    // Keep 1080p and 4K (at 2x scaling) visually equivalent, while shrinking on small screens.
    let monitor_fit = (monitor_logical_width / BASELINE_MONITOR_WIDTH)
        .min(monitor_logical_height / BASELINE_MONITOR_HEIGHT)
        .clamp(0.6, 1.0);

    let width = (BASELINE_WINDOW_WIDTH * monitor_fit * WINDOW_SCALE_BOOST)
        .round()
        .max(290.0);
    let height = (BASELINE_WINDOW_HEIGHT * monitor_fit * WINDOW_SCALE_BOOST)
        .round()
        .max(220.0);
    (width, height)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init()) // Register the FS plugin
        .setup(|app| {
            println!("Gemini CLI: Backend is running!"); // ADDED LINE
            if let Some(window) = app.get_webview_window("main") {
                let (width, height) = startup_window_size(&window);
                let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
                let _ = window.center();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, quit_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
