## [0.6.0] - 2025-04-13

### Added
- Empty states: Ollama offline, no models installed, new chat welcome screen
- Suggestion chips on new chat (Write, Code, Explain, Analyze)
- Sidebar loading skeletons while sessions fetch
- Smooth fade-in-up animations on messages and sidebar items
- Keyboard shortcuts: Ctrl+N (new chat), Ctrl+/ (focus input), Escape (close menus)

### Improved
- Message bubble design with emerald glow shadow on user messages
- AI message action row now has subtle top border separator
- Error messages now show an icon for better visibility

# Changelog

All notable changes to Lume are documented in this file.

## [0.5.0] — 2026-04-12

### Added
- Settings panel with 5 tabs (Models, Chat, Appearance, Data, About)
- Per-chat model switching
- Temperature slider per chat
- System prompt per chat
- Preset personalities (Coder, Writer, Assistant)
- Pin favourite chats to top
- Export/Import chat history
- Bulk delete chats
- User profile in sidebar
- Lume icon and logo assets

---


## [0.4.0] — 2026-04-11

### Added
- **UI Interactivity Suite (Phase 1):**
  - **Edit User Message**: Inline editing drops subsequent conversation context to fork a new prompt natively with Svelte updates.
  - **Regenerate Response**: Single-click recreation of AI answers dynamically without reloading.
  - **Stop Generation**: Immediate stream halt functionality with an accessible "Stop" button.
  - **Copy to Clipboard Button**: Hover-visible messaging tool.
  - **Thinking Process Component**: Intercepts native model `<think>` blocks and neatly tucks them into a toggleable dropdown interface.
  - **Metadata Analytics**: Displays "Answered in X.Xs" and total token counts below each message.
- **Streaming Preferences**: Headless support via `lume_streaming` local storage identifier for easy toggle between buffer and chunk retrieval. 

### Changed
- SQLite Database upgraded to return explicit UUIDs and timestamps dynamically via API mappings in `db.rs` ensuring robust edit capability.
- Implemented `delete_message` and `delete_messages_after` in the Rust API backend to complement the message branching schema. 

---

## [0.3.0] — 2026-04-11

### Added
- **Real-time AI message streaming** — tokens appear word-by-word as Ollama generates them
- **Streaming UI feedback** — Bouncing dots loading indicator displays until the first token arrives
- Live Markdown rendering during streaming

### Changed
- Refactored `ollama.js` API client to utilize `ReadableStream` instead of buffered responses
- Svelte `$state` reactivity now updates progressively during message stream

---

## [0.2.0] — 2026-04-11

### Added
- **Multi-session chat sidebar** — Create, switch, search, and delete independent conversations
- **Collapsible sidebar** with smooth 300ms animation (icons-only when collapsed)
- **Smart auto-titling** — Session titles auto-generate from first message (35 char truncation)
- **Search bar** to filter through chat sessions in real-time
- **Time-relative timestamps** — "Just now", "2h ago", "Yesterday" in sidebar
- **Delete confirmation** with hover-reveal trash icon per session
- **Active session indicator** — Emerald left-border highlight on selected chat
- **Model indicator** in sidebar footer showing currently selected Ollama model
- **Settings button** placeholder in sidebar footer

### Changed
- **Database schema** — Added `sessions` table with `id`, `title`, `created_at`, `updated_at`
- **Messages table** — Added `session_id` foreign key with `ON DELETE CASCADE`
- **Layout** — Migrated from single-column to sidebar + main content flex layout
- **Header** — Moved model selector, theme toggle, and clear button to main header bar
- **save_message** — Now automatically updates `sessions.updated_at` to bubble active chats to top

### Fixed
- PostCSS configuration crash caused by ES Module / CommonJS conflict (`postcss.config.js` → `postcss.config.cjs`)
- highlight.js CSS import moved from `<script>` to `<style>` block to prevent Vite/PostCSS parse errors
- Tauri v2 IPC argument casing (`session_id` in Rust → `sessionId` in JavaScript)

---

## [0.1.0] — 2026-04-10

### Added
- Initial release of Lume
- Single-session chat interface with Ollama integration
- SQLite persistence for chat history via `rusqlite`
- Markdown rendering with `marked` + syntax highlighting with `highlight.js`
- Dark / Light mode with system preference detection
- Auto-resizing textarea input
- Scroll-to-bottom FAB with unread message badge and bounce animation
- Fedora RPM packaging via `tauri build`
- Professional README and MIT license

---
