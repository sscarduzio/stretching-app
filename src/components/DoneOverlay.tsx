import { stop } from '../engine';
import { MODES } from '../modes';
import { useApp } from '../store';

export default function DoneOverlay() {
  const finished = useApp((s) => s.finished);
  const mode = useApp((s) => MODES[s.mode]);
  const totalTime = useApp((s) => s.totalTime);
  return (
    <div className={`overlay${finished ? ' is-active' : ''}`}>
      <div className="overlay-card glass">
        <div className="done-emoji">{mode.key === 'boxe' ? '🥊' : '🎉'}</div>
        <h2>All done!</h2>
        <p>{finished ? mode.doneText(useApp.getState(), totalTime) : ''}</p>
        <button className="primary" onClick={stop}><span>Back to setup</span></button>
      </div>
    </div>
  );
}
