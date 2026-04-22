<script>
  import "../app.css";
  import { onMount } from "svelte";
  import { shortcutStore } from "$lib/stores/shortcuts.svelte";
  import { commandStore } from "$lib/stores/commands.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";

  let { children } = $props();

  onMount(() => {
    window.onerror = function(message, source, lineno, colno, error) {
      document.body.innerHTML += `<div style="position:fixed; z-index:9999; top:0; left:0; background:red; color:white; padding:10px;">${message}<br>${error?.stack}</div>`;
      return false;
    };
    window.addEventListener("unhandledrejection", function(event) {
      document.body.innerHTML += `<div style="position:fixed; z-index:9999; top:0; right:0; background:orange; color:white; padding:10px;">Unhandled Rejection:<br>${event.reason?.message || event.reason}<br>${event.reason?.stack}</div>`;
    });

    // Boot both stores (async, but cleanup is sync)
    (async () => {
      // 1. Boot shortcut system (loads SQLite customisations + attaches keydown)
      await shortcutStore.init();

      // 2. Boot command palette (wires to shortcut store + loads recents)
      commandStore.init();

      // 3. Register built-in commands that map to existing shortcut actions
      commandStore.registerCommands([
        {
          id: "nav:new_chat",
          label: "New Chat",
          description: "Create a new chat session",
          category: "Navigation",
          keywords: ["create", "session", "conversation"],
          shortcut: shortcutStore.getLabel("global:new_chat"),
          action: () => {
            window.dispatchEvent(new CustomEvent("lume:new_chat"));
          },
        },
        {
          id: "nav:toggle_sidebar",
          label: "Toggle Sidebar",
          description: "Show or hide the sidebar",
          category: "Navigation",
          keywords: ["panel", "side", "collapse"],
          shortcut: shortcutStore.getLabel("global:toggle_sidebar"),
          action: () => {
            window.dispatchEvent(new CustomEvent("lume:toggle_sidebar"));
          },
        },
        {
          id: "nav:settings",
          label: "Open Settings",
          description: "Open the settings panel",
          category: "Navigation",
          keywords: ["preferences", "config", "options"],
          shortcut: shortcutStore.getLabel("global:toggle_settings"),
          action: () => {
            window.dispatchEvent(new CustomEvent("lume:toggle_settings"));
          },
        },
        {
          id: "nav:search",
          label: "Search Chats",
          description: "Focus the chat search filter",
          category: "Navigation",
          keywords: ["find", "filter", "query"],
          shortcut: shortcutStore.getLabel("global:search"),
          action: () => {
            window.dispatchEvent(new CustomEvent("lume:focus_search"));
          },
        },
        {
          id: "action:toggle_dark",
          label: "Toggle Dark Mode",
          description: "Switch between light and dark theme",
          category: "Actions",
          keywords: ["theme", "light", "dark", "appearance"],
          action: () => {
            document.body.classList.toggle("dark");
          },
        },
        {
          id: "action:zoom_in",
          label: "Zoom In",
          description: "Increase UI scale",
          category: "Actions",
          shortcut: shortcutStore.getLabel("global:zoom_in"),
          action: () => window.dispatchEvent(new CustomEvent("lume:zoom_in")),
        },
        {
          id: "action:zoom_out",
          label: "Zoom Out",
          description: "Decrease UI scale",
          category: "Actions",
          shortcut: shortcutStore.getLabel("global:zoom_out"),
          action: () => window.dispatchEvent(new CustomEvent("lume:zoom_out")),
        },
        {
          id: "action:zoom_reset",
          label: "Reset Zoom",
          description: "Reset UI scale to default",
          category: "Actions",
          shortcut: shortcutStore.getLabel("global:zoom_reset"),
          action: () => window.dispatchEvent(new CustomEvent("lume:zoom_reset")),
        },
        {
          id: "shortcut:show_shortcuts",
          label: "Keyboard Shortcuts",
          description: "View all available keyboard shortcuts",
          category: "Shortcuts",
          keywords: ["keybindings", "hotkeys", "keys"],
          action: () => window.dispatchEvent(new CustomEvent("lume:show_shortcuts")),
        },
        // ── Chat Commands ───────────────────────────────────────────────
        {
          id: "chat:regenerate",
          label: "Regenerate Response",
          description: "Regenerate the last AI response",
          category: "Chat",
          keywords: ["retry", "redo", "again"],
          shortcut: shortcutStore.getLabel("chat:regenerate"),
          action: () => window.dispatchEvent(new CustomEvent("lume:chat:regenerate")),
        },
        {
          id: "chat:stop_generation",
          label: "Stop Generation",
          description: "Stop current AI generation",
          category: "Chat",
          keywords: ["halt", "cancel", "abort"],
          shortcut: shortcutStore.getLabel("chat:stop_generation"),
          action: () => window.dispatchEvent(new CustomEvent("lume:chat:stop_generation")),
        },
        {
          id: "chat:copy_last",
          label: "Copy Last Response",
          description: "Copy the last AI response to clipboard",
          category: "Chat",
          keywords: ["clipboard"],
          shortcut: shortcutStore.getLabel("chat:copy_last_response"),
          action: () => window.dispatchEvent(new CustomEvent("lume:chat:copy_last")),
        },
        {
          id: "chat:clear",
          label: "Clear Chat",
          description: "Delete current chat messages",
          category: "Chat",
          keywords: ["empty", "remove", "delete"],
          shortcut: shortcutStore.getLabel("chat:clear_chat"),
          action: () => window.dispatchEvent(new CustomEvent("lume:chat:clear")),
        },
        {
          id: "chat:focus_input",
          label: "Focus Input",
          description: "Focus the chat text area",
          category: "Chat",
          keywords: ["type", "write"],
          shortcut: shortcutStore.getLabel("chat:focus_input"),
          action: () => window.dispatchEvent(new CustomEvent("lume:chat:focus_input")),
        },
        {
          id: "chat:scroll_bottom",
          label: "Scroll to Bottom",
          description: "Scroll to the latest message",
          category: "Chat",
          shortcut: shortcutStore.getLabel("chat:scroll_to_bottom"),
          action: () => window.dispatchEvent(new CustomEvent("lume:chat:scroll_bottom")),
        },
        // ── Editor Commands ─────────────────────────────────────────────
        {
          id: "editor:undo",
          label: "Undo",
          description: "Undo the last text edit",
          category: "Editing",
          shortcut: shortcutStore.getLabel("editor:undo"),
          action: () => window.dispatchEvent(new CustomEvent("lume:editor:undo")),
        },
        {
          id: "editor:redo",
          label: "Redo",
          description: "Redo the last text edit",
          category: "Editing",
          shortcut: shortcutStore.getLabel("editor:redo"),
          action: () => window.dispatchEvent(new CustomEvent("lume:editor:redo")),
        },
      ]);
    })();

    return () => {
      shortcutStore.destroy();
    };
  });
</script>

{@render children()}
<CommandPalette />
