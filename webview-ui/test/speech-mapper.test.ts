import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getSpeechKindForDomainEvent,
  getSpeechKindForStateTransition,
} from '../src/domain/speechMapper.ts';
import { AgentEventType, AgentRuntimeState } from '../src/domain/types.ts';

test('getSpeechKindForDomainEvent maps key lifecycle events to dev speech', () => {
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.AGENT_STARTED), 'turn_started');
  assert.equal(
    getSpeechKindForDomainEvent(AgentEventType.PERMISSION_REQUEST),
    'permission_request',
  );
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.TASK_COMPLETED), 'task_completed');
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.COMMAND_FINISHED), null);
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.PERMISSION_APPROVED), null);
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.AGENT_IDLE), null);
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.TASK_FAILED), 'task_failed');
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.CONTEXT_WARNING), 'context_warning');
  assert.equal(getSpeechKindForDomainEvent(AgentEventType.FILE_CHANGED), null);
});

test('getSpeechKindForStateTransition only speaks on real state changes', () => {
  assert.equal(
    getSpeechKindForStateTransition(AgentRuntimeState.IDLE, AgentRuntimeState.RUNNING),
    'turn_started',
  );
  assert.equal(
    getSpeechKindForStateTransition(
      AgentRuntimeState.RUNNING,
      AgentRuntimeState.WAITING_PERMISSION,
    ),
    'permission_request',
  );
  assert.equal(
    getSpeechKindForStateTransition(AgentRuntimeState.RUNNING, AgentRuntimeState.RUNNING),
    null,
  );
  assert.equal(
    getSpeechKindForStateTransition(AgentRuntimeState.RUNNING, AgentRuntimeState.IDLE),
    null,
  );
  assert.equal(
    getSpeechKindForStateTransition(AgentRuntimeState.RUNNING, AgentRuntimeState.DONE),
    null,
  );
});
