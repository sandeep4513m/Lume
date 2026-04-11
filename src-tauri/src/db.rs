use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[derive(Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

pub fn init(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let app_dir = app_handle.path().app_data_dir().expect("Failed to resolve app data dir");
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    let db_path = app_dir.join("chats.db");

    let conn = Connection::open(db_path)?;

    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    // Create sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // Create upgraded messages table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    Ok(conn)
}

#[tauri::command]
pub fn create_session(state: tauri::State<DbState>, title: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    conn.execute(
        "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        (&id, &title, &now, &now),
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn get_sessions(state: tauri::State<DbState>) -> Result<Vec<ChatSession>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(ChatSession {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    for s in iter {
        sessions.push(s.map_err(|e| e.to_string())?);
    }
    
    Ok(sessions)
}

#[tauri::command]
pub fn delete_session(state: tauri::State<DbState>, session_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM sessions WHERE id = ?1", [&session_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_message(state: tauri::State<DbState>, session_id: String, role: String, content: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

    // Check if it's the first message to dynamically update the session title!
    let count: i32 = conn.query_row("SELECT COUNT(*) FROM messages WHERE session_id = ?1", [&session_id], |row| row.get(0)).unwrap_or(1);
    if count == 0 && role == "user" {
        let first_line = content.lines().next().unwrap_or("New Chat");
        let mut title: String = first_line.chars().take(35).collect();
        if first_line.chars().count() > 35 { title.push_str("..."); }
        conn.execute("UPDATE sessions SET title = ?1 WHERE id = ?2", [&title, &session_id]).ok();
    }

    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, &session_id, &role, &content, &now),
    ).map_err(|e| e.to_string())?;

    // Update the session's updated_at timestamp so it jumps to top
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        (&now, &session_id),
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn get_messages(state: tauri::State<DbState>, session_id: String) -> Result<Vec<ChatMessage>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, role, content, created_at FROM messages WHERE session_id = ?1 ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    
    let msg_iter = stmt.query_map([&session_id], |row| {
        Ok(ChatMessage {
            id: row.get(0)?,
            role: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for msg in msg_iter {
        messages.push(msg.map_err(|e| e.to_string())?);
    }
    
    Ok(messages)
}

#[tauri::command]
pub fn clear_messages(state: tauri::State<DbState>, session_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE session_id = ?1", [&session_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_message(state: tauri::State<DbState>, message_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE id = ?1", [&message_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_messages_after(state: tauri::State<DbState>, session_id: String, timestamp: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE session_id = ?1 AND created_at >= ?2", (&session_id, &timestamp)).map_err(|e| e.to_string())?;
    Ok(())
}
