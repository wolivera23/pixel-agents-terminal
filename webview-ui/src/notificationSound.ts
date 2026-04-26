import {
  NOTIFICATION_NOTE_1_HZ,
  NOTIFICATION_NOTE_1_START_SEC,
  NOTIFICATION_NOTE_2_HZ,
  NOTIFICATION_NOTE_2_START_SEC,
  NOTIFICATION_NOTE_DURATION_SEC,
  NOTIFICATION_VOLUME,
  PERMISSION_NOTE_1_HZ,
  PERMISSION_NOTE_1_START_SEC,
  PERMISSION_NOTE_2_HZ,
  PERMISSION_NOTE_2_START_SEC,
  PERMISSION_NOTE_DURATION_SEC,
  PERMISSION_VOLUME,
  SPAWN_NOTE_1_HZ,
  SPAWN_NOTE_2_HZ,
  SPAWN_NOTE_3_HZ,
  SPAWN_NOTE_DURATION_SEC,
  SPAWN_NOTE_STAGGER_SEC,
  SPAWN_VOLUME,
  TOOL_START_NOTE_DURATION_SEC,
  TOOL_START_NOTE_HZ,
  TOOL_START_VOLUME,
  TYPING_CLICK_DURATION_SEC,
  TYPING_CLICK_INTERVAL_MS,
  TYPING_CLICK_VOLUME,
} from './constants.js';

let soundEnabled = true;
let audioCtx: AudioContext | null = null;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function playNote(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number = NOTIFICATION_NOTE_DURATION_SEC,
  volume: number = NOTIFICATION_VOLUME,
): void {
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + duration);
}

export async function playDoneSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    // Resume suspended context (webviews suspend until user gesture)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Ascending two-note chime: E5 → B5
    playNote(audioCtx, NOTIFICATION_NOTE_1_HZ, NOTIFICATION_NOTE_1_START_SEC);
    playNote(audioCtx, NOTIFICATION_NOTE_2_HZ, NOTIFICATION_NOTE_2_START_SEC);
  } catch {
    // Audio may not be available
  }
}

export async function playPermissionSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Descending two-note tap: A5 → E5
    playNote(
      audioCtx,
      PERMISSION_NOTE_1_HZ,
      PERMISSION_NOTE_1_START_SEC,
      PERMISSION_NOTE_DURATION_SEC,
      PERMISSION_VOLUME,
    );
    playNote(
      audioCtx,
      PERMISSION_NOTE_2_HZ,
      PERMISSION_NOTE_2_START_SEC,
      PERMISSION_NOTE_DURATION_SEC,
      PERMISSION_VOLUME,
    );
  } catch {
    // Audio may not be available
  }
}

/** Short square-wave blip — fires on every tool start (PreToolUse). */
export async function playToolStartSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(TOOL_START_NOTE_HZ, t);
    gain.gain.setValueAtTime(TOOL_START_VOLUME, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + TOOL_START_NOTE_DURATION_SEC);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + TOOL_START_NOTE_DURATION_SEC);
  } catch {
    // Audio not available
  }
}

/** Ascending C5→E5→G5 arpeggio — fires when a new agent spawns. */
export async function playAgentSpawnSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    playNote(audioCtx, SPAWN_NOTE_1_HZ, 0, SPAWN_NOTE_DURATION_SEC, SPAWN_VOLUME);
    playNote(
      audioCtx,
      SPAWN_NOTE_2_HZ,
      SPAWN_NOTE_STAGGER_SEC,
      SPAWN_NOTE_DURATION_SEC,
      SPAWN_VOLUME,
    );
    playNote(
      audioCtx,
      SPAWN_NOTE_3_HZ,
      SPAWN_NOTE_STAGGER_SEC * 2,
      SPAWN_NOTE_DURATION_SEC,
      SPAWN_VOLUME,
    );
  } catch {
    // Audio not available
  }
}

// ── Typing loop ───────────────────────────────────────────────────────────────

let typingInterval: ReturnType<typeof setInterval> | null = null;

function playTypingClick(): void {
  if (!audioCtx || !soundEnabled) return;
  const t = audioCtx.currentTime;
  // White-noise burst: fill a short buffer with random samples
  const bufLen = Math.ceil(audioCtx.sampleRate * TYPING_CLICK_DURATION_SEC);
  const buffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * TYPING_CLICK_VOLUME;
  }
  // Quick exponential fade-out
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + TYPING_CLICK_DURATION_SEC);

  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(t);
  src.stop(t + TYPING_CLICK_DURATION_SEC);
}

/** Start repeating keyboard-click sound. Call on agentToolStart. */
export function startTypingLoop(): void {
  if (!soundEnabled) return;
  stopTypingLoop();
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  playTypingClick();
  typingInterval = setInterval(playTypingClick, TYPING_CLICK_INTERVAL_MS);
}

/** Stop repeating keyboard-click sound. Call on agentToolDone / Stop. */
export function stopTypingLoop(): void {
  if (typingInterval !== null) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
}

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch {
    // ignore
  }
}
