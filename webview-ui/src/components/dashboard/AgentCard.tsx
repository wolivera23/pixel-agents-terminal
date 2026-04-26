import type { Agent } from '../../domain/types.js';
import { AgentRuntimeState, AgentSource } from '../../domain/types.js';

interface AgentCardProps {
  agent: Agent;
  isSelected?: boolean;
  onClick?: () => void;
}

const STATE_COLORS: Record<AgentRuntimeState, string> = {
  [AgentRuntimeState.IDLE]: 'var(--color-text-muted)',
  [AgentRuntimeState.RUNNING]: 'var(--color-status-active)',
  [AgentRuntimeState.WAITING_PERMISSION]: 'var(--color-status-permission)',
  [AgentRuntimeState.BLOCKED]: 'var(--color-status-error)',
  [AgentRuntimeState.ERROR]: 'var(--color-status-error)',
  [AgentRuntimeState.DONE]: 'var(--color-status-success)',
};

const STATE_LABELS: Record<AgentRuntimeState, string> = {
  [AgentRuntimeState.IDLE]: 'inactivo',
  [AgentRuntimeState.RUNNING]: 'activo',
  [AgentRuntimeState.WAITING_PERMISSION]: 'esperando',
  [AgentRuntimeState.BLOCKED]: 'bloqueado',
  [AgentRuntimeState.ERROR]: 'error',
  [AgentRuntimeState.DONE]: 'completado',
};

const SOURCE_LABELS: Record<AgentSource, string> = {
  [AgentSource.CLAUDE]: 'Claude',
  [AgentSource.CODEX]: 'Codex',
  [AgentSource.CLI]: 'CLI',
  [AgentSource.SYSTEM]: 'Sistema',
};

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'ahora';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function contextColor(usage: number): string {
  if (usage >= 0.8) return 'var(--color-status-error)';
  if (usage >= 0.6) return 'var(--color-status-permission)';
  return 'var(--color-text-muted)';
}

export function AgentCard({ agent, isSelected = false, onClick }: AgentCardProps) {
  const stateColor = STATE_COLORS[agent.state];
  const isPending = agent.state === AgentRuntimeState.WAITING_PERMISSION;
  const isError =
    agent.state === AgentRuntimeState.ERROR || agent.state === AgentRuntimeState.BLOCKED;
  const sourceLabel = agent.source ? SOURCE_LABELS[agent.source] : 'CLI';
  const hasContext = agent.contextUsage !== undefined && agent.contextUsage > 0;
  const ctxPct = hasContext ? Math.min(Math.round(agent.contextUsage! * 100), 100) : 0;
  const ctxColor = hasContext ? contextColor(agent.contextUsage!) : '';

  return (
    <div
      onClick={onClick}
      className="px-10 py-8 border-b border-border cursor-pointer"
      style={{
        background: isSelected ? 'var(--color-active-bg)' : 'transparent',
        borderLeft: `2px solid ${isSelected ? 'var(--color-accent)' : 'transparent'}`,
      }}
      onMouseEnter={(e) => {
        if (!isSelected)
          (e.currentTarget as HTMLDivElement).style.background = 'var(--color-btn-bg)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Name + state dot */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <span
          className="text-sm truncate"
          style={{ color: isError ? 'var(--color-status-error)' : 'var(--color-text)' }}
          title={agent.name}
        >
          {agent.name}
        </span>
        <div
          className="w-8 h-8 flex-shrink-0"
          style={{ background: stateColor }}
          title={STATE_LABELS[agent.state]}
        />
      </div>

      {/* Source + state label + loop flag */}
      <div className="flex items-center gap-6 mb-4">
        <span className="text-2xs text-text-muted">{sourceLabel}</span>
        <span className="text-2xs" style={{ color: stateColor }}>
          {STATE_LABELS[agent.state]}
        </span>
        {agent.loopDetected && <span className="text-2xs text-warning">⚠ loop</span>}
      </div>

      {/* Current task */}
      {agent.currentTask && (
        <div className="text-2xs text-text-muted mb-4 truncate" title={agent.currentTask}>
          {agent.currentTask}
        </div>
      )}

      {/* Permission pending banner */}
      {isPending && (
        <div
          className="text-2xs px-6 py-2 mb-4"
          style={{
            background: 'var(--color-status-permission-bg)',
            border: '1px solid var(--color-status-permission)',
            color: 'var(--color-status-permission)',
          }}
        >
          Esperando aprobación
        </div>
      )}

      {/* Context usage bar */}
      {hasContext && (
        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-2xs text-text-muted">contexto</span>
            <span className="text-2xs" style={{ color: ctxColor }}>
              {ctxPct}%
            </span>
          </div>
          <div
            style={{
              height: 2,
              background: 'var(--color-border)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${ctxPct}%`,
                background: ctxColor,
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer: errors + time */}
      <div className="flex items-center justify-between">
        {(agent.errorCount ?? 0) > 0 ? (
          <span className="text-2xs" style={{ color: 'var(--color-status-error)' }}>
            {agent.errorCount} errores
          </span>
        ) : (
          <span />
        )}
        <span className="text-2xs text-text-muted">{formatRelativeTime(agent.lastUpdate)}</span>
      </div>
    </div>
  );
}
