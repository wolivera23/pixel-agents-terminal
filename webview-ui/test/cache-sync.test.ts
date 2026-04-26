import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rebuildSnapshotCaches } from '../src/domain/cacheSync.ts';
import { AgentRuntimeState, AgentSource, AgentType } from '../src/domain/types.ts';

test('rebuildSnapshotCaches keeps only active agents and seeds canonical metadata', () => {
  const caches = rebuildSnapshotCaches(
    [
      {
        id: '2',
        name: 'Codex Agent',
        type: AgentType.DEV,
        source: AgentSource.CODEX,
        state: AgentRuntimeState.RUNNING,
        lastUpdate: 2000,
      },
    ],
    {
      names: new Map([
        ['1', 'Old Agent'],
        ['2', 'Stale Name'],
      ]),
      sources: new Map([
        ['1', AgentSource.CLAUDE],
        ['2', AgentSource.CLAUDE],
      ]),
      prevStates: new Map([
        ['1', AgentRuntimeState.ERROR],
        ['2', AgentRuntimeState.IDLE],
      ]),
      contextWarned: new Set(['1', '2']),
      contextUsage: new Map([
        ['1', 0.91],
        ['2', 0.42],
      ]),
    },
  );

  assert.deepEqual([...caches.names.entries()], [['2', 'Codex Agent']]);
  assert.deepEqual([...caches.sources.entries()], [['2', AgentSource.CODEX]]);
  assert.deepEqual([...caches.prevStates.entries()], [['2', AgentRuntimeState.RUNNING]]);
  assert.deepEqual([...caches.contextWarned.values()], ['2']);
  assert.deepEqual([...caches.contextUsage.entries()], [['2', 0.42]]);
});
