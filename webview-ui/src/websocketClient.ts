import {
  playAgentSpawnSound,
  playToolStartSound,
  setSoundEnabled,
  startTypingLoop,
  stopTypingLoop,
  unlockAudio,
} from './notificationSound.js';

const WS_RECONNECT_DELAY_MS = 3000;
const WS_CONNECT_TIMEOUT_MS = 2000;

// Active connection — used by sendDomainMessage
let activeWs: WebSocket | null = null;

// Auto-reconnect only kicks in after a successful first connection
let reconnectEnabled = false;
let reconnectPort = 3000;

/**
 * Sends a domain message to the standalone server over the active WebSocket.
 * No-op when disconnected or in VS Code extension mode.
 */
export function sendDomainMessage(msg: object): void {
  if (activeWs?.readyState === WebSocket.OPEN) {
    activeWs.send(JSON.stringify(msg));
  }
}

function attachMessageHandler(ws: WebSocket): void {
  ws.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>;

      // Trigger sounds before dispatching
      if (data.type === 'agentCreated') void playAgentSpawnSound();
      if (data.type === 'agentToolStart') {
        void playToolStartSound();
        startTypingLoop();
      }
      if (
        data.type === 'agentToolDone' ||
        data.type === 'agentToolsClear' ||
        (data.type === 'agentStatus' && data.status === 'waiting')
      ) {
        stopTypingLoop();
      }

      window.dispatchEvent(new MessageEvent('message', { data }));
    } catch {
      // malformed message — ignore
    }
  });
}

function scheduleReconnect(): void {
  if (!reconnectEnabled) return;
  setTimeout(() => {
    console.log('[Pixel Agents] Attempting to reconnect...');
    openWebSocket(reconnectPort, null);
  }, WS_RECONNECT_DELAY_MS);
}

function openWebSocket(port: number, resolve: ((success: boolean) => void) | null): void {
  let resolved = false;

  const finish = (success: boolean) => {
    if (resolved) return;
    resolved = true;
    resolve?.(success);
  };

  const timeout = resolve ? setTimeout(() => finish(false), WS_CONNECT_TIMEOUT_MS) : null;

  let ws: WebSocket;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  } catch {
    if (timeout) clearTimeout(timeout);
    finish(false);
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    if (timeout) clearTimeout(timeout);
    activeWs = ws;
    reconnectEnabled = true;
    reconnectPort = port;
    finish(true);

    setSoundEnabled(true);
    unlockAudio();

    // Re-enable sounds and signal standalone mode after reconnect
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'settingsLoaded',
          soundEnabled: true,
          extensionVersion: '1.3.0',
          lastSeenVersion: '1.3.0',
        },
      }),
    );

    console.log('[Pixel Agents] Connected to standalone server — sounds enabled');

    attachMessageHandler(ws);
  });

  ws.addEventListener('close', () => {
    if (timeout) clearTimeout(timeout);
    activeWs = null;
    finish(false);
    window.dispatchEvent(new CustomEvent('pixelagents:ws-disconnected'));
    console.log('[Pixel Agents] Disconnected from standalone server');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    if (timeout) clearTimeout(timeout);
    finish(false);
    // close will fire next — reconnect handled there
  });
}

/**
 * Connects to the Pixel Agents standalone WebSocket server and relays
 * incoming messages as window MessageEvents.
 *
 * Sets up auto-reconnect after a successful first connection.
 * Returns true if connected within timeout, false otherwise.
 */
export function tryConnectWebSocket(port = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    openWebSocket(port, resolve);
  });
}
