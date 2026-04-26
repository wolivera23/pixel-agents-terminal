import type { ProviderEvent } from '../provider.js';
import {
  type AgentEvent,
  AgentEventType,
  AgentSource,
  type AgentSource as AgentSourceType,
  EventSeverity,
} from './types.js';

export interface NormalizeProviderEventInput {
  providerId: string;
  sessionId: string;
  agentId: string;
  timestamp?: number;
  providerEvent: ProviderEvent;
}

function toAgentSource(providerId: string): AgentSourceType {
  switch (providerId) {
    case AgentSource.CLAUDE:
      return AgentSource.CLAUDE;
    case AgentSource.CODEX:
      return AgentSource.CODEX;
    default:
      return AgentSource.CLI;
  }
}

function buildEvent(
  input: NormalizeProviderEventInput,
  patch: Omit<AgentEvent, 'id' | 'timestamp' | 'source' | 'agentId'>,
): AgentEvent {
  const timestamp = input.timestamp ?? Date.now();
  const source = toAgentSource(input.providerId);
  return {
    id: `${input.sessionId}:${timestamp}:${patch.type}`,
    timestamp,
    source,
    agentId: input.agentId,
    ...patch,
  };
}

function parseInput(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  return {};
}

function extractActionMetadata(
  toolName?: string,
  input?: unknown,
): {
  description?: string;
  command?: string;
  filePath?: string;
} {
  const parsed = parseInput(input);
  const command = typeof parsed.command === 'string' ? parsed.command : undefined;
  const filePath =
    typeof parsed.file_path === 'string'
      ? parsed.file_path
      : typeof parsed.path === 'string'
        ? parsed.path
        : undefined;

  if (command) {
    return {
      description: `Running command: ${command}`,
      command,
      filePath,
    };
  }

  if (filePath) {
    const verb = toolName ? `Using ${toolName}` : 'Working with file';
    return {
      description: `${verb}: ${filePath}`,
      command,
      filePath,
    };
  }

  if (toolName) {
    return {
      description: `Tool ${toolName} started`,
      command,
      filePath,
    };
  }

  return { command, filePath };
}

function buildPermissionTitle(toolName?: string): string {
  return toolName ? `Permission required for ${toolName}` : 'Permission required';
}

export function normalizeProviderEventToAgentEvents(
  input: NormalizeProviderEventInput,
): AgentEvent[] {
  const event = input.providerEvent;

  switch (event.kind) {
    case 'sessionStart':
      return [
        buildEvent(input, {
          type: AgentEventType.AGENT_STARTED,
          severity: EventSeverity.INFO,
          title: 'Agent session started',
          description: event.source ? `Session source: ${event.source}` : undefined,
          metadata: { sessionId: input.sessionId, source: event.source },
        }),
      ];

    case 'userTurn':
      return [
        buildEvent(input, {
          type: AgentEventType.AGENT_ACTION,
          severity: EventSeverity.INFO,
          title: 'Agent received a new instruction',
          metadata: { sessionId: input.sessionId },
        }),
      ];

    case 'toolStart': {
      const toolAction = extractActionMetadata(event.toolName, event.input);
      return [
        buildEvent(input, {
          type: AgentEventType.TOOL_USE,
          severity: EventSeverity.INFO,
          title: `Using ${event.toolName}`,
          description: toolAction.description,
          metadata: {
            sessionId: input.sessionId,
            toolId: event.toolId,
            toolName: event.toolName,
            input: event.input,
            command: toolAction.command,
            filePath: toolAction.filePath,
          },
        }),
      ];
    }

    case 'toolEnd':
      if (event.success === false) {
        const title = event.toolName ? `Tool failed: ${event.toolName}` : 'Tool failed';
        const description =
          event.error ?? (event.toolName ? `Tool ${event.toolName} failed` : undefined);
        return [
          buildEvent(input, {
            type: AgentEventType.TASK_FAILED,
            severity: EventSeverity.ERROR,
            title,
            description,
            metadata: {
              sessionId: input.sessionId,
              toolId: event.toolId,
              toolName: event.toolName,
              error: event.error,
            },
          }),
        ];
      }
      return [
        buildEvent(input, {
          type: AgentEventType.COMMAND_FINISHED,
          severity: EventSeverity.SUCCESS,
          title: 'Tool finished',
          metadata: {
            sessionId: input.sessionId,
            toolId: event.toolId,
          },
        }),
      ];

    case 'permissionRequest': {
      const permissionAction = extractActionMetadata(event.toolName, event.input);
      return [
        buildEvent(input, {
          type: AgentEventType.PERMISSION_REQUEST,
          severity: EventSeverity.WARNING,
          title: buildPermissionTitle(event.toolName),
          description: permissionAction.description,
          metadata: {
            sessionId: input.sessionId,
            toolName: event.toolName,
            input: event.input,
            command: permissionAction.command,
            filePath: permissionAction.filePath,
          },
        }),
      ];
    }

    case 'turnEnd':
      return [
        buildEvent(input, {
          type: AgentEventType.TASK_COMPLETED,
          severity: EventSeverity.SUCCESS,
          title: 'Turn completed',
          metadata: { sessionId: input.sessionId },
        }),
      ];

    case 'sessionEnd':
      return [
        buildEvent(input, {
          type: AgentEventType.AGENT_IDLE,
          severity: EventSeverity.INFO,
          title: 'Agent session ended',
          description: event.reason ? `Session ended: ${event.reason}` : undefined,
          metadata: { sessionId: input.sessionId, reason: event.reason },
        }),
      ];

    case 'subagentStart':
      return [
        buildEvent(input, {
          type: AgentEventType.AGENT_ACTION,
          severity: EventSeverity.INFO,
          title: `Subagent started: ${event.toolName}`,
          metadata: {
            sessionId: input.sessionId,
            parentToolId: event.parentToolId,
            toolId: event.toolId,
            toolName: event.toolName,
            input: event.input,
          },
        }),
      ];

    case 'subagentEnd':
      return [
        buildEvent(input, {
          type: AgentEventType.AGENT_ACTION,
          severity: EventSeverity.SUCCESS,
          title: 'Subagent finished',
          metadata: {
            sessionId: input.sessionId,
            parentToolId: event.parentToolId,
            toolId: event.toolId,
          },
        }),
      ];

    case 'subagentTurnEnd':
      return [
        buildEvent(input, {
          type: AgentEventType.TASK_COMPLETED,
          severity: EventSeverity.SUCCESS,
          title: 'Subagent turn completed',
          metadata: {
            sessionId: input.sessionId,
            parentToolId: event.parentToolId,
          },
        }),
      ];

    case 'progress':
      return [
        buildEvent(input, {
          type: AgentEventType.AGENT_ACTION,
          severity: EventSeverity.INFO,
          title: 'Agent reported progress',
          metadata: {
            sessionId: input.sessionId,
            toolId: event.toolId,
            data: event.data,
          },
        }),
      ];

    default: {
      const exhaustiveCheck: never = event;
      return exhaustiveCheck;
    }
  }
}
