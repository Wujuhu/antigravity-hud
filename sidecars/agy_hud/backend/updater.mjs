/**
 * Self-update checker & zero-dependency applier adapted from
 * aishadiaodeqishui/agy-monitor (backend/updater.mjs, MIT License).
 *
 * Checks GitHub Releases API for newer versions and optionally applies updates
 * in-place to the installed plugin directory while preserving user settings.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

export function validateRepoSlug(raw = '') {
  const s = String(raw || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  if (!REPO_SLUG_RE.test(s)) return '';
  return s;
}

export function compareSemver(a, b) {
  const parse = (v) =>
    String(v || '0.0.0')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function isAllowedDownloadUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    return u.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function readInstalledVersion(pluginRoot) {
  try {
    const raw = fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return String(parsed?.version || '1.0.0').trim();
  } catch {
    return '1.0.0';
  }
}

async function fetchJsonWithTimeout(fetchImpl, url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'agy-hud-updater/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdates({
  repoSlug = '',
  currentVersion = '1.0.0',
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
} = {}) {
  const slug = validateRepoSlug(repoSlug);
  if (!slug) {
    return {
      ok: false,
      configured: false,
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      checkedAtMs: nowMs,
      error: '尚未配置 GitHub 仓库地址（格式：owner/repo）',
    };
  }

  try {
    const apiUrl = `https://api.github.com/repos/${slug}/releases/latest`;
    const release = await fetchJsonWithTimeout(fetchImpl, apiUrl);
    const latestVersion = String(release?.tag_name || release?.name || '').replace(/^v/i, '').trim();
    if (!latestVersion) {
      throw new Error('Release 未包含有效版本号');
    }

    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const zipAsset = assets.find((a) => /\.zip$/i.test(String(a?.name || '')) && isAllowedDownloadUrl(a?.browser_download_url));
    const downloadUrl =
      (zipAsset && zipAsset.browser_download_url) ||
      (isAllowedDownloadUrl(release?.zipball_url) ? release.zipball_url : '');

    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

    return {
      ok: true,
      configured: true,
      repoSlug: slug,
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl: release?.html_url || `https://github.com/${slug}/releases/latest`,
      releaseNotes: typeof release?.body === 'string' ? release.body.slice(0, 600) : '',
      publishedAt: release?.published_at || '',
      downloadUrl,
      checkedAtMs: nowMs,
      error: '',
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      repoSlug: slug,
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      checkedAtMs: nowMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function extractZipArchive(zipPath, extractDir, { platform = process.platform, execFileImpl = execFileAsync } = {}) {
  await fsp.mkdir(extractDir, { recursive: true });
  if (platform === 'win32') {
    try {
      await execFileImpl('tar.exe', ['-xf', zipPath, '-C', extractDir], { timeout: 25000 });
      return;
    } catch {
      await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(extractDir, { recursive: true });
      await execFileImpl(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
        ],
        { timeout: 30000 },
      );
      return;
    }
  }
  try {
    await execFileImpl('unzip', ['-q', '-o', zipPath, '-d', extractDir], { timeout: 25000 });
  } catch {
    await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await fsp.mkdir(extractDir, { recursive: true });
    await execFileImpl('python3', ['-m', 'zipfile', '-e', zipPath, extractDir], { timeout: 25000 });
  }
}

function resolveExtractedPluginRoot(extractDir) {
  if (fs.existsSync(path.join(extractDir, 'plugin.json'))) {
    return extractDir;
  }
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const cand = path.join(extractDir, e.name);
    if (fs.existsSync(path.join(cand, 'plugin.json'))) {
      return cand;
    }
  }
  return '';
}

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

/**
 * Download and apply an update zip safely into `targetPluginDir` without touching user data.
 */
export async function applyPluginUpdate({
  downloadUrl,
  targetPluginDir,
  fetchImpl = globalThis.fetch,
  execFileImpl = execFileAsync,
  platform = process.platform,
} = {}) {
  if (!isAllowedDownloadUrl(downloadUrl)) {
    throw new Error('更新包下载地址不在受信任的 GitHub HTTPS 域名白名单中');
  }
  if (!targetPluginDir || !fs.existsSync(targetPluginDir)) {
    throw new Error('未找到有效的本地插件安装目录');
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agy-hud-update-'));
  const zipPath = path.join(tmpDir, 'release.zip');
  const extractDir = path.join(tmpDir, 'extracted');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let buf;
    try {
      const res = await fetchImpl(downloadUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'agy-hud-updater/1.0' },
      });
      if (!res.ok) throw new Error(`下载更新包失败: HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }

    if (buf.length < 128 || buf.length > 50 * 1024 * 1024) {
      throw new Error('更新包体积异常，已中止安装');
    }

    await fsp.writeFile(zipPath, buf);
    await extractZipArchive(zipPath, extractDir, { platform, execFileImpl });

    const extractedRoot = resolveExtractedPluginRoot(extractDir);
    if (
      !extractedRoot ||
      !fs.existsSync(path.join(extractedRoot, 'sidecars', 'agy_hud', 'main.mjs'))
    ) {
      throw new Error('解压后的更新包缺少核心插件文件（plugin.json 或 main.mjs）');
    }

    const items = ['plugin.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'assets', 'sidecars'];
    for (const rel of items) {
      const src = path.join(extractedRoot, rel);
      const dest = path.join(targetPluginDir, rel);
      if (fs.existsSync(src)) {
        await copyRecursive(src, dest);
      }
    }

    const newVersion = readInstalledVersion(targetPluginDir);
    return {
      ok: true,
      updatedVersion: newVersion,
      targetPluginDir,
    };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
