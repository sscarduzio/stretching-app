import { Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { stop } from '../engine';
import { t } from '../i18n';
import { MODES } from '../modes';
import { useApp, useSettings } from '../store';

export default function DoneOverlay() {
  const finished = useApp((s) => s.finished);
  const totalTime = useApp((s) => s.totalTime);
  const settings = useSettings();
  const mode = MODES[settings.mode];
  const backBtn = useRef<HTMLButtonElement>(null);

  // move focus into the dialog when it appears
  useEffect(() => {
    if (finished) backBtn.current?.focus();
  }, [finished]);

  return (
    <div
      className={`overlay${finished ? ' is-active' : ''}`}
      role="dialog" aria-modal="true" aria-labelledby="done-title" aria-hidden={!finished}
    >
      <div className="overlay-card glass">
        <div className="done-emoji" aria-hidden="true"><Trophy size={46} /></div>
        <h2 id="done-title">{t.done.title}</h2>
        <p>{finished ? mode.doneText(settings, totalTime) : ''}</p>
        <button ref={backBtn} className="primary" onClick={stop}><span>{t.done.back}</span></button>
      </div>
    </div>
  );
}
