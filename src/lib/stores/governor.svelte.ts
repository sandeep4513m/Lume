// ── governor.svelte.ts — RAM-aware model load/unload governor ───────────────
import { invoke } from '@tauri-apps/api/core';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RamStatus {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  swap_total_mb: number;
  swap_used_mb: number;
  swap_free_mb: number;
  pressure: 'ok' | 'warn' | 'critical';
}

export interface HardwareTier {
  total_ram_mb: number;
  cpu_count: number;
  tier: number;
  tier_label: string;
  max_recommended_params_b: number;
}

export interface ModelInfo {
  name: string;
  size: number;
  ram_estimate_mb: number;
}

export interface LoadedModel {
  name: string;
  size_vram: number;
  size: number;
  expires_at: string;
}

export type GovernorDecision =
  | { type: 'allow' }
  | { type: 'warn';     currentModel: string; nextModel: string; ram: RamStatus }
  | { type: 'critical'; currentModel: string; nextModel: string; ram: RamStatus };

// ── Thresholds ────────────────────────────────────────────────────────────────
// Linux uses swap proactively — raw swap_used alone is NOT a pressure signal.
// Two separate threshold sets:
//   SWITCH CHECK  — triggered by user action (model dropdown change)
//   BACKGROUND    — triggered by passive poll while model is running

// Switch check thresholds
const CRITICAL_FREE_MB           = 512;  // < 512MB free + swap pressure = critical
const WARN_FREE_MB               = 1024; // < 1GB free = warn on switch
const CRITICAL_SWAP_PRESSURE_PCT = 80;   // swap > 80% full (combined with free RAM)

// Background poll threshold — more aggressive, RAM alone is enough signal
const BG_CRITICAL_FREE_MB = 300; // < 300MB free while model loaded = fire alert

// ── State ────────────────────────────────────────────────────────────────────

let ramStatus = $state<RamStatus | null>(null);
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let loadedModel = $state<string>('');
let pendingDecision = $state<GovernorDecision | null>(null);
let ollamaUrl = $state<string>('http://localhost:11434');

let hardwareTier = $state<HardwareTier | null>(null);
let modelList = $state<ModelInfo[]>([]);
let loadedModels = $state<LoadedModel[]>([]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcPressure(ram: RamStatus): 'ok' | 'warn' | 'critical' {
  const swapPct = ram.swap_total_mb > 0
    ? (ram.swap_used_mb / ram.swap_total_mb) * 100
    : 0;

  // Critical: almost no free RAM AND swap nearly full
  if (ram.free_mb < CRITICAL_FREE_MB && swapPct > CRITICAL_SWAP_PRESSURE_PCT) {
    return 'critical';
  }
  // Warn: low free RAM (swap usage alone is NOT a signal on Linux)
  if (ram.free_mb < WARN_FREE_MB) {
    return 'warn';
  }
  return 'ok';
}

// ── Polling ──────────────────────────────────────────────────────────────────

async function refreshModels(url: string): Promise<void> {
  try {
    const [hw, models, loaded] = await Promise.all([
      invoke<HardwareTier>('get_hardware_tier'),
      invoke<ModelInfo[]>('get_model_list_with_estimates', { ollamaUrl: url }),
      invoke<LoadedModel[]>('get_loaded_models', { ollamaUrl: url })
    ]);
    hardwareTier = hw;
    modelList = models;
    loadedModels = loaded;
  } catch (e) {
    console.error('[governor] refreshModels failed:', e);
  }
}

async function pollRam(): Promise<void> {
  try {
    const raw = await invoke<RamStatus>('get_ram_status');
    // Recalculate pressure with correct thresholds (ignore Rust-side pressure field)
    raw.pressure = calcPressure(raw);
    ramStatus = raw;

    // Background critical alert: fire if free RAM dangerously low while model
    // is loaded — regardless of swap. 300MB free is always dangerous.
    if (
      raw.free_mb < BG_CRITICAL_FREE_MB &&
      loadedModel &&
      pendingDecision === null
    ) {
      pendingDecision = {
        type: 'critical',
        currentModel: loadedModel,
        nextModel: '',
        ram: raw,
      };
    }
  } catch (e) {
    console.error('[governor] poll failed:', e);
  }
  
  await refreshModels(ollamaUrl);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const governor = {
  get ram() { return ramStatus; },
  get loadedModel() { return loadedModel; },
  get pendingDecision() { return pendingDecision; },
  get hardwareTier() { return hardwareTier; },
  get modelList() { return modelList; },
  get loadedModels() { return loadedModels; },

  setOllamaUrl(url: string) {
    ollamaUrl = url;
  },

  /** Call on app start. */
  init() {
    if (pollingTimer) return;
    pollRam();
    refreshModels(ollamaUrl);
    pollingTimer = setInterval(pollRam, 5000);
  },

  /** Call on app unmount. */
  destroy() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = null;
  },

  /**
   * Call BEFORE switching to a new model.
   * Returns a decision: allow silently, warn user, or critical alert.
   */
  async checkSwitch(nextModel: string): Promise<GovernorDecision> {
    await pollRam();
    const ram = ramStatus!;

    // Same model or no model loaded yet → always allow silently
    if (!loadedModel || loadedModel === nextModel) {
      loadedModel = nextModel;
      return { type: 'allow' };
    }

    const pressure = calcPressure(ram);

    if (pressure === 'critical') {
      const decision: GovernorDecision = {
        type: 'critical',
        currentModel: loadedModel,
        nextModel,
        ram,
      };
      pendingDecision = decision;
      return decision;
    }

    if (pressure === 'warn') {
      const decision: GovernorDecision = {
        type: 'warn',
        currentModel: loadedModel,
        nextModel,
        ram,
      };
      pendingDecision = decision;
      return decision;
    }

    // RAM fine → silent unload + switch
    await governor.unload(loadedModel);
    loadedModel = nextModel;
    return { type: 'allow' };
  },

  /** Unload a model from Ollama memory. */
  async unload(modelName: string): Promise<void> {
    if (!modelName) return;
    try {
      await invoke('unload_model', {
        modelName: modelName,
        ollamaUrl: ollamaUrl,
      });
      if (loadedModel === modelName) loadedModel = '';
    } catch (e) {
      console.error('[governor] unload failed:', e);
    }
  },

  /** User confirmed unload → proceed with switch. */
  async confirmSwitch(): Promise<void> {
    if (!pendingDecision || pendingDecision.type === 'allow') return;
    const { currentModel, nextModel } = pendingDecision;
    pendingDecision = null;
    await governor.unload(currentModel);
    loadedModel = nextModel;
  },

  /** User dismissed warning → continue without unloading. */
  dismissDecision() {
    if (!pendingDecision) return;
    if (pendingDecision.type !== 'allow') {
      loadedModel = pendingDecision.nextModel;
    }
    pendingDecision = null;
  },

  /** Mark a model as loaded (call after model confirmed active). */
  setLoaded(modelName: string) {
    loadedModel = modelName;
  },
};
