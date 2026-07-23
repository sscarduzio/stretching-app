import { useEffect, useState } from 'react';
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
  const setMode = (m: ModeKey) => {
    if (running) return; // no mode switch mid-session
    useApp.getState().set({ mode: m });
    beep(660, 0.05);
  };
  return (
    <div className="mode-switch glass" role="tablist" aria-label={t.config.workoutModeAria}>
      {(Object.keys(MODES) as ModeKey[]).map((m) => (
        <button
          key={m} type="button" role="tab"
          className={`mode-btn${mode === m ? ' is-active' : ''}`}
          aria-selected={mode === m}
          onClick={() => setMode(m)}
        >
          <span aria-hidden="true">{MODES[m].logo}</span> <span>{t.modes[m].title}</span>
        </button>
      ))}
    </div>
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
        <span aria-hidden="true">ℹ️</span>
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
