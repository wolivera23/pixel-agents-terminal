import { describe, expect, it } from 'vitest';

import { normalizeProviderEventToAgentEvents } from '../src/domain/eventNormalizer.js';
import { AgentEventType, EventSeverity } from '../src/domain/types.js';

describe('eventNormalizer', () => {
  it('maps provider toolStart events into domain tool_use events', () => {
    const [event] = normalizeProviderEventToAgentEvents({
      providerId: 'codex',
      sessionId: 'sess-1',
      agentId: 'agent-1',
      timestamp: 100,
      providerEvent: {
        kind: 'toolStart',
        toolId: 'tool-1',
        toolName: 'shell_command',
        input: { command: 'npm test' },
      },
    });

    expect(event.type).toBe(AgentEventType.TOOL_USE);
    expect(event.severity).toBe(EventSeverity.INFO);
    expect(event.metadata?.['toolName']).toBe('shell_command');
    expect(event.metadata?.['command']).toBe('npm test');
    expect(event.description).toBe('Running command: npm test');
  });

  it('maps permission requests into warning events', () => {
    const [event] = normalizeProviderEventToAgentEvents({
      providerId: 'claude',
      sessionId: 'sess-1',
      agentId: 'agent-1',
      timestamp: 101,
      providerEvent: {
        kind: 'permissionRequest',
        toolName: 'Edit',
        input: { file_path: '/repo/settings.json' },
      },
    });

    expect(event.type).toBe(AgentEventType.PERMISSION_REQUEST);
    expect(event.severity).toBe(EventSeverity.WARNING);
    expect(event.title).toBe('Permission required for Edit');
    expect(event.metadata?.['toolName']).toBe('Edit');
    expect(event.metadata?.['filePath']).toBe('/repo/settings.json');
    expect(event.description).toBe('Using Edit: /repo/settings.json');
  });

  it('maps failed toolEnd events into task_failed domain events', () => {
    const [event] = normalizeProviderEventToAgentEvents({
      providerId: 'codex',
      sessionId: 'sess-2',
      agentId: 'agent-2',
      timestamp: 102,
      providerEvent: {
        kind: 'toolEnd',
        toolId: 'tool-2',
        success: false,
        toolName: 'shell_command',
        error: 'Command exited with code 1',
      },
    });

    expect(event.type).toBe(AgentEventType.TASK_FAILED);
    expect(event.severity).toBe(EventSeverity.ERROR);
    expect(event.title).toBe('Tool failed: shell_command');
    expect(event.description).toBe('Command exited with code 1');
    expect(event.metadata?.['error']).toBe('Command exited with code 1');
  });
});
