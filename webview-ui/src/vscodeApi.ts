import { isBrowserRuntime } from './runtime';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const LAYOUT_STORAGE_KEY = 'pixel-agents:layout';

export function getBrowserSavedLayout(): unknown | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? {
      postMessage: (msg: unknown) => {
        const m = msg as Record<string, unknown>;
        if (m['type'] === 'saveLayout') {
          try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(m['layout']));
          } catch {
            /* storage may be unavailable */
          }
          // Also persist via WebSocket server (writes ~/.pixel-agents/layout.json)
          void import('./websocketClient.js').then(({ sendDomainMessage }) => {
            sendDomainMessage({ type: 'saveLayout', layout: m['layout'] });
          });
        }
        if (m['type'] === 'closeAgent' && typeof m['id'] === 'number') {
          void import('./websocketClient.js').then(({ sendDomainMessage }) => {
            sendDomainMessage({ type: 'closeAgent', id: m['id'] });
          });
        }
        console.log('[vscode.postMessage]', msg);
      },
    }
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
