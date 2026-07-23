import { useEffect, useRef } from 'react';
import { t } from '../i18n';

export default function AboutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);

  // move focus into the dialog when it appears
  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);

  // close on Escape while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={`overlay${open ? ' is-active' : ''}`}
      role="dialog" aria-modal="true" aria-labelledby="about-title" aria-hidden={!open}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="overlay-card glass about-card">
        <h2 id="about-title">{t.about.title}</h2>
        <p>{t.about.what}</p>
        <p>{t.about.who}</p>
        <p>{t.about.why}</p>
        <p className="about-credits">
          <a href="https://twitter.com/s_scarduzio" target="_blank" rel="noopener">{t.about.madeBy}</a>
          <a href="https://beshu.tech" target="_blank" rel="noopener">{t.about.production}</a>
        </p>
        <button ref={closeBtn} className="primary" onClick={onClose}><span>{t.about.close}</span></button>
      </div>
    </div>
  );
}
