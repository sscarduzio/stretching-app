// Português
import type { Messages } from './en';

export const pt: Messages = {
  appTitle: 'Temporizador Stretch & Boxe',

  modes: {
    stretch: { title: 'Stretch', subtitle: 'Mantém · recupera · alterna os lados' },
    boxe: { title: 'Boxe', subtitle: 'Boxe sombra · combos · rounds' },
    plank: { title: 'Prancha', subtitle: 'Core · exercícios · séries' },
  },

  fields: {
    hold: { label: 'Manter', sub: 'segundos por lado' },
    stretches: { label: 'Alongamentos', sub: 'exercícios' },
    sets: { label: 'Séries', sub: 'esquerda + direita' },
    recover: { label: 'Troca de lado', sub: 'segundos' },
    rest: { label: 'Descanso entre exercícios', sub: '0 = off' },
    boxRounds: { label: 'Rounds', sub: 'boxe' },
    boxWork: { label: 'Duração do round', sub: 'segundos' },
    boxRest: { label: 'Descanso', sub: 'entre rounds · 0 = off' },
    boxCombos: { label: 'Ritmo dos combos', sub: 'segundos · 0 = off' },
    plankHold: { label: 'Segurar', sub: 'segundos' },
    plankExercises: { label: 'Pranchas', sub: 'exercícios' },
    plankSets: { label: 'Séries', sub: 'por prancha' },
    plankRecover: { label: 'Entre séries', sub: 'segundos' },
    plankRest: { label: 'Entre pranchas', sub: '0 = off' },
    prepare: { label: 'Preparação', sub: 'antes de começar · 0 = off' },
  },

  presets: {
    quick: 'Rápido', daily: 'Diário', deep: 'Profundo',
    beginner: 'Iniciante', classic: 'Clássico', hiit: 'HIIT',
    starter: 'Inicial', core: 'Clássico', iron: 'Core de ferro',
  },

  config: {
    voice: 'Voz', beeps: 'Bipes', haptics: 'Vibração', music: 'Música',
    volume: 'Volume', advanced: 'Avançado', start: 'Começar',
    hint: 'A tela fica acesa · salvo no dispositivo',
    share: 'Compartilhar treino', copied: 'Link copiado ✓',
    language: 'Idioma',
    presetsAria: 'Treinos', workoutModeAria: 'Tipo de treino',
    increase: (label: string) => `aumentar ${label}`,
    decrease: (label: string) => `reduzir ${label}`,
  },

  summary: {
    stretch: (stretches, sets, hold, total) => (
      <>
        <b>{stretches}</b> exercício{stretches > 1 ? 's' : ''} × <b>{sets}</b> série{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> por lado · cerca de <b>{total}</b>
      </>
    ),
    boxe: (rounds, work, rest, combos, total) => (
      <>
        <b>{rounds}</b> rounds · <b>{work}</b> trabalho · <b>{rest}</b> descanso
        {combos > 0 ? ` · combos a cada ${combos}s` : ''} · cerca de <b>{total}</b>
      </>
    ),
    plank: (ex, sets, hold, total) => (
      <>
        <b>{ex}</b> prancha{ex > 1 ? 's' : ''} × <b>{sets}</b> série{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> de prancha · cerca de <b>{total}</b>
      </>
    ),
  },

  run: {
    now: 'agora', endsAbout: 'fim ~', live: 'AO VIVO', upNext: 'A SEGUIR',
    session: 'Sessão', complete: 'completo', elapsed: 'decorrido', remaining: 'restante',
    timeSplit: 'Distribuição',
    focus: 'Modo foco',
    pause: '⏸ Pausa', resume: '▶ Retomar', skip: '⏭ Pular', stop: '⏹ Parar',
    stretchChip: (n, total) => `Alongamento ${n} / ${total}`,
    setChip: (n, total) => `Série ${n} / ${total}`,
    roundChip: (n, total) => `Round ${n} / ${total}`,
    hold: 'MANTÉM', switch: 'TROCA', rest: 'DESCANSO', work: 'TRABALHO', boxe: 'BOXE',
    left: 'ESQUERDA', right: 'DIREITA', ready: 'PRONTO', getReady: 'PREPARE-SE',
    plank: 'PRANCHA', plankChip: (n, total) => `Prancha ${n} / ${total}`,
    holdsTitle: 'Repetições', roundsTitle: 'Rounds',
    legendHold: 'Manter', legendWork: 'Trabalho', legendRecover: 'Recuperação', legendRest: 'Descanso',
    next: {
      holdSide: (side) => `lado ${side === 'left' ? 'esquerdo' : 'direito'} · alongamento`,
      nextStretch: 'Próximo alongamento', switchSides: 'Troque de lado', rest: 'Descanso',
      round: (n) => `Round ${n} · boxe`,
      nextPlank: 'Próxima prancha', plank: (n) => `Prancha ${n}`,
      getReady: 'Prepare-se', finish: 'Fim',
    },
  },

  done: {
    title: 'Pronto!', back: 'Voltar ao início',
    stretch: (holds, stretches, mins) =>
      `${holds} repetições em ${stretches} alongamento${stretches > 1 ? 's' : ''} · cerca de ${mins} min`,
    boxe: (rounds, work, mins) =>
      `${rounds} rounds · ${work} de trabalho · cerca de ${mins} min`,
    plank: (holds, ex, mins) => `${holds} pranchas em ${ex} exercício${ex > 1 ? 's' : ''} · cerca de ${mins} min`,
  },

  about: {
    button: 'Sobre este app',
    title: 'Sobre',
    what: 'Um temporizador de intervalos gratuito com três almas: alongamento tranquilo, boxe sombra e pranchas para o core. Com voz de treinador de verdade, treinos prontos e um painel ao vivo que conta por você.',
    who: 'É para quem alonga ou treina boxe sombra em casa ou na academia. Treinadores: compartilhem um treino inteiro só enviando a URL.',
    why: 'Sem anúncios, sem contas, sem assinatura. Funciona offline depois de carregado, instala direto na tela inicial, e o cronômetro só começa a contar quando o treinador termina de falar — como um de verdade.',
    madeBy: 'Simone Scarduzio no X',
    production: 'Beshu Limited (UK) — beshu.tech',
    close: 'Fechar',
  },
};
