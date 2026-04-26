import type { Agent, AgentRuntimeState, AgentSource } from './types.js';

export interface DomainSnapshotCaches {
  names: Map<string, string>;
  sources: Map<string, AgentSource>;
  prevStates: Map<string, AgentRuntimeState>;
  contextWarned: Set<string>;
  contextUsage: Map<string, number>;
}

export function rebuildSnapshotCaches(
  agents: Agent[],
  current: DomainSnapshotCaches,
): DomainSnapshotCaches {
  const names = new Map<string, string>();
  const sources = new Map<string, AgentSource>();
  const prevStates = new Map<string, AgentRuntimeState>();
  const contextWarned = new Set<string>();
  const contextUsage = new Map<string, number>();

  for (const agent of agents) {
    names.set(agent.id, agent.name);
    if (agent.source) sources.set(agent.id, agent.source);
    prevStates.set(agent.id, agent.state);

    if (current.contextWarned.has(agent.id)) {
      contextWarned.add(agent.id);
    }

    const usage = current.contextUsage.get(agent.id);
    if (usage !== undefined) {
      contextUsage.set(agent.id, usage);
    }
  }

  return {
    names,
    sources,
    prevStates,
    contextWarned,
    contextUsage,
  };
}
