import type { Agent, PermissionRequest } from '../../domain/types.js';
import { AgentCard } from './AgentCard.js';
import { PermissionPanel } from './PermissionPanel.js';

interface AgentGridProps {
  agents: Agent[];
  pendingPermissions: PermissionRequest[];
  selectedAgentId?: string;
  onSelectAgent?: (id: string) => void;
}

export function AgentGrid({
  agents,
  pendingPermissions,
  selectedAgentId,
  onSelectAgent,
}: AgentGridProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center px-10 py-6 border-b-2 border-border flex-shrink-0"
        style={{ background: 'var(--color-bg-dark)' }}
      >
        <span className="text-sm text-text-muted select-none">Agentes</span>
        {agents.length > 0 && (
          <span
            className="ml-6 text-2xs px-4 py-1"
            style={{
              background: 'var(--color-btn-bg)',
              color: 'var(--color-text-muted)',
            }}
          >
            {agents.length}
          </span>
        )}
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="px-10 py-20 text-center">
            <p className="text-sm text-text-muted leading-relaxed">Sin agentes activos.</p>
            <p className="text-2xs text-text-muted mt-4">
              Usa <span style={{ color: 'var(--color-accent)' }}>+ Agent</span> para iniciar uno.
            </p>
          </div>
        ) : (
          agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedAgentId}
              onClick={() => onSelectAgent?.(agent.id)}
            />
          ))
        )}
      </div>

      {/* Permissions section */}
      {pendingPermissions.length > 0 && (
        <div className="flex-shrink-0 border-t-2 border-border">
          <PermissionPanel permissions={pendingPermissions} />
        </div>
      )}
    </div>
  );
}
