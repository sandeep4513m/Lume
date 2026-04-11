use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub fn init(app_handle: &tauri::AppHandle) -> Result<Connection> {
    // Resolves to ~/.local/share/com.lume.ai/chats.db on Fedora
    let app_dir = app_handle.path().app_data_dir().expect("Failed to resolve app data dir");
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    let db_path = app_dir.join("chats.db");

    let conn = Connection::open(db_path)?;

    // Create messages table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}

#[tauri::command]
pub fn save_message(state: tauri::State<DbState>, role: String, content: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs() as i64;

    conn.execute(
        "INSERT INTO messages (id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)",
        (&id, &role, &content, &created_at),
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn get_messages(state: tauri::State<DbState>) -> Result<Vec<ChatMessage>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT role, content FROM messages ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    
    let msg_iter = stmt.query_map([], |row| {
        Ok(ChatMessage {
            role: row.get(0)?,
            content: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for msg in msg_iter {
        messages.push(msg.map_err(|e| e.to_string())?);
    }
    
    Ok(messages)
}

#[tauri::command]
pub fn clear_messages(state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages", []).map_err(|e| e.to_string())?;
    Ok(())
}
