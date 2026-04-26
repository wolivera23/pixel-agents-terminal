/**
 * Standalone entry point — runs the hook receiver + WebSocket bridge so
 * the webview-ui can receive live Claude Code events without VS Code.
 *
 * Usage:  npx tsx server/src/standalone.ts
 *
 * The server:
 *  - Starts PixelAgentsServer (HTTP, receives Claude Code hook POSTs)
 *  - Installs hook scripts into ~/.pixel-agents/ and ~/.claude/settings.json
 *  - Opens a WebSocket server so the browser can receive real-time events
 *
 * Run `npm run dev` in webview-ui/ in a second terminal, then open
 * http://localhost:5173 in the browser.
 */

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { WebSocket, WebSocketServer } from 'ws';

import { DomainSessionBridge } from './domain/domainSessionBridge.js';
import type { DomainWsClientMessage } from './domain/wsProtocol.js';
import { copyAllHookScripts, hookProvidersById, installAllHooks } from './providers/index.js';
import { PixelAgentsServer } from './server.js';

// __dirname is available in CJS (the target this project compiles to)
// When running via tsx: server/src/standalone.ts → root is ../../
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const WS_PORT = parseInt(process.env.PIXEL_AGENTS_WS_PORT ?? '3000', 10);
const domainBridge = new DomainSessionBridge(hookProvidersById);

// ── Layout persistence (~/.pixel-agents/layout.json) ─────────────────────────

const LAYOUT_FILE = path.join(os.homedir(), '.pixel-agents', 'layout.json');

function readLayoutFile(): unknown | null {
  try {
    if (!fs.existsSync(LAYOUT_FILE)) return null;
    return JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

function writeLayoutFile(layout: unknown): void {
  try {
    const dir = path.dirname(LAYOUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = LAYOUT_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(layout), 'utf-8');
    fs.renameSync(tmp, LAYOUT_FILE);
  } catch (e) {
    console.error('[Pixel Agents] Failed to write layout.json:', e);
  }
}

// ── WebSocket clients ─────────────────────────────────────────────────────────

const clients = new Set<WebSocket>();

function broadcast(msg: object): void {
  const json = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// ── Token tracking (polls JSONL for assistant usage records) ─────────────────

const tokenPollers = new Map<number, { timer: ReturnType<typeof setInterval>; offset: number }>();
const agentTokens = new Map<number, { input: number; output: number }>();

function getClaudeJsonlPath(cwd: string, sessionId: string): string {
  const dirName = cwd.replace(/[^a-zA-Z0-9-]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', dirName, `${sessionId}.jsonl`);
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeFsPath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function readCodexSessionMeta(filePath: string): { sessionId: string; cwd: string } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n')[0];
    const record = JSON.parse(firstLine) as Record<string, unknown>;
    if (record.type !== 'session_meta') return null;
    const payload = parseRecord(record.payload);
    const id = payload.id;
    const cwd = payload.cwd;
    if (typeof id !== 'string' || typeof cwd !== 'string') return null;
    return { sessionId: id, cwd };
  } catch {
    return null;
  }
}

function findCodexJsonlPath(sessionId: string, cwd?: string): string | null {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  const expectedCwd = typeof cwd === 'string' ? normalizeFsPath(cwd) : null;
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
      const meta = readCodexSessionMeta(full);
      if (!meta || meta.sessionId !== sessionId) continue;
      if (expectedCwd && normalizeFsPath(meta.cwd) !== expectedCwd) continue;
      return full;
    }
  }
  return null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractTokenUsage(
  record: Record<string, unknown>,
): { input?: number; output?: number; absolute: boolean } | null {
  const messageUsage = parseRecord(parseRecord(record.message).usage);
  const messageInput = readNumber(messageUsage.input_tokens);
  const messageOutput = readNumber(messageUsage.output_tokens);
  if (messageInput !== undefined || messageOutput !== undefined) {
    return { input: messageInput, output: messageOutput, absolute: false };
  }

  const payload = parseRecord(record.payload);
  if (record.type === 'event_msg' && payload.type === 'token_count') {
    const info = parseRecord(payload.info);
    const lastUsage = parseRecord(info.last_token_usage);
    const lastInput = readNumber(lastUsage.input_tokens);
    const lastOutput = readNumber(lastUsage.output_tokens);
    if (lastInput !== undefined || lastOutput !== undefined) {
      return { input: lastInput, output: lastOutput, absolute: true };
    }

    const totalUsage = parseRecord(info.total_token_usage);
    const totalInput = readNumber(totalUsage.input_tokens);
    const totalOutput = readNumber(totalUsage.output_tokens);
    if (totalInput !== undefined || totalOutput !== undefined) {
      return { input: totalInput, output: totalOutput, absolute: true };
    }
  }

  return null;
}

function startTokenPoller(agentId: number, resolveJsonlPath: () => string | null): void {
  if (tokenPollers.has(agentId)) return;
  let jsonlPath: string | null = null;
  let offset = 0;
  let buf = '';
  const timer = setInterval(() => {
    try {
      jsonlPath ??= resolveJsonlPath();
      if (!jsonlPath) return;
      if (!fs.existsSync(jsonlPath)) return;
      const stat = fs.statSync(jsonlPath);
      if (stat.size <= offset) return;
      const fd = fs.openSync(jsonlPath, 'r');
      const chunk = Buffer.alloc(stat.size - offset);
      const bytesRead = fs.readSync(fd, chunk, 0, chunk.length, offset);
      fs.closeSync(fd);
      offset += bytesRead;
      buf += chunk.toString('utf-8', 0, bytesRead);
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          const usage = extractTokenUsage(record);
          if (!usage) continue;
          const cur = agentTokens.get(agentId) ?? { input: 0, output: 0 };
          if (usage.absolute) {
            cur.input = usage.input ?? cur.input;
            cur.output = usage.output ?? cur.output;
          } else {
            cur.input += usage.input ?? 0;
            cur.output += usage.output ?? 0;
          }
          agentTokens.set(agentId, cur);
          broadcast({
            type: 'agentTokenUsage',
            id: agentId,
            inputTokens: cur.input,
            outputTokens: cur.output,
          });
        } catch {
          /* skip malformed lines */
        }
      }
    } catch {
      /* file not ready */
    }
  }, 1000);
  tokenPollers.set(agentId, { timer, offset });
}

function stopTokenPoller(agentId: number): void {
  const p = tokenPollers.get(agentId);
  if (p) {
    clearInterval(p.timer);
    tokenPollers.delete(agentId);
  }
  agentTokens.delete(agentId);
}

// ── Agent state ───────────────────────────────────────────────────────────────

const agentCurrentToolId = new Map<number, string>();

// ── Hook event → webview message mapping ─────────────────────────────────────

function handleHookEvent(providerId: string, event: Record<string, unknown>): void {
  const sessionId = event.session_id as string | undefined;
  const hookName = event.hook_event_name as string | undefined;
  console.log(
    `[Hook] ${hookName ?? '?'} | session: ${sessionId?.slice(0, 8) ?? '?'} | clients: ${clients.size}`,
  );
  if (!sessionId || !hookName) return;

  const domainResult = domainBridge.handleHookEvent(providerId, event);
  if (!domainResult) return;
  const {
    agentId: id,
    isNewAgent,
    providerId: resolvedProviderId,
    folderName,
    domainMessages,
  } = domainResult;

  if (isNewAgent) {
    broadcast({ type: 'agentCreated', id, folderName, providerId: resolvedProviderId });
  }
  for (const msg of domainMessages) broadcast(msg);

  switch (hookName) {
    case 'SessionStart': {
      broadcast({ type: 'agentStatus', id, status: 'active' });
      // Poll provider JSONL files for token usage without changing the hook/WebSocket protocol.
      if (providerId === 'claude' && typeof event.cwd === 'string') {
        startTokenPoller(id, () => getClaudeJsonlPath(event.cwd as string, sessionId));
      } else if (providerId === 'codex') {
        startTokenPoller(id, () =>
          findCodexJsonlPath(sessionId, typeof event.cwd === 'string' ? event.cwd : undefined),
        );
      }
      break;
    }

    case 'SessionEnd': {
      broadcast({ type: 'agentToolsClear', id });
      broadcast({ type: 'agentClosed', id });
      agentCurrentToolId.delete(id);
      stopTokenPoller(id);
      break;
    }

    case 'UserPromptSubmit': {
      broadcast({ type: 'agentToolsClear', id });
      broadcast({ type: 'agentStatus', id, status: 'active' });
      break;
    }

    case 'PreToolUse': {
      const toolName = (event.tool_name as string | undefined) ?? 'Unknown';
      const toolInput = event.tool_input as Record<string, unknown> | undefined;
      const provider = hookProvidersById.get(providerId);
      // Use provider's formatToolStatus for rich status (e.g. "Reading main.py" vs "Read")
      const status = provider?.formatToolStatus(toolName, toolInput) ?? toolName;
      const toolId = `hook-${sessionId}-${Date.now()}`;
      agentCurrentToolId.set(id, toolId);
      broadcast({ type: 'agentToolStart', id, toolId, status, toolName });
      break;
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const toolId = agentCurrentToolId.get(id);
      if (toolId) {
        broadcast({ type: 'agentToolDone', id, toolId });
        agentCurrentToolId.delete(id);
      }
      break;
    }

    case 'Stop': {
      broadcast({ type: 'agentToolsClear', id });
      broadcast({ type: 'agentStatus', id, status: 'waiting' });
      break;
    }

    case 'PermissionRequest': {
      broadcast({ type: 'agentToolPermission', id });
      break;
    }

    case 'Notification': {
      const notifType = event.notification_type as string | undefined;
      if (notifType === 'permission_request') {
        broadcast({ type: 'agentToolPermission', id });
      }
      break;
    }

    // SubagentStart/Stop — skip for now (teams feature)
    default:
      break;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Install hook script + Claude Code settings entries
  try {
    copyAllHookScripts(PROJECT_ROOT);
    installAllHooks();
  } catch (e) {
    console.warn('[Pixel Agents] Could not auto-install hooks:', e);
    console.warn('[Pixel Agents] Run `npm run build` first so dist/hooks/*.js exists.');
  }

  // Start hook receiver (manages ~/.pixel-agents/server.json for hook scripts)
  const pixelServer = new PixelAgentsServer();
  pixelServer.onHookEvent(handleHookEvent);
  // forceOwn=true: standalone always takes ownership of server.json so hooks
  // reach this process (not a VS Code extension that may also be running).
  const serverConfig = await pixelServer.start(true);

  // HTTP + WebSocket server (browser connects here)
  const httpServer = http.createServer((_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pixel Agents Standalone Server\n');
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[Pixel Agents] Browser connected (${clients.size} active)`);

    function sendSync(): void {
      // Send saved layout first so seats exist before characters are placed
      const savedLayout = readLayoutFile();
      if (savedLayout) {
        ws.send(JSON.stringify({ type: 'layoutLoaded', layout: savedLayout }));
      }
      for (const agent of domainBridge.buildLegacyReplayAgents()) {
        ws.send(
          JSON.stringify({
            type: 'agentCreated',
            id: agent.agentId,
            folderName: agent.folderName,
            providerId: agent.providerId,
          }),
        );
        const tokens = agentTokens.get(agent.agentId);
        if (tokens) {
          ws.send(
            JSON.stringify({
              type: 'agentTokenUsage',
              id: agent.agentId,
              inputTokens: tokens.input,
              outputTokens: tokens.output,
            }),
          );
        }
      }
      ws.send(JSON.stringify(domainBridge.buildSnapshot()));
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as DomainWsClientMessage;
        if (msg.type === 'requestSync') {
          sendSync();
          return;
        }
        if (msg.type === 'saveLayout') {
          writeLayoutFile(msg.layout);
          return;
        }
        if (msg.type === 'closeAgent') {
          stopTokenPoller(msg.id);
          for (const domainMsg of domainBridge.removeAgent(msg.id)) {
            broadcast(domainMsg);
          }
          broadcast({ type: 'agentClosed', id: msg.id });
          return;
        }
        for (const domainMsg of domainBridge.handleClientMessage(msg)) {
          broadcast(domainMsg);
        }
      } catch {
        // Ignore malformed or unsupported client messages.
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[Pixel Agents] Browser disconnected (${clients.size} active)`);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(WS_PORT, '127.0.0.1', resolve);
  });

  console.log('');
  console.log('  Pixel Agents — Standalone Mode');
  console.log('  ──────────────────────────────────────────────');
  console.log(`  Hook server  →  http://127.0.0.1:${serverConfig.port}/api/hooks`);
  console.log(`  WebSocket    →  ws://127.0.0.1:${WS_PORT}/ws`);
  console.log('  UI           →  http://localhost:5173  (run: npm run dev in webview-ui/)');
  console.log('  ──────────────────────────────────────────────');
  console.log('  Claude Code and Codex hooks installed');
  console.log('');
}

main().catch(console.error);
