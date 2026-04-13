# Lume

A clean, native desktop chat interface for Ollama, built with Tauri and SvelteKit.

## What's New in v0.7.0 — Model Manager

- **Model Manager** — Open it from the model picker dropdown or the profile menu.
- **Installed tab** — View local models with size, parameter count, and family badge; use or delete models in one click.
- **Discover tab** — Hardware-aware recommendations with Fast, Balanced, and Best suggestions based on detected RAM/VRAM.
- **One-click downloads** — Download models directly in-app with a live progress bar.
- **Hardware detection** — Rust-powered RAM and VRAM detection (NVIDIA via `nvidia-smi`, with RAM-tier fallback).
- **Error handling** — Clear feedback for offline Ollama, interrupted downloads, disk-full conditions, and unknown models.
- **SQLite persistence** — Last-used model is persisted across sessions.
- **Auto-switch flow** — After download completes, the UI switches to Installed and selects the downloaded model.

## Previous versions

### v0.6.0

- Settings panel
- Custom Ollama URL support
- Dark/light mode

### v0.5.0

- Initial release
- Chat with local Ollama models
- Model picker dropdown
- Streaming responses

## Tech Stack

- **Frontend** — SvelteKit + Svelte 5 + TailwindCSS
- **Backend** — Tauri (Rust)
- **Database** — SQLite via rusqlite
- **AI Runtime** — Ollama (local)

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

## Requirements

- [Ollama](https://ollama.ai) installed and running
- Node.js 18+
- Rust toolchain
