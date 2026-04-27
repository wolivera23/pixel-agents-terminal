import type { Agent, AgentEvent, AgentKind, AgentState } from '../types/agentControl.js';
import { displayNameForAgentId } from './agentNames.js';

export type AgentMap = Record<string, Agent>;

function asAgentKind(value: unknown): AgentKind {
  return value === 'npc' || value === 'system' ? value : 'dev';
}

function asAgentState(value: unknown, fallback: AgentState): AgentState {
  return value === 'idle' ||
    value === 'running' ||
    value === 'waiting_permission' ||
    value === 'blocked' ||
    value === 'error' ||
    value === 'done'
    ? value
    : fallback;
}

function getMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function createAgentFromEvent(event: AgentEvent): Agent {
  const metadata = event.metadata;
  return {
    id: event.agentId,
    name:
      getMetadataString(metadata, 'agentDisplayName') ??
      getMetadataString(metadata, 'agentName') ??
      getMetadataString(metadata, 'folderName') ??
      displayNameForAgentId(event.agentId),
    type: asAgentKind(metadata?.['agentKind']),
    source: event.source,
    state: asAgentState(metadata?.['agentState'], 'idle'),
    lastAction: event.title,
    lastUpdate: event.timestamp,
    currentTask: event.description,
    contextUsage: getMetadataNumber(metadata, 'contextUsage'),
    errorCount: getMetadataNumber(metadata, 'errorCount'),
    loopDetected: metadata?.['loopDetected'] === true,
    muted: metadata?.['muted'] === true,
  };
}

export function reduceAgentEvent(agents: AgentMap, event: AgentEvent): AgentMap {
  const current = agents[event.agentId] ?? createAgentFromEvent(event);
  const metadata = event.metadata;

  let next: Agent = {
    ...current,
    source: event.source,
    lastAction: event.title,
    lastUpdate: event.timestamp,
    currentTask: event.description ?? current.currentTask,
  };

  switch (event.type) {
    case 'agent_started':
      next = { ...next, state: 'running' };
      break;
    case 'agent_idle':
      next = { ...next, state: 'idle' };
      break;
    case 'permission_request':
      next = { ...next, state: 'waiting_permission' };
      break;
    case 'task_completed':
      next = { ...next, state: 'done' };
      break;
    case 'task_failed':
    case 'error':
      next = {
        ...next,
        state: 'error',
        errorCount: (current.errorCount ?? 0) + 1,
      };
      break;
    case 'blocked':
      next = { ...next, state: 'blocked' };
      break;
    case 'context_warning': {
      const contextUsage = getMetadataNumber(metadata, 'contextUsage');
      next = {
        ...next,
        contextUsage: contextUsage ?? current.contextUsage,
      };
      break;
    }
    case 'loop_detected':
      next = { ...next, loopDetected: true };
      break;
  }

  const agentDisplayName = getMetadataString(metadata, 'agentDisplayName');
  const agentName = getMetadataString(metadata, 'agentName');
  const agentKind = metadata?.['agentKind'];
  const muted = metadata?.['muted'];
  if (agentDisplayName) next.name = agentDisplayName;
  else if (agentName) next.name = agentName;
  if (agentKind !== undefined) next.type = asAgentKind(agentKind);
  if (typeof muted === 'boolean') next.muted = muted;

  return {
    ...agents,
    [event.agentId]: next,
  };
}
