/**
 * Connects to the Pixel Agents standalone WebSocket server and relays
 * incoming messages as window MessageEvents — the same mechanism used
 * by the VS Code extension's postMessage API.
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
      console.log('[Pixel Agents] Connected to standalone server');

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          console.log('[Pixel Agents] WS message received:', data.type, data);
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
