/**
 * Agent speech system — two independent audio layers:
 *
 *  DEV layer   — real coding agents + operational events
 *               Clear voice, full volume. High priority interrupts everything.
 *               Profiles: default / fun (mode-driven) / serious.
 *
 *  NPC layer   — office ambience (secretary / manager / cleaner)
 *               Low volume, different pitch per role, no alerts, never interrupts dev.
 *               Silenced while dev is speaking. Own throttle (10–90 s by frequency).
 *
 * Speech modes (VITE_PIXEL_AGENTS_SPEECH_MODE or runtime override):
 *   quiet   — dev high-priority only
 *   normal  — dev high + medium
 *   fun     — all dev events (playful) + NPC ambience
 *   ambient — all dev events (normal tone) + NPC ambience
 *
 * No-repeat: shuffled decks per bucket — all phrases play before any repeat.
 */

import {
  NPC_SPEAK_CHANCE,
  NPC_THROTTLE_HIGH_MIN_MS,
  NPC_THROTTLE_LOW_MIN_MS,
  NPC_THROTTLE_MEDIUM_MIN_MS,
  SPEECH_THROTTLE_MS,
  VOICE_MAX_PHRASE_CHARS,
} from './constants.js';

// ── Types ─────────────────────────────────────────────────────

export type SpeechMode = 'quiet' | 'normal' | 'fun' | 'ambient';
export type SpeechEventKind =
  | 'permission_request'
  | 'turn_started'
  | 'task_completed'
  | 'task_failed'
  | 'context_warning';
export type NpcRole = 'cleaner' | 'secretary' | 'manager';
export type NpcSpeechFrequency = 'low' | 'medium' | 'high';

type SpeechPriority = 'low' | 'medium' | 'high';
type NpcProfileKey = 'npc_secretary' | 'npc_management' | 'npc_cleaning';

// ── Speech profiles ───────────────────────────────────────────

const SPEECH_PROFILES = {
  // Dev — clear, prominent, never sounds like background
  dev: { volume: 0.9, rate: 0.9, pitch: 0.95, interruptible: false },

  // NPCs — low volume, distinct pitch per role, clearly ambient
  npc_secretary: { volume: 0.28, rate: 0.96, pitch: 1.15, interruptible: true },
  npc_management: { volume: 0.24, rate: 0.82, pitch: 0.82, interruptible: true },
  npc_cleaning: { volume: 0.2, rate: 0.9, pitch: 1.25, interruptible: true },
} as const;

// Minor per-mode adjustment applied on top of the dev profile
const MODE_DEV_ADJUST: Record<SpeechMode, { rate: number; pitch: number }> = {
  quiet: { rate: 0.0, pitch: 0.0 },
  normal: { rate: 0.0, pitch: 0.0 },
  fun: { rate: 0.07, pitch: 0.17 }, // slightly faster, livelier
  ambient: { rate: 0.0, pitch: 0.0 },
};

const NPC_ROLE_PROFILE: Record<NpcRole, NpcProfileKey> = {
  secretary: 'npc_secretary',
  manager: 'npc_management',
  cleaner: 'npc_cleaning',
};

const NPC_THROTTLE_MS: Record<NpcSpeechFrequency, number> = {
  low: NPC_THROTTLE_LOW_MIN_MS,
  medium: NPC_THROTTLE_MEDIUM_MIN_MS,
  high: NPC_THROTTLE_HIGH_MIN_MS,
};

// ── Priority map ──────────────────────────────────────────────

const PRIORITY: Record<SpeechEventKind, SpeechPriority> = {
  permission_request: 'high',
  turn_started: 'medium',
  task_completed: 'medium',
  task_failed: 'medium',
  context_warning: 'low',
};

// ── Dev phrase bank ───────────────────────────────────────────

const PHRASES: Record<SpeechMode, Record<SpeechEventKind, string[]>> = {
  quiet: {
    permission_request: [
      'Necesito permiso',
      'Requiero aprobación',
      'Esperando permiso',
      'Acción bloqueada',
      'En espera de autorización',
    ],
    turn_started: ['Empecé', 'En eso estoy', 'Arrancando', 'Entendido', 'Voy'],
    task_completed: ['Listo', 'Terminé', 'Hecho', 'Completado', 'Finalizado'],
    task_failed: ['Falló', 'Error', 'Hubo un problema', 'Tarea fallida', 'Sin éxito'],
    context_warning: [
      'Límite próximo',
      'Contexto por agotarse',
      'Memoria casi llena',
      'Límite de contexto cercano',
    ],
  },

  normal: {
    permission_request: [
      'Necesito tu aprobación para continuar',
      'Esperando tu permiso',
      'Esta acción requiere tu aprobación',
      'Necesito que me des el visto bueno',
      'No puedo continuar sin tu autorización',
      'Hay una acción pendiente de aprobación',
      'Necesito que confirmes esta acción',
      'Detenido, esperando tu permiso',
      'Una acción requiere tu atención',
      'Esperando que autorices esto',
    ],
    turn_started: [
      'Entendido',
      'En eso estoy',
      'Empecé',
      'Voy con eso',
      'Arrancando',
      'Estoy en eso',
      'Empiezo ahora',
      'Lo tengo',
      'Voy a revisar eso',
      'Perfecto, empiezo',
    ],
    task_completed: [
      'Tarea completada',
      'Listo, revisá cuando puedas',
      'Terminé',
      'Todo hecho',
      'Listo para revisión',
      'La tarea está lista',
      'Trabajo finalizado',
      'Todo en orden',
      'Completé lo que me pediste',
      'Ya terminé, podés revisar',
      'Tarea entregada',
      'Listo para que lo veas',
    ],
    task_failed: [
      'Algo salió mal',
      'La tarea falló',
      'Hubo un error',
      'Me encontré con un problema',
      'No pude completar la tarea',
      'Terminé con errores',
      'Hay un problema que necesita atención',
      'No salió bien',
      'Encontré un error que no pude resolver',
      'La tarea no se completó correctamente',
    ],
    context_warning: [
      'Me estoy acercando al límite de contexto',
      'Queda poco contexto disponible',
      'El contexto está por agotarse',
      'El límite de contexto está cerca',
      'Estoy usando mucho contexto',
      'Queda poca memoria de contexto',
      'El contexto se está agotando',
      'Atención, contexto casi lleno',
    ],
  },

  // fun mode — same phrases as normal but dev profile adds pitch/rate lift
  fun: {
    permission_request: [
      '¡Ey! Necesito un permiso para esto',
      'Jefe, necesito tu firma',
      'Toc toc, ¿me dejás pasar?',
      'Esta me la tenés que aprobar',
      'Esperando luz verde',
      '¡Che! ¿Me dejás hacer esto?',
      'Necesito tu bendición para seguir',
      'Esto lo hago solo si vos me lo autorizás',
      '¿Me das el ok?',
      'Frenado en seco, necesito tu permiso',
      '¡Houston, necesito autorización!',
      'Mandame el permiso que estoy esperando',
    ],
    turn_started: [
      '¡Vamos!',
      '¡Dale, empiezo!',
      'A trabajar se ha dicho',
      '¡Manos a la obra!',
      '¡Veamos qué tenemos acá!',
      '¡En eso me pongo!',
      '¡Arrancamos!',
      '¡A darle!',
      '¡Eso es pan comido, empiezo!',
      '¡Buenísimo, ya arranco!',
    ],
    task_completed: [
      '¡Boom! La rompí',
      'Hecho y derecho',
      '¡Misión cumplida!',
      'Y... ¡listo el pollo!',
      '¡Terminé! ¿Qué sigue?',
      'La clavé',
      '¡A shipiarlo!',
      '¡Ta-dán! Listo',
      'Otro más para el bolsillo',
      '¡Eso fue pan comido!',
      '¡Voilà!',
      '¡Tarea destruida!',
      '¿Eso era todo? Demasiado fácil',
      'Me auto-aplaudo, con permiso',
      '¡Completado con estilo!',
    ],
    task_failed: [
      'Uy, no salió como esperaba',
      'Bueh, algo se rompió',
      'Me trabé en algo',
      'Eso salió torcido',
      '¡Error! Necesito ayuda acá',
      'Metí la pata, la verdad',
      'Esto no me salió bien',
      '¡Mayday, mayday!',
      'Se fue todo al carajo',
      '¿Alguien sabe qué pasó acá?',
      'Prometí que iba a salir bien... mentí',
      'Momento, necesito que me ayudes con esto',
    ],
    context_warning: [
      'Se me está llenando la cabeza',
      'Me estoy quedando sin espacio para pensar',
      'El contexto me está apretando',
      'Empiezo a sentirme un poco saturado',
      '¡Houston, tenemos un problema de contexto!',
      'Estoy a full, casi no me entra más info',
      'Mucho contexto, poco espacio',
      'Siento que me explota la cabeza de tanto contexto',
      'Dale, que me queda poquito de contexto',
      'Mi memoria de trabajo está que revienta',
    ],
  },

  // ambient mode — same phrases as normal (dev stays calm, NPCs are prominent)
  ambient: {
    permission_request: [
      'Necesito tu aprobación para continuar',
      'Esperando tu permiso',
      'Esta acción requiere tu aprobación',
      'Necesito que me des el visto bueno',
      'No puedo continuar sin tu autorización',
      'Hay una acción pendiente de aprobación',
      'Necesito que confirmes esta acción',
      'Detenido, esperando tu permiso',
      'Una acción requiere tu atención',
      'Esperando que autorices esto',
    ],
    turn_started: [
      'Entendido',
      'En eso estoy',
      'Empecé',
      'Voy con eso',
      'Arrancando',
      'Estoy en eso',
      'Empiezo ahora',
      'Lo tengo',
      'Voy a revisar eso',
      'Perfecto, empiezo',
    ],
    task_completed: [
      'Tarea completada',
      'Listo, revisá cuando puedas',
      'Terminé',
      'Todo hecho',
      'Listo para revisión',
      'La tarea está lista',
      'Trabajo finalizado',
      'Todo en orden',
      'Completé lo que me pediste',
      'Ya terminé, podés revisar',
      'Tarea entregada',
      'Listo para que lo veas',
    ],
    task_failed: [
      'Algo salió mal',
      'La tarea falló',
      'Hubo un error',
      'Me encontré con un problema',
      'No pude completar la tarea',
      'Terminé con errores',
      'Hay un problema que necesita atención',
      'No salió bien',
      'Encontré un error que no pude resolver',
      'La tarea no se completó correctamente',
    ],
    context_warning: [
      'Me estoy acercando al límite de contexto',
      'Queda poco contexto disponible',
      'El contexto está por agotarse',
      'El límite de contexto está cerca',
      'Estoy usando mucho contexto',
      'Queda poca memoria de contexto',
      'El contexto se está agotando',
      'Atención, contexto casi lleno',
    ],
  },
};

// ── NPC phrase bank ───────────────────────────────────────────

const NPC_PHRASES: Record<NpcRole, string[]> = {
  secretary: [
    '¿Alguien vio el calendario?',
    'Voy dejando esto anotado.',
    'Después reviso los pendientes.',
    'Creo que había una reunión, pero no sé con quién.',
    'A ver... ¿dónde estaba?',
    'Casi termino este informe.',
    'Hay que responder estos mails.',
    'Necesito mandar esto antes de las cinco.',
    '¿Dónde puse ese archivo?',
    'Ya casi lo tengo.',
    '¿Cuándo es la reunión?',
    'Voy a dejar esto listo hoy.',
    '¿Alguien quiere café?',
    'Hoy hay reunión a las tres.',
    '¿Alguien vio mi agenda?',
    'Qué día largo...',
    'Necesito un café urgente.',
    'No llego a terminar todo hoy.',
    'Tengo mil mails sin contestar.',
    'Menos mal que estoy yo para organizar todo esto.',
  ],
  manager: [
    'Necesitamos alinear prioridades.',
    'Esto lo vemos en la próxima reunión.',
    'Hay que medir mejor el impacto.',
    'Lo importante es mantener el foco.',
    '¿Cómo van los números?',
    '¿Esto está dentro del presupuesto?',
    'Hay que hablar de esto.',
    '¿Alguien puede explicarme esto?',
    'Excelente trabajo, equipo.',
    '¿Quién se encarga de esto?',
    'Buen trabajo, de verdad.',
    '¿Cómo viene el sprint?',
    '¿Alguien tiene cinco minutos?',
    'El deadline es el viernes.',
    '¿Cumplimos los objetivos del trimestre?',
    'Voy a necesitar eso documentado.',
    '¿Hay algún blocker que no me contaron?',
    'Muy bien, sigan así.',
    '¿Ya hicieron la retro del sprint?',
    'Necesitamos hablar de los KPIs.',
  ],
  cleaner: [
    'Otra taza al lado del teclado...',
    'Estos cables se reproducen solos.',
    'Después dicen que no encuentran nada.',
    'Yo no toco ese servidor ni loca.',
    'Este piso no se va a limpiar solo.',
    '¿Alguien derramó café acá?',
    'A ver si limpiamos un poco esto.',
    'Ay, qué desastre...',
    '¿Nadie usa el tacho de basura?',
    'No entiendo cómo ensucian tanto.',
    '¿Quién deja el café en el escritorio?',
    'Hoy no termino más...',
    'Siempre lo mismo...',
    '¿Para cuándo me compran la mopa nueva?',
    'Otra vez las mismas cosas tiradas.',
    'A este ritmo no termino nunca.',
    'Parece que acá trabajo solo yo.',
    '¿Cuándo fue la última vez que alguien limpió esto?',
    'Menos mal que estoy yo...',
    'Mañana pido más papel de cocina.',
  ],
};

// ── Shuffled decks (no-repeat) ────────────────────────────────

const decks = new Map<string, string[]>();
const npcDecks = new Map<NpcRole, string[]>();

function shuffle(arr: string[]): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function nextPhrase(mode: SpeechMode, kind: SpeechEventKind): string {
  const key = `${mode}:${kind}`;
  let deck = decks.get(key);
  if (!deck || deck.length === 0) {
    deck = shuffle(PHRASES[mode][kind]);
    decks.set(key, deck);
  }
  return deck.shift()!;
}

function nextNpcPhrase(role: NpcRole): string {
  let deck = npcDecks.get(role);
  if (!deck || deck.length === 0) {
    deck = shuffle(NPC_PHRASES[role]);
    npcDecks.set(role, deck);
  }
  return deck.shift()!;
}

// ── Voice selection ───────────────────────────────────────────

export interface VoiceSettings {
  voiceURI: string | null;
  rate: number | null; // overrides dev profile rate
  pitch: number | null;
  volume: number | null;
}

export interface NpcSpeechSettings {
  enabled: boolean;
  volumeMultiplier: number;
  frequency: NpcSpeechFrequency;
}

const VOICE_STORAGE_KEY = 'pixel-agents:voice-settings';
const NPC_STORAGE_KEY = 'pixel-agents:npc-speech-settings';

function loadStored<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key);
    if (r) return JSON.parse(r) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

let userVoiceSettings: VoiceSettings = loadStored(VOICE_STORAGE_KEY, {
  voiceURI: null,
  rate: null,
  pitch: null,
  volume: null,
});
let npcSpeechSettings: NpcSpeechSettings = loadStored(NPC_STORAGE_KEY, {
  enabled: true,
  volumeMultiplier: 1.0,
  frequency: 'medium',
});

let selectedVoice: SpeechSynthesisVoice | null = null;

// Per-role NPC voices — automatically assigned by gender heuristic,
// always different from the dev voice when the system has multiple voices.
const npcVoices: Record<NpcRole, SpeechSynthesisVoice | null> = {
  secretary: null,
  manager: null,
  cleaner: null,
};

// Common Spanish TTS voice name fragments used to guess gender.
// Covers Windows (Helena, Pablo, Sabina, Raúl), macOS (Lucía, Jorge), and
// generic "Female/Male" labels from some browser engines.
const FEMALE_VOICE_PATTERNS = [
  'helena',
  'lucia',
  'lucía',
  'laura',
  'sabina',
  'monica',
  'mónica',
  'carmen',
  'maria',
  'maría',
  'sofia',
  'sofía',
  'paloma',
  'paulina',
  'valentina',
  'female',
  'femenin',
  'mujer',
];
const MALE_VOICE_PATTERNS = [
  'pablo',
  'jorge',
  'diego',
  'raul',
  'raúl',
  'carlos',
  'enrique',
  'juan',
  'male',
  'masculin',
  'hombre',
];

function guessVoiceGender(v: SpeechSynthesisVoice): 'female' | 'male' | 'unknown' {
  const name = v.name.toLowerCase();
  if (FEMALE_VOICE_PATTERNS.some((p) => name.includes(p))) return 'female';
  if (MALE_VOICE_PATTERNS.some((p) => name.includes(p))) return 'male';
  return 'unknown';
}

function pickNpcVoice(
  gender: 'female' | 'male' | 'any',
  allVoices: SpeechSynthesisVoice[],
  devVoice: SpeechSynthesisVoice | null,
): SpeechSynthesisVoice | null {
  const es = allVoices.filter((v) => v.lang.startsWith('es'));
  // Prefer a voice different from the dev voice; fall back to any Spanish if only one exists
  const pool = es.filter((v) => v !== devVoice);
  const candidates = pool.length > 0 ? pool : es;
  if (gender === 'female')
    return candidates.find((v) => guessVoiceGender(v) === 'female') ?? candidates[0] ?? null;
  if (gender === 'male')
    return candidates.find((v) => guessVoiceGender(v) === 'male') ?? candidates[0] ?? null;
  return candidates[0] ?? null;
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  if (userVoiceSettings.voiceURI) {
    const pinned = voices.find((v) => v.voiceURI === userVoiceSettings.voiceURI);
    if (pinned) return pinned;
  }
  return (
    voices.find((v) => v.lang.startsWith('es') && v.localService) ??
    voices.find((v) => v.lang.startsWith('es')) ??
    voices.find((v) => v.localService) ??
    (() => {
      console.warn('[Pixel Agents] No Spanish TTS voice found. Using:', voices[0]?.lang);
      return voices[0] ?? null;
    })()
  );
}

function applyVoices(): void {
  if (!supported()) return;
  const voices = window.speechSynthesis.getVoices();
  selectedVoice = pickBestVoice(voices);
  // NPC voices: gender-matched, prefer a voice different from the dev agent
  npcVoices.secretary = pickNpcVoice('female', voices, selectedVoice);
  npcVoices.manager = pickNpcVoice('male', voices, selectedVoice);
  npcVoices.cleaner = pickNpcVoice('any', voices, selectedVoice);
  console.log(
    '[Pixel Agents] Voices — dev:',
    selectedVoice?.name ?? 'none',
    '| secretary:',
    npcVoices.secretary?.name ?? 'none',
    '| manager:',
    npcVoices.manager?.name ?? 'none',
  );
  window.dispatchEvent(new CustomEvent('pixel-agents:voices-changed'));
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = applyVoices;
  applyVoices();
}

// ── Runtime state ─────────────────────────────────────────────

function readEnvMode(): SpeechMode {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const raw = env?.['VITE_PIXEL_AGENTS_SPEECH_MODE'] ?? '';
  if (raw === 'quiet' || raw === 'normal' || raw === 'fun' || raw === 'ambient') return raw;
  return 'normal';
}

let currentMode: SpeechMode = readEnvMode();
let speechEnabled = true;

// Dev queue — interrupts NPC, has priority
type DevQueueItem = { text: string };
const devQueue: DevQueueItem[] = [];
let devSpeaking = false;

// NPC queue — low volume ambient, yields to dev
type NpcQueueItem = { text: string; profileKey: NpcProfileKey; role: NpcRole };
const npcQueue: NpcQueueItem[] = [];
let npcSpeaking = false;
let lastNpcAt = 0;
let npcQueueTimer: ReturnType<typeof setTimeout> | null = null;

const lastSpokenAt: Partial<Record<SpeechEventKind, number>> = {};

// ── Core helpers ──────────────────────────────────────────────

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function truncate(text: string): string {
  if (text.length <= VOICE_MAX_PHRASE_CHARS) return text;
  const cut = text.lastIndexOf(' ', VOICE_MAX_PHRASE_CHARS);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, VOICE_MAX_PHRASE_CHARS)) + '…';
}

function applyVoiceToUtterance(u: SpeechSynthesisUtterance): void {
  if (selectedVoice) {
    u.voice = selectedVoice;
    u.lang = selectedVoice.lang;
  } else {
    u.lang = 'es-AR';
  }
}

// ── Dev speech ────────────────────────────────────────────────

function doSpeakDev(text: string): void {
  const prof = SPEECH_PROFILES.dev;
  const adj = MODE_DEV_ADJUST[currentMode];
  try {
    const u = new SpeechSynthesisUtterance(truncate(text));
    applyVoiceToUtterance(u);
    u.rate = clamp(prof.rate + adj.rate, 0.1, 10);
    u.pitch = clamp(prof.pitch + adj.pitch, 0.0, 2);
    u.volume = userVoiceSettings.volume ?? prof.volume;
    u.onend = () => {
      devSpeaking = false;
      processDevQueue();
      tryProcessNpcQueue();
    };
    u.onerror = () => {
      devSpeaking = false;
      processDevQueue();
      tryProcessNpcQueue();
    };
    devSpeaking = true;
    window.speechSynthesis.speak(u);
  } catch {
    devSpeaking = false;
  }
}

function processDevQueue(): void {
  if (devSpeaking || devQueue.length === 0) return;
  // Interrupt any NPC in progress — dev always takes priority
  if (npcSpeaking) {
    window.speechSynthesis.cancel();
    npcSpeaking = false;
  }
  const item = devQueue.shift()!;
  doSpeakDev(item.text);
}

// ── NPC ambient speech ────────────────────────────────────────

function doSpeakNpc(text: string, profileKey: NpcProfileKey, role: NpcRole): void {
  const prof = SPEECH_PROFILES[profileKey];
  const vol = clamp(prof.volume * npcSpeechSettings.volumeMultiplier, 0, 1);
  const rateJitter = (Math.random() - 0.5) * 0.06;
  const pitchJitter = (Math.random() - 0.5) * 0.04;
  // Use the role-specific voice (female for secretary, male for manager, etc.)
  // Fall back to dev voice if none was found
  const voice = npcVoices[role] ?? selectedVoice;
  try {
    const u = new SpeechSynthesisUtterance(truncate(text));
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'es-AR';
    }
    u.rate = clamp(prof.rate + rateJitter, 0.1, 10);
    u.pitch = clamp(prof.pitch + pitchJitter, 0.0, 2);
    u.volume = vol;
    u.onend = () => {
      npcSpeaking = false;
      lastNpcAt = Date.now();
      tryProcessNpcQueue();
    };
    u.onerror = () => {
      npcSpeaking = false;
      tryProcessNpcQueue();
    };
    npcSpeaking = true;
    window.speechSynthesis.speak(u);
  } catch {
    npcSpeaking = false;
  }
}

function tryProcessNpcQueue(): void {
  if (npcQueueTimer !== null) {
    clearTimeout(npcQueueTimer);
    npcQueueTimer = null;
  }
  if (devSpeaking || npcSpeaking || devQueue.length > 0) return;
  if (npcQueue.length === 0 || !npcSpeechSettings.enabled) return;
  if (currentMode !== 'fun' && currentMode !== 'ambient') return;

  const elapsed = Date.now() - lastNpcAt;
  const minWait = NPC_THROTTLE_MS[npcSpeechSettings.frequency];

  if (elapsed >= minWait) {
    const item = npcQueue.shift()!;
    doSpeakNpc(item.text, item.profileKey, item.role);
  } else {
    npcQueueTimer = setTimeout(tryProcessNpcQueue, minWait - elapsed);
  }
}

// ── Public API — mode & enable ────────────────────────────────

export function setSpeechMode(mode: SpeechMode): void {
  currentMode = mode;
}
export function getSpeechMode(): SpeechMode {
  return currentMode;
}

export function setSpeechEnabled(on: boolean): void {
  speechEnabled = on;
  if (!on && supported()) {
    window.speechSynthesis.cancel();
    devQueue.length = 0;
    npcQueue.length = 0;
    devSpeaking = false;
    npcSpeaking = false;
    if (npcQueueTimer !== null) {
      clearTimeout(npcQueueTimer);
      npcQueueTimer = null;
    }
  }
}
export function isSpeechEnabled(): boolean {
  return speechEnabled;
}

// ── Public API — voice selection ──────────────────────────────

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  return supported() ? window.speechSynthesis.getVoices() : [];
}
export function getSelectedVoice(): SpeechSynthesisVoice | null {
  return selectedVoice;
}
export function getUserVoiceSettings(): Readonly<VoiceSettings> {
  return userVoiceSettings;
}

/** Default values from the dev profile, used by the UI to reset sliders. */
export const VOICE_DEFAULTS = {
  rate: SPEECH_PROFILES.dev.rate,
  pitch: SPEECH_PROFILES.dev.pitch,
  volume: SPEECH_PROFILES.dev.volume,
};

export function setVoiceByURI(uri: string | null): void {
  userVoiceSettings = { ...userVoiceSettings, voiceURI: uri };
  selectedVoice = pickBestVoice(getAvailableVoices());
  persist(VOICE_STORAGE_KEY, userVoiceSettings);
}
export function setVoiceRate(rate: number | null): void {
  userVoiceSettings = { ...userVoiceSettings, rate };
  persist(VOICE_STORAGE_KEY, userVoiceSettings);
}
export function setVoicePitch(pitch: number | null): void {
  userVoiceSettings = { ...userVoiceSettings, pitch };
  persist(VOICE_STORAGE_KEY, userVoiceSettings);
}
export function setVoiceVolume(volume: number | null): void {
  userVoiceSettings = { ...userVoiceSettings, volume };
  persist(VOICE_STORAGE_KEY, userVoiceSettings);
}
export function resetVoiceSettings(): void {
  userVoiceSettings = { voiceURI: null, rate: null, pitch: null, volume: null };
  selectedVoice = pickBestVoice(getAvailableVoices());
  persist(VOICE_STORAGE_KEY, userVoiceSettings);
}

export function testVoice(): void {
  if (!speechEnabled || !supported()) return;
  window.speechSynthesis.cancel();
  devQueue.length = 0;
  npcQueue.length = 0;
  devSpeaking = false;
  npcSpeaking = false;
  doSpeakDev('Hola, soy tu agente. Todo listo.');
}

// ── Public API — NPC settings ─────────────────────────────────

export function getNpcSpeechSettings(): Readonly<NpcSpeechSettings> {
  return npcSpeechSettings;
}

export function setNpcEnabled(enabled: boolean): void {
  npcSpeechSettings = { ...npcSpeechSettings, enabled };
  persist(NPC_STORAGE_KEY, npcSpeechSettings);
  if (!enabled) {
    if (npcSpeaking) {
      window.speechSynthesis.cancel();
      npcSpeaking = false;
    }
    npcQueue.length = 0;
    if (npcQueueTimer !== null) {
      clearTimeout(npcQueueTimer);
      npcQueueTimer = null;
    }
  }
}

export function setNpcVolumeMultiplier(multiplier: number): void {
  npcSpeechSettings = { ...npcSpeechSettings, volumeMultiplier: multiplier };
  persist(NPC_STORAGE_KEY, npcSpeechSettings);
}

export function setNpcFrequency(frequency: NpcSpeechFrequency): void {
  npcSpeechSettings = { ...npcSpeechSettings, frequency };
  persist(NPC_STORAGE_KEY, npcSpeechSettings);
}

export function testNpcVoice(role: NpcRole): void {
  if (!supported()) return;
  if (devSpeaking) return; // never interrupt dev
  if (npcSpeaking) {
    window.speechSynthesis.cancel();
    npcSpeaking = false;
  }
  const samples: Record<NpcRole, string> = {
    secretary: 'Voy dejando esto anotado.',
    manager: 'Necesitamos alinear prioridades.',
    cleaner: 'Otra taza al lado del teclado...',
  };
  doSpeakNpc(samples[role], NPC_ROLE_PROFILE[role], role);
}

// ── Public API — speech events ────────────────────────────────

/**
 * Fire a dev speech event. Respects mode gates, throttle, and queue.
 * High-priority events (permission_request) interrupt all other speech.
 */
export function triggerSpeech(kind: SpeechEventKind): void {
  if (!speechEnabled || !supported()) return;

  const priority = PRIORITY[kind];

  // Mode gates
  if (currentMode === 'quiet' && priority !== 'high') return;
  if (currentMode === 'normal' && priority === 'low') return; // no context_warning

  const now = Date.now();
  if (priority !== 'high') {
    const last = lastSpokenAt[kind] ?? 0;
    if (now - last < SPEECH_THROTTLE_MS) return;
  }

  lastSpokenAt[kind] = now;
  const text = nextPhrase(currentMode, kind);

  if (priority === 'high') {
    // Emergency — wipe all queues and interrupt everything immediately
    window.speechSynthesis.cancel();
    devQueue.length = 0;
    npcQueue.length = 0;
    devSpeaking = false;
    npcSpeaking = false;
    if (npcQueueTimer !== null) {
      clearTimeout(npcQueueTimer);
      npcQueueTimer = null;
    }
    doSpeakDev(text);
  } else {
    devQueue.push({ text });
    processDevQueue();
  }
}

/**
 * Trigger ambient NPC speech. 38% chance per call, queued behind any dev speech.
 * Only fires in fun/ambient modes; silenced while dev is speaking.
 */
export function triggerNpcSpeech(role: NpcRole): void {
  if (!speechEnabled || !supported()) return;
  if (!npcSpeechSettings.enabled) return;
  if (currentMode !== 'fun' && currentMode !== 'ambient') return;
  if (Math.random() > NPC_SPEAK_CHANCE) return;
  npcQueue.push({ text: nextNpcPhrase(role), profileKey: NPC_ROLE_PROFILE[role], role });
  tryProcessNpcQueue();
}
