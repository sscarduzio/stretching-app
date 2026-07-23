import { beep, setMusicVolume } from './../audio';
import { start } from '../engine';
import { MODES, PREPARE_FIELD, type FieldDef, type Preset } from '../modes';
import { useApp, useSettings, type Settings } from '../store';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function Stepper({ f }: { f: FieldDef }) {
  const value = useApp((s) => s[f.key] as number);
  const setVal = (v: number) => useApp.getState().set({ [f.key]: v });
  const bump = (dir: 1 | -1) => {
    setVal(clamp(value + dir * f.step, f.min, f.max));
    beep(660, 0.05);
  };
  return (
    <div className="field">
      <label htmlFor={`cfg-${f.key}`}>
        {f.label} <small>{f.sub}</small>
      </label>
      <div className="stepper">
        <button type="button" aria-label={`decrease ${f.label}`} onClick={() => bump(-1)}>−</button>
        <input
          id={`cfg-${f.key}`} type="number" inputMode="numeric"
          min={f.min} max={f.max} step={f.step} value={value}
          onChange={(e) => setVal(e.target.valueAsNumber || 0)}
          onBlur={(e) => setVal(clamp(e.target.valueAsNumber || f.min, f.min, f.max))}
        />
        <button type="button" aria-label={`increase ${f.label}`} onClick={() => bump(1)}>+</button>
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
      <b>{p.name}</b>
      <small>{p.sub}</small>
    </button>
  );
}

const SOUND_CHIPS = [
  { k: 'voice', icon: '🔊', label: 'Voice' },
  { k: 'beeps', icon: '⏱️', label: 'Beeps' },
  { k: 'vibrate', icon: '📳', label: 'Haptics' },
  { k: 'music', icon: '🎵', label: 'Music' },
] as const;

function SoundChip({ k, icon, label }: (typeof SOUND_CHIPS)[number]) {
  const on = useApp((s) => s[k]);
  return (
    <button
      type="button"
      className={`schip${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => useApp.getState().set({ [k]: !on })}
    >
      <span className="ico">{icon}</span>
      <span>{label}</span>
    </button>
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
        onChange={(e) => apply(e.target.valueAsNumber)}
      />
      <span className="vol-val">{Math.round(volume * 100)}%</span>
    </>
  );
}

export default function ConfigScreen({ active }: { active: boolean }) {
  const settings = useSettings();
  const m = MODES[settings.mode];
  return (
    <main className={`screen${active ? ' is-active' : ''}`}>
      <header className="brand">
        <div className="logo-ring"><div className="logo">{m.brand.logo}</div></div>
        <h1>{m.brand.title}<span>.</span></h1>
        <p className="subtitle">{m.brand.subtitle}</p>
      </header>

      <div className="cfg-grid">
        <div className="cfg-col">
          <div className="preset-row" role="group" aria-label="Presets">
            {m.presets.map((p) => <PresetChip key={p.name} p={p} settings={settings} />)}
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
                <label htmlFor="cfg-vol">Volume</label>
                <VolumeSlider id="cfg-vol" />
              </div>
            )}
          </section>

          <details className="glass card advanced">
            <summary>Advanced</summary>
            {m.advanced.map((f) => <Stepper key={f.key} f={f} />)}
            <Stepper f={PREPARE_FIELD} />
          </details>

          <p className="summary">{m.summary(settings)}</p>
        </div>
      </div>

      <button className="primary" onClick={start}><span>Start</span></button>
      <p className="hint">Screen stays awake · saved on this device</p>
    </main>
  );
}
