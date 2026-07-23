// Locale picked once at load from the browser language; `t` is the active
// dictionary. Voice cues are pre-generated audio and stay English until
// per-locale atoms are generated (see scripts/generate-voice.sh).
import { en, type Messages } from './en';
import { it } from './it';

const LOCALES: Record<string, Messages> = { en, it };

// override via #/…?lang=it — persisted, so the link works once and sticks
const forced = new URLSearchParams(location.hash.split('?')[1] ?? '').get('lang');
if (forced) try { localStorage.setItem('stretchTimer.lang', forced); } catch { /* private mode */ }
let stored: string | null = null;
try { stored = localStorage.getItem('stretchTimer.lang'); } catch { /* private mode */ }

const pick = (stored || navigator.language || 'en').slice(0, 2).toLowerCase();
export const locale = pick in LOCALES ? pick : 'en';
export const t: Messages = LOCALES[locale];

document.documentElement.lang = locale;
