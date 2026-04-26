// Maps domain state transitions and events to speech.
// Single entry point for all dev speech, not useExtensionMessages.

import type { SpeechEventKind } from '../agentSpeech.js';
import { triggerSpeech } from '../agentSpeech.js';
import { AgentEventType, AgentRuntimeState } from './types.js';

export function getSpeechKindForStateTransition(
  prevState: AgentRuntimeState,
  nextState: AgentRuntimeState,
): SpeechEventKind | null {
  if (prevState === nextState) return null;

  switch (nextState) {
    case AgentRuntimeState.RUNNING:
      return 'turn_started';
    case AgentRuntimeState.WAITING_PERMISSION:
      return 'permission_request';
    case AgentRuntimeState.IDLE:
    case AgentRuntimeState.DONE:
      return 'task_completed';
    case AgentRuntimeState.ERROR:
    case AgentRuntimeState.BLOCKED:
      return 'task_failed';
  }
}

export function getSpeechKindForDomainEvent(eventType: AgentEventType): SpeechEventKind | null {
  switch (eventType) {
    case AgentEventType.AGENT_STARTED:
    case AgentEventType.AGENT_ACTION:
    case AgentEventType.TOOL_USE:
    case AgentEventType.COMMAND_STARTED:
      return 'turn_started';
    case AgentEventType.PERMISSION_REQUEST:
      return 'permission_request';
    case AgentEventType.TASK_COMPLETED:
    case AgentEventType.COMMAND_FINISHED:
    case AgentEventType.PERMISSION_APPROVED:
    case AgentEventType.AGENT_IDLE:
      return 'task_completed';
    case AgentEventType.TASK_FAILED:
    case AgentEventType.ERROR:
    case AgentEventType.PERMISSION_REJECTED:
    case AgentEventType.BLOCKED:
    case AgentEventType.LOOP_DETECTED:
      return 'task_failed';
    case AgentEventType.CONTEXT_WARNING:
      return 'context_warning';
    case AgentEventType.FILE_CHANGED:
      return null;
  }
}

export function mapStateTransitionToSpeech(
  prevState: AgentRuntimeState,
  nextState: AgentRuntimeState,
): void {
  const kind = getSpeechKindForStateTransition(prevState, nextState);
  if (kind) triggerSpeech(kind);
}

export function mapDomainEventToSpeech(eventType: AgentEventType): void {
  const kind = getSpeechKindForDomainEvent(eventType);
  if (kind) triggerSpeech(kind);
}

export function mapContextWarningToSpeech(): void {
  triggerSpeech('context_warning');
}
