// Español
import type { Messages } from './en';

export const es: Messages = {
  appTitle: 'Temporizador Stretch & Boxe',

  modes: {
    stretch: { title: 'Stretch', subtitle: 'Mantén · recupera · alterna los lados' },
    boxe: { title: 'Boxe', subtitle: 'Boxeo de sombra · combos · asaltos' },
    plank: { title: 'Plancha', subtitle: 'Core · ejercicios · series' },
  },

  fields: {
    hold: { label: 'Mantener', sub: 'segundos por lado' },
    stretches: { label: 'Estiramientos', sub: 'ejercicios' },
    sets: { label: 'Series', sub: 'izquierda + derecha' },
    recover: { label: 'Cambio de lado', sub: 'segundos' },
    rest: { label: 'Descanso entre ejercicios', sub: '0 = off' },
    boxRounds: { label: 'Asaltos', sub: 'boxeo' },
    boxWork: { label: 'Duración del asalto', sub: 'segundos' },
    boxRest: { label: 'Descanso', sub: 'entre asaltos · 0 = off' },
    boxCombos: { label: 'Ritmo de combos', sub: 'segundos · 0 = off' },
    plankHold: { label: 'Aguante', sub: 'segundos' },
    plankExercises: { label: 'Planchas', sub: 'ejercicios' },
    plankSets: { label: 'Series', sub: 'por plancha' },
    plankRecover: { label: 'Entre series', sub: 'segundos' },
    plankRest: { label: 'Entre planchas', sub: '0 = off' },
    prepare: { label: 'Preparación', sub: 'antes de empezar · 0 = off' },
  },

  presets: {
    quick: 'Rápido', daily: 'Diario', deep: 'Profundo',
    beginner: 'Principiante', classic: 'Clásico', hiit: 'HIIT',
    starter: 'Inicial', core: 'Clásico', iron: 'Core de hierro',
  },

  config: {
    voice: 'Voz', beeps: 'Pitidos', haptics: 'Vibración', music: 'Música',
    volume: 'Volumen', advanced: 'Avanzado', start: 'Empezar',
    hint: 'La pantalla no se apaga · guardado en el dispositivo',
    share: 'Compartir rutina', copied: 'Enlace copiado ✓',
    language: 'Idioma',
    presetsAria: 'Rutinas', workoutModeAria: 'Tipo de entrenamiento',
    increase: (label: string) => `aumentar ${label}`,
    decrease: (label: string) => `reducir ${label}`,
  },

  summary: {
    stretch: (stretches, sets, hold, total) => (
      <>
        <b>{stretches}</b> ejercicio{stretches > 1 ? 's' : ''} × <b>{sets}</b> serie{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> por lado · unos <b>{total}</b>
      </>
    ),
    boxe: (rounds, work, rest, combos, total) => (
      <>
        <b>{rounds}</b> asaltos · <b>{work}</b> trabajo · <b>{rest}</b> descanso
        {combos > 0 ? ` · combos cada ${combos}s` : ''} · unos <b>{total}</b>
      </>
    ),
    plank: (ex, sets, hold, total) => (
      <>
        <b>{ex}</b> plancha{ex > 1 ? 's' : ''} × <b>{sets}</b> serie{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> de aguante · unos <b>{total}</b>
      </>
    ),
  },

  run: {
    now: 'ahora', endsAbout: 'fin ~', live: 'EN VIVO', upNext: 'A CONTINUACIÓN',
    session: 'Sesión', complete: 'completado', elapsed: 'transcurrido', remaining: 'restante',
    timeSplit: 'Reparto del tiempo',
    focus: 'Modo focus',
    pause: '⏸ Pausa', resume: '▶ Reanudar', skip: '⏭ Saltar', stop: '⏹ Parar',
    stretchChip: (n, total) => `Ejercicio ${n} / ${total}`,
    setChip: (n, total) => `Serie ${n} / ${total}`,
    roundChip: (n, total) => `Asalto ${n} / ${total}`,
    hold: 'MANTÉN', switch: 'CAMBIO', rest: 'DESCANSO', work: 'TRABAJO', boxe: 'BOXEO',
    left: 'IZQUIERDA', right: 'DERECHA', ready: 'LISTOS', getReady: 'PREPÁRATE',
    plank: 'PLANCHA', plankChip: (n, total) => `Plancha ${n} / ${total}`,
    holdsTitle: 'Repeticiones', roundsTitle: 'Asaltos',
    legendHold: 'Mantener', legendWork: 'Trabajo', legendRecover: 'Recuperación', legendRest: 'Descanso',
    next: {
      holdSide: (side) => `lado ${side === 'left' ? 'izquierdo' : 'derecho'} · estiramiento`,
      nextStretch: 'Siguiente ejercicio', switchSides: 'Cambia de lado', rest: 'Descanso',
      round: (n) => `Asalto ${n} · boxeo`,
      nextPlank: 'Siguiente plancha', plank: (n) => `Plancha ${n}`,
      getReady: 'Prepárate', finish: 'Final',
    },
  },

  done: {
    title: '¡Terminado!', back: 'Volver al inicio',
    stretch: (holds, stretches, mins) =>
      `${holds} repeticiones en ${stretches} ejercicio${stretches > 1 ? 's' : ''} · unos ${mins} min`,
    boxe: (rounds, work, mins) =>
      `${rounds} asaltos · ${work} de trabajo · unos ${mins} min`,
    plank: (holds, ex, mins) => `${holds} aguantes en ${ex} plancha${ex > 1 ? 's' : ''} · unos ${mins} min`,
  },

  about: {
    button: 'Acerca de esta app',
    title: 'Acerca de',
    what: 'Un temporizador de intervalos gratuito con tres almas: estiramientos tranquilos, boxeo de sombra y planchas para el core. Con voz de entrenador real, rutinas listas y un panel en vivo que lleva la cuenta por ti.',
    who: 'Es para cualquiera que estire o haga boxeo de sombra en casa o en el gimnasio. Entrenadores: compartid una rutina completa con solo enviar la URL.',
    why: 'Sin anuncios, sin cuentas, sin suscripción. Funciona sin conexión una vez cargado, se instala en tu pantalla de inicio, y el temporizador solo empieza a contar cuando el entrenador termina de hablar — como uno de verdad.',
    madeBy: 'Simone Scarduzio en X',
    production: 'Beshu Limited (UK) — beshu.tech',
    close: 'Cerrar',
  },
};
