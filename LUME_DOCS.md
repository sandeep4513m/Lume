# Lume — Live Documentation
_Generated: April 22, 2026_

## 1. Project Overview
Lume is a high-performance local AI chat client built with Tauri 2, Svelte 5, and Rust. It provides a privacy-first interface for local LLMs via Ollama, featuring real-time streaming, reasoning process visualization, and advanced keyboard mastery.

## 2. Architecture
- **Frontend:** Svelte 5 (Runes) + Tailwind CSS. Single-page application architecture.
- **Desktop Layer:** Tauri 2 (Rust) manages windowing, system resources (RAM monitoring), and IPC.
- **Persistence:** SQLite (rusqlite) for local storage of sessions, messages, and application settings.
- **Inference:** Ollama API integration (fetch) for local model execution.
- **Data Flow:** UI → Svelte Stores → Tauri IPC (Invoke) → Rust Commands → SQLite / System APIs.

## 3. File Map
- `src-tauri/src/main.rs` → Entry point; calls `lume_lib::run()`.
- `src-tauri/src/lib.rs` → Tauri setup, invoke handlers, and RAM status logic.
- `src-tauri/src/db.rs` → SQLite initialization, migrations, and CRUD for chats/messages.
- `src-tauri/src/shortcuts.rs` → Rust handlers for persisting keyboard shortcut customizations.
- `src-tauri/tauri.conf.json` → Application metadata, bundle config, and window settings.
- `src/lib/stores/shortcuts.svelte.ts` → Svelte 5 store for shortcut management and key-event normalization.
- `src/lib/stores/commands.svelte.ts` → Command palette store with fuzzy search scoring.
- `src/lib/stores/governor.svelte.ts` → RAM-aware model load/unload state management.
- `src/lib/config/defaultShortcuts.ts` → Factory defaults for all keyboard shortcuts.
- `src/lib/ollama.js` → API client for Ollama with native streaming reasoning parser.
- `src/routes/+layout.svelte` → Main app layout; initializes stores and global command registry.
- `src/routes/+page.svelte` → Primary chat interface; handles message lifecycle and UI state.
- `src/components/LumeCodex.svelte` → Interactive help drawer and shortcut visualizer.
- `src/components/Markdown.svelte` → Syntax-highlighted markdown renderer for AI responses.
- `src/components/Settings.svelte` → Tabbed configuration interface (Models, Chat, Appearance, etc.).
- `src/components/ThinkingProcess.svelte` → Accordion component for rendering model reasoning tokens.
- `src/components/GovernorNotice.svelte` → Warning UI for high RAM pressure states.

## 4. Tauri Commands
- `get_ram_status() -> RamStatus`
- `unload_model(model_name: String, ollama_url: String) -> ()`
- `create_session(title: String, model: String, temperature: f64, system_prompt: String) -> String`
- `get_sessions() -> Vec<ChatSession>`
- `delete_session(session_id: String) -> ()`
- `save_message(session_id: String, role: String, content: String) -> String`
- `get_messages(session_id: String) -> Vec<ChatMessage>`
- `clear_messages(session_id: String) -> ()`
- `delete_message(message_id: String) -> ()`
- `delete_messages_after(session_id: String, timestamp: i64) -> ()`
- `toggle_pin(session_id: String) -> bool`
- `export_chat_markdown(session_id: String) -> String`
- `import_chat(title: String, messages: Vec<ImportMessage>) -> String`
- `delete_sessions(session_ids: Vec<String>) -> ()`
- `get_storage_stats() -> StorageStats`
- `wipe_all_data() -> ()`
- `set_session_model(session_id: String, model: String) -> ()`
- `set_session_temperature(session_id: String, temperature: f64) -> ()`
- `set_session_system_prompt(session_id: String, system_prompt: String) -> ()`
- `get_setting(key: String) -> Option<String>`
- `set_setting(key: String, value: String) -> ()`
- `get_shortcut_customizations() -> Vec<ShortcutCustomization>`
- `set_shortcut_customization(customization: ShortcutCustomization) -> ()`
- `set_shortcut_customizations_batch(customizations: Vec<ShortcutCustomization>) -> ()`
- `delete_shortcut_customization(shortcut_id: String) -> ()`
- `reset_all_shortcut_customizations() -> ()`

## 5. Svelte Stores
- `shortcutStore`: Reactive registry of all shortcuts; handles keydown listeners and scope switching.
- `commandStore`: Registry for command palette; manages fuzzy search and execution of UI actions.
- `governor`: Monitors RAM status; manages unload/load decisions for Ollama models.

## 6. Svelte Components
- `+layout.svelte`: Renders `CommandPalette` and main `children` slot.
- `+page.svelte`: Renders sidebar, chat header, message list, and chat input.
- `LumeCodex.svelte`: Renders an interactive help drawer with shortcut highlighting.
- `Markdown.svelte`: Renders sanitized HTML from markdown using `marked` and `DOMPurify`.
- `Settings.svelte`: Renders a modal with 6 tabs for application configuration.
- `ThinkingProcess.svelte`: Renders a collapsible block for reasoning tokens (`<think>` tags).

## 7. Database Schema
- `sessions`: `id (TEXT)`, `title (TEXT)`, `created_at (INTEGER)`, `updated_at (INTEGER)`, `is_pinned (INTEGER)`, `model (TEXT)`, `temperature (REAL)`, `system_prompt (TEXT)`
- `messages`: `id (TEXT)`, `session_id (TEXT)`, `role (TEXT)`, `content (TEXT)`, `created_at (INTEGER)`
- `app_settings`: `key (TEXT)`, `value (TEXT)` (stores settings and `shortcut:<id>` blobs)

## 8. Keyboard Shortcuts
- `global:command_palette` → `MOD+K`
- `global:new_chat` → `MOD+N`
- `global:toggle_sidebar` → `MOD+B`
- `global:toggle_settings` → `MOD+,`
- `chat:send_message` → `Enter`
- `chat:regenerate` → `MOD+Shift+R`
- `chat:stop_generation` → `MOD+Shift+S`
- `chat:focus_input` → `MOD+L`

## 9. Intelligence Governor
- `WARN_FREE_MB`: 1024MB (Triggers warning on model switch)
- `CRITICAL_FREE_MB`: 512MB (Triggers critical alert on model switch if swap > 80%)
- `BG_CRITICAL_FREE_MB`: 300MB (Triggers background alert while model is loaded)
- `Logic`: On model switch, if RAM is below thresholds, prompts user to unload current model before loading the next.

## 10. Known Bugs
- `src-tauri/src/shortcuts.rs`: Multiple `lock().unwrap()` calls on DB state (L37, L71, L91, L115, L127).
- `src-tauri/src/lib.rs`: `expect("Failed to initialize database")` (L77) and `expect("error while running tauri application")` (L114).
- `src-tauri/src/db.rs`: `expect()` on app data dir resolution (L32, L33); multiple `lock().unwrap()` (L90, L104, etc.); `unwrap()` on duration since epoch (L92, L187, L298).
- `src/lib/ollama.js`: `JSON.parse` inside try-catch but `console.warn` skips malformed lines (L146).

## 11. Dependencies
- **Rust:** `tauri (2)`, `rusqlite (0.39.0)`, `sysinfo (0.30)`, `reqwest (0.13)`, `serde (1)`, `uuid (1.23.0)`
- **Node.js:** `svelte (5)`, `@tauri-apps/api (2)`, `tailwindcss (3.4.19)`, `marked (18.0.0)`, `dompurify (3.3.3)`, `highlight.js (11.11.1)`

## 12. Open Questions
- The `is_pinned` column in `sessions` uses `INTEGER` (0/1) but is mapped to `bool` in Rust; ensure consistency across all queries.
- `shortcuts.rs` stores customizations as JSON blobs in `app_settings` instead of a dedicated table; evaluate if this scales for many shortcuts.
- `governor.svelte.ts` ignores the `pressure` field calculated on the Rust side and re-calculates it in TypeScript.
