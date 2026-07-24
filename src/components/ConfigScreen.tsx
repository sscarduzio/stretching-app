import { useState } from 'react';
import { beep, setMusicVolume } from '../audio';
import { start } from '../engine';
import { LANGS, locale, setLocale, t } from '../i18n';
import { MODES, PREPARE_FIELD, type FieldDef, type Preset } from '../modes';
import { useApp, useSettings, type Settings } from '../store';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function Stepper({ f }: { f: FieldDef }) {
  const value = useApp((s) => s[f.key]);
  const { label, sub } = t.fields[f.key];
  const setVal = (v: number) => useApp.getState().set({ [f.key]: v });
  const bump = (dir: 1 | -1) => {
    setVal(clamp(value + dir * f.step, f.min, f.max));
    beep(660, 0.05);
  };
  return (
    <div className="field">
      <label htmlFor={`cfg-${f.key}`}>
        {label} <small>{sub}</small>
      </label>
      <div className="stepper">
        <button type="button" aria-label={t.config.decrease(label)} onClick={() => bump(-1)}>−</button>
        <input
          id={`cfg-${f.key}`} type="number" inputMode="numeric"
          min={f.min} max={f.max} step={f.step} value={value}
          onChange={(e) => setVal(e.target.valueAsNumber || 0)}
          onBlur={(e) => setVal(clamp(e.target.valueAsNumber || f.min, f.min, f.max))}
        />
        <button type="button" aria-label={t.config.increase(label)} onClick={() => bump(1)}>+</button>
      </div>
    </div>
  );
}

function PresetChip({ p, settings }: { p: Preset; settings: Settings }) {
  const active = Object.entries(p.values).every(([k, v]) => settings[k as keyof Settings] === v);
  return (
    <button
      type="button"
      className={`preset${active ? ' on' : ''}`}
      aria-pressed={active}
      onClick={() => { useApp.getState().set(p.values); beep(660, 0.05); }}
    >
      <b>{t.presets[p.id]}</b>
      <small>{p.sub}</small>
    </button>
  );
}

const ALL_CHIPS = [
  { k: 'voice', icon: '🔊', label: () => t.config.voice },
  { k: 'beeps', icon: '⏱️', label: () => t.config.beeps },
  { k: 'vibrate', icon: '📳', label: () => t.config.haptics },
  { k: 'music', icon: '🎵', label: () => t.config.music },
] as const;

// iOS WebKit has no Vibration API — don't show a toggle that can't work
export const SOUND_CHIPS = ALL_CHIPS.filter((c) => c.k !== 'vibrate' || 'vibrate' in navigator);

export function SoundChip({ k, icon, label }: (typeof ALL_CHIPS)[number]) {
  const on = useApp((s) => s[k]);
  return (
    <button
      type="button"
      className={`schip${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => useApp.getState().set({ [k]: !on })}
    >
      <span className="ico" aria-hidden="true">{icon}</span>
      <span>{label()}</span>
    </button>
  );
}

// permalinks already encode the workout — this just puts them in hands
function ShareButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* user cancelled the share sheet */ }
  };
  return (
    <button type="button" className="share-btn" onClick={share}>
      {copied ? t.config.copied : <>📤 {t.config.share}</>}
    </button>
  );
}

function LangSelect() {
  return (
    <label className="lang-row glass">
      <span aria-hidden="true">🌐</span>
      <select aria-label={t.config.language} value={locale} onChange={(e) => setLocale(e.target.value)}>
        {Object.entries(LANGS).map(([k, name]) => <option key={k} value={k}>{name}</option>)}
      </select>
    </label>
  );
}

export function VolumeSlider({ id }: { id: string }) {
  const volume = useApp((s) => s.volume);
  const apply = (v: number) => {
    v = clamp(v, 0, 1);
    useApp.getState().set({ volume: v });
    setMusicVolume(v);
  };
  return (
    <>
      <input
        id={id} type="range" min={0} max={1} step={0.05} value={volume}
        aria-label={t.config.volume}
        onChange={(e) => apply(e.target.valueAsNumber)}
      />
      <span className="vol-val">{Math.round(volume * 100)}%</span>
    </>
  );
}

export default function ConfigScreen({ active }: { active: boolean }) {
  const settings = useSettings();
  const m = MODES[settings.mode];
  const brand = t.modes[settings.mode];
  return (
    <main className={`screen${active ? ' is-active' : ''}`} aria-hidden={!active}>
      <header className="brand">
        <h1>{brand.title}<span>.</span></h1>
        <p className="subtitle">{brand.subtitle}</p>
      </header>

      <div className="cfg-grid">
        <div className="cfg-col">
          <div className="preset-row" role="group" aria-label={t.config.presetsAria}>
            {m.presets.map((p) => <PresetChip key={p.id} p={p} settings={settings} />)}
          </div>

          <section className="glass card">
            {m.fields.map((f) => <Stepper key={f.key} f={f} />)}
          </section>
        </div>

        <div className="cfg-col">
          <section className="glass card sound-card">
            <div className="sound-chips">
              {SOUND_CHIPS.map((c) => <SoundChip key={c.k} {...c} />)}
            </div>
            {settings.music && (
              <div className="vol-row">
                <label htmlFor="cfg-vol">{t.config.volume}</label>
                <VolumeSlider id="cfg-vol" />
              </div>
            )}
          </section>

          <details className="glass card advanced">
            <summary>{t.config.advanced}</summary>
            {m.advanced.map((f) => <Stepper key={f.key} f={f} />)}
            <Stepper f={PREPARE_FIELD} />
          </details>

          <p className="summary">{m.summary(settings)}</p>
        </div>
      </div>

      <button className="primary" onClick={start}><span>{t.config.start}</span></button>
      <div className="under-start">
        <ShareButton />
        <LangSelect />
      </div>
      <p className="hint">{t.config.hint}</p>
    </main>
  );
}
