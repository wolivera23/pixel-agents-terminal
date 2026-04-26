/**
 * Demo mode — fictional agents for UI testing and office atmosphere.
 *
 * - Demo agents: simulate realistic Claude Code tool usage with sounds.
 * - Office NPCs: wandering background characters, no sounds, just visual presence.
 */

import { startTypingLoop, stopTypingLoop } from './notificationSound.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatch(data: object): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

// ── ID ranges ─────────────────────────────────────────────────────────────────
// Real agents: 1–99  |  Demo agents: 100–199  |  NPCs: 200–299

let nextDemoId = 100;
let nextNpcId = 200;

const demoTimers = new Map<number, ReturnType<typeof setTimeout>[]>();

// ── Demo agents (simulate tool use + sounds) ──────────────────────────────────

const TOOLS = [
  'Read',
  'Bash',
  'Edit',
  'Grep',
  'Write',
  'WebSearch',
  'WebFetch',
  'Glob',
  'TodoWrite',
];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function scheduleDemo(id: number, delayMs: number, fn: () => void): void {
  const t = setTimeout(fn, delayMs);
  const timers = demoTimers.get(id) ?? [];
  timers.push(t);
  demoTimers.set(id, timers);
}

function runDemoLoop(id: number, toolsLeft: number): void {
  if (!demoTimers.has(id)) return; // agent was removed

  const tool = TOOLS[Math.floor(Math.random() * TOOLS.length)];
  const toolId = `demo-${id}-${Date.now()}`;

  dispatch({ type: 'agentToolStart', id, toolId, status: tool, toolName: tool });
  startTypingLoop();

  const toolDuration = rand(1500, 6000);
  scheduleDemo(id, toolDuration, () => {
    if (!demoTimers.has(id)) return;
    dispatch({ type: 'agentToolDone', id, toolId });
    stopTypingLoop();

    const remaining = toolsLeft - 1;
    if (remaining <= 0) {
      // End of turn
      scheduleDemo(id, 400, () => {
        if (!demoTimers.has(id)) return;
        dispatch({ type: 'agentToolsClear', id });
        dispatch({ type: 'agentStatus', id, status: 'waiting' });

        // Start next turn after a pause
        const pause = rand(3000, 7000);
        scheduleDemo(id, pause, () => {
          if (!demoTimers.has(id)) return;
          dispatch({ type: 'agentStatus', id, status: 'active' });
          runDemoLoop(id, Math.floor(rand(2, 6)));
        });
      });
    } else {
      // Next tool in same turn
      scheduleDemo(id, rand(300, 800), () => runDemoLoop(id, remaining));
    }
  });
}

/** Add a demo agent that simulates realistic Claude Code activity with sounds. */
export function addDemoAgent(): number {
  const id = nextDemoId++;
  demoTimers.set(id, []);
  dispatch({ type: 'agentCreated', id, folderName: 'demo-project' });

  // Start first turn after a brief delay
  scheduleDemo(id, 1200, () => {
    dispatch({ type: 'agentStatus', id, status: 'active' });
    runDemoLoop(id, Math.floor(rand(2, 5)));
  });

  return id;
}

/** Remove a demo agent. */
export function removeDemoAgent(id: number): void {
  const timers = demoTimers.get(id);
  if (timers) {
    timers.forEach(clearTimeout);
    demoTimers.delete(id);
    stopTypingLoop();
    dispatch({ type: 'agentToolsClear', id });
    dispatch({ type: 'agentClosed', id });
  }
}

/** Remove all active demo agents. */
export function removeAllDemoAgents(): void {
  for (const id of [...demoTimers.keys()]) {
    if (id < 200) removeDemoAgent(id); // only demo agents, not NPCs
  }
  nextDemoId = 100;
}

export function getDemoAgentIds(): number[] {
  return [...demoTimers.keys()].filter((id) => id < 200);
}

// ── Office NPCs (wandering background characters, no sounds) ──────────────────

const npcIds = new Set<number>();

/** Add N background NPCs that wander the office for atmosphere. */
export function addOfficeNpcs(count: number): void {
  for (let i = 0; i < count; i++) {
    const id = nextNpcId++;
    npcIds.add(id);
    // Stagger spawns so they don't all appear at once
    setTimeout(() => {
      dispatch({ type: 'agentCreated', id, folderName: undefined });
    }, i * 600);
  }
}

/** Remove all NPCs. */
export function removeAllNpcs(): void {
  for (const id of npcIds) {
    dispatch({ type: 'agentClosed', id });
  }
  npcIds.clear();
  nextNpcId = 200;
}

export function getNpcCount(): number {
  return npcIds.size;
}
