// Français
import type { Messages } from './en';

export const fr: Messages = {
  appTitle: 'Minuteur Stretch & Boxe',

  modes: {
    stretch: { title: 'Stretch', subtitle: 'Tiens · récupère · alterne les côtés' },
    boxe: { title: 'Boxe', subtitle: 'Shadow boxing · combos · rounds' },
    plank: { title: 'Gainage', subtitle: 'Core · exercices · séries' },
  },

  fields: {
    hold: { label: 'Maintien', sub: 'secondes par côté' },
    stretches: { label: 'Étirements', sub: 'exercices' },
    sets: { label: 'Séries', sub: 'gauche + droite' },
    recover: { label: 'Changement de côté', sub: 'secondes' },
    rest: { label: 'Repos entre étirements', sub: '0 = off' },
    boxRounds: { label: 'Rounds', sub: 'boxe' },
    boxWork: { label: 'Durée du round', sub: 'secondes' },
    boxRest: { label: 'Repos', sub: 'entre les rounds · 0 = off' },
    boxCombos: { label: 'Rythme des combos', sub: 'secondes · 0 = off' },
    plankHold: { label: 'Maintien', sub: 'secondes' },
    plankExercises: { label: 'Planches', sub: 'exercices' },
    plankSets: { label: 'Séries', sub: 'par planche' },
    plankRecover: { label: 'Entre les séries', sub: 'secondes' },
    plankRest: { label: 'Entre les planches', sub: '0 = off' },
    prepare: { label: 'Préparation', sub: 'avant de commencer · 0 = off' },
  },

  presets: {
    quick: 'Rapide', daily: 'Quotidien', deep: 'Profond',
    beginner: 'Débutant', classic: 'Classique', hiit: 'HIIT',
    starter: 'Débutant', core: 'Classique', iron: 'Core d’acier',
  },

  config: {
    voice: 'Voix', beeps: 'Bips', haptics: 'Vibrations', music: 'Musique',
    volume: 'Volume', advanced: 'Avancé', start: 'Commencer',
    hint: "L'écran reste allumé · enregistré sur l'appareil",
    share: 'Partager la séance', copied: 'Lien copié ✓',
    language: 'Langue',
    presetsAria: 'Programmes', workoutModeAria: "Type d'entraînement",
    increase: (label: string) => `augmenter ${label}`,
    decrease: (label: string) => `réduire ${label}`,
  },

  summary: {
    stretch: (stretches, sets, hold, total) => (
      <>
        <b>{stretches}</b> étirement{stretches > 1 ? 's' : ''} × <b>{sets}</b> série{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> par côté · environ <b>{total}</b>
      </>
    ),
    boxe: (rounds, work, rest, combos, total) => (
      <>
        <b>{rounds}</b> rounds · <b>{work}</b> travail · <b>{rest}</b> repos
        {combos > 0 ? ` · combos toutes les ${combos}s` : ''} · environ <b>{total}</b>
      </>
    ),
    plank: (ex, sets, hold, total) => (
      <>
        <b>{ex}</b> planche{ex > 1 ? 's' : ''} × <b>{sets}</b> série{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> de maintien · environ <b>{total}</b>
      </>
    ),
  },

  run: {
    now: 'heure', endsAbout: 'fin ~', live: 'LIVE', upNext: 'À SUIVRE',
    session: 'Session', complete: 'terminé', elapsed: 'écoulé', remaining: 'restant',
    timeSplit: 'Répartition',
    focus: 'Mode focus',
    pause: '⏸ Pause', resume: '▶ Reprendre', skip: '⏭ Passer', stop: '⏹ Stop',
    stretchChip: (n, total) => `Étirement ${n} / ${total}`,
    setChip: (n, total) => `Série ${n} / ${total}`,
    roundChip: (n, total) => `Round ${n} / ${total}`,
    hold: 'TIENS', switch: 'CHANGE', rest: 'REPOS', work: 'TRAVAIL', boxe: 'BOXE',
    left: 'GAUCHE', right: 'DROITE', ready: 'PRÊT', getReady: 'PRÉPARE-TOI',
    plank: 'PLANCHE', plankChip: (n, total) => `Planche ${n} / ${total}`,
    holdsTitle: 'Répétitions', roundsTitle: 'Rounds',
    legendHold: 'Maintien', legendWork: 'Travail', legendRecover: 'Récupération', legendRest: 'Repos',
    next: {
      holdSide: (side) => `côté ${side === 'left' ? 'gauche' : 'droit'} · étirement`,
      nextStretch: 'Étirement suivant', switchSides: 'Change de côté', rest: 'Repos',
      round: (n) => `Round ${n} · boxe`,
      nextPlank: 'Planche suivante', plank: (n) => `Planche ${n}`,
      getReady: 'Prépare-toi', finish: 'Fin',
    },
  },

  done: {
    title: 'Terminé !', back: 'Retour aux réglages',
    stretch: (holds, stretches, mins) =>
      `${holds} maintiens sur ${stretches} étirement${stretches > 1 ? 's' : ''} · environ ${mins} min`,
    boxe: (rounds, work, mins) =>
      `${rounds} rounds · ${work} de travail · environ ${mins} min`,
    plank: (holds, ex, mins) => `${holds} maintiens sur ${ex} planche${ex > 1 ? 's' : ''} · environ ${mins} min`,
  },

  about: {
    button: 'À propos de cette app',
    title: 'À propos',
    what: "Un minuteur d'intervalles gratuit à trois visages : étirements calmes, shadow boxing et gainage. Avec une vraie voix de coach, des programmes prêts à l'emploi et un tableau de bord qui compte à ta place.",
    who: "Pour tous ceux qui s'étirent ou boxent dans le vide, à la maison ou à la salle. Les coachs aussi : partagez une séance entière en envoyant simplement l'URL.",
    why: "Pas de pub, pas de compte, pas d'abonnement. Fonctionne hors ligne une fois chargé, s'installe sur l'écran d'accueil, et le chrono ne démarre que quand le coach a fini de parler — comme un vrai.",
    madeBy: 'Simone Scarduzio sur X',
    production: 'Beshu Limited (UK) — beshu.tech',
    close: 'Fermer',
  },
};
