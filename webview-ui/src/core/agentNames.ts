import { AGENT_DISPLAY_NAMES } from '../constants.js';

export function displayNameForAgentId(agentId: number | string): string {
  const numericId = typeof agentId === 'number' ? agentId : Number(agentId);
  if (!Number.isFinite(numericId) || numericId < 1) {
    return `Agente ${agentId}`;
  }

  const normalizedId = Math.floor(numericId);
  const index = (normalizedId - 1) % AGENT_DISPLAY_NAMES.length;
  const round = Math.floor((normalizedId - 1) / AGENT_DISPLAY_NAMES.length);
  const base = AGENT_DISPLAY_NAMES[index];
  return round === 0 ? base : `${base} ${round + 1}`;
}
