import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CDP_PORT = 9229;

export const PILL_ITEM_CATALOG = [
  { id: 'context', label: '上下文占用', defaultEnabled: true, description: 'SVG 进度圆环 + 占比或 Token 数' },
  { id: 'speed', label: '实时生成速率', defaultEnabled: true, description: '本轮生成速度（tok/s）' },
  { id: 'quota', label: '当前模型 5h 额度', defaultEnabled: true, description: '当前对话所属分组的 5 小时剩余百分比' },
  { id: 'cache', label: '本轮缓存命中率', defaultEnabled: false, description: '最近一轮 Prompt Cache 命中比例' },
  { id: 'tokens', label: '会话累计消耗', defaultEnabled: false, description: '当前会话累计输入+输出总 Token 数' },
  { id: 'model', label: '真实上游模型', defaultEnabled: false, description: '最近一轮实际响应的模型 ID' },
];

export const POPOVER_SECTION_CATALOG = [
  { id: 'contextOverview', label: '上下文总览进度条', defaultEnabled: true, description: '当前模型名、精确 Token / 窗口上限与总进度条' },
  { id: 'contextBreakdown', label: '上下文 5 类构成拆解', defaultEnabled: true, description: '系统底座、规则/技能、对话历史、工具输出、思考占比条与图例' },
  { id: 'speedAndCache', label: '速率、Token 与缓存双列', defaultEnabled: true, description: '本轮/平均 tok/s、本轮输出、本轮缓存命中率与累计总命中率' },
  { id: 'quotaGroups', label: '全分组账号剩余额度', defaultEnabled: true, description: 'Gemini / GPT&Claude / Argon 的 5h 与周额度及重置倒计时' },
];

const VALID_PILL_IDS = new Set(PILL_ITEM_CATALOG.map((item) => item.id));
const VALID_SECTION_IDS = new Set(POPOVER_SECTION_CATALOG.map((item) => item.id));
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

function normalizeOrderedItems(rawList, catalog, validSet) {
  const result = [];
  const seen = new Set();

  if (Array.isArray(rawList)) {
    for (const entry of rawList) {
      const id = typeof entry === 'string' ? entry.trim() : typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (!id || !validSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      const catalogDef = catalog.find((c) => c.id === id);
      const enabled = typeof entry === 'object' && entry !== null && typeof entry.enabled === 'boolean'
        ? entry.enabled
        : Boolean(catalogDef?.defaultEnabled);
      result.push({ id, enabled });
    }
  }

  // Append any missing catalog items in default order so upgrades never lose new metrics
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
    pillItems: normalizeOrderedItems(src.pillItems, PILL_ITEM_CATALOG, VALID_PILL_IDS),
    popoverSections: normalizeOrderedItems(src.popoverSections, POPOVER_SECTION_CATALOG, VALID_SECTION_IDS),
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
