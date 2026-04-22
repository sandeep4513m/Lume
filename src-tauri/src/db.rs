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
    pub is_pinned: bool,
    pub model: String,
    pub temperature: f64,
    pub system_prompt: String,
}

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

pub fn init(app_handle: &tauri::AppHandle) -> std::result::Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
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

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
        [],
    )?;

    // Safe migrations — silently ignored if column already exists
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN model TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN temperature REAL NOT NULL DEFAULT 0.7", []);
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''", []);

    // Global app settings — simple key-value store for user preferences
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_session(state: tauri::State<DbState>, title: String, model: String, temperature: f64, system_prompt: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;

    conn.execute(
        "INSERT INTO sessions (id, title, created_at, updated_at, model, temperature, system_prompt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (&id, &title, &now, &now, &model, &temperature, &system_prompt),
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_sessions(state: tauri::State<DbState>) -> Result<Vec<ChatSession>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, updated_at, is_pinned, model, temperature, system_prompt FROM sessions ORDER BY is_pinned DESC, updated_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(ChatSession {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            is_pinned: row.get::<_, i64>(4)? != 0,
            model: row.get::<_, String>(5).unwrap_or_default(),
            temperature: row.get::<_, f64>(6).unwrap_or(0.7),
            system_prompt: row.get::<_, String>(7).unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    for s in iter {
        sessions.push(s.map_err(|e| e.to_string())?);
    }
    
    Ok(sessions)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_session_model(state: tauri::State<DbState>, session_id: String, model: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE sessions SET model = ?1 WHERE id = ?2",
        (&model, &session_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_session_temperature(state: tauri::State<DbState>, session_id: String, temperature: f64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE sessions SET temperature = ?1 WHERE id = ?2",
        (&temperature, &session_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_session_system_prompt(state: tauri::State<DbState>, session_id: String, system_prompt: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE sessions SET system_prompt = ?1 WHERE id = ?2",
        (&system_prompt, &session_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn toggle_pin(state: tauri::State<DbState>, session_id: String) -> Result<bool, String> {
    let conn = state.conn.lock().unwrap();
    let current: i64 = conn.query_row(
        "SELECT is_pinned FROM sessions WHERE id = ?1",
        [&session_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let new_val = if current == 0 { 1i64 } else { 0i64 };
    conn.execute(
        "UPDATE sessions SET is_pinned = ?1 WHERE id = ?2",
        (&new_val, &session_id),
    ).map_err(|e| e.to_string())?;
    Ok(new_val != 0)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_session(state: tauri::State<DbState>, session_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM sessions WHERE id = ?1", [&session_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn save_message(state: tauri::State<DbState>, session_id: String, role: String, content: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;

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

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
pub fn clear_messages(state: tauri::State<DbState>, session_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE session_id = ?1", [&session_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_message(state: tauri::State<DbState>, message_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE id = ?1", [&message_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_messages_after(state: tauri::State<DbState>, session_id: String, timestamp: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE session_id = ?1 AND created_at >= ?2", (&session_id, &timestamp)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn export_chat_markdown(state: tauri::State<DbState>, session_id: String) -> Result<String, String> {
    let conn = state.conn.lock().unwrap();
    
    let title: String = conn.query_row(
        "SELECT title FROM sessions WHERE id = ?1",
        [&session_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;

    let mut md = format!("# {}\n\nExported from Lume\n\n---\n\n", title);
    
    let rows = stmt.query_map([&session_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (role, content) = row.map_err(|e| e.to_string())?;
        if role == "user" {
            md.push_str(&format!("**You:** {}\n\n", content));
        } else {
            md.push_str(&format!("**Lume:** {}\n\n", content));
        }
        md.push_str("---\n\n");
    }
    
    Ok(md)
}

#[derive(Deserialize)]
pub struct ImportMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn import_chat(state: tauri::State<DbState>, title: String, messages: Vec<ImportMessage>) -> Result<String, String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let session_id = uuid::Uuid::new_v4().to_string();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    
    tx.execute(
        "INSERT INTO sessions (id, title, created_at, updated_at, is_pinned) VALUES (?1, ?2, ?3, ?4, 0)",
        (&session_id, &title, &now, &now),
    ).map_err(|e| e.to_string())?;
    
    for (i, msg) in messages.iter().enumerate() {
        let msg_id = uuid::Uuid::new_v4().to_string();
        let ts = now + i as i64;
        tx.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            (&msg_id, &session_id, &msg.role, &msg.content, &ts),
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(session_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_sessions(state: tauri::State<DbState>, session_ids: Vec<String>) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in &session_ids {
        tx.execute("DELETE FROM sessions WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct StorageStats {
    pub session_count: i64,
    pub message_count: i64,
    pub db_size_bytes: u64,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_storage_stats(state: tauri::State<DbState>, app_handle: tauri::AppHandle) -> Result<StorageStats, String> {
    let conn = state.conn.lock().unwrap();
    let session_count: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let message_count: i64 = conn.query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0)).map_err(|e| e.to_string())?;

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("chats.db");
    let db_size_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    Ok(StorageStats {
        session_count,
        message_count,
        db_size_bytes,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn wipe_all_data(state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions", []).map_err(|e| e.to_string())?;
    conn.execute("VACUUM", []).map_err(|e| e.to_string())?;
    Ok(())
}

// ── App Settings (key-value) ────────────────────────────────────────────────

/// Retrieve a single setting by key.
/// Returns `None` if the key has never been set.
#[tauri::command(rename_all = "snake_case")]
pub fn get_setting(state: tauri::State<DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.conn.lock().unwrap();
    let result = conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [&key],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(val)                              => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e)                               => Err(e.to_string()),
    }
}

/// Persist a setting.  Creates the row if absent, updates it if present.
#[tauri::command(rename_all = "snake_case")]
pub fn set_setting(state: tauri::State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (&key, &value),
    ).map_err(|e| e.to_string())?;
    Ok(())
}
