'use client';

/**
 * Efeitos sonoros sintetizados via WebAudio — zero assets, zero rede.
 * O AudioContext só é criado após interação do usuário (política dos browsers).
 */

let ctx: AudioContext | null = null;
let muted = false;

if (typeof window !== 'undefined') {
  muted = localStorage.getItem('truco-muted') === '1';
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem('truco-muted', value ? '1' : '0');
  } catch {
    /* storage indisponível */
  }
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Tom simples com envelope de decaimento. */
function tone(opts: {
  freq: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  when?: number;
  slideTo?: number;
}) {
  const audio = ac();
  if (!audio || muted) return;
  const { freq, dur = 0.15, type = 'sine', vol = 0.18, when = 0, slideTo } = opts;
  const t0 = audio.currentTime + when;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Estalo de carta: rajada curta de ruído filtrado. */
function snap(when = 0, vol = 0.25) {
  const audio = ac();
  if (!audio || muted) return;
  const t0 = audio.currentTime + when;
  const dur = 0.07;
  const buffer = audio.createBuffer(1, audio.sampleRate * dur, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.8;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(vol, t0);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(t0);
}

export const sfx = {
  /** Carta batendo na mesa. */
  card() {
    snap(0, 0.3);
    tone({ freq: 180, dur: 0.06, type: 'triangle', vol: 0.1 });
  },

  /** Distribuição: três estalos em sequência + vira. */
  deal() {
    snap(0, 0.18);
    snap(0.12, 0.18);
    snap(0.24, 0.18);
    tone({ freq: 520, dur: 0.18, type: 'triangle', vol: 0.1, when: 0.45, slideTo: 780 });
  },

  /** Sua vez: ding discreto. */
  turn() {
    tone({ freq: 880, dur: 0.12, type: 'sine', vol: 0.12 });
    tone({ freq: 1320, dur: 0.18, type: 'sine', vol: 0.07, when: 0.07 });
  },

  /** TRUCO! Buzina agressiva de dois tons. */
  truco() {
    tone({ freq: 196, dur: 0.22, type: 'sawtooth', vol: 0.16 });
    tone({ freq: 247, dur: 0.3, type: 'sawtooth', vol: 0.16, when: 0.16 });
    tone({ freq: 392, dur: 0.25, type: 'square', vol: 0.06, when: 0.16 });
  },

  /** Aposta aceita. */
  accept() {
    tone({ freq: 523, dur: 0.1, type: 'triangle', vol: 0.14 });
    tone({ freq: 784, dur: 0.16, type: 'triangle', vol: 0.14, when: 0.09 });
  },

  /** Correram: deslize descendente. */
  run() {
    tone({ freq: 600, dur: 0.35, type: 'sine', vol: 0.14, slideTo: 200 });
  },

  /** Vitória: arpejo maior. */
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.16, when: i * 0.12 }));
  },

  /** Derrota: descida menor. */
  lose() {
    const notes = [440, 392, 311, 262];
    notes.forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'sine', vol: 0.12, when: i * 0.14 }));
  },

  /** Mensagem de chat. */
  chat() {
    tone({ freq: 660, dur: 0.07, type: 'sine', vol: 0.08, slideTo: 880 });
  },

  /** Emoji na mesa. */
  pop() {
    tone({ freq: 300, dur: 0.09, type: 'triangle', vol: 0.12, slideTo: 600 });
  },
};
