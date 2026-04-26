import { describe, expect, it } from 'vitest';

import {
  type Agent,
  type AgentEvent,
  AgentEventType,
  AgentRuntimeState,
  AgentSource,
  AgentType,
  type Alert,
  EventSeverity,
  type PermissionRequest,
  type TimelineEvent,
} from '../src/domain/types.js';

describe('domain types', () => {
  it('supports the initial control-center models', () => {
    const agent: Agent = {
      id: 'agent-1',
      name: 'Backend Agent',
      type: AgentType.DEV,
      source: AgentSource.CODEX,
      state: AgentRuntimeState.RUNNING,
      lastUpdate: 1,
      currentTask: 'Fix build',
    };

    const event: AgentEvent = {
      id: 'evt-1',
      timestamp: 1,
      source: AgentSource.CODEX,
      agentId: agent.id,
      type: AgentEventType.COMMAND_STARTED,
      severity: EventSeverity.INFO,
      title: 'Started npm install',
      metadata: { command: 'npm install' },
    };

    const timelineEvent: TimelineEvent = {
      id: 'tl-1',
      timestamp: 1,
      agentId: agent.id,
      severity: EventSeverity.INFO,
      message: 'Backend Agent empezo una tarea.',
    };

    const alert: Alert = {
      id: 'alert-1',
      timestamp: 1,
      agentId: agent.id,
      severity: EventSeverity.WARNING,
      kind: AgentEventType.PERMISSION_REQUEST,
      title: 'Permission required',
    };

    const permission: PermissionRequest = {
      id: 'perm-1',
      agentId: agent.id,
      source: AgentSource.CODEX,
      requestedAt: 1,
      status: 'pending',
      title: 'Modify settings.json',
      filePath: 'settings.json',
    };

    expect(agent.state).toBe(AgentRuntimeState.RUNNING);
    expect(event.type).toBe(AgentEventType.COMMAND_STARTED);
    expect(timelineEvent.message).toContain('empezo');
    expect(alert.kind).toBe(AgentEventType.PERMISSION_REQUEST);
    expect(permission.status).toBe('pending');
  });
});
