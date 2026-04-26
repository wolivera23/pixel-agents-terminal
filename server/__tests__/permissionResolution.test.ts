import { describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/domain/agentStateStore.js';
import {
  AgentEventType,
  AgentRuntimeState,
  AgentSource,
  EventSeverity,
} from '../src/domain/types.js';

describe('permission resolution', () => {
  it('resolves a pending permission as approved and updates agent state', () => {
    const store = new AgentStateStore();

    store.applyEvent({
      id: 'perm-event-1',
      timestamp: 1,
      source: AgentSource.CODEX,
      agentId: 'agent-1',
      type: AgentEventType.PERMISSION_REQUEST,
      severity: EventSeverity.WARNING,
      title: 'Permission required',
      metadata: { command: 'npm install' },
    });

    const resolved = store.resolvePermission('perm-event-1', 'approved', 2);

    expect(resolved?.type).toBe(AgentEventType.PERMISSION_APPROVED);
    expect(store.getPendingPermissions()).toHaveLength(0);
    expect(store.getAgent('agent-1')?.state).toBe(AgentRuntimeState.RUNNING);
  });

  it('resolves a pending permission as rejected and blocks the agent', () => {
    const store = new AgentStateStore();

    store.applyEvent({
      id: 'perm-event-2',
      timestamp: 1,
      source: AgentSource.CLAUDE,
      agentId: 'agent-2',
      type: AgentEventType.PERMISSION_REQUEST,
      severity: EventSeverity.WARNING,
      title: 'Permission required',
    });

    const resolved = store.resolvePermission('perm-event-2', 'rejected', 2);

    expect(resolved?.type).toBe(AgentEventType.PERMISSION_REJECTED);
    expect(store.getPendingPermissions()).toHaveLength(0);
    expect(store.getAgent('agent-2')?.state).toBe(AgentRuntimeState.BLOCKED);
  });
});
