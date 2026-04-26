import { describe, expect, it } from 'vitest';

import { codexProvider } from '../src/providers/hook/codex/codex.js';

describe('codexProvider', () => {
  describe('identity', () => {
    it('has kind "hook"', () => {
      expect(codexProvider.kind).toBe('hook');
    });
    it('has id "codex"', () => {
      expect(codexProvider.id).toBe('codex');
    });
    it('has a displayName', () => {
      expect(codexProvider.displayName).toBe('Codex');
    });
  });

  describe('normalizeHookEvent', () => {
    it('returns null when hook_event_name is missing', () => {
      expect(codexProvider.normalizeHookEvent({ session_id: 'x' })).toBeNull();
    });
    it('returns null when session_id is missing', () => {
      expect(codexProvider.normalizeHookEvent({ hook_event_name: 'Stop' })).toBeNull();
    });
    it('normalizes PreToolUse', () => {
      const result = codexProvider.normalizeHookEvent({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-1',
        tool_name: 'Bash',
        tool_use_id: 'call-1',
        tool_input: { command: 'npm test' },
      });
      expect(result?.sessionId).toBe('sess-1');
      expect(result?.event.kind).toBe('toolStart');
      if (result?.event.kind === 'toolStart') {
        expect(result.event.toolId).toBe('call-1');
        expect(result.event.toolName).toBe('Bash');
        expect(result.event.input).toEqual({ command: 'npm test' });
      }
    });
    it('normalizes lifecycle events', () => {
      expect(
        codexProvider.normalizeHookEvent({
          hook_event_name: 'SessionStart',
          session_id: 'sess-1',
          source: 'startup',
        })?.event.kind,
      ).toBe('sessionStart');
      expect(
        codexProvider.normalizeHookEvent({
          hook_event_name: 'UserPromptSubmit',
          session_id: 'sess-1',
        })?.event.kind,
      ).toBe('userTurn');
      expect(
        codexProvider.normalizeHookEvent({
          hook_event_name: 'Stop',
          session_id: 'sess-1',
        })?.event.kind,
      ).toBe('turnEnd');
    });
    it('normalizes PostToolUseFailure to failed toolEnd', () => {
      const result = codexProvider.normalizeHookEvent({
        hook_event_name: 'PostToolUseFailure',
        session_id: 'sess-1',
        tool_name: 'shell_command',
        error: 'Exited with code 1',
      });
      expect(result?.event.kind).toBe('toolEnd');
      if (result?.event.kind === 'toolEnd') {
        expect(result.event.success).toBe(false);
        expect(result.event.toolName).toBe('shell_command');
        expect(result.event.error).toBe('Exited with code 1');
      }
    });
  });

  describe('formatToolStatus', () => {
    it('formats shell_command', () => {
      expect(codexProvider.formatToolStatus('shell_command', { command: 'npm test' })).toBe(
        'Running: npm test',
      );
    });
    it('formats apply_patch as editing', () => {
      expect(codexProvider.formatToolStatus('apply_patch', {})).toBe('Editing files');
    });
    it('falls back for unknown tools', () => {
      expect(codexProvider.formatToolStatus('tool_x', {})).toBe('Using tool_x');
    });
  });
});
