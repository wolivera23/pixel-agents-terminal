import type { Alert } from '../../domain/types.js';
import { AgentEventType, EventSeverity } from '../../domain/types.js';

interface AlertsPanelProps {
  alerts: Alert[];
}

const SEVERITY_ICONS: Record<EventSeverity, string> = {
  [EventSeverity.INFO]: '·',
  [EventSeverity.SUCCESS]: '✓',
  [EventSeverity.WARNING]: '⚠',
  [EventSeverity.ERROR]: '✕',
  [EventSeverity.CRITICAL]: '!!',
};

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  [EventSeverity.INFO]: 'var(--color-text-muted)',
  [EventSeverity.SUCCESS]: 'var(--color-status-success)',
  [EventSeverity.WARNING]: 'var(--color-status-permission)',
  [EventSeverity.ERROR]: 'var(--color-status-error)',
  [EventSeverity.CRITICAL]: 'var(--color-danger)',
};

const KIND_LABELS: Partial<Record<AgentEventType, string>> = {
  [AgentEventType.PERMISSION_REQUEST]: 'permiso',
  [AgentEventType.ERROR]: 'error',
  [AgentEventType.BLOCKED]: 'bloqueado',
  [AgentEventType.LOOP_DETECTED]: 'loop',
  [AgentEventType.CONTEXT_WARNING]: 'contexto',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) return null;

  return (
    <div>
      <div
        className="flex items-center px-10 py-6 border-b border-border"
        style={{ background: 'var(--color-bg-dark)' }}
      >
        <span className="text-sm text-text-muted select-none">Alertas</span>
        <span
          className="ml-6 text-2xs px-4 py-1"
          style={{ background: 'var(--color-btn-bg)', color: 'var(--color-status-error)' }}
        >
          {alerts.length}
        </span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
        {alerts.map((alert) => {
          const color = SEVERITY_COLORS[alert.severity];
          const icon = SEVERITY_ICONS[alert.severity];
          const kindLabel = KIND_LABELS[alert.kind] ?? '';

          return (
            <div
              key={alert.id}
              className="flex gap-6 px-10 py-6 border-b border-border"
              style={{ borderColor: 'var(--color-border-faint)' }}
            >
              <span className="text-sm flex-shrink-0 w-12 text-center" style={{ color }}>
                {icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-2xs truncate" style={{ color, margin: 0 }} title={alert.title}>
                  {alert.title}
                </p>
                <div className="flex items-center gap-6 mt-2">
                  {kindLabel && <span className="text-2xs text-text-muted">{kindLabel}</span>}
                  <span className="text-2xs text-text-muted">{formatTime(alert.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
