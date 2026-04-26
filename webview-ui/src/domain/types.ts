// Mirror of server/src/domain/types.ts — kept in sync manually

export const AgentSource = {
  CLAUDE: 'claude',
  CODEX: 'codex',
  CLI: 'cli',
  SYSTEM: 'system',
} as const;
export type AgentSource = (typeof AgentSource)[keyof typeof AgentSource];

export const AgentType = {
  DEV: 'dev',
  NPC: 'npc',
  SYSTEM: 'system',
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const AgentRuntimeState = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING_PERMISSION: 'waiting_permission',
  BLOCKED: 'blocked',
  ERROR: 'error',
  DONE: 'done',
} as const;
export type AgentRuntimeState = (typeof AgentRuntimeState)[keyof typeof AgentRuntimeState];

export const AgentEventType = {
  AGENT_STARTED: 'agent_started',
  AGENT_IDLE: 'agent_idle',
  AGENT_ACTION: 'agent_action',
  TOOL_USE: 'tool_use',
  FILE_CHANGED: 'file_changed',
  COMMAND_STARTED: 'command_started',
  COMMAND_FINISHED: 'command_finished',
  PERMISSION_REQUEST: 'permission_request',
  PERMISSION_APPROVED: 'permission_approved',
  PERMISSION_REJECTED: 'permission_rejected',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',
  ERROR: 'error',
  CONTEXT_WARNING: 'context_warning',
  LOOP_DETECTED: 'loop_detected',
  BLOCKED: 'blocked',
} as const;
export type AgentEventType = (typeof AgentEventType)[keyof typeof AgentEventType];

export const EventSeverity = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;
export type EventSeverity = (typeof EventSeverity)[keyof typeof EventSeverity];

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  source?: AgentSource;
  state: AgentRuntimeState;
  lastAction?: string;
  lastUpdate: number;
  currentTask?: string;
  contextUsage?: number;
  errorCount?: number;
  loopDetected?: boolean;
  muted?: boolean;
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  agentId: string;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  timestamp: number;
  agentId: string;
  severity: EventSeverity;
  kind: AgentEventType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface PermissionRequest {
  id: string;
  agentId: string;
  source: AgentSource;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  title: string;
  description?: string;
  command?: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
}
