import type { DomainState } from './reducer.js';
import type { Agent, Alert, PermissionRequest, TimelineEvent } from './types.js';
import { AgentType } from './types.js';

export function selectRealAgents(state: DomainState): Agent[] {
  return state.agents
    .filter((a) => a.type === AgentType.DEV)
    .sort((a, b) => b.lastUpdate - a.lastUpdate);
}

export function selectPendingPermissions(state: DomainState): PermissionRequest[] {
  return state.permissions
    .filter((p) => p.status === 'pending')
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

export function selectRecentTimeline(state: DomainState, limit = 50): TimelineEvent[] {
  return state.timeline.slice(-limit).reverse();
}

export function selectActiveAlerts(state: DomainState): Alert[] {
  return state.alerts.slice(-20).reverse();
}
