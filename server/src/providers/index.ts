/**
 * Provider registry: re-exports all bundled providers.
 *
 * Adding a new CLI provider:
 *   1. Create `server/src/providers/hook/<cli>/<cli>.ts` implementing HookProvider.
 *      (File-based and stream-based provider types will land when the first such
 *       provider ships.)
 *   2. Add an export line below.
 *
 * The adapter (VS Code extension, standalone CLI, etc.) imports from here rather
 * than reaching into each provider directory directly.
 */

import type { HookProvider } from '../provider.js';
import { claudeProvider } from './hook/claude/claude.js';
import {
  copyHookScript as copyClaudeHookScript,
  installHooks as installClaudeHooks,
  uninstallHooks as uninstallClaudeHooks,
} from './hook/claude/claudeHookInstaller.js';
import { codexProvider } from './hook/codex/codex.js';
import {
  copyHookScript as copyCodexHookScript,
  installHooks as installCodexHooks,
  uninstallHooks as uninstallCodexHooks,
} from './hook/codex/codexHookInstaller.js';

export { claudeProvider } from './hook/claude/claude.js';
export { codexProvider } from './hook/codex/codex.js';

export const hookProviders: HookProvider[] = [claudeProvider, codexProvider];
export const hookProvidersById = new Map(hookProviders.map((provider) => [provider.id, provider]));

export function installAllHooks(): void {
  installClaudeHooks();
  installCodexHooks();
}

export function uninstallAllHooks(): void {
  uninstallClaudeHooks();
  uninstallCodexHooks();
}

export function copyAllHookScripts(extensionPath: string): void {
  copyClaudeHookScript(extensionPath);
  copyCodexHookScript(extensionPath);
}
