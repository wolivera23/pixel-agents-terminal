import {
  playAgentSpawnSound,
  playToolStartSound,
  setSoundEnabled,
  unlockAudio,
} from './notificationSound.js';

/**
 * Connects to the Pixel Agents standalone WebSocket server and relays
 * incoming messages as window MessageEvents — the same mechanism used
 * by the VS Code extension's postMessage API.
 *
 * Also triggers synthesized sounds for key agent events.
 *
 * Returns true if the connection was established within the timeout,
 * false otherwise (caller falls back to mock mode).
 */
export function tryConnectWebSocket(port = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;

    const finish = (success: boolean): void => {
      if (resolved) return;
      resolved = true;
      resolve(success);
    };

    const timeout = setTimeout(() => finish(false), 2000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    } catch {
      clearTimeout(timeout);
      finish(false);
      return;
    }

    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      finish(true);

      // Enable sounds in standalone mode and unlock AudioContext
      setSoundEnabled(true);
      unlockAudio();

      // Override the soundEnabled: false that dispatchMockMessages sends
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

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          console.log('[Pixel Agents] WS →', data.type);

          // Trigger sounds before dispatching so they fire as early as possible
          if (data.type === 'agentCreated') void playAgentSpawnSound();
          if (data.type === 'agentToolStart') void playToolStartSound();

          window.dispatchEvent(new MessageEvent('message', { data }));
        } catch {
          // malformed message — ignore
        }
      });

      ws.addEventListener('close', () => {
        console.log('[Pixel Agents] Disconnected from standalone server');
      });
    });

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      finish(false);
    });
  });
}
