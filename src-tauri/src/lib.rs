mod db;
mod shortcuts;
use sysinfo::System;
use tauri::Manager; // <- Added this import!

#[derive(serde::Serialize)]
pub struct RamStatus {
    pub total_mb: u64,
    pub used_mb: u64,
    pub free_mb: u64,
    pub swap_total_mb: u64,
    pub swap_used_mb: u64,
    pub swap_free_mb: u64,
    pub pressure: String, // "ok" | "warn" | "critical"
}

#[tauri::command]
fn get_ram_status() -> RamStatus {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_mb   = sys.total_memory() / 1024 / 1024;
    let used_mb    = sys.used_memory()  / 1024 / 1024;
    let free_mb    = total_mb.saturating_sub(used_mb);
    let swap_total = sys.total_swap()   / 1024 / 1024;
    let swap_used  = sys.used_swap()    / 1024 / 1024;
    let swap_free  = swap_total.saturating_sub(swap_used);

    let pressure = if swap_used > 256 {
        "critical".to_string()
    } else if free_mb < 1024 {
        "warn".to_string()
    } else {
        "ok".to_string()
    };

    RamStatus {
        total_mb,
        used_mb,
        free_mb,
        swap_total_mb: swap_total,
        swap_used_mb:  swap_used,
        swap_free_mb:  swap_free,
        pressure,
    }
}

#[tauri::command]
async fn unload_model(model_name: String, ollama_url: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/api/generate", ollama_url);

    let body = serde_json::json!({
        "model": model_name,
        "keep_alive": 0
    });

    client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize SQLite DB and store it in Tauri's managed state
            let conn = db::init(app.handle())?;
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
            // Keyboard shortcut management
            shortcuts::get_shortcut_customizations,
            shortcuts::set_shortcut_customization,
            shortcuts::set_shortcut_customizations_batch,
            shortcuts::delete_shortcut_customization,
            shortcuts::reset_all_shortcut_customizations,
            get_ram_status,
            unload_model
        ])
        // The generated context from tauri-build
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
