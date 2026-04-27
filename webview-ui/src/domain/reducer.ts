import type { Agent, Alert, PermissionRequest, TimelineEvent } from './types.js';

export interface DomainState {
  agents: Agent[];
  timeline: TimelineEvent[];
  alerts: Alert[];
  permissions: PermissionRequest[];
}

export const initialDomainState: DomainState = {
  agents: [],
  timeline: [],
  alerts: [],
  permissions: [],
};

export type DomainAction =
  | { type: 'HYDRATE_SNAPSHOT'; state: DomainState }
  | { type: 'UPSERT_AGENTS'; agents: Agent[] }
  | { type: 'PATCH_AGENTS'; agents: Array<{ id: string } & Partial<Omit<Agent, 'id'>>> }
  | { type: 'REMOVE_AGENT'; agentId: string }
  | { type: 'REPLACE_TIMELINE'; events: TimelineEvent[] }
  | { type: 'ADD_TIMELINE'; events: TimelineEvent[] }
  | { type: 'REPLACE_ALERTS'; alerts: Alert[] }
  | { type: 'ADD_ALERTS'; alerts: Alert[] }
  | { type: 'UPSERT_PERMISSIONS'; permissions: PermissionRequest[] }
  | { type: 'SET_PERMISSIONS'; permissions: PermissionRequest[] };

const MAX_TIMELINE = 100;
const MAX_ALERTS = 50;

export function domainReducer(state: DomainState, action: DomainAction): DomainState {
  switch (action.type) {
    case 'HYDRATE_SNAPSHOT': {
      return {
        agents: action.state.agents,
        timeline: action.state.timeline.slice(-MAX_TIMELINE),
        alerts: action.state.alerts.slice(-MAX_ALERTS),
        permissions: action.state.permissions,
      };
    }
    case 'UPSERT_AGENTS': {
      const map = new Map(state.agents.map((a) => [a.id, a]));
      for (const a of action.agents) map.set(a.id, a);
      return { ...state, agents: [...map.values()] };
    }
    case 'PATCH_AGENTS': {
      const map = new Map(state.agents.map((a) => [a.id, a]));
      for (const patch of action.agents) {
        const current = map.get(patch.id);
        if (!current) continue;
        map.set(patch.id, { ...current, ...patch });
      }
      return { ...state, agents: [...map.values()] };
    }
    case 'REMOVE_AGENT': {
      return { ...state, agents: state.agents.filter((a) => a.id !== action.agentId) };
    }
    case 'REPLACE_TIMELINE': {
      return {
        ...state,
        timeline: action.events.slice(-MAX_TIMELINE),
      };
    }
    case 'ADD_TIMELINE': {
      const combined = [...state.timeline];
      for (const event of action.events) {
        const existingIndex = combined.findIndex((current) => current.id === event.id);
        if (existingIndex >= 0) {
          combined[existingIndex] = event;
        } else {
          combined.push(event);
        }
      }
      return {
        ...state,
        timeline: combined.length > MAX_TIMELINE ? combined.slice(-MAX_TIMELINE) : combined,
      };
    }
    case 'REPLACE_ALERTS': {
      return {
        ...state,
        alerts: action.alerts.slice(-MAX_ALERTS),
      };
    }
    case 'ADD_ALERTS': {
      const combined = [...state.alerts, ...action.alerts];
      return {
        ...state,
        alerts: combined.length > MAX_ALERTS ? combined.slice(-MAX_ALERTS) : combined,
      };
    }
    case 'UPSERT_PERMISSIONS': {
      const map = new Map(state.permissions.map((p) => [p.id, p]));
      for (const p of action.permissions) map.set(p.id, p);
      return { ...state, permissions: [...map.values()] };
    }
    case 'SET_PERMISSIONS': {
      // Full replace — used when server sends the canonical permissions list
      return { ...state, permissions: action.permissions };
    }
  }
}
