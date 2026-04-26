import type { PermissionRequest } from '../../domain/types.js';
import { sendDomainMessage } from '../../websocketClient.js';

interface PermissionPanelProps {
  permissions: PermissionRequest[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function decide(permissionId: string, decision: 'approved' | 'rejected'): void {
  sendDomainMessage({ type: 'domainPermissionDecision', permissionId, decision });
}

export function PermissionPanel({ permissions }: PermissionPanelProps) {
  if (permissions.length === 0) return null;

  return (
    <div>
      <div
        className="flex items-center px-10 py-6 border-b border-border"
        style={{ background: 'var(--color-bg-dark)' }}
      >
        <div
          className="w-6 h-6 mr-6 pixel-pulse"
          style={{ background: 'var(--color-status-permission)' }}
        />
        <span className="text-sm" style={{ color: 'var(--color-status-permission)' }}>
          Permisos pendientes
        </span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
        {permissions.map((perm) => (
          <div key={perm.id} className="px-10 py-8 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-text">{perm.title}</span>
              <span className="text-2xs text-text-muted">{formatTime(perm.requestedAt)}</span>
            </div>
            {perm.description && (
              <p className="text-2xs text-text-muted mb-6 truncate" title={perm.description}>
                {perm.description}
              </p>
            )}
            {perm.command && (
              <code
                className="block text-2xs px-6 py-2 mb-6 truncate"
                style={{
                  background: 'var(--color-bg-dark)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-status-active)',
                }}
                title={perm.command}
              >
                {perm.command}
              </code>
            )}
            <div className="flex gap-6">
              <button
                className="flex-1 text-2xs py-2 border border-border cursor-pointer"
                style={{
                  background: 'var(--color-status-success-bg)',
                  color: 'var(--color-status-success)',
                }}
                onClick={() => decide(perm.id, 'approved')}
                title="Aprobar (actualiza el dashboard — no controla Claude/Codex todavía)"
              >
                Aprobar
              </button>
              <button
                className="flex-1 text-2xs py-2 border border-border cursor-pointer"
                style={{
                  background: 'var(--color-status-error-bg)',
                  color: 'var(--color-status-error)',
                }}
                onClick={() => decide(perm.id, 'rejected')}
                title="Rechazar (actualiza el dashboard — no controla Claude/Codex todavía)"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
