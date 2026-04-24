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

#[derive(serde::Serialize)]
pub struct LoadedModel {
    pub name: String,
    pub size_vram: u64,
    pub size: u64,
    pub expires_at: String,
}

#[derive(serde::Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub size: u64,
    pub ram_estimate_mb: u64,
}

#[derive(serde::Serialize)]
pub struct HardwareTier {
    pub total_ram_mb: u64,
    pub cpu_count: usize,
    pub tier: u8,
    pub tier_label: String,
    pub max_recommended_params_b: u8,
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

#[tauri::command]
async fn get_loaded_models(ollama_url: String) -> Result<Vec<LoadedModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/ps", ollama_url);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    let models = response["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|model| {
            Some(LoadedModel {
                name: model["name"].as_str()?.to_string(),
                size_vram: model["size_vram"].as_u64().unwrap_or(0),
                size: model["size"].as_u64().unwrap_or(0),
                expires_at: model["expires_at"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect();

    Ok(models)
}

#[tauri::command]
async fn get_model_list_with_estimates(ollama_url: String) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/tags", ollama_url);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    let models = response["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|model| {
            let size = model["size"].as_u64().unwrap_or(0);
            let ram_estimate_mb = (size / 1024 / 1024) * 115 / 100;
            Some(ModelInfo {
                name: model["name"].as_str()?.to_string(),
                size,
                ram_estimate_mb,
            })
        })
        .collect();

    Ok(models)
}

#[tauri::command]
fn get_hardware_tier() -> HardwareTier {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_mb = sys.total_memory() / 1024 / 1024;
    let cpu_count = sys.cpus().len();

    let (tier, tier_label, max_recommended_params_b) = if total_ram_mb >= 32768 {
        (1, "Performance", 70)
    } else if total_ram_mb >= 16384 {
        (2, "Balanced", 34)
    } else if total_ram_mb >= 8192 {
        (3, "Standard", 13)
    } else {
        (4, "Minimal", 7)
    };

    HardwareTier {
        total_ram_mb,
        cpu_count,
        tier,
        tier_label: tier_label.to_string(),
        max_recommended_params_b,
    }
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
            db::rename_session,
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
            unload_model,
            get_loaded_models,
            get_model_list_with_estimates,
            get_hardware_tier,
        ])
        // The generated context from tauri-build
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
