// Hash router synced to the store — permalinks without a router library.
// ponytail: two routes + GH Pages hosting; react-router earns its keep at ~5 routes.
//
//   #/stretch                     config, stretch mode
//   #/box?boxRounds=3&boxWork=90  config permalink (only non-default values)
//   #/stretch/run                 active session (transient: reload lands on config)
//
// URL wins over persisted settings on boot; back/forward apply the URL;
// the back button during a session stops it (mobile gesture-nav friendly).
import { stop } from './engine';
import { MODES, PREPARE_FIELD, type FieldDef } from './modes';
import { DEFAULTS, useApp, type ModeKey, type Settings } from './store';

function fieldsFor(mode: ModeKey): FieldDef[] {
  const m = MODES[mode];
  return [...m.fields, ...m.advanced, PREPARE_FIELD];
}

// settings key → URL param: the box* prefix is internal, permalinks read clean
// (#/boxe?rounds=6&work=180, not boxRounds=…)
const urlKey = (k: string) =>
  k.startsWith('box') ? k.slice(3).toLowerCase()
  : k.startsWith('plank') ? k.slice(5).toLowerCase()
  : k;

function parseHash(): { mode: ModeKey; run: boolean; params: Partial<Settings> } {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const segs = path.split('/').filter(Boolean);
  // accept the legacy 'box' spelling in old links
  const mode: ModeKey = segs[0] === 'boxe' || segs[0] === 'box' ? 'boxe'
    : segs[0] === 'plank' ? 'plank' : 'stretch';
  const run = segs[1] === 'run';
  const params: Record<string, number> = {};
  if (query) {
    const q = new URLSearchParams(query);
    for (const f of fieldsFor(mode)) {
      const raw = q.get(urlKey(f.key));
      if (raw === null) continue;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) params[f.key] = Math.min(f.max, Math.max(f.min, n));
    }
  }
  return { mode, run, params: params as Partial<Settings> };
}

function buildHash(s: Settings, run = false): string {
  const q = new URLSearchParams();
  for (const f of fieldsFor(s.mode)) {
    const v = s[f.key] as number;
    if (v !== DEFAULTS[f.key]) q.set(urlKey(f.key), String(v));
  }
  const qs = q.toString();
  return `#/${s.mode}${run ? '/run' : ''}${qs ? '?' + qs : ''}`;
}

function writeHash(hash: string, push = false) {
  if (location.hash === hash) return;
  if (push) history.pushState(null, '', hash);
  else history.replaceState(null, '', hash);
}

export function initRouter(): void {
  // URL → store on boot (a shared permalink beats saved settings)
  if (location.hash.length > 2) {
    const { mode, params } = parseHash();
    useApp.getState().set({ mode, ...params });
  }
  writeHash(buildHash(useApp.getState()));

  // store → URL: run transitions get a history entry, config edits replace in place
  useApp.subscribe((s, prev) => {
    const inSession = s.running || s.finished;
    const wasInSession = prev.running || prev.finished;
    if (inSession && !wasInSession) writeHash(buildHash(s, true), true);
    else if (!inSession && wasInSession) writeHash(buildHash(s));
    else if (!inSession) writeHash(buildHash(s));
  });

  // URL → store on back/forward
  window.addEventListener('popstate', () => {
    const { mode, run, params } = parseHash();
    const s = useApp.getState();
    if (!run && (s.running || s.finished)) stop(); // back exits the session
    if (!useApp.getState().running) useApp.getState().set({ mode, ...params });
  });
}
