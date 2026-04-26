import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { isBrowserRuntime } from './runtime';
import { setStandaloneMode } from './standaloneState';

async function main() {
  if (isBrowserRuntime) {
    // Assets are always loaded via browserMock (works for both mock and standalone)
    const { initBrowserMock } = await import('./browserMock.js');
    await initBrowserMock();

    // Try to connect to the standalone WebSocket server.
    // If it succeeds, real Claude Code events will drive the UI.
    // If it fails (server not running), fall back to mock animations.
    try {
      const { tryConnectWebSocket } = await import('./websocketClient.js');
      const connected = await tryConnectWebSocket(3000);
      setStandaloneMode(connected);
      if (connected) {
        console.log('[Pixel Agents] Standalone mode — real Claude Code events active');
      } else {
        console.log('[Pixel Agents] Mock mode — run standalone server for live events');
      }
    } catch {
      // WebSocket not available in this environment
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);
