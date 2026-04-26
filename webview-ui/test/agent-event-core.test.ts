import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reduceAgentEvent } from '../src/core/agentState.ts';
import { normalizeToAgentEvent } from '../src/core/eventNormalizer.ts';
import { speechEventFromAgentEvent } from '../src/core/speechAdapter.ts';
import { agentEventToTimelineEvent } from '../src/core/timeline.ts';

test('normalizeToAgentEvent maps permission messages without dropping raw payload', () => {
  const event = normalizeToAgentEvent({
    type: 'agentToolPermission',
    id: 7,
    providerId: 'codex',
  });

  assert.ok(event);
  assert.equal(event.type, 'permission_request');
  assert.equal(event.source, 'codex');
  assert.equal(event.agentId, '7');
  assert.equal(event.metadata?.rawMessage && typeof event.metadata.rawMessage, 'object');
});

test('normalizeToAgentEvent promotes high token usage to context_warning', () => {
  const event = normalizeToAgentEvent({
    type: 'agentTokenUsage',
    id: 3,
    inputTokens: 170000,
    outputTokens: 12000,
  });

  assert.ok(event);
  assert.equal(event.type, 'context_warning');
  assert.equal(event.severity, 'warning');
  assert.equal(typeof event.metadata?.contextUsage, 'number');
});

test('reduceAgentEvent updates state, error counters, and context usage', () => {
  const started = normalizeToAgentEvent({ type: 'agentCreated', id: 12, providerId: 'claude' });
  const warned = normalizeToAgentEvent({
    type: 'agentTokenUsage',
    id: 12,
    inputTokens: 180000,
    outputTokens: 10000,
  });
  const failed = normalizeToAgentEvent({ type: 'agentStatus', id: 12, status: 'error' });

  assert.ok(started && warned && failed);

  const afterStart = reduceAgentEvent({}, started);
  assert.equal(afterStart['12']?.state, 'running');

  const afterWarn = reduceAgentEvent(afterStart, warned);
  assert.equal(typeof afterWarn['12']?.contextUsage, 'number');

  const afterFail = reduceAgentEvent(afterWarn, failed);
  assert.equal(afterFail['12']?.state, 'error');
  assert.equal(afterFail['12']?.errorCount, 1);
});

test('timeline and speech adapters derive human-facing outputs from AgentEvent', () => {
  const event = normalizeToAgentEvent({
    type: 'agentToolStart',
    id: 4,
    toolId: 'tool-1',
    toolName: 'Bash',
    status: 'Running: npm test',
  });

  assert.ok(event);

  const timelineEvent = agentEventToTimelineEvent(event);
  assert.equal(timelineEvent.agentId, '4');
  assert.match(timelineEvent.message, /Command started|Tool started/);
  assert.equal(speechEventFromAgentEvent(event), 'turn_started');
});
