import { useEffect, useRef } from 'react';

import type { TimelineEvent } from '../../domain/types.js';
import { EventSeverity } from '../../domain/types.js';

interface TimelinePanelProps {
  events: TimelineEvent[];
}

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  [EventSeverity.INFO]: 'var(--color-text-muted)',
  [EventSeverity.SUCCESS]: 'var(--color-status-success)',
  [EventSeverity.WARNING]: 'var(--color-status-permission)',
  [EventSeverity.ERROR]: 'var(--color-status-error)',
  [EventSeverity.CRITICAL]: 'var(--color-danger)',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TimelinePanel({ events }: TimelinePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Auto-scroll only when user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center px-10 py-6 border-b-2 border-border flex-shrink-0"
        style={{ background: 'var(--color-bg-dark)' }}
      >
        <span className="text-sm text-text-muted select-none">Timeline</span>
        {events.length > 0 && (
          <span
            className="ml-6 text-2xs px-4 py-1"
            style={{ background: 'var(--color-btn-bg)', color: 'var(--color-text-muted)' }}
          >
            {events.length}
          </span>
        )}
      </div>

      {/* Events list (newest first shown at bottom) */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto flex flex-col"
      >
        {events.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-10">
            <p className="text-2xs text-text-muted text-center leading-relaxed">
              Aquí aparecerá la actividad de los agentes.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1" />
            {events.map((event) => (
              <div
                key={event.id}
                className="flex gap-8 px-10 py-6 border-b border-border"
                style={{ borderColor: 'var(--color-border-faint)' }}
              >
                <div
                  className="w-4 h-4 mt-4 flex-shrink-0"
                  style={{ background: SEVERITY_COLORS[event.severity] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text leading-relaxed" style={{ margin: 0 }}>
                    {event.message}
                  </p>
                  <span className="text-2xs text-text-muted">{formatTime(event.timestamp)}</span>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
