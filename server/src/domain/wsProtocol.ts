import type { Agent, AgentEvent, Alert, PermissionRequest, TimelineEvent } from './types.js';

export const DOMAIN_WS_PROTOCOL_VERSION = 1;

export interface DomainSnapshotMessage {
  type: 'domainSnapshot';
  protocolVersion: number;
  agents: Agent[];
  timeline: TimelineEvent[];
  alerts: Alert[];
  permissions: PermissionRequest[];
}

export interface DomainEventMessage {
  type: 'domainEvent';
  event: AgentEvent;
}

export interface DomainAgentUpsertedMessage {
  type: 'domainAgentUpserted';
  agent: Agent;
}

export interface DomainAgentRemovedMessage {
  type: 'domainAgentRemoved';
  agentId: string;
}

export interface DomainTimelineAppendedMessage {
  type: 'domainTimelineAppended';
  event: TimelineEvent;
}

export interface DomainAlertRaisedMessage {
  type: 'domainAlertRaised';
  alert: Alert;
}

export interface DomainPermissionsMessage {
  type: 'domainPermissions';
  permissions: PermissionRequest[];
}

export interface DomainPermissionDecisionRequest {
  type: 'domainPermissionDecision';
  permissionId: string;
  decision: 'approved' | 'rejected';
}

export type DomainWsMessage =
  | DomainSnapshotMessage
  | DomainEventMessage
  | DomainAgentUpsertedMessage
  | DomainAgentRemovedMessage
  | DomainTimelineAppendedMessage
  | DomainAlertRaisedMessage
  | DomainPermissionsMessage;

export interface DomainSyncRequestMessage {
  type: 'requestSync';
}

export interface DomainSaveLayoutMessage {
  type: 'saveLayout';
  layout: unknown;
}

export interface DomainCloseAgentMessage {
  type: 'closeAgent';
  id: number;
}

export type DomainWsClientMessage =
  | DomainPermissionDecisionRequest
  | DomainSyncRequestMessage
  | DomainSaveLayoutMessage
  | DomainCloseAgentMessage;
