import { MAX_CONTEXT_TOKENS, TOKEN_WARN_THRESHOLD } from '../constants.js';
import type {
  AgentEvent,
  AgentEventType,
  AgentSource,
  EventSeverity,
} from '../types/agentControl.js';

const COMMAND_TOOL_NAMES = new Set(['Bash', 'shell', 'shell_command']);
const IGNORED_MESSAGE_TYPES = new Set([
  'agentSelected',
  'characterSpritesLoaded',
  'existingAgents',
  'externalAssetDirectoriesUpdated',
  'floorTilesLoaded',
  'furnitureAssetsLoaded',
  'layoutLoaded',
  'settingsLoaded',
  'wallTilesLoaded',
  'workspaceFolders',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function inferSource(message: Record<string, unknown>): AgentSource {
  const providerId = asString(message.providerId) ?? asString(message.source);
  switch (providerId) {
    case 'claude':
      return 'claude';
    case 'codex':
      return 'codex';
    case 'cli':
      return 'cli';
    default:
      return 'system';
  }
}

function getAgentId(message: Record<string, unknown>): string | null {
  const directId = message.id;
  if (typeof directId === 'string' && directId.length > 0) return directId;
  if (typeof directId === 'number' && Number.isFinite(directId)) return String(directId);

  const nestedId = message.agentId;
  if (typeof nestedId === 'string' && nestedId.length > 0) return nestedId;
  if (typeof nestedId === 'number' && Number.isFinite(nestedId)) return String(nestedId);

  return null;
}

function buildEvent(
  message: Record<string, unknown>,
  agentId: string,
  type: AgentEventType,
  severity: EventSeverity,
  title: string,
  description?: string,
  metadata?: Record<string, unknown>,
): AgentEvent {
  return {
    id: `${type}:${agentId}:${asString(message.toolId) ?? asString(message.parentToolId) ?? Date.now().toString()}`,
    timestamp: asNumber(message.timestamp) ?? Date.now(),
    source: inferSource(message),
    agentId,
    type,
    severity,
    title,
    description,
    metadata: {
      rawMessage: message,
      ...metadata,
    },
  };
}

function normalizeDomainEvent(message: Record<string, unknown>): AgentEvent | null {
  const domainEvent = message.event;
  if (!isRecord(domainEvent)) return null;

  const id = asString(domainEvent.id);
  const agentId = asString(domainEvent.agentId);
  const source = domainEvent.source;
  const type = domainEvent.type;
  const severity = domainEvent.severity;
  const title = asString(domainEvent.title);

  if (
    !id ||
    !agentId ||
    (source !== 'claude' && source !== 'codex' && source !== 'cli' && source !== 'system') ||
    typeof type !== 'string' ||
    typeof severity !== 'string' ||
    !title
  ) {
    return null;
  }

  return {
    id,
    timestamp: asNumber(domainEvent.timestamp) ?? Date.now(),
    source,
    agentId,
    type: type as AgentEventType,
    severity: severity as EventSeverity,
    title,
    description: asString(domainEvent.description),
    metadata: isRecord(domainEvent.metadata) ? domainEvent.metadata : { rawMessage: message },
  };
}

export function normalizeToAgentEvent(rawMessage: unknown): AgentEvent | null {
  if (!isRecord(rawMessage)) return null;
  if (rawMessage.type === 'domainEvent') return normalizeDomainEvent(rawMessage);

  const messageType = asString(rawMessage.type);
  if (!messageType || IGNORED_MESSAGE_TYPES.has(messageType)) return null;

  const agentId = getAgentId(rawMessage);
  if (!agentId) return null;

  switch (messageType) {
    case 'agentCreated':
      return buildEvent(rawMessage, agentId, 'agent_started', 'info', 'Agent started', undefined, {
        agentKind: 'dev',
        agentName: asString(rawMessage.teammateName),
        folderName: asString(rawMessage.folderName),
        isTeammate: rawMessage.isTeammate === true,
      });
    case 'agentClosed':
      return buildEvent(rawMessage, agentId, 'task_completed', 'success', 'Agent closed');
    case 'agentToolStart': {
      const toolName = asString(rawMessage.toolName) ?? asString(rawMessage.status) ?? 'Tool';
      const isCommand = COMMAND_TOOL_NAMES.has(toolName);
      return buildEvent(
        rawMessage,
        agentId,
        isCommand ? 'command_started' : 'tool_use',
        'info',
        isCommand ? 'Command started' : 'Tool started',
        asString(rawMessage.status) ?? toolName,
        {
          toolId: asString(rawMessage.toolId),
          toolName,
        },
      );
    }
    case 'agentToolDone':
      return buildEvent(
        rawMessage,
        agentId,
        'command_finished',
        'success',
        'Tool finished',
        asString(rawMessage.toolId),
      );
    case 'agentToolsClear':
      return buildEvent(rawMessage, agentId, 'agent_idle', 'success', 'Agent idle');
    case 'agentStatus': {
      const status = asString(rawMessage.status) ?? 'unknown';
      if (status === 'active') {
        return buildEvent(rawMessage, agentId, 'agent_started', 'info', 'Agent active');
      }
      if (status === 'waiting') {
        return buildEvent(rawMessage, agentId, 'task_completed', 'success', 'Task completed');
      }
      if (status === 'blocked') {
        return buildEvent(rawMessage, agentId, 'blocked', 'error', 'Agent blocked');
      }
      if (status === 'error') {
        return buildEvent(rawMessage, agentId, 'error', 'error', 'Agent error');
      }
      return buildEvent(
        rawMessage,
        agentId,
        'agent_action',
        'info',
        'Agent status changed',
        status,
      );
    }
    case 'agentToolPermission':
    case 'subagentToolPermission':
      return buildEvent(
        rawMessage,
        agentId,
        'permission_request',
        'warning',
        'Permission requested',
        asString(rawMessage.parentToolId),
      );
    case 'agentToolPermissionClear':
      return buildEvent(
        rawMessage,
        agentId,
        'permission_approved',
        'success',
        'Permission cleared',
      );
    case 'subagentToolStart':
      return buildEvent(
        rawMessage,
        agentId,
        'tool_use',
        'info',
        'Subagent tool started',
        asString(rawMessage.status),
        {
          toolId: asString(rawMessage.toolId),
          parentToolId: asString(rawMessage.parentToolId),
        },
      );
    case 'subagentToolDone':
      return buildEvent(
        rawMessage,
        agentId,
        'command_finished',
        'success',
        'Subagent tool finished',
        asString(rawMessage.toolId),
      );
    case 'subagentClear':
      return buildEvent(rawMessage, agentId, 'agent_idle', 'success', 'Subagent cleared');
    case 'agentTokenUsage': {
      const inputTokens = asNumber(rawMessage.inputTokens) ?? 0;
      const outputTokens = asNumber(rawMessage.outputTokens) ?? 0;
      const contextUsage = (inputTokens + outputTokens) / MAX_CONTEXT_TOKENS;
      const isWarning = contextUsage >= TOKEN_WARN_THRESHOLD;
      return buildEvent(
        rawMessage,
        agentId,
        isWarning ? 'context_warning' : 'agent_action',
        isWarning ? 'warning' : 'info',
        isWarning ? 'Context warning' : 'Token usage updated',
        `${Math.round(contextUsage * 100)}% context used`,
        {
          contextUsage,
          inputTokens,
          outputTokens,
        },
      );
    }
    default:
      return buildEvent(rawMessage, agentId, 'agent_action', 'info', 'Agent event', messageType);
  }
}
