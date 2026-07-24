// Italiano
import type { Messages } from './en';

export const it: Messages = {
  appTitle: 'Timer Stretch & Boxe',

  modes: {
    stretch: { title: 'Stretch', subtitle: 'Tieni · recupera · alterna i lati' },
    boxe: { title: 'Boxe', subtitle: 'Boxe a vuoto · combo · round' },
    plank: { title: 'Plank', subtitle: 'Core · esercizi · serie' },
  },

  fields: {
    hold: { label: 'Tenuta', sub: 'secondi per lato' },
    stretches: { label: 'Allungamenti', sub: 'esercizi' },
    sets: { label: 'Serie', sub: 'sinistra + destra' },
    recover: { label: 'Cambio lato', sub: 'secondi' },
    rest: { label: 'Riposo tra esercizi', sub: '0 = off' },
    boxRounds: { label: 'Round', sub: 'boxe' },
    boxWork: { label: 'Durata round', sub: 'secondi' },
    boxRest: { label: 'Riposo', sub: 'tra i round · 0 = off' },
    boxCombos: { label: 'Ritmo combo', sub: 'secondi · 0 = off' },
    plankHold: { label: 'Tenuta', sub: 'secondi' },
    plankExercises: { label: 'Plank', sub: 'esercizi' },
    plankSets: { label: 'Serie', sub: 'per plank' },
    plankRecover: { label: 'Tra le serie', sub: 'secondi' },
    plankRest: { label: 'Tra i plank', sub: '0 = off' },
    prepare: { label: 'Preparazione', sub: 'prima di iniziare · 0 = off' },
  },

  presets: {
    quick: 'Veloce', daily: 'Quotidiano', deep: 'Profondo',
    beginner: 'Principiante', classic: 'Classico', hiit: 'HIIT',
    starter: 'Base', core: 'Classico', iron: 'Core d’acciaio',
  },

  config: {
    voice: 'Voce', beeps: 'Bip', haptics: 'Vibrazione', music: 'Musica',
    volume: 'Volume', advanced: 'Avanzate', start: 'Inizia',
    hint: 'Lo schermo resta acceso · salvato sul dispositivo',
    share: 'Condividi allenamento', copied: 'Link copiato ✓',
    language: 'Lingua',
    presetsAria: 'Programmi', workoutModeAria: 'Tipo di allenamento',
    increase: (label: string) => `aumenta ${label}`,
    decrease: (label: string) => `riduci ${label}`,
  },

  summary: {
    stretch: (stretches, sets, hold, total) => (
      <>
        <b>{stretches}</b> esercizi{stretches === 1 ? 'o' : ''} × <b>{sets}</b> serie ·{' '}
        <b>{hold}s</b> per lato · circa <b>{total}</b>
      </>
    ),
    boxe: (rounds, work, rest, combos, total) => (
      <>
        <b>{rounds}</b> round · <b>{work}</b> lavoro · <b>{rest}</b> riposo
        {combos > 0 ? ` · combo ogni ${combos}s` : ''} · circa <b>{total}</b>
      </>
    ),
    plank: (ex, sets, hold, total) => (
      <>
        <b>{ex}</b> plank × <b>{sets}</b> serie · <b>{hold}s</b> di tenuta · circa <b>{total}</b>
      </>
    ),
  },

  run: {
    now: 'ora', endsAbout: 'fine ~', live: 'LIVE', upNext: 'A SEGUIRE',
    session: 'Sessione', complete: 'completato', elapsed: 'trascorso', remaining: 'rimanente',
    timeSplit: 'Ripartizione',
    focus: 'Modalità focus',
    pause: '⏸ Pausa', resume: '▶ Riprendi', skip: '⏭ Salta', stop: '⏹ Stop',
    stretchChip: (n, total) => `Esercizio ${n} / ${total}`,
    setChip: (n, total) => `Serie ${n} / ${total}`,
    roundChip: (n, total) => `Round ${n} / ${total}`,
    hold: 'TIENI', switch: 'CAMBIO', rest: 'RIPOSO', work: 'LAVORO', boxe: 'BOXE',
    left: 'SINISTRA', right: 'DESTRA', ready: 'PRONTI', getReady: 'PREPARATI',
    plank: 'PLANK', plankChip: (n, total) => `Plank ${n} / ${total}`,
    holdsTitle: 'Tenute', roundsTitle: 'Round',
    legendHold: 'Tenuta', legendWork: 'Lavoro', legendRecover: 'Recupero', legendRest: 'Riposo',
    next: {
      holdSide: (side) => `lato ${side === 'left' ? 'sinistro' : 'destro'} · allungamento`,
      nextStretch: 'Prossimo esercizio', switchSides: 'Cambia lato', rest: 'Riposo',
      round: (n) => `Round ${n} · boxe`,
      nextPlank: 'Prossimo plank', plank: (n) => `Plank ${n}`,
      getReady: 'Preparati', finish: 'Fine',
    },
  },

  about: {
    button: 'Informazioni sull’app',
    title: 'Informazioni',
    what: 'Un timer a intervalli gratuito con tre anime: stretching rilassato, boxe a vuoto e plank per il core. Con una vera voce da coach, preset pronti all’uso e una dashboard live che conta al posto tuo.',
    who: 'È per chiunque faccia stretching o boxe a vuoto, a casa o in palestra. E anche per i coach: condividi un intero allenamento semplicemente inviando l’URL.',
    why: 'Niente pubblicità, niente account, niente abbonamenti. Funziona completamente offline dopo il primo caricamento, si installa sulla schermata home e il timer parte solo quando il coach finisce di parlare — come farebbe un vero allenatore.',
    madeBy: 'Simone Scarduzio su X',
    production: 'Beshu Limited (UK) — beshu.tech',
    close: 'Chiudi',
  },

  done: {
    title: 'Finito!', back: 'Torna alle impostazioni',
    stretch: (holds, stretches, mins) =>
      `${holds} tenute in ${stretches} esercizi${stretches === 1 ? 'o' : ''} · circa ${mins} min`,
    boxe: (rounds, work, mins) =>
      `${rounds} round · ${work} di lavoro · circa ${mins} min`,
    plank: (holds, ex, mins) => `${holds} tenute su ${ex} plank · circa ${mins} min`,
  },
};
