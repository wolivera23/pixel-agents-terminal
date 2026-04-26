import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BASH_COMMAND_DISPLAY_MAX_LENGTH } from '../../../constants.js';
import type { HookProvider, ProviderEvent } from '../../../provider.js';
import {
  areHooksInstalled as installerAreHooksInstalled,
  installHooks as installerInstallHooks,
  uninstallHooks as installerUninstallHooks,
} from './codexHookInstaller.js';

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatCommand(command: string): string {
  return command.length > BASH_COMMAND_DISPLAY_MAX_LENGTH
    ? command.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026'
    : command;
}

export function formatToolStatus(toolName: string, input?: unknown): string {
  const inp = parseObject(input);
  switch (toolName) {
    case 'shell_command':
    case 'Bash':
    case 'shell': {
      const command = typeof inp.command === 'string' ? inp.command : '';
      return command ? `Running: ${formatCommand(command)}` : 'Running command';
    }
    case 'apply_patch':
    case 'Edit':
    case 'Write':
      return 'Editing files';
    case 'view_image': {
      const imagePath = typeof inp.path === 'string' ? path.basename(inp.path) : '';
      return imagePath ? `Reading ${imagePath}` : 'Reading image';
    }
    case 'web_search':
    case 'web.run':
      return 'Searching web';
    case 'multi_tool_use.parallel':
      return 'Running tools';
    case 'spawn_agent':
      return 'Running subtask';
    default:
      if (toolName.startsWith('mcp__')) return `Using ${toolName.replace(/^mcp__/, '')}`;
      return `Using ${toolName}`;
  }
}

function getCodexSessionsRoot(): string {
  return path.join(os.homedir(), '.codex', 'sessions');
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function readSessionMeta(filePath: string): { sessionId: string; cwd: string } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n')[0];
    const record = JSON.parse(firstLine) as Record<string, unknown>;
    if (record.type !== 'session_meta') return null;
    const payload = parseObject(record.payload);
    const sessionId = payload.id;
    const cwd = payload.cwd;
    if (typeof sessionId !== 'string' || typeof cwd !== 'string') return null;
    return { sessionId, cwd };
  } catch {
    return null;
  }
}

function collectSessionFiles(root: string, createdAt: number): string[] {
  const files: Array<{ file: string; mtime: number }> = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs >= createdAt - 2000) {
          files.push({ file: full, mtime: stat.mtimeMs });
        }
      } catch {
        /* ignore */
      }
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime).map((f) => f.file);
}

function findTranscript(
  cwd: string,
  createdAt: number,
  trackedFiles: ReadonlySet<string>,
): { transcriptPath: string; projectDir: string; sessionId: string } | null {
  const expectedCwd = normalizePath(cwd);
  const tracked = new Set([...trackedFiles].map(normalizePath));
  for (const file of collectSessionFiles(getCodexSessionsRoot(), createdAt)) {
    if (tracked.has(normalizePath(file))) continue;
    const meta = readSessionMeta(file);
    if (!meta) continue;
    if (normalizePath(meta.cwd) !== expectedCwd) continue;
    return {
      transcriptPath: file,
      projectDir: path.dirname(file),
      sessionId: meta.sessionId,
    };
  }
  return null;
}

function buildLaunchCommand(
  _sessionId: string,
  cwd: string,
  options?: { bypassPermissions?: boolean },
): { command: string; args: string[]; env?: Record<string, string> } {
  const args = ['--enable', 'codex_hooks', '--cd', cwd];
  if (options?.bypassPermissions) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }
  return { command: 'codex', args, env: { PWD: cwd } };
}

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: ProviderEvent } | null {
  const eventName = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof eventName !== 'string' || typeof sessionId !== 'string') return null;

  switch (eventName) {
    case 'PreToolUse': {
      const toolName = typeof raw.tool_name === 'string' ? raw.tool_name : '';
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: typeof raw.tool_use_id === 'string' ? raw.tool_use_id : `hook-${Date.now()}`,
          toolName,
          input: raw.tool_input,
        },
      };
    }

    case 'PostToolUse':
      return { sessionId, event: { kind: 'toolEnd', toolId: 'current' } };

    case 'PostToolUseFailure':
      return {
        sessionId,
        event: {
          kind: 'toolEnd',
          toolId: 'current',
          success: false,
          toolName: typeof raw.tool_name === 'string' ? raw.tool_name : undefined,
          error: typeof raw.error === 'string' ? raw.error : undefined,
        },
      };

    case 'Stop':
      return { sessionId, event: { kind: 'turnEnd' } };

    case 'UserPromptSubmit':
      return { sessionId, event: { kind: 'userTurn' } };

    case 'PermissionRequest':
      return {
        sessionId,
        event: {
          kind: 'permissionRequest',
          toolName: typeof raw.tool_name === 'string' ? raw.tool_name : undefined,
          input: raw.tool_input,
        },
      };

    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: typeof raw.source === 'string' ? raw.source : undefined,
        },
      };

    case 'SessionEnd':
      return {
        sessionId,
        event: {
          kind: 'sessionEnd',
          reason: typeof raw.reason === 'string' ? raw.reason : undefined,
        },
      };

    default:
      return null;
  }
}

function installHooks(_serverUrl: string, _authToken: string): Promise<void> {
  installerInstallHooks();
  return Promise.resolve();
}

function uninstallHooks(): Promise<void> {
  installerUninstallHooks();
  return Promise.resolve();
}

function areHooksInstalled(): Promise<boolean> {
  return Promise.resolve(installerAreHooksInstalled());
}

export const codexProvider: HookProvider = {
  kind: 'hook',
  id: 'codex',
  displayName: 'Codex',

  normalizeHookEvent,

  installHooks,
  uninstallHooks,
  areHooksInstalled,

  formatToolStatus,
  permissionExemptTools: new Set(['spawn_agent']),
  subagentToolNames: new Set(['spawn_agent']),

  getSessionDirs: () => [getCodexSessionsRoot()],
  sessionFilePattern: '*.jsonl',
  buildLaunchCommand,
  findTranscript,
};
