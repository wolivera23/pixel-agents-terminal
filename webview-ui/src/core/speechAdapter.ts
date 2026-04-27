import type { SpeechEventKind } from '../agentSpeech.js';
import type { AgentEvent } from '../types/agentControl.js';

export function speechEventFromAgentEvent(event: AgentEvent): SpeechEventKind | null {
  switch (event.type) {
    case 'agent_started':
    case 'agent_action':
    case 'tool_use':
    case 'command_started':
      return 'turn_started';
    case 'permission_request':
      return 'permission_request';
    case 'task_completed':
      return 'task_completed';
    case 'command_finished':
    case 'permission_approved':
    case 'agent_idle':
      return null;
    case 'task_failed':
    case 'error':
    case 'permission_rejected':
    case 'blocked':
    case 'loop_detected':
      return 'task_failed';
    case 'context_warning':
      return 'context_warning';
    case 'file_changed':
      return null;
  }
}
