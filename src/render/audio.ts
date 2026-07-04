export type SfxEvent =
  | 'shoot'
  | 'hit'
  | 'pickup'
  | 'levelup'
  | 'buy'
  | 'hurt'
  | 'death'
  | 'click'
  | 'win'
  | 'lose'
  | 'reroll';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let muted = localStorage.getItem('as_muted') === '1';
let musicOn = localStorage.getItem('as_music') !== '0';
let musicTimer: number | null = null;

const lastPlayed: Partial<Record<SfxEvent, number>> = {};
const THROTTLE: Partial<Record<SfxEvent, number>> = { hit: 35, shoot: 45, pickup: 50, death: 60 };

/** Must be called from a user gesture at least once (browser autoplay policy). */
export function ensureAudio(): void {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ac.destination);
  musicGain = ac.createGain();
  musicGain.gain.value = musicOn ? 0.14 : 0;
  musicGain.connect(master);
  startMusicLoop();
}

export function isMuted(): boolean {
  return muted;
}

export function isMusicOn(): boolean {
  return musicOn;
}

export function toggleMute(): void {
  muted = !muted;
  localStorage.setItem('as_muted', muted ? '1' : '0');
  if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.01);
}

export function toggleMusic(): void {
  musicOn = !musicOn;
  localStorage.setItem('as_music', musicOn ? '1' : '0');
  if (musicGain && ac) musicGain.gain.setTargetAtTime(musicOn ? 0.14 : 0, ac.currentTime, 0.05);
}

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  dur: number;
  vol?: number;
  delay?: number;
  dest?: AudioNode;
}

function tone({ freq, freqEnd, type = 'square', dur, vol = 0.12, delay = 0, dest }: ToneOpts): void {
  if (!ac || !master) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(dest ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
  if (!ac || !master) return;
  const t0 = ac.currentTime + delay;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  f.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export function playSfx(event: SfxEvent): void {
  if (!ac || muted) return;
  const now = performance.now();
  const th = THROTTLE[event];
  if (th) {
    const last = lastPlayed[event] ?? 0;
    if (now - last < th) return;
    lastPlayed[event] = now;
  }
  switch (event) {
    case 'shoot':
      tone({ freq: 720, freqEnd: 280, type: 'square', dur: 0.07, vol: 0.05 });
      break;
    case 'hit':
      noise(0.05, 0.09, 1800);
      break;
    case 'pickup':
      tone({ freq: 640, freqEnd: 1280, type: 'sine', dur: 0.09, vol: 0.1 });
      break;
    case 'levelup':
      tone({ freq: 523, type: 'triangle', dur: 0.12, vol: 0.18 });
      tone({ freq: 659, type: 'triangle', dur: 0.12, vol: 0.18, delay: 0.09 });
      tone({ freq: 784, type: 'triangle', dur: 0.2, vol: 0.18, delay: 0.18 });
      break;
    case 'buy':
      tone({ freq: 700, type: 'sine', dur: 0.08, vol: 0.16 });
      tone({ freq: 1050, type: 'sine', dur: 0.12, vol: 0.16, delay: 0.07 });
      break;
    case 'reroll':
      tone({ freq: 500, freqEnd: 900, type: 'triangle', dur: 0.1, vol: 0.12 });
      break;
    case 'hurt':
      tone({ freq: 300, freqEnd: 110, type: 'sawtooth', dur: 0.18, vol: 0.2 });
      noise(0.12, 0.1, 500);
      break;
    case 'death':
      noise(0.12, 0.08, 700);
      tone({ freq: 220, freqEnd: 60, type: 'triangle', dur: 0.15, vol: 0.08 });
      break;
    case 'click':
      tone({ freq: 900, type: 'sine', dur: 0.04, vol: 0.08 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.2, delay: i * 0.16 }));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.12, delay: i * 0.2 }));
      break;
  }
}

// ── background music: a soft minor arpeggio loop ─────────────
const BASS = [110, 110, 87.31, 98]; // A2 A2 F2 G2
const ARP = [220, 261.63, 329.63, 261.63, 220, 329.63, 392, 329.63]; // Am figure

function startMusicLoop(): void {
  if (!ac || musicTimer !== null) return;
  const barDur = 2.0; // seconds per bar
  let bar = 0;
  let nextBarTime = ac.currentTime + 0.1;

  const schedule = () => {
    if (!ac || !musicGain) return;
    // keep ~2 bars scheduled ahead
    while (nextBarTime < ac.currentTime + barDur * 2) {
      const t = nextBarTime;
      const bass = BASS[bar % BASS.length];
      tone({ freq: bass, type: 'triangle', dur: barDur * 0.9, vol: 0.5, delay: t - ac.currentTime, dest: musicGain });
      for (let i = 0; i < 8; i++) {
        const f = ARP[(i + (bar % 2) * 4) % ARP.length] * (bass / 110);
        tone({ freq: f, type: 'sine', dur: 0.22, vol: 0.3, delay: t - ac.currentTime + (i * barDur) / 8, dest: musicGain });
      }
      nextBarTime += barDur;
      bar++;
    }
  };
  schedule();
  musicTimer = window.setInterval(schedule, 500);
}
