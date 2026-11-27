/**
 * Windows CDP launcher generator adapted from aishadiaodeqishui/agy-monitor
 * (backend/cdp_theme_bridge.mjs, MIT License).
 *
 * Generates zero-console desktop launchers (.lnk + silent .vbs + .cmd) that
 * start Antigravity with `--remote-debugging-port=<port>` without touching
 * app.asar or any installation files.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_CDP_PORT, atomicWriteText, normalizeCdpPort } from './config.mjs';

const execFileAsync = promisify(execFile);

function escapeVbsString(str) {
  return String(str || '').replace(/"/g, '""');
}

export function findWindowsAntigravityExe(env = process.env) {
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    path.join(localAppData, 'Programs', 'antigravity', 'Antigravity.exe'),
    path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
    path.join(programFiles, 'Antigravity', 'Antigravity.exe'),
  ];
  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand)) return { exePath: cand, found: true };
    } catch {
      // ignore probe errors
    }
  }
  return { exePath: candidates[0], found: false };
}

export function buildWindowsVbsContent(exePath, port = DEFAULT_CDP_PORT) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const cdpArg = `--remote-debugging-port=${p}`;
  return [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${escapeVbsString(exePath)}"" ${cdpArg}", 1, False`,
    '',
  ].join('\r\n');
}

export function buildWindowsCmdContent(vbsPath, exePath, port = DEFAULT_CDP_PORT) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const cdpArg = `--remote-debugging-port=${p}`;
  const portLabel = p === 0 ? 'auto' : `:${p}`;
  return [
    '@echo off',
    'chcp 65001 >nul',
    `rem 静默启动 Antigravity CDP 模式 (${portLabel})，不修改 app.asar`,
    vbsPath
      ? `start "" wscript.exe //Nologo "${vbsPath}"`
      : `start "" /b "${exePath}" ${cdpArg}`,
    'exit /b 0',
    '',
  ].join('\r\n');
}

export async function createWindowsShortcutLnk({
  lnkPath,
  targetPath,
  args = '',
  workingDir = '',
  description = 'Antigravity (CDP HUD)',
}) {
  const helperVbs = path.join(
    os.tmpdir(),
    `agy-hud-mklnk-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.vbs`,
  );
  const script = [
    'Set sh = CreateObject("WScript.Shell")',
    `Set sc = sh.CreateShortcut("${escapeVbsString(lnkPath)}")`,
    `sc.TargetPath = "${escapeVbsString(targetPath)}"`,
    args ? `sc.Arguments = "${escapeVbsString(args)}"` : '',
    workingDir ? `sc.WorkingDirectory = "${escapeVbsString(workingDir)}"` : '',
    `sc.IconLocation = "${escapeVbsString(targetPath)},0"`,
    `sc.Description = "${escapeVbsString(description)}"`,
    'sc.WindowStyle = 1',
    'sc.Save',
    '',
  ]
    .filter(Boolean)
    .join('\r\n');

  try {
    await fsp.mkdir(path.dirname(lnkPath), { recursive: true });
    const bomBuf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(script, 'utf16le')]);
    await fsp.writeFile(helperVbs, bomBuf);
    await execFileAsync('wscript.exe', ['//Nologo', helperVbs], {
      windowsHide: true,
      timeout: 8000,
    });
    return fs.existsSync(lnkPath);
  } catch {
    return false;
  } finally {
    await fsp.unlink(helperVbs).catch(() => {});
  }
}

export function detectWindowsCdpLauncher({
  dataDir = '',
  desktopDir = path.join(os.homedir(), 'Desktop'),
  port = DEFAULT_CDP_PORT,
  exePathOverride = '',
} = {}) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const detected = exePathOverride
    ? { exePath: exePathOverride, found: fs.existsSync(exePathOverride) }
    : findWindowsAntigravityExe();
  const desktopLnkPath = desktopDir ? path.join(desktopDir, 'Antigravity (HUD).lnk') : '';
  const fallbackLnkPath = dataDir ? path.join(dataDir, 'launchers', 'Antigravity (HUD).lnk') : '';

  const desktopDirExists = Boolean(desktopDir && fs.existsSync(desktopDir));
  const desktopLnkExists = Boolean(desktopLnkPath && fs.existsSync(desktopLnkPath));
  const fallbackLnkExists = Boolean(fallbackLnkPath && fs.existsSync(fallbackLnkPath));

  // On normal Windows desktops, treat Desktop shortcut as the primary launcher
  // so deleting it from Desktop is accurately detected and regenerated.
  const exists = desktopDirExists ? desktopLnkExists : fallbackLnkExists;
  const launcherPath = desktopDirExists
    ? desktopLnkPath
    : fallbackLnkExists
      ? fallbackLnkPath
      : desktopLnkPath || fallbackLnkPath;

  return {
    platform: 'win32',
    port: p,
    exists,
    launcherPath,
    desktopLnkPath,
    fallbackLnkPath,
    exePath: detected.exePath,
    exeFound: detected.found,
    manualCommand: `"${detected.exePath}" --remote-debugging-port=${p}`,
  };
}

export async function generateWindowsCdpLauncher({
  dataDir,
  desktopDir = path.join(os.homedir(), 'Desktop'),
  port = DEFAULT_CDP_PORT,
  exePathOverride = '',
  createDesktopShortcut = true,
  skipWscript = false,
} = {}) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const detected = exePathOverride
    ? { exePath: exePathOverride, found: fs.existsSync(exePathOverride) }
    : findWindowsAntigravityExe();

  const outDir = path.join(dataDir, 'launchers');
  await fsp.mkdir(outDir, { recursive: true });

  const vbsPath = path.join(outDir, 'launch_antigravity_cdp.vbs');
  const cmdPath = path.join(outDir, 'Antigravity_HUD.cmd');
  const lnkPath = path.join(outDir, 'Antigravity (HUD).lnk');
  const desktopLnkPath = path.join(desktopDir, 'Antigravity (HUD).lnk');
  const legacyLnkPath = path.join(outDir, 'Antigravity (CDP).lnk');
  const legacyDesktopLnkPath = path.join(desktopDir, 'Antigravity (CDP).lnk');

  const vbsContent = buildWindowsVbsContent(detected.exePath, p);
  const vbsBuf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbsContent, 'utf16le')]);
  await fsp.writeFile(vbsPath, vbsBuf);

  const cmdContent = buildWindowsCmdContent(vbsPath, detected.exePath, p);
  await atomicWriteText(cmdPath, cmdContent);

  let lnkCreated = false;
  let desktopLnkCreated = false;
  if (!skipWscript && process.platform === 'win32') {
    const workDir = path.dirname(detected.exePath);
    const args = `--remote-debugging-port=${p}`;
    const desc = p === 0 ? 'Antigravity (AGY HUD CDP Auto)' : `Antigravity (AGY HUD CDP :${p})`;
    lnkCreated = await createWindowsShortcutLnk({
      lnkPath,
      targetPath: detected.exePath,
      args,
      workingDir: workDir,
      description: desc,
    });
    if (createDesktopShortcut && fs.existsSync(desktopDir)) {
      if (lnkCreated) {
        try {
          await fsp.copyFile(lnkPath, desktopLnkPath);
          desktopLnkCreated = fs.existsSync(desktopLnkPath);
        } catch {
          desktopLnkCreated = false;
        }
      }
      if (!desktopLnkCreated) {
        desktopLnkCreated = await createWindowsShortcutLnk({
          lnkPath: desktopLnkPath,
          targetPath: detected.exePath,
          args,
          workingDir: workDir,
          description: desc,
        });
      }
      if (desktopLnkCreated && fs.existsSync(legacyDesktopLnkPath)) {
        await fsp.unlink(legacyDesktopLnkPath).catch(() => {});
      }
    }
    if (lnkCreated && fs.existsSync(legacyLnkPath)) {
      await fsp.unlink(legacyLnkPath).catch(() => {});
    }
  }

  return {
    platform: 'win32',
    port: p,
    exePath: detected.exePath,
    exeFound: detected.found,
    vbsPath,
    cmdPath,
    lnkPath: desktopLnkCreated ? desktopLnkPath : lnkCreated ? lnkPath : cmdPath,
    desktopLnkCreated,
    manualCommand: `"${detected.exePath}" --remote-debugging-port=${p}`,
  };
}
