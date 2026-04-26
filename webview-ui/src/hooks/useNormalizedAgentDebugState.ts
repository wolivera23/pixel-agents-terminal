import { useMemo } from 'react';

import type { AgentMap } from '../core/agentState.js';
import type { AgentEvent, TimelineEvent } from '../types/agentControl.js';

interface NormalizedAgentDebugState {
  agents: Array<AgentMap[string]>;
  timeline: TimelineEvent[];
  recentEvents: AgentEvent[];
}

export function useNormalizedAgentDebugState(
  normalizedAgents: AgentMap,
  normalizedTimeline: TimelineEvent[],
  recentAgentEvents: AgentEvent[],
): NormalizedAgentDebugState {
  return useMemo(
    () => ({
      agents: Object.values(normalizedAgents).sort((a, b) => b.lastUpdate - a.lastUpdate),
      timeline: normalizedTimeline.slice(-25),
      recentEvents: recentAgentEvents.slice(-25),
    }),
    [normalizedAgents, normalizedTimeline, recentAgentEvents],
  );
}
