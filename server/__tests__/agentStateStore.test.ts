import { describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/domain/agentStateStore.js';
import {
  AgentEventType,
  AgentRuntimeState,
  AgentSource,
  AgentType,
  EventSeverity,
} from '../src/domain/types.js';

describe('AgentStateStore', () => {
  it('creates and updates agent state from events', () => {
    const store = new AgentStateStore();

    store.upsertAgent({
      id: 'agent-1',
      name: 'Backend Agent',
      type: AgentType.DEV,
      source: AgentSource.CODEX,
      state: AgentRuntimeState.IDLE,
      lastUpdate: 0,
      errorCount: 0,
    });

    store.applyEvent({
      id: 'evt-1',
      timestamp: 1,
      source: AgentSource.CODEX,
      agentId: 'agent-1',
      type: AgentEventType.TOOL_USE,
      severity: EventSeverity.INFO,
      title: 'Using shell_command',
      metadata: { toolName: 'shell_command' },
    });

    const updated = store.getAgent('agent-1');
    expect(updated?.state).toBe(AgentRuntimeState.RUNNING);
    expect(updated?.lastAction).toBe('Using shell_command');
    expect(updated?.currentTask).toBe('Using shell_command');
    expect(store.getTimeline()).toHaveLength(1);
  });

  it('tracks pending permissions and raises alerts', () => {
    const store = new AgentStateStore();

    store.applyEvent({
      id: 'evt-2',
      timestamp: 2,
      source: AgentSource.CLAUDE,
      agentId: 'agent-2',
      type: AgentEventType.PERMISSION_REQUEST,
      severity: EventSeverity.WARNING,
      title: 'Permission required',
      metadata: { command: 'npm install' },
    });

    expect(store.getAgent('agent-2')?.state).toBe(AgentRuntimeState.WAITING_PERMISSION);
    expect(store.getPendingPermissions()).toHaveLength(1);
    expect(store.getAlerts()).toHaveLength(1);
  });

  it('writes more specific permission timeline messages when command or file metadata exists', () => {
    const store = new AgentStateStore();

    store.upsertAgent({
      id: 'agent-5',
      name: 'Ops Agent',
      type: AgentType.DEV,
      source: AgentSource.CODEX,
      state: AgentRuntimeState.IDLE,
      lastUpdate: 0,
    });

    store.applyEvent({
      id: 'evt-8',
      timestamp: 8,
      source: AgentSource.CODEX,
      agentId: 'agent-5',
      type: AgentEventType.PERMISSION_REQUEST,
      severity: EventSeverity.WARNING,
      title: 'Permission required for shell_command',
      metadata: { command: 'npm install' },
    });
    expect(store.getTimeline().at(-1)?.message).toBe(
      'Ops Agent pidio permiso para ejecutar un comando.',
    );

    store.applyEvent({
      id: 'evt-9',
      timestamp: 9,
      source: AgentSource.CODEX,
      agentId: 'agent-5',
      type: AgentEventType.PERMISSION_REQUEST,
      severity: EventSeverity.WARNING,
      title: 'Permission required for Edit',
      metadata: { filePath: '/repo/settings.json' },
    });
    expect(store.getTimeline().at(-1)?.message).toBe(
      'Ops Agent pidio permiso para modificar un archivo.',
    );
  });

  it('increments error count on failures', () => {
    const store = new AgentStateStore();

    store.applyEvent({
      id: 'evt-3',
      timestamp: 3,
      source: AgentSource.CODEX,
      agentId: 'agent-3',
      type: AgentEventType.ERROR,
      severity: EventSeverity.ERROR,
      title: 'Build failed',
    });

    expect(store.getAgent('agent-3')?.state).toBe(AgentRuntimeState.ERROR);
    expect(store.getAgent('agent-3')?.errorCount).toBe(1);
    expect(store.getAlerts()).toHaveLength(1);
  });

  it('updates currentTask on newer tool activity and clears it when work completes', () => {
    const store = new AgentStateStore();

    store.upsertAgent({
      id: 'agent-4',
      name: 'Frontend Agent',
      type: AgentType.DEV,
      source: AgentSource.CLAUDE,
      state: AgentRuntimeState.IDLE,
      lastUpdate: 0,
    });

    store.applyEvent({
      id: 'evt-4',
      timestamp: 4,
      source: AgentSource.CLAUDE,
      agentId: 'agent-4',
      type: AgentEventType.TOOL_USE,
      severity: EventSeverity.INFO,
      title: 'Using read_file',
      description: 'Reading package.json',
    });
    expect(store.getAgent('agent-4')?.currentTask).toBe('Reading package.json');

    store.applyEvent({
      id: 'evt-5',
      timestamp: 5,
      source: AgentSource.CLAUDE,
      agentId: 'agent-4',
      type: AgentEventType.TOOL_USE,
      severity: EventSeverity.INFO,
      title: 'Using shell_command',
      description: 'Running npm test',
    });
    expect(store.getAgent('agent-4')?.currentTask).toBe('Running npm test');

    store.applyEvent({
      id: 'evt-6',
      timestamp: 6,
      source: AgentSource.CLAUDE,
      agentId: 'agent-4',
      type: AgentEventType.PERMISSION_REQUEST,
      severity: EventSeverity.WARNING,
      title: 'Permission required',
    });
    expect(store.getAgent('agent-4')?.currentTask).toBe('Running npm test');

    store.applyEvent({
      id: 'evt-7',
      timestamp: 7,
      source: AgentSource.CLAUDE,
      agentId: 'agent-4',
      type: AgentEventType.TASK_COMPLETED,
      severity: EventSeverity.SUCCESS,
      title: 'Turn completed',
    });
    expect(store.getAgent('agent-4')?.currentTask).toBeUndefined();
  });
});
