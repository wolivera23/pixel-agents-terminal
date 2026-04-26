import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpBase: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

const { areHooksInstalled, installHooks, uninstallHooks, copyHookScript } =
  await import('../src/providers/hook/codex/codexHookInstaller.js');

function readHooks(): Record<string, unknown> {
  const p = path.join(tmpBase, '.codex', 'hooks.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
}

function readConfig(): string {
  return fs.readFileSync(path.join(tmpBase, '.codex', 'config.toml'), 'utf-8');
}

describe('codexHookInstaller', () => {
  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-codex-hook-test-'));
    fs.mkdirSync(path.join(tmpBase, '.codex'), { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('installHooks adds entries to hooks.json and enables feature flag', () => {
    installHooks();
    const hooks = readHooks().hooks as Record<string, unknown[]>;
    expect(hooks['SessionStart']).toHaveLength(1);
    expect(hooks['PreToolUse']).toHaveLength(1);
    expect(hooks['PostToolUse']).toHaveLength(1);
    expect(hooks['Stop']).toHaveLength(1);
    expect(readConfig()).toContain('codex_hooks = true');
  });

  it('installHooks is idempotent', () => {
    installHooks();
    installHooks();
    const hooks = readHooks().hooks as Record<string, unknown[]>;
    expect(hooks['PreToolUse']).toHaveLength(1);
    expect(hooks['Stop']).toHaveLength(1);
  });

  it('areHooksInstalled tracks install and uninstall', () => {
    expect(areHooksInstalled()).toBe(false);
    installHooks();
    expect(areHooksInstalled()).toBe(true);
    uninstallHooks();
    expect(areHooksInstalled()).toBe(false);
  });

  it('copyHookScript copies to ~/.pixel-agents/hooks/', () => {
    const mockExtPath = path.join(tmpBase, 'mock-ext');
    const hookSrc = path.join(mockExtPath, 'dist', 'hooks');
    fs.mkdirSync(hookSrc, { recursive: true });
    fs.writeFileSync(path.join(hookSrc, 'codex-hook.js'), '// mock hook script');

    copyHookScript(mockExtPath);

    const dst = path.join(tmpBase, '.pixel-agents', 'hooks', 'codex-hook.js');
    expect(fs.existsSync(dst)).toBe(true);
    expect(fs.readFileSync(dst, 'utf-8')).toBe('// mock hook script');
  });
});
