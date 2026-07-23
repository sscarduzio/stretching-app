import { beep, setMusicVolume } from './../audio';
import { start } from '../engine';
import { MODES, type FieldDef } from '../modes';
import { useApp, useSettings } from '../store';

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

function Toggle({ k, label }: { k: 'voice' | 'beeps' | 'vibrate' | 'music'; label: string }) {
  const on = useApp((s) => s[k]);
  return (
    <label className="toggle" htmlFor={`opt-${k}`}>
      <span>{label}</span>
      <input
        type="checkbox" id={`opt-${k}`} checked={on}
        onChange={(e) => useApp.getState().set({ [k]: e.target.checked })}
      />
      <span className="switch" />
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

      <section className="glass card">
        {m.fields.map((f) => <Stepper key={f.key} f={f} />)}
      </section>

      <section className="glass card toggles">
        <Toggle k="voice" label="🔊 Voice cues" />
        <Toggle k="beeps" label="⏱️ Countdown beeps" />
        <Toggle k="vibrate" label="📳 Vibration" />
        <Toggle k="music" label="🎵 Background music" />
        {settings.music && (
          <div className="vol-row">
            <label htmlFor="cfg-vol">Volume</label>
            <VolumeSlider id="cfg-vol" />
          </div>
        )}
      </section>

      <p className="summary">{m.summary(settings)}</p>

      <button className="primary" onClick={start}><span>Start</span></button>
      <p className="hint">Screen stays awake · saved on this device</p>
    </main>
  );
}
