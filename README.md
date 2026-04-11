# 🚀 Lume — Local AI Desktop Client

**Lume** is a high-performance, privacy-first AI desktop chat application for Linux. It provides a clean, modern interface for your local [Ollama](https://ollama.com/) models — no cloud, no telemetry, no compromise.

Built with Tauri v2, Svelte 5, and Rust, Lume runs blisteringly fast on low-end hardware while delivering a premium user experience that rivals ChatGPT and Claude's desktop apps.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
![Platform: Linux](https://img.shields.io/badge/Platform-Linux-blue)
![Version](https://img.shields.io/badge/Version-0.3.0-green)

---

## ✨ Features

### Core
- **Zero-Latency Conversations** — Connects directly to Ollama on `localhost:11434` for fully offline inference
- **Real-Time Streaming** — Watch tokens appear word-by-word as the CPU/GPU generates them
- **Multi-Session Chat** — Create, switch between, search, and delete independent chat sessions
- **Persistent History** — SQLite backend with foreign-key cascading ensures conversations survive restarts
- **Model Selection** — Switch between any installed Ollama model on the fly

### Interface
- **Collapsible Sidebar** — Premium sidebar with session list, search bar, and smooth 300ms collapse animation
- **Smart Titles** — Session titles auto-generate from your first message (truncated to 35 chars)
- **Time-Relative Stamps** — Sidebar shows "Just now", "2h ago", "Yesterday" etc.
- **Dark / Light Mode** — Native system-preference detection with manual toggle
- **Markdown & Syntax Highlighting** — Full GFM rendering with `highlight.js` code blocks
- **Scroll-to-Bottom FAB** — Floating action button with unread badge and bounce animation
- **Auto-Resizing Input** — Textarea grows with your message, up to 200px

### Performance
- **~5 MB** binary size
- **< 0.5s** startup time
- **< 20 MB** idle RAM usage
- **No Electron** — Native WebKit via Tauri

## 📸 Screenshots
*Screenshots coming soon*

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Tauri v2](https://tauri.app/) (Rust backend) |
| **Frontend** | [Svelte 5](https://svelte.dev/) with `$state` / `$derived` reactivity |
| **Styling** | [Tailwind CSS v3](https://tailwindcss.com/) + `@tailwindcss/typography` |
| **Database** | SQLite via [`rusqlite`](https://github.com/rusqlite/rusqlite) |
| **Markdown** | [`marked`](https://marked.js.org/) + [`marked-highlight`](https://github.com/markedjs/marked-highlight) + [`DOMPurify`](https://github.com/cure53/DOMPurify) |
| **Syntax** | [`highlight.js`](https://highlightjs.org/) (github-dark-dimmed theme) |
| **Inference** | [Ollama](https://ollama.com/) REST API |

---

## 💻 System Requirements

| Resource | Minimum |
|----------|---------|
| **OS** | Fedora 40+ / any RPM-based Linux distro |
| **CPU** | Intel Core i5 or equivalent |
| **RAM** | 8 GB (Lume itself uses < 20 MB) |
| **Disk** | ~10 MB for Lume + Ollama model weights |
| **GPU** | Not required (Ollama handles GPU acceleration) |

---

## 📦 Installation

### Pre-built RPM (Fedora)
```bash
sudo dnf install ./lume-0.3.0-1.x86_64.rpm
```

### From Source
**Prerequisites:** Node.js 18+, Rust 1.70+, and Tauri system dependencies:
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel pango-devel
```

**Build steps:**
```bash
git clone https://github.com/sandeep4513m/Lume.git
cd Lume
npm install
npm run tauri dev      # Development mode with hot-reload
npm run tauri build    # Production RPM bundle
```

> **Note:** Ensure Ollama is installed and running before launching Lume:
> ```bash
> systemctl start ollama
> ```

---

## 🗃️ Project Structure
```
lume/
├── src/                    # Svelte frontend
│   ├── routes/+page.svelte # Main chat + sidebar UI
│   ├── components/         # Markdown renderer
│   └── lib/ollama.js       # Ollama API client
├── src-tauri/              # Rust backend
│   ├── src/db.rs           # SQLite schema + Tauri commands
│   └── src/lib.rs          # App bootstrap + command registration
├── package.json
└── README.md
```

---

## 🤝 Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License
This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with 💚 using <a href="https://tauri.app">Tauri</a> + <a href="https://svelte.dev">Svelte</a> + <a href="https://ollama.com">Ollama</a>
</p>
