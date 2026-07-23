import { useEffect } from 'react';
import { beep } from './audio';
import { MODES } from './modes';
import { useApp, type ModeKey } from './store';
import ConfigScreen from './components/ConfigScreen';
import RunScreen from './components/RunScreen';
import DoneOverlay from './components/DoneOverlay';

function ModeSwitch() {
  const mode = useApp((s) => s.mode);
  const running = useApp((s) => s.running);
  const setMode = (m: ModeKey) => {
    if (running) return; // no mode switch mid-session
    useApp.getState().set({ mode: m });
    beep(660, 0.05);
  };
  return (
    <div className="mode-switch glass" role="tablist" aria-label="Workout mode">
      {(Object.keys(MODES) as ModeKey[]).map((m) => (
        <button
          key={m} type="button" role="tab"
          className={`mode-btn${mode === m ? ' is-active' : ''}`}
          aria-selected={mode === m}
          onClick={() => setMode(m)}
        >
          {MODES[m].brand.logo} <span>{MODES[m].brand.title}</span>
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
    document.querySelector('#theme-color-meta')?.setAttribute('content', MODES[mode].themeColor);
  }, [mode]);

  const phaseTheme = finished ? 'done' : running ? phaseType ?? 'idle' : 'idle';
  useEffect(() => {
    document.body.dataset.phase = phaseTheme;
  }, [phaseTheme]);

  const inSession = running || finished;
  return (
    <>
      <ModeSwitch />
      <Aurora />
      <ConfigScreen active={!inSession} />
      <RunScreen active={inSession} />
      <DoneOverlay />
    </>
  );
}
