import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { beep } from './audio';
import { t } from './i18n';
import { MODES } from './modes';
import { useApp, type ModeKey } from './store';
import ConfigScreen from './components/ConfigScreen';
import RunScreen from './components/RunScreen';
import DoneOverlay from './components/DoneOverlay';
import AboutOverlay from './components/AboutOverlay';

function ModeSwitch() {
  const mode = useApp((s) => s.mode);
  const running = useApp((s) => s.running);
  const ModeIcon = MODES[mode].logo;
  return (
    <label className="mode-select glass">
      <ModeIcon aria-hidden="true" size={16} strokeWidth={2.4} />
      <select
        aria-label={t.config.workoutModeAria} value={mode} disabled={running}
        onChange={(e) => { useApp.getState().set({ mode: e.target.value as ModeKey }); beep(660, 0.05); }}
      >
        {(Object.keys(MODES) as ModeKey[]).map((m) => (
          <option key={m} value={m}>{t.modes[m].title}</option>
        ))}
      </select>
    </label>
  );
}

const Aurora = () => (
  <div className="aurora" aria-hidden="true">
    <span className="orb orb-a" />
    <span className="orb orb-b" />
    <span className="orb orb-c" />
    <div className="grain" />
  </div>
);

export default function App() {
  const mode = useApp((s) => s.mode);
  const running = useApp((s) => s.running);
  const finished = useApp((s) => s.finished);
  const phaseType = useApp((s) => s.plan[s.idx]?.type);

  // the CSS theming contract: body[data-mode] + body[data-phase]
  useEffect(() => {
    document.body.dataset.mode = mode;
    document.title = `${t.modes[mode].title} · ${t.appTitle}`;
    document.querySelector('#theme-color-meta')?.setAttribute('content', MODES[mode].themeColor);
  }, [mode]);

  const phaseTheme = finished ? 'done' : running ? phaseType ?? 'idle' : 'idle';
  useEffect(() => {
    document.body.dataset.phase = phaseTheme;
  }, [phaseTheme]);

  const focus = useApp((s) => s.focus);
  useEffect(() => {
    document.body.dataset.focus = focus ? 'on' : 'off';
  }, [focus]);

  const inSession = running || finished;
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <button
        type="button" className="info-btn glass" aria-label={t.about.button}
        onClick={() => setAboutOpen(true)}
      >
        <Info aria-hidden="true" size={19} />
      </button>
      <ModeSwitch />
      <Aurora />
      <ConfigScreen active={!inSession} />
      <RunScreen active={inSession} />
      <DoneOverlay />
      <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
