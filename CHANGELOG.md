# Changelog

All notable changes to Lume are documented in this file.

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
