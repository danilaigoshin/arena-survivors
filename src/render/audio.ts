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

function noise(dur: number, vol: number, filterFreq: number, delay = 0, dest?: AudioNode): void {
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
  src.connect(f).connect(g).connect(dest ?? master);
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

// ── background music: two-mode loop — calm arpeggio in menus, driving action in combat ──
export type MusicMode = 'calm' | 'combat';
let musicMode: MusicMode = 'calm';

/** Switched by the game loop: 'combat' while a run is active, 'calm' in menus/shop. */
export function setMusicMode(mode: MusicMode): void {
  musicMode = mode;
}

const BASS = [110, 110, 87.31, 98]; // A2 A2 F2 G2
const ARP = [220, 261.63, 329.63, 261.63, 220, 329.63, 392, 329.63]; // Am figure

/** Soft menu loop (the original track). */
function calmBar(t: number, bar: number, barDur: number): void {
  if (!ac || !musicGain) return;
  const bass = BASS[bar % BASS.length];
  tone({ freq: bass, type: 'triangle', dur: barDur * 0.9, vol: 0.5, delay: t - ac.currentTime, dest: musicGain });
  for (let i = 0; i < 8; i++) {
    const f = ARP[(i + (bar % 2) * 4) % ARP.length] * (bass / 110);
    tone({ freq: f, type: 'sine', dur: 0.22, vol: 0.3, delay: t - ac.currentTime + (i * barDur) / 8, dest: musicGain });
  }
}

// action track: 150 BPM, four-on-the-floor kick, snare on 2 & 4, pumping saw bass, pentatonic lead
const COMBAT_BASS = [55, 55, 43.65, 49]; // A1 A1 F1 G1 per bar
const PENTA = [220, 261.63, 293.66, 329.63, 392, 440]; // A minor pentatonic
// 8th-note lead patterns (indices into PENTA, -1 = rest), rotated per bar
const RIFFS = [
  [0, -1, 3, 0, 4, -1, 3, 2],
  [0, 0, -1, 2, 3, -1, 5, 4],
  [4, -1, 3, 2, 0, -1, 2, 3],
  [5, 4, 3, -1, 2, 0, -1, 0],
];

function combatBar(t: number, bar: number, barDur: number): void {
  if (!ac || !musicGain) return;
  const now = ac.currentTime;
  const beat = barDur / 4;
  const step = barDur / 8;
  const bass = COMBAT_BASS[bar % COMBAT_BASS.length];

  // kick: four on the floor
  for (let b = 0; b < 4; b++) {
    tone({ freq: 150, freqEnd: 45, type: 'sine', dur: 0.13, vol: 1.0, delay: t - now + b * beat, dest: musicGain });
  }
  // snare on 2 and 4 (+ a quick fill at the end of every 4th bar)
  noise(0.09, 0.5, 1900, t - now + beat, musicGain);
  noise(0.09, 0.5, 1900, t - now + beat * 3, musicGain);
  if (bar % 4 === 3) {
    noise(0.05, 0.3, 2200, t - now + beat * 3.5, musicGain);
    noise(0.05, 0.35, 2400, t - now + beat * 3.75, musicGain);
  }
  // hats on eighths, offbeats louder
  for (let i = 0; i < 8; i++) {
    noise(0.03, i % 2 === 1 ? 0.16 : 0.09, 7000, t - now + i * step, musicGain);
  }
  // pumping bass: eighths with an octave jump on the last of each half
  for (let i = 0; i < 8; i++) {
    const f = bass * (i === 3 || i === 7 ? 2 : 1);
    tone({ freq: f, type: 'sawtooth', dur: step * 0.85, vol: 0.4, delay: t - now + i * step, dest: musicGain });
  }
  // lead riff, transposed with the bar's root
  const riff = RIFFS[bar % RIFFS.length];
  const k = bass / 55;
  for (let i = 0; i < 8; i++) {
    const n = riff[i];
    if (n < 0) continue;
    tone({ freq: PENTA[n] * k, type: 'square', dur: step * 0.8, vol: 0.16, delay: t - now + i * step, dest: musicGain });
  }
}

function startMusicLoop(): void {
  if (!ac || musicTimer !== null) return;
  let bar = 0;
  let nextBarTime = ac.currentTime + 0.1;

  const schedule = () => {
    if (!ac || !musicGain) return;
    // keep ~2 bars scheduled ahead; bar length depends on the current mode
    for (;;) {
      const barDur = musicMode === 'combat' ? 1.6 : 2.0;
      if (nextBarTime >= ac.currentTime + barDur * 2) break;
      if (musicMode === 'combat') combatBar(nextBarTime, bar, barDur);
      else calmBar(nextBarTime, bar, barDur);
      nextBarTime += barDur;
      bar++;
    }
  };
  schedule();
  musicTimer = window.setInterval(schedule, 400);
}
