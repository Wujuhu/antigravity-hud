import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_CDP_PORT,
  PILL_ITEM_CATALOG,
  POPOVER_SECTION_CATALOG,
  createConfigStore,
  createDefaultConfig,
  normalizeConfig,
} from '../sidecars/agy_hud/backend/config.mjs';

test('default config matches expected initial pill items and popover sections', () => {
  const cfg = createDefaultConfig();
  assert.equal(cfg.cdpPort, DEFAULT_CDP_PORT);
  assert.equal(cfg.cdpEnabled, true);
  assert.equal(cfg.contextDisplayFormat, 'percent');
  assert.equal(cfg.windowCapMode, 'auto');

  const enabledPillIds = cfg.pillItems.filter((x) => x.enabled).map((x) => x.id);
  assert.deepEqual(enabledPillIds, ['context', 'speed', 'quota']);
  assert.equal(cfg.pillItems.length, PILL_ITEM_CATALOG.length);
  assert.equal(cfg.popoverSections.length, POPOVER_SECTION_CATALOG.length);
});

test('normalizeConfig preserves custom order, deduplicates, drops unknown IDs, and appends missing catalog items', () => {
  const normalized = normalizeConfig({
    cdpPort: 99999,
    contextDisplayFormat: 'both',
    windowCapMode: '512000',
    pillItems: [
      { id: 'quota', enabled: true },
      { id: 'cache', enabled: true },
      { id: 'quota', enabled: false }, // duplicate should be ignored
      { id: 'invalid_metric', enabled: true }, // unknown should be dropped
      { id: 'context', enabled: true },
    ],
    popoverSections: [
      { id: 'quotaGroups', enabled: true },
      { id: 'speedAndCache', enabled: false },
    ],
  });

  assert.equal(normalized.cdpPort, 65535);
  assert.equal(normalized.contextDisplayFormat, 'both');
  assert.equal(normalized.windowCapMode, 512000);

  assert.deepEqual(
    normalized.pillItems.slice(0, 3),
    [
      { id: 'quota', enabled: true },
      { id: 'cache', enabled: true },
      { id: 'context', enabled: true },
    ],
  );
  // Missing items appended automatically
  assert.equal(normalized.pillItems.length, PILL_ITEM_CATALOG.length);

  assert.deepEqual(
    normalized.popoverSections.slice(0, 2),
    [
      { id: 'quotaGroups', enabled: true },
      { id: 'speedAndCache', enabled: false },
    ],
  );
  assert.equal(normalized.popoverSections.length, POPOVER_SECTION_CATALOG.length);
});

test('createConfigStore persists custom ordering atomically and supports reset', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-cfg-'));
  try {
    const store = createConfigStore(tmpDir);
    const saved = await store.save({
      cdpPort: 9333,
      pillItems: [
        { id: 'speed', enabled: true },
        { id: 'context', enabled: true },
      ],
    });
    assert.equal(saved.cdpPort, 9333);
    assert.equal(saved.pillItems[0].id, 'speed');

    // Re-open fresh store pointing to same dir
    const store2 = createConfigStore(tmpDir);
    assert.equal(store2.get().cdpPort, 9333);
    assert.equal(store2.get().pillItems[0].id, 'speed');

    const resetCfg = await store2.reset();
    assert.equal(resetCfg.cdpPort, DEFAULT_CDP_PORT);
    assert.equal(resetCfg.pillItems[0].id, 'context');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
