#!/usr/bin/env python3
"""Generate the baked-in voice atoms for every UI language.

    OPENAI_API_KEY=sk-... python3 scripts/generate_voice.py                 # all locales, all themes
    OPENAI_API_KEY=sk-... python3 scripts/generate_voice.py --locales it,es # subset
    OPENAI_API_KEY=sk-... python3 scripts/generate_voice.py --force         # regenerate existing

Output: public/audio/voice/<locale>/<atom>.mp3

Per theme:
  stretch — Shimmer, calm yoga instructor (slow by instruction)
  box     — Onyx, ringside coach: fast clipped delivery by instruction,
            PLUS a deterministic atempo speed-up in post, so the boxe
            voice is never as slow as the yoga voice.

Post-processing (ffmpeg, per atom):
  1. trim leading/trailing silence (-45 dB) — kills the long TTS tails
     that inflated the pre-round voice lead-in
  2. box atoms: atempo 1.1
  3. two-pass EBU R128 loudnorm to -16 LUFS / -1.5 dBTP (LRA 11) —
     uniform loudness, sits above the background music
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

OUT_ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'audio', 'voice')
MODEL = os.environ.get('TTS_MODEL', 'gpt-4o-mini-tts')
TARGET_I, TARGET_TP, TARGET_LRA = '-16', '-1.5', '11'
BOX_ATEMPO = os.environ.get('BOX_ATEMPO', '1.1')

VOICES = {'stretch': os.environ.get('VOICE', 'shimmer'), 'box': os.environ.get('BOX_VOICE', 'onyx')}

INSTR = {
    'stretch': (
        'You are a calm, soothing yoga and meditation instructor. Speak slowly and '
        'gently, with a warm, relaxed, unhurried tone. Let each word linger and pause '
        'briefly after every sentence. Never rush. {lang_hint}'
    ),
    'box': (
        'You are an energetic boxing coach calling the action ringside. Rapid-fire, '
        'clipped, confident delivery — short punchy words, no dramatic pauses, no '
        'trailing breath. Make every number land hard and keep it FAST. {lang_hint}'
    ),
}

LANG_HINT = {
    'en': 'Speak in English.',
    'it': 'Speak in Italian.',
    'es': 'Speak in Spanish.',
    'pt': 'Speak in Brazilian Portuguese.',
    'fr': 'Speak in French.',
}

NUMS = {
    'en': ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
           'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
           'eighteen', 'nineteen', 'twenty'],
    'it': ['uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
           'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette',
           'diciotto', 'diciannove', 'venti'],
    'es': ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
           'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
           'dieciocho', 'diecinueve', 'veinte'],
    'pt': ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
           'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete',
           'dezoito', 'dezenove', 'vinte'],
    'fr': ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
           'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept',
           'dix-huit', 'dix-neuf', 'vingt'],
}


def n(loc, i):  # spelled-out number, so TTS never guesses the language of a digit
    return NUMS[loc][i - 1]


def phrases(loc):
    """atom name -> (theme, text) for one locale."""
    set_word = {'en': 'Set', 'it': 'Serie', 'es': 'Serie', 'pt': 'Série', 'fr': 'Série'}[loc]
    # 'Raund' is a phonetic transliteration: read as Italian text it lands on
    # the gym pronunciation /'raund/, instead of the TTS switching to an
    # English accent mid-sentence. Display text elsewhere still says 'Round'.
    round_word = {'en': 'Round', 'it': 'Raund', 'es': 'Asalto', 'pt': 'Round', 'fr': 'Round'}[loc]
    p = {}

    # ---- stretch ----
    for i in range(1, 21):
        p[f'round_{i}'] = ('stretch', f'{set_word} {n(loc, i)}.')
    p['left_stretch'] = ('stretch', {
        'en': 'Left side. Stretch.', 'it': 'Lato sinistro. Allunga.',
        'es': 'Lado izquierdo. Estira.', 'pt': 'Lado esquerdo. Alonga.',
        'fr': 'Côté gauche. Étire.'}[loc])
    p['right_stretch'] = ('stretch', {
        'en': 'Right side. Stretch.', 'it': 'Lato destro. Allunga.',
        'es': 'Lado derecho. Estira.', 'pt': 'Lado direito. Alonga.',
        'fr': 'Côté droit. Étire.'}[loc])
    p['relax_switch'] = ('stretch', {
        'en': 'Relax. Switch.', 'it': 'Rilassa. Cambia lato.',
        'es': 'Relaja. Cambia de lado.', 'pt': 'Relaxa. Troca de lado.',
        'fr': 'Relâche. Change de côté.'}[loc])
    p['relax_next'] = ('stretch', {
        'en': 'Relax. Next stretch.', 'it': 'Rilassa. Prossimo esercizio.',
        'es': 'Relaja. Siguiente ejercicio.', 'pt': 'Relaxa. Próximo alongamento.',
        'fr': 'Relâche. Étirement suivant.'}[loc])
    p['rest'] = ('stretch', {
        'en': 'Rest.', 'it': 'Riposa.', 'es': 'Descansa.', 'pt': 'Descansa.',
        'fr': 'Repos.'}[loc])
    for i in range(1, 13):
        p[f'rest_stretch_{i}'] = ('stretch', {
            'en': f'Rest. Stretch {n(loc, i)}.', 'it': f'Riposa. Esercizio {n(loc, i)}.',
            'es': f'Descansa. Ejercicio {n(loc, i)}.', 'pt': f'Descansa. Alongamento {n(loc, i)}.',
            'fr': f'Repos. Étirement {n(loc, i)}.'}[loc])
    for i in range(1, 4):
        p[f'count_{i}'] = ('stretch', n(loc, i))
    p['done'] = ('stretch', {
        'en': 'All done. Great job.', 'it': 'Finito. Ottimo lavoro.',
        'es': 'Terminado. ¡Buen trabajo!', 'pt': 'Pronto. Ótimo trabalho.',
        'fr': 'Terminé. Beau travail.'}[loc])

    # ---- box ----
    for i in range(1, 13):
        p[f'box_round_{i}'] = ('box', f'{round_word} {n(loc, i)}.')
    p['box_work'] = ('box', {
        'en': 'Hands up. Box.', 'it': 'Guardia alta. Boxe!',
        'es': 'Manos arriba. ¡Boxea!', 'pt': 'Guarda alta. Boxe!',
        'fr': 'Garde haute. Boxe !'}[loc])
    p['box_rest'] = ('box', {
        'en': 'Time. Rest.', 'it': 'Tempo. Riposa.', 'es': 'Tiempo. Descansa.',
        'pt': 'Tempo. Descansa.', 'fr': 'Temps. Repos.'}[loc])
    combo = lambda *idx: ', '.join(n(loc, i) for i in idx).capitalize() + '.'
    p['box_combo_12'] = ('box', combo(1, 2))
    p['box_combo_123'] = ('box', combo(1, 2, 3))
    p['box_combo_112'] = ('box', combo(1, 1, 2))
    p['box_combo_232'] = ('box', combo(2, 3, 2))
    p['box_combo_32'] = ('box', combo(3, 2))
    p['box_combo_1232'] = ('box', combo(1, 2, 3, 2))
    p['box_combo_jabbody'] = ('box', {
        'en': 'Jab to the body, two.', 'it': 'Jab al corpo, due.',
        'es': 'Jab al cuerpo, dos.', 'pt': 'Jab no corpo, dois.',
        'fr': 'Jab au corps, deux.'}[loc])
    p['box_combo_slip'] = ('box', {
        'en': 'Slip, slip, back.', 'it': 'Schiva, schiva, indietro.',
        'es': 'Esquiva, esquiva, atrás.', 'pt': 'Esquiva, esquiva, volta.',
        'fr': 'Esquive, esquive, recule.'}[loc])
    p['box_combo_roll'] = ('box', {
        'en': 'Roll, roll.', 'it': 'Rolla, rolla.', 'es': 'Rueda, rueda.',
        'pt': 'Rola, rola.', 'fr': 'Roule, roule.'}[loc])
    p['box_combo_djab'] = ('box', {
        'en': 'Double jab.', 'it': 'Doppio jab.', 'es': 'Doble jab.',
        'pt': 'Jab duplo.', 'fr': 'Double jab.'}[loc])
    p['box_combo_hook'] = ('box', {
        'en': 'Hook, hook.', 'it': 'Gancio, gancio.', 'es': 'Gancho, gancho.',
        'pt': 'Gancho, gancho.', 'fr': 'Crochet, crochet.'}[loc])
    p['box_combo_12h'] = ('box', {
        'en': 'One, two, hook.', 'it': 'Uno, due, gancio.', 'es': 'Uno, dos, gancho.',
        'pt': 'Um, dois, gancho.', 'fr': 'Un, deux, crochet.'}[loc])
    for i in range(1, 4):
        p[f'box_count_{i}'] = ('box', n(loc, i))
    p['box_done'] = ('box', {
        'en': 'Time. Workout complete. Great work.',
        'it': 'Tempo! Allenamento completato. Grande lavoro.',
        'es': '¡Tiempo! Entrenamiento completado. Gran trabajo.',
        'pt': 'Tempo! Treino completo. Excelente trabalho.',
        'fr': 'Temps ! Entraînement terminé. Excellent travail.'}[loc])
    return p


def tts(text, voice, instructions, out_path, key):
    body = json.dumps({
        'model': MODEL, 'voice': voice, 'input': text,
        'instructions': instructions, 'response_format': 'mp3',
    }).encode()
    req = urllib.request.Request(
        'https://api.openai.com/v1/audio/speech', data=body,
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(out_path, 'wb') as f:
                f.write(data)
            return
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError(f'TTS failed ({e.code}): {e.read()[:200]}')


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def measure(mid):
    r = run(['ffmpeg', '-hide_banner', '-i', mid, '-af',
             f'loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json',
             '-f', 'null', '-'])
    raw = r.stderr
    return json.loads(raw[raw.rfind('{'):raw.rfind('}') + 1])


def trim_filter(threshold, theme):
    tempo = f',atempo={BOX_ATEMPO}' if theme == 'box' else ''
    return ('silenceremove=start_periods=1:start_threshold=' + threshold + 'dB,'
            'areverse,silenceremove=start_periods=1:start_threshold=' + threshold + 'dB,areverse,'
            'apad=pad_dur=0.05') + tempo


def post_process(path, theme):
    """trim silence -> (box: atempo) -> two-pass loudnorm -> mp3 128k.
    Very quiet single-word atoms (soft yoga counts) can be swallowed whole by
    the trim — retry with a gentler threshold, then give up trimming."""
    with tempfile.TemporaryDirectory() as td:
        mid = os.path.join(td, 'mid.wav')
        d = None
        for threshold in ('-45', '-60', None):
            pre = trim_filter(threshold, theme) if threshold else (
                f'atempo={BOX_ATEMPO}' if theme == 'box' else 'anull')
            r = run(['ffmpeg', '-y', '-v', 'error', '-i', path, '-af', pre, mid])
            if r.returncode:
                raise RuntimeError(f'trim failed: {r.stderr[:200]}')
            d = measure(mid)
            if d['input_i'] != '-inf':
                break
        if d['input_i'] == '-inf':
            raise RuntimeError(f'atom is silent: {path}')
        meas = (f"measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
                f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:"
                f"offset={d['target_offset']}")
        r = run(['ffmpeg', '-y', '-v', 'error', '-i', mid, '-af',
                 f'loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:{meas}:linear=true',
                 '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', path])
        if r.returncode:
            raise RuntimeError(f'loudnorm failed: {r.stderr[:200]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--locales', default='en,it,es,pt,fr')
    ap.add_argument('--themes', default='stretch,box')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        sys.exit('ERROR: set OPENAI_API_KEY')

    themes = set(args.themes.split(','))
    for loc in args.locales.split(','):
        out_dir = os.path.abspath(os.path.join(OUT_ROOT, loc))
        os.makedirs(out_dir, exist_ok=True)
        table = {k: v for k, v in phrases(loc).items() if v[0] in themes}
        print(f'▶ {loc}: {len(table)} atoms → {out_dir}')
        for name, (theme, text) in table.items():
            out = os.path.join(out_dir, f'{name}.mp3')
            if os.path.exists(out) and not args.force:
                continue
            print(f'  gen {loc}/{name:<20} [{theme}] {text}')
            tts(text, VOICES[theme], INSTR[theme].format(lang_hint=LANG_HINT[loc]), out, key)
            post_process(out, theme)
            time.sleep(0.15)
    print('Done.')


if __name__ == '__main__':
    main()
