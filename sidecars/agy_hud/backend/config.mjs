import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CDP_PORT = 9229;

export const PILL_ITEM_CATALOG = [
  { id: 'context', label: '上下文', defaultEnabled: true },
  { id: 'speed', label: '速率', defaultEnabled: true },
  { id: 'quota', label: '额度', defaultEnabled: true },
  { id: 'cache', label: '缓存命中', defaultEnabled: false },
  { id: 'tokens', label: '会话总计', defaultEnabled: false },
  { id: 'model', label: '上游模型', defaultEnabled: false },
];

export const POPOVER_SECTION_CATALOG = [
  { id: 'context', label: '上下文', defaultEnabled: true },
  { id: 'speedAndCache', label: '速率与缓存', defaultEnabled: true },
  { id: 'quota', label: '额度', defaultEnabled: true },
];

const VALID_PILL_IDS = new Set(PILL_ITEM_CATALOG.map((item) => item.id));
const VALID_SECTION_IDS = new Set(POPOVER_SECTION_CATALOG.map((item) => item.id));
const LEGACY_SECTION_MAP = {
  contextOverview: 'context',
  contextBreakdown: 'context',
  quotaGroups: 'quota',
};
const VALID_CONTEXT_FORMATS = new Set(['percent', 'tokens', 'both']);
const VALID_WINDOW_CAPS = new Set(['auto', 256000, 512000, 1048576]);

export function createDefaultConfig() {
  return {
    cdpEnabled: true,
    cdpPort: DEFAULT_CDP_PORT,
    pollIntervalMs: 1800,
    hoverDelayMs: 150,
    contextDisplayFormat: 'percent',
    windowCapMode: 'auto',
    updateRepoSlug: '',
    autoCheckUpdate: true,
    autoApplyUpdate: false,
    pillItems: PILL_ITEM_CATALOG.map(({ id, defaultEnabled }) => ({
      id,
      enabled: defaultEnabled,
    })),
    popoverSections: POPOVER_SECTION_CATALOG.map(({ id, defaultEnabled }) => ({
      id,
      enabled: defaultEnabled,
    })),
  };
}

function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeOrderedItems(rawList, catalog, validSet, legacyMap = null) {
  const result = [];
  const seen = new Set();

  if (Array.isArray(rawList)) {
    for (const entry of rawList) {
      let id = typeof entry === 'string' ? entry.trim() : typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (legacyMap && legacyMap[id]) id = legacyMap[id];
      if (!id || !validSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      const catalogDef = catalog.find((c) => c.id === id);
      const enabled = typeof entry === 'object' && entry !== null && typeof entry.enabled === 'boolean'
        ? entry.enabled
        : Boolean(catalogDef?.defaultEnabled);
      result.push({ id, enabled });
    }
  }

  for (const def of catalog) {
    if (!seen.has(def.id)) {
      result.push({ id: def.id, enabled: def.defaultEnabled });
    }
  }

  return result;
}

export function normalizeConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const defaults = createDefaultConfig();

  const contextDisplayFormat = VALID_CONTEXT_FORMATS.has(src.contextDisplayFormat)
    ? src.contextDisplayFormat
    : defaults.contextDisplayFormat;

  let windowCapMode = defaults.windowCapMode;
  if (src.windowCapMode === 'auto') {
    windowCapMode = 'auto';
  } else {
    const capNum = Number(src.windowCapMode);
    if (VALID_WINDOW_CAPS.has(capNum)) {
      windowCapMode = capNum;
    }
  }

  return {
    cdpEnabled: typeof src.cdpEnabled === 'boolean' ? src.cdpEnabled : defaults.cdpEnabled,
    cdpPort: clampInt(src.cdpPort, 1024, 65535, defaults.cdpPort),
    pollIntervalMs: clampInt(src.pollIntervalMs, 800, 10000, defaults.pollIntervalMs),
    hoverDelayMs: clampInt(src.hoverDelayMs, 0, 1000, defaults.hoverDelayMs),
    contextDisplayFormat,
    windowCapMode,
    updateRepoSlug: typeof src.updateRepoSlug === 'string' ? src.updateRepoSlug.trim().slice(0, 120) : defaults.updateRepoSlug,
    autoCheckUpdate: typeof src.autoCheckUpdate === 'boolean' ? src.autoCheckUpdate : defaults.autoCheckUpdate,
    autoApplyUpdate: typeof src.autoApplyUpdate === 'boolean' ? src.autoApplyUpdate : defaults.autoApplyUpdate,
    pillItems: normalizeOrderedItems(src.pillItems, PILL_ITEM_CATALOG, VALID_PILL_IDS),
    popoverSections: normalizeOrderedItems(
      src.popoverSections,
      POPOVER_SECTION_CATALOG,
      VALID_SECTION_IDS,
      LEGACY_SECTION_MAP,
    ),
  };
}

export function resolveDataDir(env = process.env) {
  if (env?.AGY_HUD_DATA_DIR && String(env.AGY_HUD_DATA_DIR).trim()) {
    return path.resolve(String(env.AGY_HUD_DATA_DIR).trim());
  }
  if (env?.PLUGIN_DATA && String(env.PLUGIN_DATA).trim()) {
    return path.resolve(String(env.PLUGIN_DATA).trim());
  }
  return path.join(os.homedir(), '.gemini', 'antigravity', 'plugin_data', 'agy-hud');
}

export async function atomicWriteText(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, filePath);
}

export async function atomicWriteJson(filePath, data) {
  await atomicWriteText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function createConfigStore(dataDir = resolveDataDir()) {
  const configFile = path.join(dataDir, 'config.json');
  let memoryCache = null;

  function loadSync() {
    if (memoryCache) return memoryCache;
    try {
      if (fs.existsSync(configFile)) {
        const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        memoryCache = normalizeConfig(parsed);
        return memoryCache;
      }
    } catch {
      // Fallback to defaults on corrupted file
    }
    memoryCache = createDefaultConfig();
    return memoryCache;
  }

  async function save(patchOrFull) {
    const current = loadSync();
    const merged = { ...current, ...(patchOrFull && typeof patchOrFull === 'object' ? patchOrFull : {}) };
    const normalized = normalizeConfig(merged);
    memoryCache = normalized;
    await atomicWriteJson(configFile, normalized);
    return normalized;
  }

  async function reset() {
    const fresh = createDefaultConfig();
    memoryCache = fresh;
    await atomicWriteJson(configFile, fresh);
    return fresh;
  }

  return {
    dataDir,
    configFile,
    get: loadSync,
    save,
    reset,
  };
}
