mod db;
use tauri::Manager;
use tauri::Emitter;
use serde::{Serialize, Deserialize};
use futures_util::StreamExt;
use std::collections::HashSet;
use tokio::sync::Mutex;

#[derive(Serialize)]
pub struct HardwareInfo {
    pub total_ram_mb: u64,
    pub free_ram_mb: u64,
    pub gpu_name: String,
    pub vram_mb: u64,
}

#[derive(Deserialize, Serialize, Clone)]
struct OllamaChunk {
    response: Option<String>,
    done: bool,
}

struct StreamCancelState {
    active: Mutex<HashSet<String>>,
    cancelled: Mutex<HashSet<String>>,
}

#[tauri::command]
fn get_hardware_info() -> HardwareInfo {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    let total_ram_mb = sys.total_memory() / 1024 / 1024;
    let free_ram_mb = sys.available_memory() / 1024 / 1024;
    let (gpu_name, vram_mb) = detect_gpu();
    HardwareInfo { total_ram_mb, free_ram_mb, gpu_name, vram_mb }
}

fn detect_gpu() -> (String, u64) {
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
    ("Integrated / Unknown".to_string(), 0)
}

#[tauri::command]
fn save_preference(state: tauri::State<'_, db::DbState>, key: String, value: String) -> Result<(), String> {
    db::set_pref(state, key, value)
}

#[tauri::command]
fn load_preference(state: tauri::State<'_, db::DbState>, key: String) -> Result<Option<String>, String> {
    db::get_pref(state, key)
}

#[tauri::command]
async fn proxy_ollama(
    base_url: String,
    endpoint: String,
    method: Option<String>,
    body: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e: reqwest::Error| e.to_string())?;

    let base = base_url.trim();
    if base.is_empty() {
        return Err("base_url is required".to_string());
    }
    let base = base.trim_end_matches('/');
    let ep = if endpoint.starts_with('/') {
        endpoint
    } else {
        format!("/{}", endpoint)
    };
    let url = format!("{}{}", base, ep);
    let method = method.unwrap_or("POST".to_string());
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        _ => client.post(&url),
    }
    .header("Content-Type", "application/json");

    if !body.is_empty() {
        let b = body;
        req = req.body(b);
    }

    let response = req.send()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    let status = response.status();
    let text = response.text()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Ollama error {}: {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
async fn ollama_stream(
    window: tauri::Window,
    cancel_state: tauri::State<'_, StreamCancelState>,
    stream_id: String,
    base_url: String,
    model: String,
    prompt: String,
    system: Option<String>,
) -> Result<(), String> {
    if stream_id.trim().is_empty() {
        return Err("stream_id is required".to_string());
    }

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": true,
        "system": system,
    });

    let base = base_url.trim();
    if base.is_empty() {
        return Err("base_url is required".to_string());
    }
    let url = format!("{}/api/generate", base.trim_end_matches('/'));

    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(serde_json::to_string(&body).map_err(|e| e.to_string())?)
        .send()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        let text = response
            .text()
            .await
            .map_err(|e: reqwest::Error| e.to_string())?;
        return Err(format!("Ollama error {}: {}", status, text));
    }

    {
        let mut active = cancel_state.active.lock().await;
        active.insert(stream_id.clone());
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut saw_done = false;
    let mut result: Result<(), String> = Ok(());

    while let Some(item) = stream.next().await {
        let is_cancelled = {
            let cancelled = cancel_state.cancelled.lock().await;
            cancelled.contains(&stream_id)
        };
        if is_cancelled {
            result = Err("Aborted".to_string());
            break;
        }

        let bytes = match item {
            Ok(bytes) => bytes,
            Err(e) => {
                result = Err(e.to_string());
                break;
            }
        };
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(newline_idx) = buffer.find('\n') {
            let line = buffer[..newline_idx].trim().to_string();
            buffer = buffer[newline_idx + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            let chunk: OllamaChunk = match serde_json::from_str(&line) {
                Ok(chunk) => chunk,
                Err(_) => continue,
            };

            if let Some(text) = chunk.response {
                if let Err(e) = window.emit("ollama_response", text) {
                    result = Err(e.to_string());
                    break;
                }
            }
            if chunk.done {
                if let Err(e) = window.emit("ollama_done", ()) {
                    result = Err(e.to_string());
                }
                saw_done = true;
                break;
            }
        }

        if saw_done || result.is_err() {
            break;
        }
    }

    let tail = buffer.trim();
    if result.is_ok() && !tail.is_empty() && !saw_done {
        if let Ok(chunk) = serde_json::from_str::<OllamaChunk>(tail) {
            if let Some(text) = chunk.response {
                if let Err(e) = window.emit("ollama_response", text) {
                    result = Err(e.to_string());
                }
            }
            if result.is_ok() && chunk.done {
                if let Err(e) = window.emit("ollama_done", ()) {
                    result = Err(e.to_string());
                }
                saw_done = true;
            }
        }
    }

    if result.is_ok() && !saw_done {
        result = Err("Ollama stream ended without completion signal".to_string());
    }

    {
        let mut active = cancel_state.active.lock().await;
        active.remove(&stream_id);
    }
    {
        let mut cancelled = cancel_state.cancelled.lock().await;
        cancelled.remove(&stream_id);
    }

    result
}

#[tauri::command]
async fn cancel_ollama_stream(
    state: tauri::State<'_, StreamCancelState>,
    stream_id: String,
) -> Result<(), String> {
    if stream_id.trim().is_empty() {
        return Err("stream_id is required".to_string());
    }
    let is_active = {
        let active = state.active.lock().await;
        active.contains(&stream_id)
    };
    if !is_active {
        return Err("stream_id is not active".to_string());
    }
    let mut cancelled = state.cancelled.lock().await;
    cancelled.insert(stream_id);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::init(app.handle()).expect("Failed to initialize database");
            app.manage(db::DbState {
                conn: std::sync::Mutex::new(conn),
            });
            app.manage(StreamCancelState {
                active: Mutex::new(HashSet::new()),
                cancelled: Mutex::new(HashSet::new()),
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
            db::get_storage_stats,
            db::wipe_all_data,
            db::set_session_model,
            db::get_setting,
            db::set_setting,
            get_hardware_info,
            save_preference,
            load_preference,
            proxy_ollama,
            ollama_stream,
            cancel_ollama_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
