# 🚀 Lume – Local AI Desktop Client

**Lume** is a high-performance, locally-first AI desktop chat application designed specifically for Linux. Built to provide a pixel-perfect, clean, and modern interface (inspired by the official Ollama Windows client), Lume acts as a lightweight native frontend for your local Ollama models. 

It runs blisteringly fast on low-end hardware, ensures complete offline privacy, and packages massive power into an incredibly small footprint.

---

## ✨ Features
- **Zero-Latency Conversations**: Connects directly to local Ollama (`localhost:11434`) for offline inference.
- **Deep Reactivity UI**: Built with Svelte 5 for a frictionless, ultra-responsive chat experience.
- **Persistent Chat History**: Fast, local SQLite backend ensures your conversations are saved securely on your machine.
- **Futuristic Aesthetics**: Glassmorphism elements, native Dark/Light mode detection, and responsive message bubbles.
- **Developer Grade**: Full Markdown rendering and dynamic syntax highlighting for generated code.

## 📸 Screenshots
*Screenshots coming soon*

## 🛠️ Tech Stack
- **Frontend**: Svelte 5, Tailwind CSS v3
- **Backend / IPC**: Tauri v2 (Rust)
- **Database**: SQLite (`rusqlite`)
- **Inference**: Ollama REST API

## 💻 Hardware Requirements
Lume was intentionally architected from the ground up to sip resources. It is validated for low-end hardware:
- **Processor**: Intel Core i5 (e.g., i5-10310U) or equivalent
- **Memory**: 8GB RAM recommended (Application idle usage is typically **< 20MB RAM**)
- **Disk Space**: ~10 MB for the Lume binary (Model weights via Ollama require additional space)
- **GPU**: Not required for Lume UI (Ollama manages native GPU acceleration automatically)

## 📦 Installation (Fedora / RPM)
If you are on an RPM-based distribution (like Fedora), you can install the pre-compiled native package:

```bash
sudo dnf install ./lume-0.1.0-1.x86_64.rpm
```
After installation, simply launch `lume` from your application menu.

*Note: Ensure [Ollama](https://ollama.com/) is installed and running (`systemctl start ollama`) before opening Lume.*

## 🔨 Building from Source
Prerequisites: `Node.js`, `Rust (cargo)`, and Tauri dependencies (`webkit2gtk4.1-devel`, etc).

1. Clone the repository:
```bash
git clone https://github.com/Sandeep87p/Lume.git
cd lume
```
2. Install npm dependencies:
```bash
npm install
```
3. Run in Development Mode:
```bash
npm run tauri dev
```
4. Compile Release Bundle (RPM/AppImage):
```bash
npm run tauri build
```

## 📄 License
This project is licensed under the **MIT License**. See the LICENSE file for details.
