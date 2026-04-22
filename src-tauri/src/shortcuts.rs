// ── shortcuts.rs — Tauri command handlers for keyboard-shortcut persistence ──
//
// Shortcuts are stored in the existing `app_settings` key-value table.
// Each user customisation is a single JSON blob keyed as "shortcut:<id>".
// This avoids adding a new table migration while staying fully normalised
// at the application level.

use serde::{Deserialize, Serialize};

use crate::db::DbState;

// ── Data Transfer Types ─────────────────────────────────────────────────────

/// Mirrors the TS `ShortcutCustomization` type.
#[derive(Debug, Serialize, Deserialize)]
pub struct ShortcutCustomization {
    pub id: String,
    pub current_keys: String, // JSON array of key combos, e.g. "[\"Ctrl+K\"]"
    pub enabled: bool,
}

// ── Key Helpers ─────────────────────────────────────────────────────────────

/// Derive the `app_settings.key` from a shortcut id.
fn settings_key(shortcut_id: &str) -> String {
    format!("shortcut:{}", shortcut_id)
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Retrieve ALL user-customised shortcuts (returns only rows that differ
/// from defaults — the frontend merges these on top of the factory map).
#[tauri::command(rename_all = "snake_case")]
pub fn get_shortcut_customizations(
    state: tauri::State<DbState>,
) -> Result<Vec<ShortcutCustomization>, String> {
    let conn = state.conn.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings WHERE key LIKE 'shortcut:%'")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let _key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok(value)
        })
        .map_err(|e| e.to_string())?;

    let mut result: Vec<ShortcutCustomization> = Vec::new();
    for row in rows {
        let json_str = row.map_err(|e| e.to_string())?;
        match serde_json::from_str::<ShortcutCustomization>(&json_str) {
            Ok(sc) => result.push(sc),
            Err(e) => {
                eprintln!("[shortcuts] skipping malformed row: {}", e);
            }
        }
    }

    Ok(result)
}

/// Persist a single shortcut customisation (upsert).
#[tauri::command(rename_all = "snake_case")]
pub fn set_shortcut_customization(
    state: tauri::State<DbState>,
    customization: ShortcutCustomization,
) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    let key = settings_key(&customization.id);
    let value = serde_json::to_string(&customization).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (&key, &value),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Persist multiple customisations inside a single transaction.
#[tauri::command(rename_all = "snake_case")]
pub fn set_shortcut_customizations_batch(
    state: tauri::State<DbState>,
    customizations: Vec<ShortcutCustomization>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for c in &customizations {
        let key = settings_key(&c.id);
        let value = serde_json::to_string(c).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (&key, &value),
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove a single customisation (revert to default).
#[tauri::command(rename_all = "snake_case")]
pub fn delete_shortcut_customization(
    state: tauri::State<DbState>,
    shortcut_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    let key = settings_key(&shortcut_id);
    conn.execute("DELETE FROM app_settings WHERE key = ?1", [&key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Wipe all customisations (full reset to factory defaults).
#[tauri::command(rename_all = "snake_case")]
pub fn reset_all_shortcut_customizations(
    state: tauri::State<DbState>,
) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM app_settings WHERE key LIKE 'shortcut:%'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
