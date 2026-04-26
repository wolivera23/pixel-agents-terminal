import { describe, expect, it } from 'vitest';

import { DomainSessionBridge } from '../src/domain/domainSessionBridge.js';
import { hookProvidersById } from '../src/providers/index.js';

describe('DomainSessionBridge', () => {
  it('builds a snapshot after a hook event', () => {
    const bridge = new DomainSessionBridge(hookProvidersById);

    const result = bridge.handleHookEvent('codex', {
      hook_event_name: 'SessionStart',
      session_id: 'sess-1',
      cwd: 'C:\\repo',
      source: 'startup',
    });

    expect(result?.agentId).toBe(1);
    expect(result?.providerId).toBe('codex');
    expect(result?.folderName).toBe('repo');
    expect(result?.domainMessages.some((msg) => msg.type === 'domainAgentUpserted')).toBe(true);

    const snapshot = bridge.buildSnapshot();
    expect(snapshot.type).toBe('domainSnapshot');
    expect(snapshot.protocolVersion).toBe(1);
    expect(snapshot.agents).toHaveLength(1);
    expect(snapshot.agents[0]?.source).toBe('codex');
  });

  it('emits permission updates and resolves them from client messages', () => {
    const bridge = new DomainSessionBridge(hookProvidersById);

    const permissionResult = bridge.handleHookEvent('codex', {
      hook_event_name: 'PermissionRequest',
      session_id: 'sess-2',
      cwd: 'C:\\repo',
    });

    expect(permissionResult?.domainMessages.some((msg) => msg.type === 'domainPermissions')).toBe(
      true,
    );

    const snapshot = bridge.buildSnapshot();
    expect(snapshot.permissions).toHaveLength(1);

    const permissionId = snapshot.permissions[0]!.id;
    const resolvedMessages = bridge.handleClientMessage({
      type: 'domainPermissionDecision',
      permissionId,
      decision: 'approved',
    });

    expect(resolvedMessages.some((msg) => msg.type === 'domainEvent')).toBe(true);
    expect(resolvedMessages.some((msg) => msg.type === 'domainPermissions')).toBe(true);
    expect(bridge.buildSnapshot().permissions).toHaveLength(0);
  });

  it('replays legacy agent metadata and clears it on session end', () => {
    const bridge = new DomainSessionBridge(hookProvidersById);

    bridge.handleHookEvent('codex', {
      hook_event_name: 'SessionStart',
      session_id: 'sess-3',
      cwd: 'C:\\repo\\backend',
      source: 'startup',
    });

    expect(bridge.buildLegacyReplayAgents()).toEqual([
      {
        agentId: 1,
        providerId: 'codex',
        folderName: 'backend',
      },
    ]);

    const result = bridge.handleHookEvent('codex', {
      hook_event_name: 'SessionEnd',
      session_id: 'sess-3',
      cwd: 'C:\\repo\\backend',
      reason: 'exit',
    });

    expect(result?.domainMessages.some((msg) => msg.type === 'domainAgentRemoved')).toBe(true);
    expect(bridge.buildLegacyReplayAgents()).toEqual([]);
    expect(bridge.buildSnapshot().agents).toEqual([]);
  });

  it('clears pending permissions when a session ends', () => {
    const bridge = new DomainSessionBridge(hookProvidersById);

    bridge.handleHookEvent('codex', {
      hook_event_name: 'PermissionRequest',
      session_id: 'sess-4',
      cwd: 'C:\\repo',
    });
    expect(bridge.buildSnapshot().permissions).toHaveLength(1);

    const result = bridge.handleHookEvent('codex', {
      hook_event_name: 'SessionEnd',
      session_id: 'sess-4',
      cwd: 'C:\\repo',
      reason: 'exit',
    });

    const permissionMessages = result?.domainMessages.filter(
      (msg) => msg.type === 'domainPermissions',
    );
    expect(permissionMessages).toHaveLength(1);
    expect(bridge.buildSnapshot().permissions).toEqual([]);
  });
});
