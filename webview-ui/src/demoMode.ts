/**
 * Demo mode — fictional agents and office NPCs for UI testing and atmosphere.
 *
 * - Demo agents: simulate realistic Claude Code tool usage with sounds.
 * - Office NPCs: background characters with roles (cleaner, secretary, manager).
 *   Secretaries occasionally type, managers inspect, cleaners roam and pause.
 */

import { startTypingLoop, stopTypingLoop } from './notificationSound.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatch(data: object): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ── ID ranges ─────────────────────────────────────────────────────────────────
// Real agents: 1–99  |  Demo agents: 100–199  |  NPCs: 200–299

let nextDemoId = 100;
let nextNpcId = 200;

const demoTimers = new Map<number, ReturnType<typeof setTimeout>[]>();
const npcTimers = new Map<number, ReturnType<typeof setTimeout>[]>();

function scheduleFor(
  map: Map<number, ReturnType<typeof setTimeout>[]>,
  id: number,
  delayMs: number,
  fn: () => void,
): void {
  const t = setTimeout(fn, delayMs);
  const arr = map.get(id) ?? [];
  arr.push(t);
  map.set(id, arr);
}

function clearTimers(map: Map<number, ReturnType<typeof setTimeout>[]>, id: number): void {
  map.get(id)?.forEach(clearTimeout);
  map.delete(id);
}

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

function runDemoLoop(id: number, toolsLeft: number): void {
  if (!demoTimers.has(id)) return;

  const tool = TOOLS[Math.floor(Math.random() * TOOLS.length)];
  const toolId = `demo-${id}-${Date.now()}`;

  dispatch({ type: 'agentToolStart', id, toolId, status: tool, toolName: tool });
  startTypingLoop();

  scheduleFor(demoTimers, id, rand(1500, 6000), () => {
    if (!demoTimers.has(id)) return;
    dispatch({ type: 'agentToolDone', id, toolId });
    stopTypingLoop();

    if (toolsLeft <= 1) {
      scheduleFor(demoTimers, id, 400, () => {
        if (!demoTimers.has(id)) return;
        dispatch({ type: 'agentToolsClear', id });
        dispatch({ type: 'agentStatus', id, status: 'waiting' });
        scheduleFor(demoTimers, id, rand(3000, 7000), () => {
          if (!demoTimers.has(id)) return;
          dispatch({ type: 'agentStatus', id, status: 'active' });
          runDemoLoop(id, Math.floor(rand(2, 6)));
        });
      });
    } else {
      scheduleFor(demoTimers, id, rand(300, 800), () => runDemoLoop(id, toolsLeft - 1));
    }
  });
}

export function addDemoAgent(): number {
  const id = nextDemoId++;
  demoTimers.set(id, []);
  dispatch({ type: 'agentCreated', id, folderName: 'demo-project' });
  scheduleFor(demoTimers, id, 1200, () => {
    dispatch({ type: 'agentStatus', id, status: 'active' });
    runDemoLoop(id, Math.floor(rand(2, 5)));
  });
  return id;
}

export function removeDemoAgent(id: number): void {
  clearTimers(demoTimers, id);
  stopTypingLoop();
  dispatch({ type: 'agentToolsClear', id });
  dispatch({ type: 'agentClosed', id });
}

export function removeAllDemoAgents(): void {
  for (const id of [...demoTimers.keys()]) removeDemoAgent(id);
  nextDemoId = 100;
}

export function getDemoAgentIds(): number[] {
  return [...demoTimers.keys()];
}

// ── Office NPCs ───────────────────────────────────────────────────────────────

export type NpcRole = 'cleaner' | 'secretary' | 'manager';

const NPC_ROLES: Array<{ role: NpcRole; label: string }> = [
  { role: 'secretary', label: 'Secretaría' },
  { role: 'cleaner', label: 'Limpieza' },
  { role: 'manager', label: 'Gerencia' },
];

// Secretary: sits and sends short typing bursts (visual animation only, no sound)
function runSecretaryLoop(id: number): void {
  if (!npcTimers.has(id)) return;
  const toolId = `npc-${id}-${Date.now()}`;
  dispatch({ type: 'agentToolStart', id, toolId, status: 'typing', toolName: 'typing' });
  scheduleFor(npcTimers, id, rand(3000, 8000), () => {
    if (!npcTimers.has(id)) return;
    dispatch({ type: 'agentToolDone', id, toolId });
    dispatch({ type: 'agentToolsClear', id });
    scheduleFor(npcTimers, id, rand(8000, 20000), () => runSecretaryLoop(id));
  });
}

// Manager: wanders and occasionally pauses to "review" something
function runManagerLoop(id: number): void {
  if (!npcTimers.has(id)) return;
  if (Math.random() < 0.4) {
    const toolId = `npc-${id}-${Date.now()}`;
    dispatch({ type: 'agentToolStart', id, toolId, status: 'reviewing', toolName: 'reviewing' });
    scheduleFor(npcTimers, id, rand(2000, 5000), () => {
      if (!npcTimers.has(id)) return;
      dispatch({ type: 'agentToolDone', id, toolId });
      dispatch({ type: 'agentToolsClear', id });
      scheduleFor(npcTimers, id, rand(10000, 25000), () => runManagerLoop(id));
    });
  } else {
    scheduleFor(npcTimers, id, rand(12000, 30000), () => runManagerLoop(id));
  }
}

// Cleaner: wanders the office and occasionally pauses to "clean" a spot
function runCleanerLoop(id: number): void {
  if (!npcTimers.has(id)) return;
  if (Math.random() < 0.5) {
    const toolId = `npc-${id}-${Date.now()}`;
    dispatch({ type: 'agentToolStart', id, toolId, status: 'cleaning', toolName: 'cleaning' });
    scheduleFor(npcTimers, id, rand(4000, 9000), () => {
      if (!npcTimers.has(id)) return;
      dispatch({ type: 'agentToolDone', id, toolId });
      dispatch({ type: 'agentToolsClear', id });
      scheduleFor(npcTimers, id, rand(6000, 15000), () => runCleanerLoop(id));
    });
  } else {
    scheduleFor(npcTimers, id, rand(8000, 18000), () => runCleanerLoop(id));
  }
}

export function addOfficeNpcs(count: number): void {
  for (let i = 0; i < count; i++) {
    const id = nextNpcId++;
    const def = NPC_ROLES[i % NPC_ROLES.length];
    npcTimers.set(id, []);

    scheduleFor(npcTimers, id, i * 700, () => {
      dispatch({ type: 'agentCreated', id, folderName: def.label });
      const delay = rand(2000, 5000);
      if (def.role === 'secretary') scheduleFor(npcTimers, id, delay, () => runSecretaryLoop(id));
      if (def.role === 'manager') scheduleFor(npcTimers, id, delay, () => runManagerLoop(id));
      if (def.role === 'cleaner') scheduleFor(npcTimers, id, delay, () => runCleanerLoop(id));
    });
  }
}

export function removeAllNpcs(): void {
  for (const id of [...npcTimers.keys()]) {
    clearTimers(npcTimers, id);
    dispatch({ type: 'agentToolsClear', id });
    dispatch({ type: 'agentClosed', id });
  }
  nextNpcId = 200;
}

export function getNpcCount(): number {
  return npcTimers.size;
}
