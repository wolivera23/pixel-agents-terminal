import { useEffect, useReducer, useRef } from 'react';

import { MAX_CONTEXT_TOKENS, TOKEN_WARN_THRESHOLD } from '../constants.js';
import { displayNameForAgentId } from '../core/agentNames.js';
import { rebuildSnapshotCaches } from '../domain/cacheSync.js';
import type { DomainState } from '../domain/reducer.js';
import { domainReducer, initialDomainState } from '../domain/reducer.js';
import {
  mapContextWarningToSpeech,
  mapDomainEventToSpeech,
  mapStateTransitionToSpeech,
} from '../domain/speechMapper.js';
import type {
  Agent,
  AgentEvent,
  Alert,
  PermissionRequest,
  TimelineEvent,
} from '../domain/types.js';
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

interface LegacyNormalizedInput {
  agents: Agent[];
  events: AgentEvent[];
  timeline: TimelineEvent[];
}

function buildLegacyAlertsFromAgentEvents(events: AgentEvent[]): Alert[] {
  return events
    .filter((event) => {
      if (
        event.type === AgentEventType.PERMISSION_REQUEST ||
        event.type === AgentEventType.ERROR ||
        event.type === AgentEventType.BLOCKED ||
        event.type === AgentEventType.LOOP_DETECTED ||
        event.type === AgentEventType.CONTEXT_WARNING ||
        event.type === AgentEventType.TASK_FAILED
      ) {
        return true;
      }
      return (
        event.severity === EventSeverity.WARNING ||
        event.severity === EventSeverity.ERROR ||
        event.severity === EventSeverity.CRITICAL
      );
    })
    .slice(-50)
    .map((event) => ({
      id: `legacy-alert:${event.id}`,
      timestamp: event.timestamp,
      agentId: event.agentId,
      severity: event.severity,
      kind: event.type,
      title: event.title,
      description: event.description,
      metadata: event.metadata,
    }));
}

function buildLegacyPendingPermissionsFromAgentEvents(events: AgentEvent[]): PermissionRequest[] {
  const pending = new Map<string, PermissionRequest>();

  for (const event of events) {
    const id = `perm:${event.agentId}`;
    if (event.type === AgentEventType.PERMISSION_REQUEST) {
      pending.set(id, {
        id,
        agentId: event.agentId,
        source: event.source,
        requestedAt: event.timestamp,
        status: 'pending',
        title: event.title,
        description: event.description,
        metadata: event.metadata,
      });
      continue;
    }

    if (
      event.type === AgentEventType.PERMISSION_APPROVED ||
      event.type === AgentEventType.PERMISSION_REJECTED ||
      event.type === AgentEventType.TASK_COMPLETED ||
      event.type === AgentEventType.AGENT_IDLE
    ) {
      pending.delete(id);
    }
  }

  return [...pending.values()].sort((a, b) => b.requestedAt - a.requestedAt);
}

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
      return `${name} empezo a trabajar.`;
    case AgentRuntimeState.WAITING_PERMISSION:
      return `${name} espera permiso para continuar.`;
    case AgentRuntimeState.IDLE:
      return `${name} termino correctamente.`;
    case AgentRuntimeState.DONE:
      return `${name} completo la tarea.`;
    case AgentRuntimeState.ERROR:
      return `${name} encontro un error.`;
    case AgentRuntimeState.BLOCKED:
      return `${name} quedo bloqueado.`;
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
  legacyNormalized?: LegacyNormalizedInput,
  mutedAgentIds?: ReadonlySet<string>,
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
  const processedLegacyEventIdsRef = useRef<Set<string>>(new Set());

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
          if (!mutedAgentIds?.has(event.agentId)) {
            mapDomainEventToSpeech(event.type);
          }
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

        case 'agentRenamed': {
          const agentId = String(msg.id as number);
          const displayName = msg.displayName as string | undefined;
          if (displayName) {
            agentNamesRef.current.set(agentId, displayName);
            dispatch({
              type: 'PATCH_AGENTS',
              agents: [{ id: agentId, name: displayName }],
            });
          }
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
          dispatch({
            type: 'PATCH_AGENTS',
            agents: [
              {
                id: agentId,
                contextUsage: usage,
                inputTokens: msg.inputTokens as number,
                outputTokens: msg.outputTokens as number,
              },
            ],
          });

          if (!contextWarnedRef.current.has(agentId) && usage >= TOKEN_WARN_THRESHOLD) {
            contextWarnedRef.current.add(agentId);
            const name =
              agentNamesRef.current.get(agentId) ?? displayNameForAgentId(msg.id as number);
            const now = Date.now();
            const warnTimeline: TimelineEvent = {
              id: `ctx-warn:${agentId}:${now}`,
              timestamp: now,
              agentId,
              severity: EventSeverity.WARNING,
              message: `${name} se acerca al limite de contexto.`,
            };
            const warnAlert: Alert = {
              id: `ctx-alert:${agentId}:${now}`,
              timestamp: now,
              agentId,
              severity: EventSeverity.WARNING,
              kind: AgentEventType.CONTEXT_WARNING,
              title: `${name} se acerca al limite de contexto.`,
            };
            dispatch({ type: 'ADD_TIMELINE', events: [warnTimeline] });
            dispatch({ type: 'ADD_ALERTS', alerts: [warnAlert] });
            if (!mutedAgentIds?.has(agentId)) {
              mapContextWarningToSpeech();
            }
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
  }, [mutedAgentIds]);

  // ── Legacy bridge ─────────────────────────────────────────────────────────
  // Always upserts agents (canvas needs them).
  // Skips timeline/alerts/speech/permissions when domain source is active.
  useEffect(() => {
    const os = getOfficeState();
    const observedAt = Date.now();

    const domainAgents: Agent[] = legacyAgents.map((id) => {
      const ch = os.characters.get(id);
      const name = ch?.displayName ?? ch?.agentName ?? ch?.folderName ?? displayNameForAgentId(id);
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
        contextUsage:
          contextUsageRef.current.get(agentIdStr) ??
          (ch && ch.inputTokens + ch.outputTokens > 0
            ? (ch.inputTokens + ch.outputTokens) / MAX_CONTEXT_TOKENS
            : undefined),
        inputTokens: ch?.inputTokens,
        outputTokens: ch?.outputTokens,
        muted: mutedAgentIds?.has(agentIdStr),
      } satisfies Agent;
    });
    const effectiveAgents =
      legacyNormalized && legacyNormalized.agents.length > 0
        ? legacyNormalized.agents
        : domainAgents;
    const hasNormalizedTimeline =
      Boolean(legacyNormalized) && (legacyNormalized?.timeline.length ?? 0) > 0;
    const hasNormalizedEvents =
      Boolean(legacyNormalized) && (legacyNormalized?.events.length ?? 0) > 0;

    if (!hasDomainSourceRef.current) {
      dispatch({ type: 'UPSERT_AGENTS', agents: effectiveAgents });
      if (hasNormalizedTimeline) {
        dispatch({ type: 'REPLACE_TIMELINE', events: legacyNormalized?.timeline ?? [] });
      }
      if (hasNormalizedEvents) {
        dispatch({
          type: 'REPLACE_ALERTS',
          alerts: buildLegacyAlertsFromAgentEvents(legacyNormalized?.events ?? []),
        });
        dispatch({
          type: 'SET_PERMISSIONS',
          permissions: buildLegacyPendingPermissionsFromAgentEvents(legacyNormalized?.events ?? []),
        });
        for (const event of legacyNormalized?.events ?? []) {
          if (processedLegacyEventIdsRef.current.has(event.id)) continue;
          processedLegacyEventIdsRef.current.add(event.id);
          if (!mutedAgentIds?.has(event.agentId)) {
            mapDomainEventToSpeech(event.type);
          }
        }
      }

      const timelineEvents: TimelineEvent[] = [];
      const alerts: Alert[] = [];

      for (const agent of effectiveAgents) {
        const numId = Number(agent.id);
        const prev = prevLegacyStatesRef.current[numId];

        if (prev !== agent.state) {
          if (prev !== undefined && !hasNormalizedTimeline) {
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

            if (!agent.muted) {
              mapStateTransitionToSpeech(prev, agent.state);
            }
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
      if (alerts.length > 0 && !hasNormalizedEvents) dispatch({ type: 'ADD_ALERTS', alerts });

      // Synthesize permissions from waiting agents
      const permissions: PermissionRequest[] = [];
      if (!hasNormalizedEvents) {
        for (const agent of effectiveAgents) {
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
      }
      if (permissions.length > 0) dispatch({ type: 'UPSERT_PERMISSIONS', permissions });
    } else {
      dispatch({
        type: 'PATCH_AGENTS',
        agents: effectiveAgents.map((agent) => ({
          id: agent.id,
          contextUsage: agent.contextUsage,
          inputTokens: agent.inputTokens,
          outputTokens: agent.outputTokens,
          muted: mutedAgentIds?.has(agent.id),
        })),
      });
    }
  }, [legacyAgents, agentTools, agentStatuses, getOfficeState, legacyNormalized, mutedAgentIds]);

  return state;
}
