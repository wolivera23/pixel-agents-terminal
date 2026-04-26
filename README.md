# Pixel Agents

Pixel art office for AI coding agents. Each Claude Code or Codex CLI session can appear as an animated character with live tool status, waiting/permission bubbles, timeline events, alerts, and optional sound notifications.

This repository is a fork of [pixel-agents](https://github.com/pablodelucca/pixel-agents) adapted to support both the original VS Code extension flow and a standalone browser flow for terminal-based agents.

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## What It Does

- Shows AI coding agents as pixel-art characters in a virtual office.
- Tracks active tools, completed turns, waiting states, permissions, alerts, and timeline activity.
- Supports Claude Code and Codex hook events through provider adapters.
- Runs as a VS Code extension webview or as a standalone browser UI.
- Keeps the legacy pixel-art protocol working while a normalized Agent Control Center model is introduced.

## Current Architecture

```text
src/                         VS Code extension backend
server/src/                  standalone hook server + domain bridge
webview-ui/src/              React webview/browser UI
webview-ui/src/core/         normalized agent event/state helpers
webview-ui/src/domain/       Agent Control Center domain state and WS protocol
```

### Message Flow

1. Claude Code or Codex emits hook events.
2. Provider adapters normalize raw hook payloads into provider events.
3. The standalone server or VS Code extension maps those events to legacy UI messages and domain messages.
4. The webview receives messages through VS Code `postMessage` or browser WebSocket.
5. `useExtensionMessages` keeps the existing canvas behavior working and also normalizes messages into `AgentEvent`.
6. `useAgentControlCenter` projects normalized events into agents, timeline, alerts, and permissions for the dashboard.

The legacy visual flow is intentionally still present. The Agent Control Center model is being migrated in small steps so the existing UI and sounds keep working.

## Modes

### VS Code Extension

The root `package.json` declares the VS Code extension metadata, commands, and panel view.

Useful commands:

- `Pixel Agents: Show Panel`
- `Pixel Agents: Export Layout as Default`

### Standalone Browser Mode

Standalone mode starts a hook receiver plus a WebSocket bridge for the browser UI.

```bash
npm run standalone:dev
```

In another terminal:

```bash
cd webview-ui
npm run dev
```

Then open:

```text
http://localhost:5173
```

On startup, standalone mode takes ownership of `~/.pixel-agents/server.json` so hooks reach the browser-facing server. The browser can also request a fresh sync over WebSocket with `requestSync`, which replays existing agents and sends the current domain snapshot.

## Installation

```bash
git clone https://github.com/wolivera23/pixel-agents-terminal.git
cd pixel-agents-terminal
npm install
cd webview-ui && npm install && cd ..
npm run build
```

## Development

```bash
npm run build
npm run test
npm run test:webview
npm run test:server
```

Standalone development:

```bash
npm run dev
```

This runs the standalone server and web UI in parallel.

## Agent Control Center Work

The new domain layer is being introduced gradually.

Current pieces:

- `webview-ui/src/types/agentControl.ts` defines shared agent/event/timeline types.
- `webview-ui/src/core/eventNormalizer.ts` converts existing messages into `AgentEvent`.
- `webview-ui/src/core/agentState.ts` reduces `AgentEvent` into an agent map.
- `webview-ui/src/core/timeline.ts` converts agent events into timeline entries.
- `webview-ui/src/core/speechAdapter.ts` maps agent events to speech event kinds.
- `webview-ui/src/hooks/useAgentControlCenter.ts` projects normalized data into dashboard state.

The dashboard can use normalized legacy data as a fallback while the domain WebSocket path continues to mature.

## Domain WebSocket Protocol

The standalone server sends domain messages in parallel with legacy UI messages:

- `domainSnapshot`
- `domainEvent`
- `domainAgentUpserted`
- `domainAgentRemoved`
- `domainTimelineAppended`
- `domainAlertRaised`
- `domainPermissions`

The browser can send:

- `domainPermissionDecision`
- `requestSync`

See [DOMAIN_WS_PROTOCOL.md](DOMAIN_WS_PROTOCOL.md) for protocol details.

## Notes

- Layout and config persistence still use the existing Pixel Agents storage paths.
- Hook support is preferred for live events; filesystem polling remains part of the broader project history and fallback strategy.
- Permission decisions in the dashboard are still UI/domain state only unless explicitly wired to a provider.

## Credits

- Original project: [pixel-agents](https://github.com/pablodelucca/pixel-agents) by [@pablodelucca](https://github.com/pablodelucca), MIT License.
- Character assets are based on [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## License

MIT. See [LICENSE](LICENSE).
