import {
  type Agent,
  type AgentEvent,
  AgentEventType,
  AgentRuntimeState,
  AgentType,
  type Alert,
  EventSeverity,
  type PermissionRequest,
  type TimelineEvent,
} from './types.js';

export interface AgentStateStoreOptions {
  maxEvents?: number;
  maxTimelineEvents?: number;
  maxAlerts?: number;
}

function trimToLimit<T>(list: T[], maxItems: number): T[] {
  return list.length <= maxItems ? list : list.slice(list.length - maxItems);
}

function buildTimelineMessage(event: AgentEvent, agent: Agent): string {
  switch (event.type) {
    case AgentEventType.AGENT_STARTED:
      return `${agent.name} empezo una sesion.`;
    case AgentEventType.AGENT_IDLE:
      return `${agent.name} quedo inactivo.`;
    case AgentEventType.AGENT_ACTION:
      return `${agent.name} registro actividad.`;
    case AgentEventType.TOOL_USE:
      return `${agent.name} uso ${event.metadata?.['toolName'] ?? 'una herramienta'}.`;
    case AgentEventType.COMMAND_STARTED:
      return `${agent.name} inicio un comando.`;
    case AgentEventType.COMMAND_FINISHED:
      return `${agent.name} termino un comando.`;
    case AgentEventType.PERMISSION_REQUEST:
      if (typeof event.metadata?.['command'] === 'string') {
        return `${agent.name} pidio permiso para ejecutar un comando.`;
      }
      if (typeof event.metadata?.['filePath'] === 'string') {
        return `${agent.name} pidio permiso para modificar un archivo.`;
      }
      return `${agent.name} pidio permiso para continuar.`;
    case AgentEventType.PERMISSION_APPROVED:
      return `${agent.name} recibio una aprobacion.`;
    case AgentEventType.PERMISSION_REJECTED:
      return `${agent.name} recibio un rechazo.`;
    case AgentEventType.TASK_COMPLETED:
      return `${agent.name} termino correctamente.`;
    case AgentEventType.TASK_FAILED:
      return `${agent.name} no pudo completar la tarea.`;
    case AgentEventType.ERROR:
      return `${agent.name} encontro un error.`;
    case AgentEventType.CONTEXT_WARNING:
      return `${agent.name} se acerca al limite de contexto.`;
    case AgentEventType.LOOP_DETECTED:
      return `${agent.name} podria estar en un loop.`;
    case AgentEventType.BLOCKED:
      return `${agent.name} parece bloqueado.`;
    case AgentEventType.FILE_CHANGED:
      return `${agent.name} modifico archivos.`;
    default: {
      const exhaustiveCheck: never = event.type;
      return exhaustiveCheck;
    }
  }
}

function shouldRaiseAlert(event: AgentEvent): boolean {
  return (
    event.severity === EventSeverity.WARNING ||
    event.severity === EventSeverity.ERROR ||
    event.severity === EventSeverity.CRITICAL
  );
}

function nextAgentState(previous: Agent, event: AgentEvent): AgentRuntimeState {
  switch (event.type) {
    case AgentEventType.AGENT_STARTED:
    case AgentEventType.AGENT_ACTION:
    case AgentEventType.TOOL_USE:
    case AgentEventType.COMMAND_STARTED:
      return AgentRuntimeState.RUNNING;
    case AgentEventType.PERMISSION_REQUEST:
      return AgentRuntimeState.WAITING_PERMISSION;
    case AgentEventType.PERMISSION_APPROVED:
      return AgentRuntimeState.RUNNING;
    case AgentEventType.PERMISSION_REJECTED:
      return AgentRuntimeState.BLOCKED;
    case AgentEventType.TASK_COMPLETED:
      return AgentRuntimeState.DONE;
    case AgentEventType.TASK_FAILED:
    case AgentEventType.ERROR:
      return AgentRuntimeState.ERROR;
    case AgentEventType.BLOCKED:
      return AgentRuntimeState.BLOCKED;
    case AgentEventType.AGENT_IDLE:
      return AgentRuntimeState.IDLE;
    case AgentEventType.CONTEXT_WARNING:
    case AgentEventType.FILE_CHANGED:
    case AgentEventType.COMMAND_FINISHED:
    case AgentEventType.LOOP_DETECTED:
      return previous.state;
    default: {
      const exhaustiveCheck: never = event.type;
      return exhaustiveCheck;
    }
  }
}

function nextCurrentTask(previous: Agent, event: AgentEvent): string | undefined {
  switch (event.type) {
    case AgentEventType.TASK_COMPLETED:
    case AgentEventType.AGENT_IDLE:
      return undefined;

    case AgentEventType.TOOL_USE:
    case AgentEventType.COMMAND_STARTED:
      return event.description ?? event.title;

    case AgentEventType.PERMISSION_REQUEST:
    case AgentEventType.PERMISSION_APPROVED:
    case AgentEventType.PERMISSION_REJECTED:
    case AgentEventType.TASK_FAILED:
    case AgentEventType.ERROR:
    case AgentEventType.BLOCKED:
      return previous.currentTask ?? event.description ?? event.title;

    case AgentEventType.AGENT_STARTED:
    case AgentEventType.AGENT_ACTION:
    case AgentEventType.FILE_CHANGED:
    case AgentEventType.CONTEXT_WARNING:
    case AgentEventType.LOOP_DETECTED:
    case AgentEventType.COMMAND_FINISHED:
      return event.description ?? previous.currentTask;

    default: {
      const exhaustiveCheck: never = event.type;
      return exhaustiveCheck;
    }
  }
}

export class AgentStateStore {
  private readonly maxEvents: number;
  private readonly maxTimelineEvents: number;
  private readonly maxAlerts: number;
  private readonly agents = new Map<string, Agent>();
  private events: AgentEvent[] = [];
  private timeline: TimelineEvent[] = [];
  private alerts: Alert[] = [];
  private permissions = new Map<string, PermissionRequest>();

  constructor(options: AgentStateStoreOptions = {}) {
    this.maxEvents = options.maxEvents ?? 500;
    this.maxTimelineEvents = options.maxTimelineEvents ?? 500;
    this.maxAlerts = options.maxAlerts ?? 200;
  }

  upsertAgent(agent: Agent): Agent {
    this.agents.set(agent.id, { ...agent });
    return this.agents.get(agent.id)!;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.permissions = new Map(
      [...this.permissions.entries()].filter(([, permission]) => permission.agentId !== agentId),
    );
  }

  getAgents(): Agent[] {
    return [...this.agents.values()].sort((a, b) => b.lastUpdate - a.lastUpdate);
  }

  getEvents(): AgentEvent[] {
    return [...this.events];
  }

  getTimeline(): TimelineEvent[] {
    return [...this.timeline];
  }

  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  getPendingPermissions(): PermissionRequest[] {
    return [...this.permissions.values()]
      .filter((permission) => permission.status === 'pending')
      .sort((a, b) => b.requestedAt - a.requestedAt);
  }

  resolvePermission(
    permissionId: string,
    decision: 'approved' | 'rejected',
    timestamp = Date.now(),
  ): AgentEvent | null {
    const permission = this.permissions.get(permissionId);
    if (!permission) return null;

    permission.status = decision;
    this.permissions.set(permissionId, permission);

    const eventType =
      decision === 'approved'
        ? AgentEventType.PERMISSION_APPROVED
        : AgentEventType.PERMISSION_REJECTED;
    const severity = decision === 'approved' ? EventSeverity.SUCCESS : EventSeverity.WARNING;

    const event: AgentEvent = {
      id: `${permissionId}:${decision}:${timestamp}`,
      timestamp,
      source: permission.source,
      agentId: permission.agentId,
      type: eventType,
      severity,
      title: decision === 'approved' ? 'Permission approved' : 'Permission rejected',
      description: permission.title,
      metadata: {
        permissionId,
        mock: true,
        command: permission.command,
        filePath: permission.filePath,
      },
    };

    this.applyEvent(event);
    return event;
  }

  applyEvent(event: AgentEvent): Agent {
    const current =
      this.agents.get(event.agentId) ??
      ({
        id: event.agentId,
        name: event.agentId,
        type: AgentType.DEV,
        source: event.source,
        state: AgentRuntimeState.IDLE,
        lastUpdate: 0,
        errorCount: 0,
      } satisfies Agent);

    const next: Agent = {
      ...current,
      source: current.source ?? event.source,
      state: nextAgentState(current, event),
      lastAction: event.title,
      lastUpdate: event.timestamp,
      currentTask: nextCurrentTask(current, event),
      errorCount:
        event.type === AgentEventType.ERROR || event.type === AgentEventType.TASK_FAILED
          ? (current.errorCount ?? 0) + 1
          : (current.errorCount ?? 0),
      loopDetected: event.type === AgentEventType.LOOP_DETECTED ? true : current.loopDetected,
    };

    this.agents.set(next.id, next);

    this.events = trimToLimit([...this.events, event], this.maxEvents);

    const timelineEvent: TimelineEvent = {
      id: `${event.id}:timeline`,
      timestamp: event.timestamp,
      agentId: event.agentId,
      severity: event.severity,
      message: buildTimelineMessage(event, next),
      metadata: event.metadata,
    };
    this.timeline = trimToLimit([...this.timeline, timelineEvent], this.maxTimelineEvents);

    if (event.type === AgentEventType.PERMISSION_REQUEST) {
      this.permissions.set(event.id, {
        id: event.id,
        agentId: event.agentId,
        source: event.source,
        requestedAt: event.timestamp,
        status: 'pending',
        title: event.title,
        description: event.description,
        command:
          typeof event.metadata?.['command'] === 'string'
            ? (event.metadata['command'] as string)
            : undefined,
        filePath:
          typeof event.metadata?.['filePath'] === 'string'
            ? (event.metadata['filePath'] as string)
            : undefined,
        metadata: event.metadata,
      });
    }

    if (
      event.type === AgentEventType.PERMISSION_APPROVED ||
      event.type === AgentEventType.PERMISSION_REJECTED
    ) {
      const permissionId =
        typeof event.metadata?.['permissionId'] === 'string'
          ? (event.metadata['permissionId'] as string)
          : undefined;
      if (permissionId) {
        const permission = this.permissions.get(permissionId);
        if (permission) {
          permission.status =
            event.type === AgentEventType.PERMISSION_APPROVED ? 'approved' : 'rejected';
          this.permissions.set(permissionId, permission);
        }
      }
    }

    if (shouldRaiseAlert(event)) {
      const alert: Alert = {
        id: `${event.id}:alert`,
        timestamp: event.timestamp,
        agentId: event.agentId,
        severity: event.severity,
        kind: event.type,
        title: event.title,
        description: event.description,
        metadata: event.metadata,
      };
      this.alerts = trimToLimit([...this.alerts, alert], this.maxAlerts);
    }

    return next;
  }
}
