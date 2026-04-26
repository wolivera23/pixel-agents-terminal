import { useEffect, useReducer, useRef } from 'react';

import { MAX_CONTEXT_TOKENS, TOKEN_WARN_THRESHOLD } from '../constants.js';
import { rebuildSnapshotCaches } from '../domain/cacheSync.js';
import type { DomainState } from '../domain/reducer.js';
import { domainReducer, initialDomainState } from '../domain/reducer.js';
import { mapDomainEventToSpeech, mapStateTransitionToSpeech } from '../domain/speechMapper.js';
import type { Agent, Alert, PermissionRequest, TimelineEvent } from '../domain/types.js';
import {
  AgentEventType,
  AgentRuntimeState,
  AgentSource,
  AgentType,
  EventSeverity,
} from '../domain/types.js';
import type {
  DomainAgentRemovedMessage,
  DomainAgentUpsertedMessage,
  DomainAlertRaisedMessage,
  DomainEventMessage,
  DomainPermissionsMessage,
  DomainSnapshotMessage,
  DomainTimelineAppendedMessage,
} from '../domain/wsProtocol.js';
import { DOMAIN_WS_PROTOCOL_VERSION } from '../domain/wsProtocol.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';

// ── Legacy bridge helpers ─────────────────────────────────────────────────────

function toLegacyRuntimeState(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  agentStatuses: Record<number, string>,
): AgentRuntimeState {
  if (agentStatuses[agentId] === 'waiting') return AgentRuntimeState.WAITING_PERMISSION;
  if (agentTools[agentId]?.length) return AgentRuntimeState.RUNNING;
  return AgentRuntimeState.IDLE;
}

function stateToTimelineMessage(name: string, state: AgentRuntimeState): string {
  switch (state) {
    case AgentRuntimeState.RUNNING:
      return `${name} empezó a trabajar.`;
    case AgentRuntimeState.WAITING_PERMISSION:
      return `${name} espera permiso para continuar.`;
    case AgentRuntimeState.IDLE:
      return `${name} terminó correctamente.`;
    case AgentRuntimeState.DONE:
      return `${name} completó la tarea.`;
    case AgentRuntimeState.ERROR:
      return `${name} encontró un error.`;
    case AgentRuntimeState.BLOCKED:
      return `${name} quedó bloqueado.`;
  }
}

function stateToSeverity(state: AgentRuntimeState): EventSeverity {
  switch (state) {
    case AgentRuntimeState.WAITING_PERMISSION:
      return EventSeverity.WARNING;
    case AgentRuntimeState.ERROR:
    case AgentRuntimeState.BLOCKED:
      return EventSeverity.ERROR;
    case AgentRuntimeState.IDLE:
    case AgentRuntimeState.DONE:
      return EventSeverity.SUCCESS;
    default:
      return EventSeverity.INFO;
  }
}

function stateToAlertKind(state: AgentRuntimeState): AgentEventType {
  switch (state) {
    case AgentRuntimeState.WAITING_PERMISSION:
      return AgentEventType.PERMISSION_REQUEST;
    case AgentRuntimeState.ERROR:
      return AgentEventType.ERROR;
    case AgentRuntimeState.BLOCKED:
      return AgentEventType.BLOCKED;
    default:
      return AgentEventType.AGENT_ACTION;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentControlCenter(
  legacyAgents: number[],
  agentTools: Record<number, ToolActivity[]>,
  agentStatuses: Record<number, string>,
  getOfficeState: () => OfficeState,
): DomainState {
  const [state, dispatch] = useReducer(domainReducer, initialDomainState);

  // Legacy bridge tracking
  const prevLegacyStatesRef = useRef<Record<number, AgentRuntimeState>>({});
  const seenPermissionsRef = useRef<Set<string>>(new Set());
  const agentSourceRef = useRef<Map<string, AgentSource>>(new Map());

  // Domain protocol tracking
  const hasDomainSourceRef = useRef(false);
  const agentNamesRef = useRef<Map<string, string>>(new Map());
  const contextWarnedRef = useRef<Set<string>>(new Set());
  const contextUsageRef = useRef<Map<string, number>>(new Map());
  const prevDomainStatesRef = useRef<Map<string, AgentRuntimeState>>(new Map());

  // ── Domain + legacy-context listener ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;

      switch (msg.type) {
        case 'domainSnapshot': {
          const snap = msg as unknown as DomainSnapshotMessage;
          if (
            typeof snap.protocolVersion === 'number' &&
            snap.protocolVersion !== DOMAIN_WS_PROTOCOL_VERSION
          ) {
            console.warn(
              `[Pixel Agents] Unsupported domain WS protocol version ${snap.protocolVersion}. Expected ${DOMAIN_WS_PROTOCOL_VERSION}.`,
            );
          }
          hasDomainSourceRef.current = true;

          dispatch({
            type: 'HYDRATE_SNAPSHOT',
            state: {
              agents: snap.agents,
              timeline: snap.timeline,
              alerts: snap.alerts,
              permissions: snap.permissions,
            },
          });

          const caches = rebuildSnapshotCaches(snap.agents, {
            names: agentNamesRef.current,
            sources: agentSourceRef.current,
            prevStates: prevDomainStatesRef.current,
            contextWarned: contextWarnedRef.current,
            contextUsage: contextUsageRef.current,
          });
          agentNamesRef.current = caches.names;
          agentSourceRef.current = caches.sources;
          prevDomainStatesRef.current = caches.prevStates;
          contextWarnedRef.current = caches.contextWarned;
          contextUsageRef.current = caches.contextUsage;
          break;
        }

        case 'domainEvent': {
          hasDomainSourceRef.current = true;
          const { event } = msg as unknown as DomainEventMessage;
          mapDomainEventToSpeech(event.type);
          break;
        }

        case 'domainAgentUpserted': {
          hasDomainSourceRef.current = true;
          const { agent } = msg as unknown as DomainAgentUpsertedMessage;
          agentNamesRef.current.set(agent.id, agent.name);
          if (agent.source) {
            agentSourceRef.current.set(agent.id, agent.source);
          }

          prevDomainStatesRef.current.set(agent.id, agent.state);

          dispatch({ type: 'UPSERT_AGENTS', agents: [agent] });
          break;
        }

        case 'domainAgentRemoved': {
          hasDomainSourceRef.current = true;
          const { agentId } = msg as unknown as DomainAgentRemovedMessage;
          dispatch({ type: 'REMOVE_AGENT', agentId });
          agentNamesRef.current.delete(agentId);
          contextWarnedRef.current.delete(agentId);
          contextUsageRef.current.delete(agentId);
          prevDomainStatesRef.current.delete(agentId);
          agentSourceRef.current.delete(agentId);
          break;
        }

        case 'domainTimelineAppended': {
          hasDomainSourceRef.current = true;
          const { event } = msg as unknown as DomainTimelineAppendedMessage;
          dispatch({ type: 'ADD_TIMELINE', events: [event] });
          break;
        }

        case 'domainAlertRaised': {
          hasDomainSourceRef.current = true;
          const { alert } = msg as unknown as DomainAlertRaisedMessage;
          dispatch({ type: 'ADD_ALERTS', alerts: [alert] });
          break;
        }

        case 'domainPermissions': {
          hasDomainSourceRef.current = true;
          const { permissions } = msg as unknown as DomainPermissionsMessage;
          dispatch({ type: 'SET_PERMISSIONS', permissions });
          break;
        }

        // ── context_warning migration ───────────────────────────────────────
        // Captures providerId so the legacy bridge can show the correct source badge.
        case 'agentCreated': {
          const agentId = String(msg.id as number);
          const providerId = msg.providerId as string | undefined;
          if (providerId === 'codex') agentSourceRef.current.set(agentId, AgentSource.CODEX);
          else if (providerId === 'claude') agentSourceRef.current.set(agentId, AgentSource.CLAUDE);
          break;
        }

        // agentTokenUsage is a legacy-only message (extension mode).
        // Handles context threshold detection and updates contextUsage for AgentCard.
        case 'agentTokenUsage': {
          const agentId = String(msg.id as number);
          const total = (msg.inputTokens as number) + (msg.outputTokens as number);
          const usage = total / MAX_CONTEXT_TOKENS;

          contextUsageRef.current.set(agentId, usage);

          if (!contextWarnedRef.current.has(agentId) && usage >= TOKEN_WARN_THRESHOLD) {
            contextWarnedRef.current.add(agentId);
            const name = agentNamesRef.current.get(agentId) ?? `Agent ${msg.id as number}`;
            const now = Date.now();
            const warnTimeline: TimelineEvent = {
              id: `ctx-warn:${agentId}:${now}`,
              timestamp: now,
              agentId,
              severity: EventSeverity.WARNING,
              message: `${name} se acerca al límite de contexto.`,
            };
            const warnAlert: Alert = {
              id: `ctx-alert:${agentId}:${now}`,
              timestamp: now,
              agentId,
              severity: EventSeverity.WARNING,
              kind: AgentEventType.CONTEXT_WARNING,
              title: `${name} se acerca al límite de contexto.`,
            };
            dispatch({ type: 'ADD_TIMELINE', events: [warnTimeline] });
            dispatch({ type: 'ADD_ALERTS', alerts: [warnAlert] });
            mapContextWarningToSpeech();
          }
          break;
        }
      }
    };

    // When WS disconnects, fall back to legacy bridge
    const onDisconnect = () => {
      hasDomainSourceRef.current = false;
      prevDomainStatesRef.current.clear();
    };

    window.addEventListener('message', handler);
    window.addEventListener('pixelagents:ws-disconnected', onDisconnect);
    return () => {
      window.removeEventListener('message', handler);
      window.removeEventListener('pixelagents:ws-disconnected', onDisconnect);
    };
  }, []);

  // ── Legacy bridge ─────────────────────────────────────────────────────────
  // Always upserts agents (canvas needs them).
  // Skips timeline/alerts/speech/permissions when domain source is active.
  useEffect(() => {
    const os = getOfficeState();
    const observedAt = Date.now();

    const domainAgents: Agent[] = legacyAgents.map((id) => {
      const ch = os.characters.get(id);
      const name = ch?.agentName ?? ch?.folderName ?? `Agent ${id}`;
      const runtimeState = toLegacyRuntimeState(id, agentTools, agentStatuses);
      const currentTool = agentTools[id]?.find((t) => !t.done);
      const agentIdStr = String(id);

      // Keep caches in sync
      agentNamesRef.current.set(agentIdStr, name);

      return {
        id: agentIdStr,
        name,
        type: AgentType.DEV,
        source: agentSourceRef.current.get(agentIdStr) ?? AgentSource.CLAUDE,
        state: runtimeState,
        lastAction: currentTool?.status ?? undefined,
        lastUpdate: observedAt,
        currentTask: currentTool?.status ?? undefined,
        contextUsage: contextUsageRef.current.get(agentIdStr),
      } satisfies Agent;
    });

    if (!hasDomainSourceRef.current) {
      dispatch({ type: 'UPSERT_AGENTS', agents: domainAgents });

      const timelineEvents: TimelineEvent[] = [];
      const alerts: Alert[] = [];

      for (const agent of domainAgents) {
        const numId = Number(agent.id);
        const prev = prevLegacyStatesRef.current[numId];

        if (prev !== agent.state) {
          if (prev !== undefined) {
            const severity = stateToSeverity(agent.state);
            const message = stateToTimelineMessage(agent.name, agent.state);
            const now = Date.now();
            const eventId = `${agent.id}:${now}:${agent.state}`;

            timelineEvents.push({
              id: eventId,
              timestamp: now,
              agentId: agent.id,
              severity,
              message,
            });

            if (
              severity === EventSeverity.WARNING ||
              severity === EventSeverity.ERROR ||
              severity === EventSeverity.CRITICAL
            ) {
              alerts.push({
                id: `alert:${eventId}`,
                timestamp: now,
                agentId: agent.id,
                severity,
                kind: stateToAlertKind(agent.state),
                title: message,
              });
            }

            mapStateTransitionToSpeech(prev, agent.state);
          }
          prevLegacyStatesRef.current[numId] = agent.state;
        }
      }

      // Prune removed agents
      const activeIds = new Set(legacyAgents);
      for (const id of Object.keys(prevLegacyStatesRef.current).map(Number)) {
        if (!activeIds.has(id)) {
          delete prevLegacyStatesRef.current[id];
          contextWarnedRef.current.delete(String(id));
          contextUsageRef.current.delete(String(id));
          agentSourceRef.current.delete(String(id));
        }
      }

      if (timelineEvents.length > 0) dispatch({ type: 'ADD_TIMELINE', events: timelineEvents });
      if (alerts.length > 0) dispatch({ type: 'ADD_ALERTS', alerts });

      // Synthesize permissions from waiting agents
      const permissions: PermissionRequest[] = [];
      for (const agent of domainAgents) {
        const permId = `perm:${agent.id}`;
        if (agent.state === AgentRuntimeState.WAITING_PERMISSION) {
          if (!seenPermissionsRef.current.has(permId)) {
            seenPermissionsRef.current.add(permId);
            permissions.push({
              id: permId,
              agentId: agent.id,
              source: agent.source ?? AgentSource.CLAUDE,
              requestedAt: Date.now(),
              status: 'pending',
              title: 'Permiso requerido',
              description: agent.currentTask,
            });
          }
        } else {
          seenPermissionsRef.current.delete(permId);
        }
      }
      if (permissions.length > 0) dispatch({ type: 'UPSERT_PERMISSIONS', permissions });
    } else {
      dispatch({
        type: 'PATCH_AGENTS',
        agents: domainAgents.map((agent) => ({
          id: agent.id,
          contextUsage: agent.contextUsage,
        })),
      });
    }
  }, [legacyAgents, agentTools, agentStatuses, getOfficeState]);

  return state;
}
