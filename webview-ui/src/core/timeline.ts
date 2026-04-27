import { TIMELINE_GROUP_WINDOW_MS, TIMELINE_TOOL_SUMMARY_LIMIT } from '../constants.js';
import { AgentEventType, EventSeverity } from '../domain/types.js';
import type { AgentEvent, TimelineEvent } from '../types/agentControl.js';

const NOISY_TOOL_NAMES = new Set(['typing', 'reviewing', 'cleaning']);
const INTERNAL_TITLES = new Set([
  'Agent active',
  'Agent event',
  'Agent reported progress',
  'Token usage updated',
  'Tool finished',
  'Subagent tool finished',
]);
const ACTIVITY_TYPES = new Set<AgentEvent['type']>([
  AgentEventType.TOOL_USE,
  AgentEventType.COMMAND_STARTED,
  AgentEventType.FILE_CHANGED,
]);

interface TimelineHumanizedMetadata extends Record<string, unknown> {
  humanized?: {
    kind: 'activity';
    rawEventIds: string[];
    toolLabels: string[];
  };
}

function agentLabel(agentId: string): string {
  return `Agente ${agentId}`;
}

function metadataString(event: AgentEvent, key: string): string | undefined {
  const value = event.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isNoisyEvent(event: AgentEvent): boolean {
  const toolName = metadataString(event, 'toolName')?.toLowerCase();
  if (toolName && NOISY_TOOL_NAMES.has(toolName)) return true;
  if (INTERNAL_TITLES.has(event.title)) return true;
  if (event.type === AgentEventType.COMMAND_FINISHED && event.severity === EventSeverity.SUCCESS) {
    return true;
  }
  if (event.type === AgentEventType.AGENT_ACTION && event.severity === EventSeverity.INFO) {
    return true;
  }
  return false;
}

function toolLabel(event: AgentEvent): string {
  const toolName = metadataString(event, 'toolName');
  const filePath = metadataString(event, 'filePath');
  const command = metadataString(event, 'command');

  if (command) return 'ejecutando comandos';
  if (filePath) {
    if (toolName?.toLowerCase().includes('read')) return 'leyendo archivos';
    if (toolName?.toLowerCase().includes('edit') || toolName?.toLowerCase().includes('write')) {
      return 'editando archivos';
    }
    return 'trabajando con archivos';
  }
  if (toolName) return `usando ${toolName}`;
  if (event.description) return event.description;
  return 'trabajando';
}

function summarizeToolLabels(labels: string[]): string {
  const unique = [...new Set(labels)];
  const visible = unique.slice(0, TIMELINE_TOOL_SUMMARY_LIMIT);
  const hiddenCount = unique.length - visible.length;
  return hiddenCount > 0 ? `${visible.join(', ')} y ${hiddenCount} mas` : visible.join(', ');
}

function buildActivityMessage(agentId: string, labels: string[]): string {
  return `${agentLabel(agentId)} esta ${summarizeToolLabels(labels)}.`;
}

function buildMessage(event: AgentEvent): string | null {
  switch (event.type) {
    case AgentEventType.AGENT_STARTED:
      return `${agentLabel(event.agentId)} inicio una sesion.`;
    case AgentEventType.AGENT_IDLE:
      return `${agentLabel(event.agentId)} quedo inactivo.`;
    case AgentEventType.PERMISSION_REQUEST:
      if (metadataString(event, 'command')) {
        return `${agentLabel(event.agentId)} necesita permiso para ejecutar un comando.`;
      }
      if (metadataString(event, 'filePath')) {
        return `${agentLabel(event.agentId)} necesita permiso para cambiar un archivo.`;
      }
      return `${agentLabel(event.agentId)} necesita permiso para continuar.`;
    case AgentEventType.PERMISSION_APPROVED:
      return `${agentLabel(event.agentId)} recibio aprobacion.`;
    case AgentEventType.PERMISSION_REJECTED:
      return `${agentLabel(event.agentId)} no recibio permiso.`;
    case AgentEventType.TASK_COMPLETED:
      return `${agentLabel(event.agentId)} termino el turno.`;
    case AgentEventType.TASK_FAILED:
      return `${agentLabel(event.agentId)} no pudo completar la tarea.`;
    case AgentEventType.ERROR:
      return `${agentLabel(event.agentId)} encontro un error.`;
    case AgentEventType.CONTEXT_WARNING:
      return `${agentLabel(event.agentId)} se acerca al limite de contexto.`;
    case AgentEventType.LOOP_DETECTED:
      return `${agentLabel(event.agentId)} podria estar trabado en un loop.`;
    case AgentEventType.BLOCKED:
      return `${agentLabel(event.agentId)} esta bloqueado.`;
    case AgentEventType.TOOL_USE:
    case AgentEventType.COMMAND_STARTED:
    case AgentEventType.FILE_CHANGED:
      return buildActivityMessage(event.agentId, [toolLabel(event)]);
    case AgentEventType.AGENT_ACTION:
    case AgentEventType.COMMAND_FINISHED:
      return null;
  }
}

function shouldMergeWithPrevious(previous: TimelineEvent, event: AgentEvent): boolean {
  const metadata = previous.metadata as TimelineHumanizedMetadata | undefined;
  return (
    metadata?.humanized?.kind === 'activity' &&
    previous.agentId === event.agentId &&
    ACTIVITY_TYPES.has(event.type) &&
    event.timestamp - previous.timestamp <= TIMELINE_GROUP_WINDOW_MS
  );
}

export function agentEventToTimelineEvent(event: AgentEvent): TimelineEvent | null {
  if (isNoisyEvent(event)) return null;

  const message = buildMessage(event);
  if (!message) return null;

  const label = ACTIVITY_TYPES.has(event.type) ? toolLabel(event) : undefined;
  return {
    id: event.id,
    timestamp: event.timestamp,
    agentId: event.agentId,
    severity: event.severity,
    message,
    metadata: {
      ...event.metadata,
      rawEvent: event,
      ...(label
        ? {
            humanized: {
              kind: 'activity',
              rawEventIds: [event.id],
              toolLabels: [label],
            },
          }
        : {}),
    },
  };
}

export function appendHumanizedTimelineEvent(
  timeline: TimelineEvent[],
  event: AgentEvent,
  limit: number,
): TimelineEvent[] {
  if (isNoisyEvent(event)) return timeline;

  const previous = timeline.at(-1);
  if (previous && shouldMergeWithPrevious(previous, event)) {
    const previousMetadata = previous.metadata as TimelineHumanizedMetadata;
    const previousHumanized = previousMetadata.humanized!;
    const toolLabels = [...previousHumanized.toolLabels, toolLabel(event)];
    const rawEventIds = [...previousHumanized.rawEventIds, event.id];
    const merged: TimelineEvent = {
      ...previous,
      timestamp: event.timestamp,
      severity:
        event.severity === EventSeverity.WARNING ||
        event.severity === EventSeverity.ERROR ||
        event.severity === EventSeverity.CRITICAL
          ? event.severity
          : previous.severity,
      message: buildActivityMessage(event.agentId, toolLabels),
      metadata: {
        ...previous.metadata,
        latestRawEvent: event,
        humanized: {
          kind: 'activity',
          rawEventIds,
          toolLabels,
        },
      },
    };
    return [...timeline.slice(0, -1), merged];
  }

  const nextEvent = agentEventToTimelineEvent(event);
  if (!nextEvent) return timeline;
  const nextTimeline = [...timeline, nextEvent];
  return nextTimeline.length > limit
    ? nextTimeline.slice(nextTimeline.length - limit)
    : nextTimeline;
}
