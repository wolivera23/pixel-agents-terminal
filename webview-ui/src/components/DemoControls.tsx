import { useCallback, useState } from 'react';

import {
  addDemoAgent,
  addOfficeNpcs,
  getDemoAgentIds,
  getNpcCount,
  removeAllDemoAgents,
  removeAllNpcs,
  removeDemoAgent,
} from '../demoMode.js';
import { Button } from './ui/Button.js';

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [demoIds, setDemoIds] = useState<number[]>([]);
  const [npcCount, setNpcCount] = useState(0);

  const handleAddDemo = useCallback(() => {
    addDemoAgent();
    setDemoIds(getDemoAgentIds());
  }, []);

  const handleRemoveDemo = useCallback((id: number) => {
    removeDemoAgent(id);
    setDemoIds(getDemoAgentIds());
  }, []);

  const handleClearDemos = useCallback(() => {
    removeAllDemoAgents();
    setDemoIds([]);
  }, []);

  const handleAddNpcs = useCallback((n: number) => {
    addOfficeNpcs(n);
    setTimeout(() => setNpcCount(getNpcCount()), n * 600 + 100);
  }, []);

  const handleClearNpcs = useCallback(() => {
    removeAllNpcs();
    setNpcCount(0);
  }, []);

  return (
    <div className="absolute bottom-48 right-12 z-50 flex flex-col items-end gap-4">
      {/* Toggle button */}
      <Button size="sm" onClick={() => setOpen((v) => !v)} title="Demo controls">
        {open ? '▼' : '▶'} demo
      </Button>

      {open && (
        <div className="pixel-panel p-10 flex flex-col gap-8 min-w-[180px]">
          {/* Demo agents */}
          <section className="flex flex-col gap-4">
            <span className="text-text-muted text-xs">Agentes demo</span>

            <div className="flex gap-4">
              <Button size="sm" onClick={handleAddDemo}>
                + Agregar
              </Button>
              {demoIds.length > 0 && (
                <Button size="sm" onClick={handleClearDemos}>
                  × Limpiar
                </Button>
              )}
            </div>

            {demoIds.map((id) => (
              <div key={id} className="flex items-center gap-4">
                <span className="text-status-active text-xs">●</span>
                <span className="text-xs">Demo #{id - 99}</span>
                <Button size="sm" onClick={() => handleRemoveDemo(id)} className="ml-auto">
                  ×
                </Button>
              </div>
            ))}
          </section>

          <div className="border-t border-border" />

          {/* NPCs */}
          <section className="flex flex-col gap-4">
            <span className="text-text-muted text-xs">
              Oficina{npcCount > 0 ? ` (${npcCount})` : ''}
            </span>
            <div className="flex gap-4 flex-wrap">
              {[1, 3, 5].map((n) => (
                <Button key={n} size="sm" onClick={() => handleAddNpcs(n)}>
                  +{n}
                </Button>
              ))}
              {npcCount > 0 && (
                <Button size="sm" onClick={handleClearNpcs}>
                  × Limpiar
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
