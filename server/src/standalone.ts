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

import * as http from 'http';
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
      break;
    }

    case 'SessionEnd': {
      broadcast({ type: 'agentToolsClear', id });
      broadcast({ type: 'agentClosed', id });
      agentCurrentToolId.delete(id);
      break;
    }

    case 'UserPromptSubmit': {
      broadcast({ type: 'agentToolsClear', id });
      broadcast({ type: 'agentStatus', id, status: 'active' });
      break;
    }

    case 'PreToolUse': {
      const toolName = (event.tool_name as string | undefined) ?? 'Unknown';
      const toolId = `hook-${sessionId}-${Date.now()}`;
      agentCurrentToolId.set(id, toolId);
      broadcast({ type: 'agentToolStart', id, toolId, status: toolName, toolName });
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
  const serverConfig = await pixelServer.start();

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

    // Replay existing agents so a reconnecting browser doesn't miss agentCreated
    for (const agent of domainBridge.buildLegacyReplayAgents()) {
      ws.send(
        JSON.stringify({
          type: 'agentCreated',
          id: agent.agentId,
          folderName: agent.folderName,
          providerId: agent.providerId,
        }),
      );
    }
    ws.send(JSON.stringify(domainBridge.buildSnapshot()));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as DomainWsClientMessage;
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
