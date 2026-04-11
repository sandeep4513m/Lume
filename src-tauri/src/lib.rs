mod db;
use tauri::Manager; // <- Added this import!

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            db::delete_messages_after
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
