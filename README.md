# Lume — Local AI Desktop Client

A fast, private AI chat client for Linux. Talks to [Ollama](https://ollama.com/) running on your machine. No cloud. No telemetry. No Electron.

![Platform: Linux](https://img.shields.io/badge/Platform-Linux-blue)
![Version](https://img.shields.io/badge/Version-0.5.5--beta-green)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

---

## What it does

- Chat with any Ollama model installed on your system
- Full streaming output — tokens appear as they generate
- Multiple independent chat sessions with persistent SQLite history
- Markdown + syntax highlighting in responses
- Dark/light mode, collapsible sidebar, keyboard shortcuts
- Intelligence Governor — warns before loading a model that will OOM your system
- Offline detection — banner appears within 5 seconds if Ollama goes down

## What it doesn't do

- No cloud. No accounts. No API keys.
- No GPU required (Ollama handles that separately)
- No Electron. WebKit via Tauri. ~5 MB binary, <20 MB idle RAM.

---

## Requirements

| | Minimum |
|---|---|
| **OS** | Linux (x86_64) — tested on Fedora 40, Ubuntu 24.04 |
| **RAM** | 8 GB system RAM (Lume uses <20 MB — the model uses the rest) |
| **Disk** | 10 MB for Lume + space for Ollama model weights |
| **Ollama** | Must be installed and running before launching Lume |

**RAM by model size (rough guide):**
| Model | RAM needed |
|---|---|
| 1B–3B params | 2–4 GB |
| 7B params | 6–8 GB |
| 13B params | 10–14 GB |
| 70B params | 40+ GB |

---

## Install Ollama first

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve          # start the server
ollama pull llama3.2  # download a model
```

---

## Install Lume

### AppImage (any distro)
```bash
chmod +x lume_0.5.5-beta_amd64.AppImage
./lume_0.5.5-beta_amd64.AppImage
```

### Debian/Ubuntu (.deb)
```bash
sudo dpkg -i lume_0.5.5-beta_amd64.deb
```

### Fedora/RHEL (.rpm)
```bash
sudo dnf install ./lume-0.5.5-beta-1.x86_64.rpm
```

### Arch Linux (AUR — community)
```bash
# AUR package coming soon
```

---

## Build from source

**Dependencies:**
```bash
# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel pango-devel nodejs rust cargo

# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libssl-dev curl wget file \
  libappindicator3-dev librsvg2-dev libpango1.0-dev nodejs cargo
```

**Build:**
```bash
git clone https://github.com/sandeep4513m/Lume.git
cd Lume
npm install
npm run tauri dev             # dev mode with hot-reload
NO_STRIP=true npm run tauri build   # production build (.deb .rpm .AppImage)
```

---

## Troubleshooting

**Banner says "Ollama is offline"**
```bash
ollama serve
# or if using systemd:
systemctl start ollama
systemctl enable ollama  # auto-start on boot
```

**No models in the dropdown**
```bash
ollama list              # check what's installed
ollama pull llama3.2     # pull a model
```

**App won't start / blank screen**
- Lume requires Ollama to be reachable at `http://localhost:11434`
- Custom Ollama URL can be set in Settings → Models

**High RAM usage / system lag**
- Open the System Health panel (⋯ menu → System Health)
- The Intelligence Governor will warn you before loading a model that exceeds available RAM
- Unload the current model before switching to a large one

**Build fails on Ubuntu**
```bash
# Make sure webkit2gtk 4.1 is installed, not 4.0
sudo apt install libwebkit2gtk-4.1-dev
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Tauri v2 (Rust) |
| Frontend | Svelte 5 |
| Styling | Tailwind CSS v3 |
| Database | SQLite via rusqlite |
| Inference | Ollama REST API |

---

## License

MIT. See [LICENSE](LICENSE).