<script>
  import { onMount, tick, untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { shortcutStore } from "$lib/stores/shortcuts.svelte";
  import { fetchModels, sendMessage, extractThink } from "$lib/ollama.js";
  import Markdown from "../components/Markdown.svelte";
  import Settings from "../components/Settings.svelte";
  import LumeCodex from "../components/LumeCodex.svelte";
  import ThinkingProcess from "../components/ThinkingProcess.svelte";
  import lumeFireLogo from "$lib/assets/lume-icon.png";
  import GovernorNotice from "../components/GovernorNotice.svelte";
  import GovernorPanel from "../components/GovernorPanel.svelte";
  import ModelInfoCard from "../components/ModelInfoCard.svelte";
  import MessageBubble from "../components/MessageBubble.svelte";
  import ChatInput from "../components/ChatInput.svelte";
  import Sidebar from "../components/Sidebar.svelte";
  import { governor } from "$lib/stores/governor.svelte";

  /** @type {any[]} */
  let models = $state([]);
  let ollamaStatus = $state(true);
  let selectedModel = $state("");
  let selectedTemperature = $state(0.7);
  let systemPrompt = $state("");
  let prompt = $state("");
  /** @type {any[]} */
  let messages = $state([]);
  let isLoading = $state(false);
  let errorMessage = $state("");
  let copiedIndex = $state(-1);

  /** @type {AbortController | null} */
  let currentAbortController = $state(null);
  let isStreamingEnabled = $state(true);
  let isThinkingEnabled = $state(true);
  let showTokenCounter = $state(true);
  let showResponseTime = $state(true);
  let enterToSend = $state(true);

  // Sidebar Multi-Session State
  /** @type {any[]} */
  let sessions = $state([]);
  let currentSessionId = $state("");
  let isSidebarCollapsed = $state(false);
  let isModelMenuOpen = $state(false);
  let searchQuery = $state("");
  let hasUnread = $state(false);
  /** @type {string | null} */
  let activeDropdown = $state(null);
  /** @type {string | null} */
  let editingSessionId = $state(null);
  let editingSessionTitle = $state("");

  // ── User Profile State ────────────────────────────────────────
  let userName = $state(localStorage.getItem("lume_user_name") || "User");
  let userAvatarColor = $state(localStorage.getItem("lume_user_avatar_color") || "#10b981");
  let isUserMenuOpen = $state(false);
  let isHeaderMenuOpen = $state(false);
  let isGovernorOpen = $state(false);
  let isCodexOpen = $state(false);
  let userInitials = $derived(
    userName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((/** @type {string} */ w) => w[0].toUpperCase())
      .slice(0, 2)
      .join(""),
  );



  /** @param {string} model */
  async function handleModelChange(model) {
    const decision = await governor.checkSwitch(model);
    if (decision.type === "allow") {
      selectedModel = model;
    }
    // if warn or critical, governor.pendingDecision is set → GovernorNotice renders
  }

  // Bulk select
  let isBulkSelectMode = $state(false);
  /** @type {Set<string>} */
  let selectedSessionIds = $state(new Set());

  let textareaRef = $state();
  let chatContainerRef = $state();
  let showScrollButton = $state(false);
  let isDarkMode = $state(false);
  let isSettingsOpen = $state(false);
  let settingsInitialTab = $state('');
  let settingsScrollTo = $state('');
  let searchInputRef = $state();
  let zoomFactor = $state(1.0);
  /** Shortcut ID to highlight when Settings opens to the Shortcuts tab (from Codex "Edit" button). */
  let activeShortcutId = $state("");

  // ── Feature 2: Model Info Card ──────────────────────────────────────────
  /** Lightweight in-memory cache: modelName → parsed info. Never hits the
   *  network twice for the same model within a session. ~400 bytes per entry. */
  /** @type {Map<string, {size?: string, params?: string, speed?: string, family?: string, _numCtx?: number, _tier?: any}>} */
  const modelInfoCache = new Map();

  /** @type {{size?: string, params?: string, speed?: string, family?: string, _numCtx?: number, _tier?: any} | null} */
  let modelInfo = $state(null);
  let modelInfoLoading = $state(false);
  /** The model name for which the info card is currently shown */
  let hoveredModel = $state("");

  /** Derive a human-readable speed tier from parameter count (B) */
  /** @param {number} billions */
  function speedTier(billions) {
    if (billions <= 3)
      return { label: "Fast", color: "text-emerald-400", bars: 3 };
    if (billions <= 9)
      return { label: "Balanced", color: "text-amber-400", bars: 2 };
    if (billions <= 30)
      return { label: "Capable", color: "text-orange-400", bars: 2 };
    return { label: "Slow", color: "text-red-400", bars: 1 };
  }

  /** @param {string} name */
  async function fetchModelInfo(name) {
    if (!name) return;
    if (modelInfoCache.has(name)) {
      modelInfo = modelInfoCache.get(name) ?? null;
      return;
    }
    modelInfoLoading = true;
    modelInfo = null;
    try {
      const ollamaUrl =
        localStorage.getItem("lume_ollama_url") || "http://localhost:11434";
      const res = await fetch(`${ollamaUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error("show failed");
      const data = await res.json();

      // Extract fields — Ollama /api/show returns modelinfo or details depending on version
      const details = data.details || {};
      const modelDetails = data.model_info || {};

      // Parameter count: prefer model_info key, fall back to details string
      let billions = 0;
      const paramStr = details.parameter_size || "";
      const match = paramStr.match(/([\d.]+)\s*([BbMm])/);
      if (match) {
        billions = parseFloat(match[1]);
        if (match[2].toLowerCase() === "m") billions /= 1000;
      }

      // Disk size from the model list entry
      const listEntry = models.find((m) => m.name === name);
      const bytes = listEntry?.size ?? 0;
      const gb = bytes / 1073741824;
      const sizeStr =
        gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1048576).toFixed(0)} MB`;

      // Context length parsing
      let numCtx = 4096; // fallback for low-RAM protection
      // 1. Check explicit Modelfile override
      if (data.parameters) {
        const ctxMatch = data.parameters.match(/num_ctx\s+(\d+)/);
        if (ctxMatch) numCtx = parseInt(ctxMatch[1], 10);
      }
      // 2. If no explicit override, read architecture context_length but clamp to 4096
      //    to protect 8GB RAM hardware from OOM. Only trust explicit num_ctx at face value.
      if (numCtx === 4096 && data.model_info) {
        const ctxKey = Object.keys(data.model_info).find((k) =>
          k.endsWith(".context_length"),
        );
        if (ctxKey)
          numCtx = parseInt(data.model_info[ctxKey], 10);
      }

      const info = {
        size: sizeStr || "—",
        params: paramStr || "—",
        speed: "", // set below
        family: details.family || name.split(":")[0],
        _numCtx: numCtx,
      };
      // Store speed metadata on the object directly
      const tier = speedTier(billions);
      // @ts-ignore
      info._tier = tier;

      modelInfoCache.set(name, info);
      modelInfo = info;
    } catch {
      // Non-fatal: just show nothing
      modelInfo = null;
    } finally {
      modelInfoLoading = false;
    }
  }

  // Derived filtered results
  let filteredSessions = $derived(
    sessions.filter((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // Lightweight Context Length Approximation (Feature 4)
  let activeContextSize = $state(4096);

  $effect(() => {
    if (!selectedModel) return;

    // Use cached value if we've already hovered and fetched it
    const cached = modelInfoCache.get(selectedModel);
    if (cached && cached._numCtx !== undefined) {
      activeContextSize = cached._numCtx;
      console.log(
        "[ContextSize] cache hit:",
        selectedModel,
        "→",
        activeContextSize,
      );
      return;
    }

    // Otherwise, fetch it specifically for the sizing engine
    const modelName = selectedModel; // capture for async closure
    const url =
      localStorage.getItem("lume_ollama_url") || "http://localhost:11434";
    fetch(`${url}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(4000),
    })
      .then((r) => r.json())
      .then((data) => {
        let numCtx = 4096;
        if (data.parameters) {
          const match = data.parameters.match(/num_ctx\s+(\d+)/);
          if (match) numCtx = parseInt(match[1], 10);
        }
        if (numCtx === 4096 && data.model_info) {
          const ctxKey = Object.keys(data.model_info).find((k) =>
            k.endsWith(".context_length"),
          );
          if (ctxKey)
            numCtx = parseInt(data.model_info[ctxKey], 10);
        }

        console.log("[ContextSize] fetched:", modelName, "→", numCtx);
        activeContextSize = numCtx;

        // Store in cache so future model switches are instant
        if (modelInfoCache.has(modelName)) {
          const info = modelInfoCache.get(modelName);
          if (info) info._numCtx = numCtx;
        } else {
          modelInfoCache.set(modelName, { _numCtx: numCtx });
        }
      })
      .catch((err) => {
        console.error("[ContextSize] fetch failed:", err);
        activeContextSize = 4096;
      });
  });

  let contextTokenCount = $derived(
    Math.floor(
      messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0) / 4,
    ),
  );
  let contextPercentage = $derived(
    Math.min(100, Math.round((contextTokenCount / activeContextSize) * 100)),
  );
  let contextColor = $derived(
    contextPercentage > 85
      ? "text-red-500 bg-red-500"
      : contextPercentage > 60
        ? "text-yellow-500 bg-yellow-500"
        : "text-emerald-500 bg-emerald-500",
  );

  /** @param {number} timestamp */
  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  /** @param {string | null} switchToId */
  async function loadSessions(switchToId = null) {
    try {
      sessions = await invoke("get_sessions");
      if (sessions.length > 0) {
        if (switchToId) {
          await loadChat(switchToId);
        } else if (
          !currentSessionId ||
          !sessions.find((s) => s.id === currentSessionId)
        ) {
          await loadChat(sessions[0].id);
        }
      } else {
        await createNewChat();
      }
    } catch (e) {
      errorMessage = "Failed to load sessions: " + e;
    }
  }

  /**
   * @param {MouseEvent | KeyboardEvent} e
   * @param {string} sessionId
   */
  function renameSession(e, sessionId) {
    e.stopPropagation();
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      editingSessionId = sessionId;
      editingSessionTitle = session.title;
      activeDropdown = null;
    }
  }

  async function handleRenameConfirm() {
    if (!editingSessionId) return;
    const newTitle = editingSessionTitle.trim();
    if (newTitle) {
      try {
        await invoke("rename_session", {
          session_id: editingSessionId,
          new_title: newTitle,
        });
        const idx = sessions.findIndex((s) => s.id === editingSessionId);
        if (idx !== -1) {
          sessions[idx].title = newTitle;
        }
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    }
    editingSessionId = null;
  }

  /** @param {HTMLInputElement} node */
  function autoFocus(node) {
    node.focus();
    node.select();
  }

  async function createNewChat() {
    try {
      // Pass the currently active model and temperature so the new session inherits it
      const newId = await invoke("create_session", {
        title: "New Chat",
        model: selectedModel,
        temperature: selectedTemperature,
        system_prompt: systemPrompt,
      });
      currentSessionId = newId;
      messages = [];
      await loadSessions(newId);
    } catch (e) {
      errorMessage = "Error creating chat: " + e;
    }
  }

  /** @param {string} id */
  async function loadChat(id) {
    currentSessionId = id;
    prompt = "";
    isLoading = false;
    errorMessage = "";
    try {
      const rawMessages = /** @type {any[]} */ (
        await invoke("get_messages", { session_id: id })
      );
      messages = rawMessages.map((m) => {
        if (m.role === "ai" && m.content) {
          const parsed = extractThink(m.content);
          if (parsed.think_content) {
            return {
              ...m,
              content: parsed.content,
              thinkContent: parsed.think_content,
              isThinkingFinished: true,
              isLoading: false,
            };
          }
        }
        return { ...m, isLoading: false };
      });

      // Restore the model and temperature that was last used in this specific session.
      // Falls back to: localStorage default → first available model.
      const session = sessions.find((s) => s.id === id);

      const fallbackModel =
        localStorage.getItem("lume_default_model") ||
        (models.length > 0 ? models[0].name : "");
      selectedModel = session?.model || fallbackModel;

      // Governor: mark currently loaded model
      governor.setLoaded(selectedModel);

      const fallbackTemp = parseFloat(
        localStorage.getItem("lume_temperature") || "0.7",
      );
      selectedTemperature = session?.temperature ?? fallbackTemp;

      systemPrompt = session?.system_prompt || "";

      setTimeout(scrollToBottom, 100);
    } catch (e) {
      console.error("[loadChat]", e);
      errorMessage = "Failed to load messages: " + e;
    }
  }

  /**
   * @param {Event} e
   * @param {string} id
   */
  async function deleteSession(e, id) {
    e.stopPropagation();
    try {
      await invoke("delete_session", { session_id: id });
      if (currentSessionId === id) currentSessionId = "";
      await loadSessions();
    } catch (err) {
      console.error("[deleteSession]", err);
      errorMessage = "Failed to delete: " + err;
    }
  }

  /** @param {Event} e @param {string} id */
  async function handleTogglePin(e, id) {
    e.stopPropagation();
    try {
      await invoke("toggle_pin", { session_id: id });
      await loadSessions();
    } catch (err) {
      console.error("[togglePin]", err);
    }
  }

  /** @param {string} sessionId */
  async function handleExportMarkdown(sessionId) {
    try {
      const md = /** @type {string} */ (
        await invoke("export_chat_markdown", { session_id: sessionId })
      );
      const session = sessions.find((s) => s.id === sessionId);
      const filename =
        (session?.title || "chat").replace(/[^a-z0-9]/gi, "_").toLowerCase() +
        ".md";
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      errorMessage = "Export failed: " + err;
    }
  }



  async function handleBulkDelete() {
    const count = selectedSessionIds.size;
    if (!count) return;
    if (
      !confirm(
        `Delete ${count} chat${count > 1 ? "s" : ""}? This cannot be undone.`,
      )
    )
      return;
    try {
      await invoke("delete_sessions", {
        session_ids: Array.from(selectedSessionIds),
      });
      if (selectedSessionIds.has(currentSessionId)) currentSessionId = "";
      selectedSessionIds = new Set();
      isBulkSelectMode = false;
      await loadSessions();
    } catch (err) {
      errorMessage = "Bulk delete failed: " + err;
    }
  }

  let activeSessionWordCount = $state(0);

  $effect(() => {
    if (!isLoading) {
      const text = messages
        .filter((m) => m.role === "ai")
        .map((m) => m.content)
        .join(" ");
      activeSessionWordCount = text.trim()
        ? text.trim().split(/\s+/).length
        : 0;
    }
  });

  /** @param {string} sessionId */
  function getChatWordCount(sessionId) {
    if (sessionId !== currentSessionId) return null;
    return activeSessionWordCount > 0 ? activeSessionWordCount : null;
  }

  /** @param {number} n */
  function formatWordCount(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  }

  // ── Keyboard Shortcut Actions ───────────────────────────────────────────

  /** @param {number} factor */
  async function applyZoom(factor) {
    if (factor < 0.5) factor = 0.5;
    if (factor > 3.0) factor = 3.0;
    zoomFactor = factor;
    try {
      await getCurrentWebviewWindow().setZoom(zoomFactor);
    } catch(e) { console.error("Zoom API not available", e); }
  }

  function chatRegenerate() {
    if (messages.length > 0 && !isLoading) {
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") { lastUserIdx = i; break; }
      }
      if (lastUserIdx !== -1 && lastUserIdx + 1 < messages.length) {
        handleRegenerate(messages[lastUserIdx + 1], lastUserIdx + 1);
      }
    }
  }

  function chatStop() {
    if (isLoading && currentAbortController) currentAbortController.abort();
  }

  function chatCopyLast() {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "ai" && messages[i].content) {
        handleCopy(messages[i].content, i);
        break;
      }
    }
  }

  async function chatClear() {
    if (messages.length > 0 && confirm("Clear all messages in this chat?")) {
      messages = [];
      try {
        await invoke("delete_session", { session_id: currentSessionId });
        currentSessionId = "";
        await loadSessions();
      } catch (err) {
        console.error("Failed to delete session", err);
      }
    }
  }

  /**
   * @param {string} before 
   * @param {string} after 
   */
  function insertWrapText(before, after) {
    if (!textareaRef) return;
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const selection = prompt.substring(start, end);
    prompt = prompt.substring(0, start) + before + selection + after + prompt.substring(end);
    setTimeout(() => {
      textareaRef.focus();
      textareaRef.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  }

  function editorBold() { insertWrapText("**", "**"); }
  function editorItalic() { insertWrapText("*", "*"); }
  function editorCodeBlock() { insertWrapText("```\n", "\n```"); }
  function editorUndo() { document.execCommand("undo"); }
  function editorRedo() { document.execCommand("redo"); }

  $effect(() => {
    if (currentSessionId) untrack(() => shortcutStore.pushScope("chat"));
    else untrack(() => shortcutStore.popScope("chat"));
  });

  // Global click listener to close session dropdowns when clicking outside
  $effect(() => {
    if (!activeDropdown) return;
    const handleGlobalClick = () => {
      activeDropdown = null;
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  });

  onMount(() => {
    // If name not in localStorage, check legacy app_settings fallback
    if (!localStorage.getItem("lume_user_name")) {
      invoke("get_setting", { key: "user_name" })
        .then((n) => {
          if (n) {
            userName = /** @type {string} */ (n);
            localStorage.setItem("lume_user_name", userName);
          }
        })
        .catch((e) => console.error("[onMount] get_setting failed:", e));
    }

    // Storage listener for live user profile updates
    /** @param {StorageEvent} e */
    const handleStorage = (e) => {
      if (!e.key || e.key === "lume_user_name") {
        userName = localStorage.getItem("lume_user_name") || "User";
      }
      if (!e.key || e.key === "lume_user_avatar_color") {
        userAvatarColor = localStorage.getItem("lume_user_avatar_color") || "#10b981";
      }
    };
    window.addEventListener("storage", handleStorage);

    fetchModels().then(({ models: fetchedModels, ollamaOnline }) => {
      ollamaStatus = ollamaOnline;
      models = fetchedModels;
      if (!ollamaOnline) {
        errorMessage = "";
      } else if (models.length > 0) {
        selectedModel = models[0].name;
        errorMessage = "";
      } else {
        errorMessage = "No models found. Try: ollama pull llama3.2";
      }
    });

    async function pollOllama() {
      const { models: fetchedModels, ollamaOnline } = await fetchModels();
      ollamaStatus = ollamaOnline;
      if (ollamaOnline && fetchedModels.length > 0) {
        models = fetchedModels;
        if (!selectedModel) selectedModel = fetchedModels[0].name;
      }
    }
    /** @type {any} */
    let ollamaPoller = setInterval(pollOllama, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(ollamaPoller);
        ollamaPoller = null;
      } else if (!ollamaPoller) {
        pollOllama();
        ollamaPoller = setInterval(pollOllama, 5000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Theming logic
    isDarkMode =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDarkMode) document.body.classList.add("dark");

    // Setup initial streaming preference from localStorage
    const savedStreaming = localStorage.getItem("lume_streaming");
    if (savedStreaming !== null) isStreamingEnabled = savedStreaming === "true";

    // Setup initial thinking blocks preference
    const savedThinking = localStorage.getItem("lume_show_thinking");
    if (savedThinking !== null) isThinkingEnabled = savedThinking === "true";

    // Load Chat Settings
    loadSettings();

    // Load chat sessions from database
    loadSessions();

    // ── Codex "Edit" shortcut deep-link ──────────────────────────────────
    /** @param {Event} e */
    function handleOpenKeybinding(e) {
      const id = /** @type {CustomEvent} */(e).detail?.id ?? null;
      activeShortcutId = id;
      isSettingsOpen = true;
    }
    window.addEventListener("lume:open_keybinding", handleOpenKeybinding);

    // ── Keyboard Shortcuts Wiring ──────────────────────────────────────────
    const actions = {
      "global:new_chat": () => createNewChat(),
      "global:toggle_sidebar": () => { isSidebarCollapsed = !isSidebarCollapsed; },
      "global:toggle_settings": () => { isSettingsOpen = true; },
      "global:open_codex":    () => { isCodexOpen = true; },
      "global:open_settings": () => { isSettingsOpen = true; },
      "global:open_profile":  () => { isUserMenuOpen = !isUserMenuOpen; },
      "global:search": () => { searchInputRef?.focus(); },
      "global:zoom_in": () => applyZoom(zoomFactor + 0.1),
      "global:zoom_out": () => applyZoom(zoomFactor - 0.1),
      "global:zoom_reset": () => applyZoom(1.0),
      "chat:regenerate": chatRegenerate,
      "chat:stop_generation": chatStop,
      "chat:copy_last_response": chatCopyLast,
      "chat:clear_chat": chatClear,
      "chat:focus_input": () => textareaRef?.focus(),
      "chat:scroll_to_bottom": scrollToBottom,
      "settings:close": () => { isSettingsOpen = false; },
      "editor:bold": editorBold,
      "editor:italic": editorItalic,
      "editor:code_block": editorCodeBlock,
      "editor:undo": editorUndo,
      "editor:redo": editorRedo,
    };

    const customEvents = {
      "lume:new_chat": actions["global:new_chat"],
      "lume:toggle_sidebar": actions["global:toggle_sidebar"],
      "lume:toggle_settings": actions["global:toggle_settings"],
      "lume:focus_search": actions["global:search"],
      "lume:show_shortcuts": () => { isCodexOpen = true; },
      "lume:open_codex":    () => { isCodexOpen = true; },
      "lume:open_settings": () => { isSettingsOpen = true; },
      "lume:open_profile":  () => { isUserMenuOpen = !isUserMenuOpen; },
      "lume:zoom_in": actions["global:zoom_in"],
      "lume:zoom_out": actions["global:zoom_out"],
      "lume:zoom_reset": actions["global:zoom_reset"],
      "lume:chat:regenerate": actions["chat:regenerate"],
      "lume:chat:stop_generation": actions["chat:stop_generation"],
      "lume:chat:copy_last": actions["chat:copy_last_response"],
      "lume:chat:clear": actions["chat:clear_chat"],
      "lume:chat:focus_input": actions["chat:focus_input"],
      "lume:chat:scroll_bottom": actions["chat:scroll_to_bottom"],
      "lume:editor:undo": actions["editor:undo"],
      "lume:editor:redo": actions["editor:redo"],
    };

    /** @type {Array<() => void>} */
    const cleanups = [];

    for (const [id, fn] of Object.entries(actions)) {
      // @ts-ignore
      cleanups.push(shortcutStore.on(id, (e) => fn()));
    }

    for (const [evtName, fn] of Object.entries(customEvents)) {
      const handler = () => fn();
      window.addEventListener(evtName, handler);
      cleanups.push(() => window.removeEventListener(evtName, handler));
    }

    // ── Governor init ────────────────────────────────────────────────────
    const savedOllamaUrl =
      localStorage.getItem("lume_ollama_url") || "http://localhost:11434";
    governor.setOllamaUrl(savedOllamaUrl);
    governor.init();

    return () => {
      window.removeEventListener("lume:open_keybinding", handleOpenKeybinding);
      window.removeEventListener("storage", handleStorage);
      cleanups.forEach((c) => c());
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (ollamaPoller) clearInterval(ollamaPoller);
    };
  });

  function loadSettings() {
    showTokenCounter = localStorage.getItem('lume_show_tokens') !== 'false';
    showResponseTime = localStorage.getItem('lume_show_response_time') !== 'false';
    enterToSend = localStorage.getItem('lume_enter_to_send') !== 'false';
  }

  /** @param {boolean} val */
  const handleTokenCounterToggle = (val) => { showTokenCounter = val; };
  /** @param {boolean} val */
  const handleResponseTimeToggle = (val) => { showResponseTime = val; };
  /** @param {boolean} val */
  const handleEnterToSendToggle = (val) => { enterToSend = val; };

  function handleScroll() {
    if (!chatContainerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    showScrollButton = distanceFromBottom > 150;
    if (!showScrollButton) hasUnread = false;
  }

  function scrollToBottom() {
    if (chatContainerRef) {
      chatContainerRef.scrollTo({
        top: chatContainerRef.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  $effect(() => {
    if (messages.length && chatContainerRef && !showScrollButton) {
      setTimeout(() => scrollToBottom(), 50);
    }
  });

  function adjustTextareaHeight() {
    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = textareaRef.scrollHeight + "px";
    }
  }

  async function handleSend(skipUserSave = false) {
    if (typeof skipUserSave !== "boolean") skipUserSave = false;
    if (!prompt.trim() || !selectedModel || isLoading || !currentSessionId)
      return;

    currentAbortController = new AbortController();
    const startTime = Date.now();

    const currentPrompt = prompt;
    prompt = "";
    tick().then(() => {
      adjustTextareaHeight();
      scrollToBottom();
    });

    isLoading = true;
    errorMessage = "";

    if (!skipUserSave) {
      messages = [...messages, { role: "user", content: currentPrompt }];
      const userMsgIndex = messages.length - 1;

      invoke("save_message", {
        session_id: currentSessionId,
        role: "user",
        content: currentPrompt,
      })
        .then((id) => {
          messages[userMsgIndex].id = id;
          messages[userMsgIndex].created_at = Date.now();
          loadSessions();
        })
        .catch(console.error);
    }

    const aiIndex = messages.length;
    messages = [...messages, {
      role: "ai",
      content: "",
      thinkContent: "",
      isLoading: true,
      isThinkingFinished: false,
    }];
    if (showScrollButton) hasUnread = true;

    const history = messages
      .slice(0, aiIndex)
      .filter((m) => m.role === "user" || m.role === "ai")
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : m.role,
        content: m.content,
      }));

    try {
      const {
        text: finalText,
        thinkText: finalThinkText,
        evalCount,
      } = await sendMessage(
        selectedModel,
        history,
        isStreamingEnabled
          ? (chunkObj) => {
              // Always update content fields from parsed stream
              messages[aiIndex].content = chunkObj.content;
              messages[aiIndex].thinkContent =
                chunkObj.think_content?.trim() || "";
              messages[aiIndex].isThinkingFinished =
                chunkObj.isThinkingFinished;
              // Clear the pending state as soon as we have ANY data from the stream
              messages[aiIndex].isLoading = false;
              if (!showScrollButton) setTimeout(scrollToBottom, 10);
            }
          : null,
        currentAbortController.signal,
        systemPrompt,
      );

      const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

      messages[aiIndex].content = finalText;
      messages[aiIndex].thinkContent = finalThinkText;
      messages[aiIndex].isThinkingFinished = true;
      messages[aiIndex].isLoading = false;
      messages[aiIndex].evalCount = evalCount;
      messages[aiIndex].responseTime = responseTime;

      try {
        const rawTextForDB = finalThinkText
          ? `<think>\n${finalThinkText}\n</think>\n\n${finalText}`
          : finalText;
        const id = await invoke("save_message", {
          session_id: currentSessionId,
          role: "ai",
          content: rawTextForDB,
        });
        messages[aiIndex].id = id;
        messages[aiIndex].created_at = Date.now();
        await loadSessions();
      } catch (err) {
        console.error(err);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        const partialText = messages[aiIndex].content || "";
        const partialThink = messages[aiIndex].thinkContent || "";
        messages[aiIndex].isLoading = false;
        if (partialText || partialThink) {
          try {
            const rawTextForDB = partialThink
              ? `<think>\n${partialThink}\n</think>\n\n${partialText}`
              : partialText;
            const id = await invoke("save_message", {
              session_id: currentSessionId,
              role: "ai",
              content: rawTextForDB,
            });
            messages[aiIndex].id = id;
            messages[aiIndex].created_at = Date.now();
            await loadSessions();
          } catch (err) {
            console.error(err);
          }
        } else {
          messages = messages.filter((_, i) => i !== aiIndex);
        }
      } else {
        errorMessage =
          "Error communicating with Ollama: " +
          (error instanceof Error ? error.message : String(error));
        messages = messages.filter((_, i) => i !== aiIndex);
        prompt = currentPrompt;
        tick().then(adjustTextareaHeight);
      }
    } finally {
      isLoading = false;
      currentAbortController = null;
    }
  }

  function handleStop() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  }

  /**
   * @param {string} text
   * @param {number} i
   */
  function handleCopy(text, i) {
    navigator.clipboard.writeText(text);
    copiedIndex = i;
    setTimeout(() => (copiedIndex = -1), 2000);
  }

  /** @param {any} msg */
  async function handleEdit(msg) {
    if (!msg.id || isLoading) return;
    prompt = msg.content;
    const msgId = msg.id;
    const timestamp = msg.created_at;

    try {
      await invoke("delete_messages_after", {
        session_id: currentSessionId,
        timestamp,
      });
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx !== -1) {
        messages = messages.slice(0, idx);
      }
      tick().then(adjustTextareaHeight);
    } catch (e) {
      errorMessage = "Failed to edit: " + e;
    }
  }

  /**
   * @param {any} msg
   * @param {number} idx
   */
  async function handleRegenerate(msg, idx) {
    if (!msg.id || isLoading) return;

    const promptMsg = messages[idx - 1];
    if (!promptMsg || promptMsg.role !== "user") return;

    prompt = promptMsg.content;

    try {
      await invoke("delete_message", { message_id: msg.id });
      messages = messages.filter((m) => m.id !== msg.id);
      await handleSend(true);
    } catch (e) {
      errorMessage = "Failed to regenerate: " + e;
    }
  }

  function toggleTheme() {
    isDarkMode = !isDarkMode;
    if (isDarkMode) document.body.classList.add("dark");
    else document.body.classList.remove("dark");
  }

  async function handleClear() {
    await invoke("clear_messages", { session_id: currentSessionId });
    messages = [];
    await invoke("rename_session", { session_id: currentSessionId, new_title: "New Chat" });
    const idx = sessions.findIndex((s) => s.id === currentSessionId);
    if (idx !== -1) sessions[idx].title = "New Chat";
  }
</script>

<div class="flex flex-col h-screen w-full bg-white dark:bg-[#0d1117] text-gray-900 dark:text-gray-100 transition-colors duration-200 overflow-hidden">

  <!-- Ollama offline banner -->
  {#if !ollamaStatus}
    <div class="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400 text-[13px]">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>Ollama is offline — start it with <code class="font-mono bg-amber-500/10 px-1 rounded">ollama serve</code> then refresh.</span>
    </div>
  {/if}

  <div class="flex flex-1 min-h-0 overflow-hidden">
  <Sidebar
    bind:isSidebarCollapsed
    bind:isBulkSelectMode
    bind:selectedSessionIds
    bind:searchQuery
    bind:searchInputRef
    bind:activeDropdown
    bind:editingSessionId
    bind:editingSessionTitle
    bind:isUserMenuOpen
    bind:isSettingsOpen
    bind:isCodexOpen
    {filteredSessions}
    {currentSessionId}
    {userName}
    {userInitials}
    {userAvatarColor}
    oncreatenewchat={createNewChat}
    onloadchat={loadChat}
    onrenamesession={renameSession}
    onrenameconfirm={handleRenameConfirm}
    ontogglepin={handleTogglePin}
    onexportmarkdown={handleExportMarkdown}
    ondeletesession={deleteSession}
    onbulkdelete={handleBulkDelete}
    ontimeago={timeAgo}
    ongetchatwordcount={getChatWordCount}
    onformatwordcount={formatWordCount}
    autofocus={autoFocus}
  />



  <!-- MAIN CHAT INTERFACE -->
  <main
    class="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0d1117] relative"
  >
    <!-- Top Header -->
    <header
      class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#0d1117]/50 backdrop-blur-md sticky top-0 z-20 transition-colors shrink-0 h-16"
    >
      <div class="flex items-center space-x-3">
        <span
          class="font-normal text-[14px] text-gray-600 dark:text-gray-400"
        >
          {sessions.find((s) => s.id === currentSessionId)?.title ||
            "Lume Chat"}
        </span>
      </div>

      <div class="flex items-center space-x-3">
        <button
          onclick={toggleTheme}
          class="p-1.5 rounded-md text-gray-500 hover:text-emerald-500 dark:hover:text-emerald-400 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Toggle Theme"
        >
          {#if isDarkMode}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="12" cy="12" r="5"></circle><line
                x1="12"
                y1="1"
                x2="12"
                y2="3"
              ></line><line x1="12" y1="21" x2="12" y2="23"></line><line
                x1="4.22"
                y1="4.22"
                x2="5.64"
                y2="5.64"
              ></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"
              ></line><line x1="1" y1="12" x2="3" y2="12"></line><line
                x1="21"
                y1="12"
                x2="23"
                y2="12"
              ></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"
              ></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"
              ></line></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              ></path></svg
            >
          {/if}
        </button>

        <div class="relative">
          <button
            onclick={() => (isHeaderMenuOpen = !isHeaderMenuOpen)}
            class="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-[#1a212c] transition-colors"
            title="Chat Options"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>

          {#if isHeaderMenuOpen}
            <div
              class="fixed inset-0 z-40"
              role="presentation"
              onclick={() => (isHeaderMenuOpen = false)}
            ></div>
            <div
              class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#141920] border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg z-50 py-1 overflow-hidden"
            >
              <button
                onclick={() => {
                  isGovernorOpen = true;
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <span class="mr-2 text-[14px]">🛡</span>
                System Health
              </button>
              <div class="border-b border-gray-100 dark:border-gray-800"></div>
              <!-- Context Window -->
              <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <div class="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Context Window</div>
                <div class="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                  {contextTokenCount} / {activeContextSize >= 1000 ? Math.round(activeContextSize / 1024) + 'k' : activeContextSize} tokens
                  <span class="ml-1 text-[11px] {contextColor.split(' ')[0]}">({contextPercentage}%)</span>
                </div>
              </div>
              <button
                onclick={() => {
                  settingsInitialTab = 'chat';
                  settingsScrollTo = 'settings-system-prompt';
                  isSettingsOpen = true;
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                System Prompt
              </button>
              <button
                onclick={() => {
                  settingsInitialTab = 'models';
                  settingsScrollTo = 'settings-temperature';
                  isSettingsOpen = true;
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
                Temperature
              </button>
              <div class="border-t border-gray-100 dark:border-gray-800"></div>
              <button
                onclick={() => {
                  handleClear();
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="mr-2"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  ></path>
                </svg>
                Delete Current Chat
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>

    <!-- Chat Messages View -->
    <div
      bind:this={chatContainerRef}
      onscroll={handleScroll}
      class="flex-1 overflow-y-auto w-full p-6 space-y-6 flex flex-col scroll-smooth"
    >
      {#if errorMessage}
        <div
          class="max-w-3xl mx-auto w-full p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-sm shadow-sm"
        >
          {errorMessage}
        </div>
      {/if}

      <div class="max-w-3xl mx-auto w-full flex flex-col space-y-6 pb-6">
        {#if messages.length === 0 && !errorMessage}
          <div
            class="m-auto flex flex-col items-center justify-center opacity-40 pt-24"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-16 w-16 mb-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              ></path></svg
            >
            <p class="text-[15px] font-medium">
              Hello there. How can I help you today?
            </p>
          </div>
        {/if}

        {#each messages as msg, i}
          <MessageBubble
            {msg}
            index={i}
            {isLoading}
            {isThinkingEnabled}
            {copiedIndex}
            {showResponseTime}
            {showTokenCounter}
            {messages}
            oncopy={handleCopy}
            onedit={handleEdit}
            onregenerate={handleRegenerate}
          />
        {/each}
      </div>
    </div>

    <!-- Input Bar -->
    <ChatInput
      bind:prompt
      bind:textareaRef
      bind:selectedModel
      bind:isModelMenuOpen
      bind:hoveredModel
      bind:modelInfo
      bind:sessions
      bind:errorMessage
      {isLoading}
      {hasUnread}
      {showScrollButton}
      {enterToSend}
      {models}
      {currentSessionId}
      {modelInfoLoading}
      onscrollbottom={scrollToBottom}
      onsend={handleSend}
      onstop={handleStop}
      onadjusttextareaheight={adjustTextareaHeight}
      onfetchmodelinfo={fetchModelInfo}
      onmodelchange={handleModelChange}
    />
  </main>
</div>

<!-- Lume Codex Overlay -->
<LumeCodex isOpen={isCodexOpen} onClose={() => (isCodexOpen = false)} />

<!-- Settings Modal -->
<Settings
  initialTab={settingsInitialTab}
  scrollTo={settingsScrollTo}
  isOpen={isSettingsOpen}
  onOllamaStatusChange={(online) => { ollamaStatus = online; }}
  onClose={() => { isSettingsOpen = false; settingsInitialTab = ''; settingsScrollTo = ''; }}
  {models}
  {selectedModel}
  onModelChange={(model) => handleModelChange(model)}
  {isDarkMode}
  onThemeChange={(dark) => {
    isDarkMode = dark;
    if (dark) document.body.classList.add("dark");
    else document.body.classList.remove("dark");
  }}
  {isStreamingEnabled}
  onStreamingChange={(val) => {
    isStreamingEnabled = val;
  }}
  showThinkingBlocks={isThinkingEnabled}
  onThinkingChange={(val) => {
    isThinkingEnabled = val;
  }}
  {showTokenCounter}
  onTokenCounterChange={handleTokenCounterToggle}
  {showResponseTime}
  onResponseTimeChange={handleResponseTimeToggle}
  {enterToSend}
  onEnterToSendChange={handleEnterToSendToggle}
  onDataWiped={() => {
    loadSessions();
  }}
/>

{#if isGovernorOpen}<GovernorPanel onClose={() => isGovernorOpen = false} />{/if}

<!-- Governor Notice -->
<GovernorNotice
  onConfirm={async () => {
    const d = governor.pendingDecision;
    await governor.confirmSwitch();
    if (d && d.type !== "allow") selectedModel = d.nextModel;
  }}
  onDismiss={() => {
    governor.dismissDecision();
  }}
/>

</div>
