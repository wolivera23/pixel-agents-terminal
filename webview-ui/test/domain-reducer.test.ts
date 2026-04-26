import assert from 'node:assert/strict';
import { test } from 'node:test';

import { domainReducer, initialDomainState } from '../src/domain/reducer.ts';
import {
  AgentRuntimeState,
  AgentSource,
  AgentType,
  AgentEventType,
  EventSeverity,
} from '../src/domain/types.ts';

test('HYDRATE_SNAPSHOT replaces existing timeline and alerts instead of appending duplicates', () => {
  const original = domainReducer(initialDomainState, {
    type: 'HYDRATE_SNAPSHOT',
    state: {
      agents: [
        {
          id: '1',
          name: 'Backend Agent',
          type: AgentType.DEV,
          source: AgentSource.CODEX,
          state: AgentRuntimeState.RUNNING,
          lastUpdate: 1000,
        },
      ],
      timeline: [
        {
          id: 't1',
          timestamp: 1000,
          agentId: '1',
          severity: EventSeverity.INFO,
          message: 'Primer evento',
        },
      ],
      alerts: [
        {
          id: 'a1',
          timestamp: 1000,
          agentId: '1',
          severity: EventSeverity.WARNING,
          kind: AgentEventType.PERMISSION_REQUEST,
          title: 'Primer alerta',
        },
      ],
      permissions: [],
    },
  });

  const rehydrated = domainReducer(original, {
    type: 'HYDRATE_SNAPSHOT',
    state: {
      agents: [
        {
          id: '1',
          name: 'Backend Agent',
          type: AgentType.DEV,
          source: AgentSource.CODEX,
          state: AgentRuntimeState.DONE,
          lastUpdate: 2000,
        },
      ],
      timeline: [
        {
          id: 't2',
          timestamp: 2000,
          agentId: '1',
          severity: EventSeverity.SUCCESS,
          message: 'Segundo evento',
        },
      ],
      alerts: [],
      permissions: [],
    },
  });

  assert.deepEqual(
    rehydrated.timeline.map((event) => event.id),
    ['t2'],
  );
  assert.deepEqual(rehydrated.alerts, []);
  assert.equal(rehydrated.agents[0]?.state, AgentRuntimeState.DONE);
});

test('PATCH_AGENTS preserves canonical lastUpdate when patch omits it', () => {
  const state = domainReducer(initialDomainState, {
    type: 'HYDRATE_SNAPSHOT',
    state: {
      agents: [
        {
          id: '1',
          name: 'Backend Agent',
          type: AgentType.DEV,
          source: AgentSource.CODEX,
          state: AgentRuntimeState.RUNNING,
          lastUpdate: 1234,
        },
      ],
      timeline: [],
      alerts: [],
      permissions: [],
    },
  });

  const patched = domainReducer(state, {
    type: 'PATCH_AGENTS',
    agents: [
      {
        id: '1',
        contextUsage: 0.82,
      },
    ],
  });

  assert.equal(patched.agents[0]?.lastUpdate, 1234);
  assert.equal(patched.agents[0]?.contextUsage, 0.82);
});
