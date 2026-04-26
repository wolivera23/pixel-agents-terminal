import type { AgentEvent, TimelineEvent } from '../types/agentControl.js';

function buildMessage(event: AgentEvent): string {
  if (event.description) {
    return `${event.title}: ${event.description}`;
  }

  switch (event.type) {
    case 'agent_started':
      return `${event.title} inició actividad.`;
    case 'agent_idle':
      return `${event.title} quedó inactivo.`;
    case 'permission_request':
      return `${event.title} requiere permiso.`;
    case 'task_completed':
      return `${event.title} completó una tarea.`;
    case 'task_failed':
    case 'error':
      return `${event.title} reportó un error.`;
    case 'blocked':
      return `${event.title} quedó bloqueado.`;
    default:
      return event.title;
  }
}

export function agentEventToTimelineEvent(event: AgentEvent): TimelineEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    agentId: event.agentId,
    severity: event.severity,
    message: buildMessage(event),
    metadata: event.metadata,
  };
}
