import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../../../constants.js';
import { CODEX_HOOK_EVENTS, CODEX_HOOK_SCRIPT_NAME } from './constants.js';

/** Marker string used to identify Pixel Agents hook entries in Codex hooks.json. */
const HOOK_SCRIPT_MARKER = CODEX_HOOK_SCRIPT_NAME;

interface CodexHookEntry {
  matcher?: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
    statusMessage?: string;
  }>;
}

interface CodexHooksJson {
  hooks?: Record<string, CodexHookEntry[]>;
  [key: string]: unknown;
}

function getCodexDir(): string {
  return path.join(os.homedir(), '.codex');
}

function getCodexHooksPath(): string {
  return path.join(getCodexDir(), 'hooks.json');
}

function getCodexConfigPath(): string {
  return path.join(getCodexDir(), 'config.toml');
}

function getHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, CODEX_HOOK_SCRIPT_NAME);
}

function readCodexHooks(): CodexHooksJson {
  const hooksPath = getCodexHooksPath();
  try {
    if (fs.existsSync(hooksPath)) {
      return JSON.parse(fs.readFileSync(hooksPath, 'utf-8')) as CodexHooksJson;
    }
  } catch (e) {
    console.error(`[Pixel Agents] Failed to read Codex hooks.json: ${e}`);
  }
  return {};
}

function writeCodexHooks(hooksJson: CodexHooksJson): void {
  const hooksPath = getCodexHooksPath();
  const dir = path.dirname(hooksPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = hooksPath + '.pixel-agents-tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(hooksJson, null, 2), 'utf-8');
    fs.renameSync(tmpPath, hooksPath);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to write Codex hooks.json: ${e}`);
  }
}

function isOurHookEntry(entry: CodexHookEntry): boolean {
  return entry.hooks.some((h) => h.command.includes(HOOK_SCRIPT_MARKER));
}

function makeHookCommand(): string {
  return `node "${getHookScriptPath()}"`;
}

function makeHookEntry(): CodexHookEntry {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: makeHookCommand(),
        timeout: 5,
      },
    ],
  };
}

function ensureCodexHooksFeatureEnabled(): void {
  const configPath = getCodexConfigPath();
  const dir = path.dirname(configPath);
  let raw = '';
  try {
    if (fs.existsSync(configPath)) {
      raw = fs.readFileSync(configPath, 'utf-8');
    }

    if (/^\s*codex_hooks\s*=\s*true\s*$/m.test(raw)) return;

    let next = raw;
    if (/^\s*codex_hooks\s*=\s*false\s*$/m.test(next)) {
      next = next.replace(/^(\s*codex_hooks\s*=\s*)false\s*$/m, '$1true');
    } else if (/^\[features\]\s*$/m.test(next)) {
      next = next.replace(/^(\[features\]\s*)$/m, '$1\ncodex_hooks = true');
    } else {
      const separator = next.trim().length > 0 && !next.endsWith('\n') ? '\n\n' : '';
      next += `${separator}[features]\ncodex_hooks = true\n`;
    }

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = configPath + '.pixel-agents-tmp';
    fs.writeFileSync(tmpPath, next, 'utf-8');
    fs.renameSync(tmpPath, configPath);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to enable Codex hooks feature: ${e}`);
  }
}

export function areHooksInstalled(): boolean {
  const hooksJson = readCodexHooks();
  if (!hooksJson.hooks) return false;
  return CODEX_HOOK_EVENTS.every((event) => {
    const entries = hooksJson.hooks?.[event];
    return Array.isArray(entries) && entries.some(isOurHookEntry);
  });
}

export function installHooks(): void {
  ensureCodexHooksFeatureEnabled();

  const hooksJson = readCodexHooks();
  if (!hooksJson.hooks) {
    hooksJson.hooks = {};
  }

  let changed = false;
  for (const event of CODEX_HOOK_EVENTS) {
    if (!Array.isArray(hooksJson.hooks[event])) {
      hooksJson.hooks[event] = [];
    }
    const entries = hooksJson.hooks[event];
    const filtered = entries.filter((e) => !isOurHookEntry(e));
    filtered.push(makeHookEntry());
    if (JSON.stringify(filtered) !== JSON.stringify(entries)) {
      hooksJson.hooks[event] = filtered;
      changed = true;
    }
  }

  if (changed) {
    writeCodexHooks(hooksJson);
    console.log('[Pixel Agents] Hooks installed in ~/.codex/hooks.json');
  }
}

export function uninstallHooks(): void {
  const hooksJson = readCodexHooks();
  if (!hooksJson.hooks) return;

  let changed = false;
  for (const event of Object.keys(hooksJson.hooks)) {
    const entries = hooksJson.hooks[event];
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((e) => !isOurHookEntry(e));
    if (filtered.length !== entries.length) {
      hooksJson.hooks[event] = filtered;
      changed = true;
    }
    if (hooksJson.hooks[event].length === 0) {
      delete hooksJson.hooks[event];
    }
  }
  if (Object.keys(hooksJson.hooks).length === 0) {
    delete hooksJson.hooks;
  }

  if (changed) {
    writeCodexHooks(hooksJson);
    console.log('[Pixel Agents] Hooks removed from ~/.codex/hooks.json');
  }
}

export function copyHookScript(extensionPath: string): void {
  const src = path.join(extensionPath, 'dist', 'hooks', CODEX_HOOK_SCRIPT_NAME);
  const dst = getHookScriptPath();
  const dstDir = path.dirname(dst);

  try {
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(src)) {
      console.warn(`[Pixel Agents] Codex hook script not found at ${src}`);
      return;
    }
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o700);
    console.log(`[Pixel Agents] Codex hook script installed at ${dst}`);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to copy Codex hook script: ${e}`);
  }
}
