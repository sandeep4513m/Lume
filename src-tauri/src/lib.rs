mod db;
use tauri::Manager; // <- Added this import!

#[derive(serde::Serialize)]
pub struct HardwareInfo {
    pub total_ram_mb: u64,
    pub free_ram_mb: u64,
    pub gpu_name: String,
    pub vram_mb: u64,
}

#[tauri::command]
fn get_hardware_info() -> HardwareInfo {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_mb = sys.total_memory() / 1024 / 1024;
    let free_ram_mb = sys.available_memory() / 1024 / 1024;

    // VRAM detection via nvidia-smi (works on Linux + Windows with NVIDIA)
    let (gpu_name, vram_mb) = detect_gpu();

    HardwareInfo { total_ram_mb, free_ram_mb, gpu_name, vram_mb }
}

fn detect_gpu() -> (String, u64) {
    // Try nvidia-smi first
    if let Ok(output) = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            let line = s.lines().next().unwrap_or("").trim();
            let parts: Vec<&str> = line.splitn(2, ',').collect();
            if parts.len() == 2 {
                let name = parts[0].trim().to_string();
                let vram = parts[1].trim().parse::<u64>().unwrap_or(0);
                return (name, vram);
            }
        }
    }
    // Fallback: no discrete GPU detected
    ("Integrated / Unknown".to_string(), 0)
}

#[tauri::command]
fn save_preference(key: String, value: String) -> Result<(), String> {
    db::set_pref(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_preference(key: String) -> Result<Option<String>, String> {
    db::get_pref(&key).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    db::init_db().expect("Failed to initialise database");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize SQLite DB and store it in Tauri's managed state
            let conn = db::init(app.handle()).expect("Failed to initialize database");
            app.manage(db::DbState {
                conn: std::sync::Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::create_session,
            db::get_sessions,
            db::delete_session,
            db::save_message,
            db::get_messages,
            db::clear_messages,
            db::delete_message,
            db::delete_messages_after,
            db::toggle_pin,
            db::export_chat_markdown,
            db::import_chat,
            db::delete_sessions,
            db::get_storage_stats,
            db::wipe_all_data,
            db::set_session_model,
            db::set_session_temperature,
            db::set_session_system_prompt,
            db::get_setting,
            db::set_setting,
            get_hardware_info, // ADD THIS LINE
            save_preference,
            load_preference
        ])
        // The generated context from tauri-build
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
