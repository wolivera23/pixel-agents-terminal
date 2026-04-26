/**
 * Shared flag: true when the webview is connected to the standalone WebSocket
 * server and should receive real Claude Code events instead of mock events.
 */
export let isStandaloneMode = false;

export function setStandaloneMode(value: boolean): void {
  isStandaloneMode = value;
}
