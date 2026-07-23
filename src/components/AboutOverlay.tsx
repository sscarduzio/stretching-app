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
        <div className="about-credits">
          <a
            className="icon-link" href="https://twitter.com/s_scarduzio"
            target="_blank" rel="noopener" aria-label={t.about.madeBy}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            className="icon-link" href="https://beshu.tech"
            target="_blank" rel="noopener" aria-label={t.about.production}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9z" />
            </svg>
          </a>
        </div>
        <button ref={closeBtn} className="primary" onClick={onClose}><span>{t.about.close}</span></button>
      </div>
    </div>
  );
}
