import * as path from 'path';

import { AGENT_DISPLAY_NAMES } from '../constants.js';
import type { HookProvider } from '../provider.js';
import { AgentStateStore } from './agentStateStore.js';
import { normalizeProviderEventToAgentEvents } from './eventNormalizer.js';
import { AgentRuntimeState, AgentSource, AgentType } from './types.js';
import type {
  DomainAgentRemovedMessage,
  DomainAgentUpsertedMessage,
  DomainAlertRaisedMessage,
  DomainEventMessage,
  DomainPermissionsMessage,
  DomainSnapshotMessage,
  DomainTimelineAppendedMessage,
  DomainWsClientMessage,
  DomainWsMessage,
} from './wsProtocol.js';
import { DOMAIN_WS_PROTOCOL_VERSION } from './wsProtocol.js';

export interface HandleHookEventResult {
  agentId: number;
  isNewAgent: boolean;
  providerId: string;
  folderName?: string;
  displayName: string;
  domainMessages: DomainWsMessage[];
}

export interface LegacyReplayAgent {
  agentId: number;
  providerId: string;
  folderName?: string;
  displayName: string;
}

function toDomainSource(providerId: string): AgentSource {
  switch (providerId) {
    case AgentSource.CLAUDE:
      return AgentSource.CLAUDE;
    case AgentSource.CODEX:
      return AgentSource.CODEX;
    default:
      return AgentSource.CLI;
  }
}

export class DomainSessionBridge {
  private readonly domainStore = new AgentStateStore();
  private readonly sessionToAgentId = new Map<string, number>();
  private readonly legacyReplayAgents = new Map<number, LegacyReplayAgent>();
  private nextAgentId = 1;

  constructor(private readonly providersById: ReadonlyMap<string, HookProvider>) {}

  buildSnapshot(): DomainSnapshotMessage {
    return {
      type: 'domainSnapshot',
      protocolVersion: DOMAIN_WS_PROTOCOL_VERSION,
      agents: this.domainStore.getAgents(),
      timeline: this.domainStore.getTimeline(),
      alerts: this.domainStore.getAlerts(),
      permissions: this.domainStore.getPendingPermissions(),
    };
  }

  buildLegacyReplayAgents(): LegacyReplayAgent[] {
    return [...this.legacyReplayAgents.values()].sort((a, b) => a.agentId - b.agentId);
  }

  removeAgent(agentId: number): DomainWsMessage[] {
    const id = String(agentId);
    this.domainStore.removeAgent(id);
    this.legacyReplayAgents.delete(agentId);
    for (const [sessionId, mappedAgentId] of this.sessionToAgentId) {
      if (mappedAgentId === agentId) {
        this.sessionToAgentId.delete(sessionId);
        break;
      }
    }
    return [
      {
        type: 'domainAgentRemoved',
        agentId: id,
      } satisfies DomainAgentRemovedMessage,
      this.buildPermissionsMessage(),
    ];
  }

  handleHookEvent(
    providerId: string,
    event: Record<string, unknown>,
  ): HandleHookEventResult | null {
    const sessionId = event.session_id;
    if (typeof sessionId !== 'string') return null;

    const { agentId, isNewAgent, folderName, displayName } = this.getOrCreateAgent(
      sessionId,
      providerId,
      typeof event.cwd === 'string' ? event.cwd : undefined,
    );

    const provider = this.providersById.get(providerId);
    const normalized = provider?.normalizeHookEvent(event);
    const domainMessages: DomainWsMessage[] = [];

    if (isNewAgent) {
      const createdAgent = this.domainStore.getAgent(String(agentId));
      if (createdAgent) {
        domainMessages.push({
          type: 'domainAgentUpserted',
          agent: createdAgent,
        } satisfies DomainAgentUpsertedMessage);
      }
    }

    if (!normalized) {
      return { agentId, isNewAgent, providerId, folderName, displayName, domainMessages };
    }

    const alertsBefore = this.domainStore.getAlerts().length;
    const permissionsBefore = this.domainStore.getPendingPermissions().length;

    const domainEvents = normalizeProviderEventToAgentEvents({
      providerId,
      sessionId,
      agentId: String(agentId),
      providerEvent: normalized.event,
    });

    for (const domainEvent of domainEvents) {
      const previousTimelineEvent = this.domainStore.getTimeline().at(-1);
      const updatedAgent = this.domainStore.applyEvent(domainEvent);
      domainMessages.push({
        type: 'domainEvent',
        event: domainEvent,
      } satisfies DomainEventMessage);
      domainMessages.push({
        type: 'domainAgentUpserted',
        agent: updatedAgent,
      } satisfies DomainAgentUpsertedMessage);

      const latestTimelineEvent = this.domainStore.getTimeline().at(-1);
      if (
        latestTimelineEvent &&
        (latestTimelineEvent.id !== previousTimelineEvent?.id ||
          latestTimelineEvent.timestamp !== previousTimelineEvent?.timestamp ||
          latestTimelineEvent.message !== previousTimelineEvent?.message)
      ) {
        domainMessages.push({
          type: 'domainTimelineAppended',
          event: latestTimelineEvent,
        } satisfies DomainTimelineAppendedMessage);
      }

      const latestAlert = this.domainStore.getAlerts().at(-1);
      if (this.domainStore.getAlerts().length > alertsBefore && latestAlert) {
        domainMessages.push({
          type: 'domainAlertRaised',
          alert: latestAlert,
        } satisfies DomainAlertRaisedMessage);
      }
    }

    if (this.domainStore.getPendingPermissions().length !== permissionsBefore) {
      domainMessages.push(this.buildPermissionsMessage());
    }

    if (normalized.event.kind === 'sessionEnd') {
      this.domainStore.removeAgent(String(agentId));
      this.sessionToAgentId.delete(sessionId);
      this.legacyReplayAgents.delete(agentId);
      domainMessages.push({
        type: 'domainAgentRemoved',
        agentId: String(agentId),
      } satisfies DomainAgentRemovedMessage);
      if (permissionsBefore > 0 || this.domainStore.getPendingPermissions().length > 0) {
        domainMessages.push(this.buildPermissionsMessage());
      }
    }

    return { agentId, isNewAgent, providerId, folderName, displayName, domainMessages };
  }

  handleClientMessage(msg: DomainWsClientMessage): DomainWsMessage[] {
    if (msg.type !== 'domainPermissionDecision') return [];

    const resolvedEvent = this.domainStore.resolvePermission(msg.permissionId, msg.decision);
    if (!resolvedEvent) return [];

    const messages: DomainWsMessage[] = [
      {
        type: 'domainEvent',
        event: resolvedEvent,
      } satisfies DomainEventMessage,
    ];

    const agent = this.domainStore.getAgent(resolvedEvent.agentId);
    if (agent) {
      messages.push({
        type: 'domainAgentUpserted',
        agent,
      } satisfies DomainAgentUpsertedMessage);
    }

    const latestTimelineEvent = this.domainStore.getTimeline().at(-1);
    if (latestTimelineEvent && latestTimelineEvent.agentId === resolvedEvent.agentId) {
      messages.push({
        type: 'domainTimelineAppended',
        event: latestTimelineEvent,
      } satisfies DomainTimelineAppendedMessage);
    }

    const latestAlert = this.domainStore.getAlerts().at(-1);
    if (latestAlert && latestAlert.agentId === resolvedEvent.agentId) {
      messages.push({
        type: 'domainAlertRaised',
        alert: latestAlert,
      } satisfies DomainAlertRaisedMessage);
    }

    messages.push(this.buildPermissionsMessage());
    return messages;
  }

  renameAgent(agentId: number, displayName: string): DomainWsMessage[] {
    const agent = this.domainStore.getAgent(String(agentId));
    if (!agent) return [];

    const renamedAgent = this.domainStore.upsertAgent({
      ...agent,
      name: displayName,
    });

    const replayAgent = this.legacyReplayAgents.get(agentId);
    if (replayAgent) {
      this.legacyReplayAgents.set(agentId, { ...replayAgent, displayName });
    }

    return [
      {
        type: 'domainAgentUpserted',
        agent: renamedAgent,
      } satisfies DomainAgentUpsertedMessage,
    ];
  }

  private buildPermissionsMessage(): DomainPermissionsMessage {
    return {
      type: 'domainPermissions',
      permissions: this.domainStore.getPendingPermissions(),
    };
  }

  private getOrCreateAgent(
    sessionId: string,
    providerId: string,
    cwd?: string,
  ): { agentId: number; isNewAgent: boolean; folderName?: string; displayName: string } {
    if (this.sessionToAgentId.has(sessionId)) {
      const agentId = this.sessionToAgentId.get(sessionId)!;
      this.upsertAgent(agentId, providerId, cwd ? path.basename(cwd) : undefined);
      const displayName =
        this.domainStore.getAgent(String(agentId))?.name ?? this.displayNameFor(agentId);
      return {
        agentId,
        isNewAgent: false,
        folderName: cwd ? path.basename(cwd) : undefined,
        displayName,
      };
    }

    const agentId = this.nextAgentId++;
    this.sessionToAgentId.set(sessionId, agentId);
    const folderName = cwd ? path.basename(cwd) : undefined;
    this.upsertAgent(agentId, providerId, folderName);
    return { agentId, isNewAgent: true, folderName, displayName: this.displayNameFor(agentId) };
  }

  private upsertAgent(agentId: number, providerId: string, folderName?: string): void {
    const existing = this.domainStore.getAgent(String(agentId));
    const fallbackName = this.displayNameFor(agentId);
    this.legacyReplayAgents.set(agentId, {
      agentId,
      providerId,
      folderName,
      displayName: existing?.name ?? fallbackName,
    });
    this.domainStore.upsertAgent({
      id: String(agentId),
      name: existing?.name ?? fallbackName,
      type: AgentType.DEV,
      source: existing?.source ?? toDomainSource(providerId),
      state: existing?.state ?? AgentRuntimeState.IDLE,
      lastAction: existing?.lastAction,
      lastUpdate: existing?.lastUpdate ?? Date.now(),
      currentTask: existing?.currentTask,
      contextUsage: existing?.contextUsage,
      inputTokens: existing?.inputTokens,
      outputTokens: existing?.outputTokens,
      errorCount: existing?.errorCount,
      loopDetected: existing?.loopDetected,
      muted: existing?.muted,
    });
  }

  private displayNameFor(agentId: number): string {
    const index = (agentId - 1) % AGENT_DISPLAY_NAMES.length;
    const round = Math.floor((agentId - 1) / AGENT_DISPLAY_NAMES.length);
    const base = AGENT_DISPLAY_NAMES[index];
    return round === 0 ? base : `${base} ${round + 1}`;
  }
}
