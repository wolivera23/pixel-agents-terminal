import { useEffect, useState } from 'react';

import {
  getAvailableVoices,
  getNpcSpeechSettings,
  getSpeechMode,
  getUserVoiceSettings,
  type NpcSpeechFrequency,
  resetVoiceSettings,
  setNpcEnabled,
  setNpcFrequency,
  setNpcVolumeMultiplier,
  setSpeechMode,
  setVoiceByURI,
  setVoicePitch,
  setVoiceRate,
  setVoiceVolume,
  type SpeechMode,
  testNpcVoice,
  testVoice,
  VOICE_DEFAULTS,
} from '../agentSpeech.js';
import {
  NPC_VOLUME_MULTIPLIER_MAX,
  NPC_VOLUME_MULTIPLIER_MIN,
  NPC_VOLUME_MULTIPLIER_STEP,
  VOICE_PITCH_MAX,
  VOICE_PITCH_MIN,
  VOICE_PITCH_STEP,
  VOICE_RATE_MAX,
  VOICE_RATE_MIN,
  VOICE_RATE_STEP,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
  VOICE_VOLUME_STEP,
} from '../constants.js';
import { Button } from './ui/Button.js';

// ── Shared slider component ───────────────────────────────────

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, min, max, step, value, onChange }: SliderRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="text-xs text-text-muted" style={{ width: 64, flexShrink: 0 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
      />
      <span
        className="text-xs"
        style={{ width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── Section separator ─────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <span
      className="text-xs text-text-muted"
      style={{ paddingTop: 4, paddingBottom: 2, display: 'block' }}
    >
      {children}
    </span>
  );
}

// ── Select style (reused for voice + mode) ────────────────────

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--color-btn-bg)',
  color: 'var(--color-text)',
  border: '2px solid var(--color-border)',
  borderRadius: 0,
  padding: '2px 4px',
  cursor: 'pointer',
  fontSize: 12,
};

// ── Main panel ────────────────────────────────────────────────

export function VoiceSettingsPanel() {
  const storedVoice = getUserVoiceSettings();
  const storedNpc = getNpcSpeechSettings();

  // Voice loading
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const load = () => {
      const all = getAvailableVoices();
      setVoices([
        ...all.filter((v) => v.lang.startsWith('es')),
        ...all.filter((v) => !v.lang.startsWith('es')),
      ]);
    };
    load();
    window.addEventListener('pixel-agents:voices-changed', load);
    return () => window.removeEventListener('pixel-agents:voices-changed', load);
  }, []);

  // Dev voice settings
  const [voiceURI, setVoiceURILocal] = useState<string>(storedVoice.voiceURI ?? '');
  const [rate, setRateLocal] = useState(storedVoice.rate ?? VOICE_DEFAULTS.rate);
  const [pitch, setPitchLocal] = useState(storedVoice.pitch ?? VOICE_DEFAULTS.pitch);
  const [volume, setVolumeLocal] = useState(storedVoice.volume ?? VOICE_DEFAULTS.volume);

  // Speech mode
  const [mode, setModeLocal] = useState<SpeechMode>(getSpeechMode());

  // NPC settings
  const [npcEnabled, setNpcEnabledLocal] = useState(storedNpc.enabled);
  const [npcVolume, setNpcVolumeLocal] = useState(storedNpc.volumeMultiplier);
  const [npcFreq, setNpcFreqLocal] = useState<NpcSpeechFrequency>(storedNpc.frequency);

  const handleResetDev = () => {
    resetVoiceSettings();
    setVoiceURILocal('');
    setRateLocal(VOICE_DEFAULTS.rate);
    setPitchLocal(VOICE_DEFAULTS.pitch);
    setVolumeLocal(VOICE_DEFAULTS.volume);
  };

  const handleResetNpc = () => {
    setNpcEnabledLocal(true);
    setNpcEnabled(true);
    setNpcVolumeLocal(1.0);
    setNpcVolumeMultiplier(1.0);
    setNpcFreqLocal('medium');
    setNpcFrequency('medium');
  };

  const col = { display: 'flex', flexDirection: 'column' as const, gap: 6 };

  return (
    <div style={{ ...col, paddingLeft: 16, paddingBottom: 8 }}>
      {/* ── Speech mode ───────────────────────────────────────── */}
      <SectionLabel>Modo</SectionLabel>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
        {(['quiet', 'normal', 'fun', 'ambient'] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? 'active' : 'ghost'}
            onClick={() => {
              setSpeechMode(m);
              setModeLocal(m);
            }}
          >
            {m}
          </Button>
        ))}
      </div>

      {/* ── Dev voice ─────────────────────────────────────────── */}
      <SectionLabel>Voz de agente</SectionLabel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="text-xs text-text-muted" style={{ width: 64, flexShrink: 0 }}>
          Voz
        </span>
        <select
          value={voiceURI}
          style={selectStyle}
          onChange={(e) => {
            const uri = e.target.value;
            setVoiceURILocal(uri);
            setVoiceByURI(uri || null);
          }}
        >
          <option value="">Auto (mejor voz española)</option>
          {voices.length > 0 && (
            <optgroup label="Disponibles">
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} — {v.lang}
                  {v.localService ? ' ★' : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <SliderRow
        label="Velocidad"
        min={VOICE_RATE_MIN}
        max={VOICE_RATE_MAX}
        step={VOICE_RATE_STEP}
        value={rate}
        onChange={(v) => {
          setRateLocal(v);
          setVoiceRate(v);
        }}
      />
      <SliderRow
        label="Tono"
        min={VOICE_PITCH_MIN}
        max={VOICE_PITCH_MAX}
        step={VOICE_PITCH_STEP}
        value={pitch}
        onChange={(v) => {
          setPitchLocal(v);
          setVoicePitch(v);
        }}
      />
      <SliderRow
        label="Volumen"
        min={VOICE_VOLUME_MIN}
        max={VOICE_VOLUME_MAX}
        step={VOICE_VOLUME_STEP}
        value={volume}
        onChange={(v) => {
          setVolumeLocal(v);
          setVoiceVolume(v);
        }}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="accent" onClick={testVoice}>
          Probar
        </Button>
        <Button size="sm" variant="ghost" onClick={handleResetDev}>
          Restaurar
        </Button>
      </div>

      {/* ── NPC ambience ──────────────────────────────────────── */}
      <SectionLabel>Voz ambiente (NPCs)</SectionLabel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          id="npc-enabled"
          checked={npcEnabled}
          onChange={() => {
            const v = !npcEnabled;
            setNpcEnabledLocal(v);
            setNpcEnabled(v);
          }}
          style={{ cursor: 'pointer' }}
        />
        <label htmlFor="npc-enabled" className="text-xs" style={{ cursor: 'pointer' }}>
          Activar voz ambiente
        </label>
      </div>

      {npcEnabled && (
        <div style={{ ...col, paddingLeft: 8 }}>
          <SliderRow
            label="Volumen"
            min={NPC_VOLUME_MULTIPLIER_MIN}
            max={NPC_VOLUME_MULTIPLIER_MAX}
            step={NPC_VOLUME_MULTIPLIER_STEP}
            value={npcVolume}
            onChange={(v) => {
              setNpcVolumeLocal(v);
              setNpcVolumeMultiplier(v);
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-xs text-text-muted" style={{ width: 64, flexShrink: 0 }}>
              Frecuencia
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['low', 'medium', 'high'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={npcFreq === f ? 'active' : 'ghost'}
                  onClick={() => {
                    setNpcFreqLocal(f);
                    setNpcFrequency(f);
                  }}
                >
                  {f === 'low' ? 'baja' : f === 'medium' ? 'media' : 'alta'}
                </Button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
            <Button size="sm" variant="ghost" onClick={() => testNpcVoice('secretary')}>
              Probar secretaría
            </Button>
            <Button size="sm" variant="ghost" onClick={() => testNpcVoice('manager')}>
              Probar gerencia
            </Button>
            <Button size="sm" variant="ghost" onClick={() => testNpcVoice('cleaner')}>
              Probar limpieza
            </Button>
          </div>

          <Button size="sm" variant="ghost" onClick={handleResetNpc}>
            Restaurar NPCs
          </Button>
        </div>
      )}
    </div>
  );
}
