import type {
  Agent as DomainAgent,
  AgentEventType as DomainAgentEventType,
  AgentRuntimeState as DomainAgentRuntimeState,
  AgentSource as DomainAgentSource,
  AgentType as DomainAgentType,
  EventSeverity as DomainEventSeverity,
  TimelineEvent as DomainTimelineEvent,
} from '../domain/types.js';

export type AgentSource = DomainAgentSource;
export type AgentKind = DomainAgentType;
export type AgentState = DomainAgentRuntimeState;
export type EventSeverity = DomainEventSeverity;
export type AgentEventType = DomainAgentEventType;
export type Agent = DomainAgent;
export type TimelineEvent = DomainTimelineEvent;

export interface AgentEvent {
  id: string;
  timestamp: number;
  source: AgentSource;
  agentId: string;
  type: AgentEventType;
  severity: EventSeverity;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
