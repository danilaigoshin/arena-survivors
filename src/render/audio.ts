import { emitPresentationEvent } from '../multiplayer/presentationBus';
import { loadSettings } from '../core/settings';

export type SfxEvent =
  | 'shoot'
  | 'magic'
  | 'explosion'
  | 'heavy'
  | 'return'
  | 'fire'
  | 'ice'
  | 'summon'
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
let sfxGain: GainNode | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('as_muted') === '1';
let musicOn = typeof localStorage === 'undefined' || localStorage.getItem('as_music') !== '0';
let musicTimer: number | null = null;

const lastPlayed: Partial<Record<SfxEvent, number>> = {};
const THROTTLE: Partial<Record<SfxEvent, number>> = { hit: 35, shoot: 45, magic: 80, explosion: 90, heavy: 90, return: 80, fire: 70, ice: 90, summon: 120, pickup: 50, death: 60 };

/** Must be called from a user gesture at least once (browser autoplay policy). */
export function ensureAudio(): void {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = muted ? 0 : loadSettings().masterVolume;
  master.connect(ac.destination);
  sfxGain = ac.createGain();
  sfxGain.gain.value = loadSettings().sfxVolume;
  sfxGain.connect(master);
  musicGain = ac.createGain();
  musicGain.gain.value = musicOn ? loadSettings().musicVolume : 0;
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
  if (typeof localStorage !== 'undefined') localStorage.setItem('as_muted', muted ? '1' : '0');
  if (master && ac) master.gain.setTargetAtTime(muted ? 0 : loadSettings().masterVolume, ac.currentTime, 0.01);
}

export function toggleMusic(): void {
  musicOn = !musicOn;
  if (typeof localStorage !== 'undefined') localStorage.setItem('as_music', musicOn ? '1' : '0');
  if (musicGain && ac) musicGain.gain.setTargetAtTime(musicOn ? loadSettings().musicVolume : 0, ac.currentTime, 0.05);
}

/** Applies changed volume sliders without rebuilding the audio graph. */
export function syncAudioSettings(): void {
  if (!ac) return;
  const settings = loadSettings();
  master?.gain.setTargetAtTime(muted ? 0 : settings.masterVolume, ac.currentTime, 0.02);
  sfxGain?.gain.setTargetAtTime(settings.sfxVolume, ac.currentTime, 0.02);
  musicGain?.gain.setTargetAtTime(musicOn ? settings.musicVolume : 0, ac.currentTime, 0.05);
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
  if (!ac || !master || !sfxGain) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(dest ?? sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0, dest?: AudioNode): void {
  if (!ac || !master || !sfxGain) return;
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
  src.connect(f).connect(g).connect(dest ?? sfxGain);
  src.start(t0);
}

export function playSfx(event: SfxEvent): void {
  // UI feedback belongs to the local client. In particular, pause and modal
  // controls live inside RunScene, whose update is otherwise captured for the
  // host gameplay event stream.
  if (event !== 'click') emitPresentationEvent({ type: 'sfx', sound: event });
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
    case 'magic':
      tone({ freq: 980, freqEnd: 440, type: 'triangle', dur: 0.12, vol: 0.075 });
      tone({ freq: 1480, freqEnd: 720, type: 'sine', dur: 0.16, vol: 0.045, delay: 0.025 });
      break;
    case 'explosion':
      noise(0.16, 0.14, 420);
      tone({ freq: 150, freqEnd: 48, type: 'sawtooth', dur: 0.2, vol: 0.09 });
      break;
    case 'heavy':
      noise(0.1, 0.11, 260);
      tone({ freq: 190, freqEnd: 70, type: 'square', dur: 0.14, vol: 0.08 });
      break;
    case 'return':
      tone({ freq: 520, freqEnd: 980, type: 'sawtooth', dur: 0.11, vol: 0.055 });
      break;
    case 'fire':
      noise(0.1, 0.055, 1200);
      tone({ freq: 620, freqEnd: 210, type: 'triangle', dur: 0.14, vol: 0.06 });
      break;
    case 'ice':
      tone({ freq: 1320, freqEnd: 760, type: 'sine', dur: 0.18, vol: 0.07 });
      tone({ freq: 1760, freqEnd: 1100, type: 'triangle', dur: 0.12, vol: 0.035, delay: 0.02 });
      break;
    case 'summon':
      tone({ freq: 260, freqEnd: 720, type: 'sine', dur: 0.22, vol: 0.065 });
      tone({ freq: 390, freqEnd: 1040, type: 'triangle', dur: 0.18, vol: 0.04, delay: 0.04 });
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

// ── background music ─────────────────────────────────────────
// Procedural two-track engine: sectioned song structure, chord progressions,
// phrase-based lead, fat detuned voices, filter envelopes, delay/reverb sends,
// sidechain pump and a limiter. Everything is synthesized — no audio files.

export type MusicMode = 'calm' | 'combat';
let musicMode: MusicMode = 'calm';
let musicIntensity = 0.6;

/** Switched by the game loop: 'combat' while a run is active, 'calm' in menus/shop. */
export function setMusicMode(mode: MusicMode): void {
  musicMode = mode;
}

/** 0..1 — boss waves push it to 1: the break section is skipped, the bass filter opens. */
export function setMusicIntensity(v: number): void {
  musicIntensity = Math.max(0, Math.min(1, v));
}

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// chords as midi triads (root ~A2 area)
const AM = [45, 48, 52];
const F = [41, 45, 48];
const G = [43, 47, 50];
const C = [48, 52, 55];
const E = [40, 44, 47];

interface Section {
  bars: number;
  /** chord per bar */
  prog: number[][];
  drums: boolean;
  stabs: boolean;
  lead: boolean;
  arp: boolean;
  pad: boolean;
  roll: boolean;
}

const SEC_INTRO: Section = { bars: 4, prog: [AM, AM, AM, AM], drums: false, stabs: false, lead: false, arp: false, pad: false, roll: false };
const SEC_A: Section = { bars: 8, prog: [AM, AM, F, G, AM, AM, F, G], drums: true, stabs: true, lead: false, arp: false, pad: false, roll: false };
const SEC_BUILD: Section = { bars: 4, prog: [AM, AM, G, E], drums: true, stabs: true, lead: false, arp: true, pad: false, roll: true };
const SEC_B: Section = { bars: 8, prog: [AM, C, F, E, AM, C, F, E], drums: true, stabs: true, lead: true, arp: true, pad: false, roll: false };
const SEC_A2: Section = { bars: 8, prog: [AM, AM, F, G, AM, AM, F, G], drums: true, stabs: true, lead: true, arp: false, pad: false, roll: false };
const SEC_BREAK: Section = { bars: 4, prog: [F, F, G, G], drums: false, stabs: false, lead: false, arp: false, pad: true, roll: false };

const COMBAT_SONG = [SEC_INTRO, SEC_A, SEC_BUILD, SEC_B, SEC_A2, SEC_BREAK, SEC_B];
const COMBAT_LOOP_FROM = 1; // repeat from SEC_A, intro plays once

// lead phrases: 16 eighth-steps (2 bars), semitone offsets from the chord root, -1 = rest
const PHRASES = [
  [12, -1, -1, 15, -1, 12, 10, -1, 7, -1, 10, 12, -1, -1, -1, -1],
  [15, -1, 17, 15, -1, 12, -1, 10, 12, -1, -1, -1, -1, -1, 10, 7],
  [19, -1, 17, -1, 15, -1, 12, -1, 15, 17, 15, 12, 10, -1, -1, -1],
  [12, 15, 17, 19, -1, -1, 17, -1, 15, -1, 12, -1, -1, 10, 12, -1],
];

// bass riff: semitone offsets per eighth, relative to the chord root an octave down
const BASS_RIFF = [0, 0, 7, 0, 0, 0, 10, 12];

const COMBAT_BAR = 60 / 160 * 4; // 1.5s at 160 BPM
const CALM_BAR = 60 / 90 * 4; // ~2.67s at 90 BPM
const CALM_PROG = [AM, F, C, G];

interface MusicEngine {
  /** Schedule bars until `untilTime` (ctx time) for the given mode/intensity. */
  scheduleUntil(untilTime: number, mode: MusicMode, intensity: number): void;
}

/** Builds the full bus graph + voices on any AudioContext (live or offline). */
function createMusicEngine(ctx: BaseAudioContext, dest: AudioNode): MusicEngine {
  // ── buses: tonal → duck → bus; drums → bus; bus → limiter → dest ──
  const bus = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  bus.connect(limiter);
  limiter.connect(dest);

  const duck = ctx.createGain(); // sidechain pump for tonal voices
  duck.connect(bus);
  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(bus);

  // delay send (dotted-eighth echo) feeding back through a lowpass
  const delayIn = ctx.createGain();
  delayIn.gain.value = 0.8;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const delayLP = ctx.createBiquadFilter();
  delayLP.type = 'lowpass';
  delayLP.frequency.value = 2800;
  delayIn.connect(delay);
  delay.connect(delayLP);
  delayLP.connect(fb);
  fb.connect(delay);
  delayLP.connect(duck);

  // reverb send: generated 1.8s decaying-noise impulse
  const verb = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 1.8);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
  }
  verb.buffer = ir;
  const verbIn = ctx.createGain();
  verbIn.gain.value = 0.5;
  verbIn.connect(verb);
  verb.connect(duck);

  // shared noise buffer for all percussion
  const nbLen = Math.floor(ctx.sampleRate * 0.5);
  const nb = ctx.createBuffer(1, nbLen, ctx.sampleRate);
  const nbd = nb.getChannelData(0);
  for (let i = 0; i < nbLen; i++) nbd[i] = Math.random() * 2 - 1;

  const noiseHit = (t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, dst: AudioNode): void => {
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dst);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  };

  const kick = (t: number): void => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(drums);
    o.start(t);
    o.stop(t + 0.2);
    noiseHit(t, 0.012, 0.5, 3200, 'bandpass', drums); // click
    // sidechain pump on the tonal bus
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.4, t);
    duck.gain.linearRampToValueAtTime(1, t + 0.22);
  };

  const snare = (t: number, vol = 0.55): void => {
    noiseHit(t, 0.11, vol, 1900, 'bandpass', drums);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(drums);
    o.start(t);
    o.stop(t + 0.1);
    noiseHit(t, 0.3, vol * 0.25, 2400, 'bandpass', verbIn);
  };

  const hat = (t: number, open: boolean, vol: number): void => {
    noiseHit(t, open ? 0.12 : 0.03, vol, 8200, 'highpass', drums);
  };

  /** 3 detuned saws through a lowpass with a filter envelope — bass and stabs. */
  const fatSaw = (freq: number, t: number, dur: number, vol: number, cutoff: number): void => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(Math.max(120, cutoff * 0.25), t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.05, dur * 0.3));
    f.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff * 0.3), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g).connect(duck);
    for (const cents of [-12, 0, 12]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
  };

  /** Square+triangle pluck with a delay send — the lead voice. */
  const pluck = (freq: number, t: number, dur: number, vol: number, echo = 0.3): void => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(duck);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      g.connect(send);
      send.connect(delayIn);
    }
    for (const [type, mul, v] of [['square', 1, 1], ['triangle', 2, 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
  };

  /** Slow-attack detuned chord through the reverb — pads and breakdowns. */
  const pad = (chord: number[], t: number, dur: number, vol: number): void => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.5, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(verbIn);
    g.connect(duck);
    for (const m of chord) {
      for (const cents of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiHz(m + 12);
        o.detune.value = cents;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  };

  // ── combat bar ──
  const combatBar = (t: number, chord: number[], sec: Section, barInSec: number, globalBar: number, intensity: number): void => {
    const bar = COMBAT_BAR;
    const beat = bar / 4;
    const step = bar / 8;
    const root = chord[0];

    // drums
    if (sec.drums) {
      for (let b = 0; b < 4; b++) kick(t + b * beat);
      snare(t + beat);
      snare(t + beat * 3);
      for (let i = 0; i < 8; i++) hat(t + i * step, i === 7 && globalBar % 2 === 1, i % 2 === 1 ? 0.2 : 0.11);
      if (globalBar % 4 === 3 && !sec.roll) {
        snare(t + beat * 3.5, 0.32);
        snare(t + beat * 3.75, 0.4);
      }
    } else if (!sec.pad) {
      for (let i = 0; i < 8; i++) hat(t + i * step, false, 0.1); // intro: hats only
    }
    // build-up roll: 16ths rising across the section
    if (sec.roll) {
      const k = barInSec / sec.bars;
      for (let i = 0; i < 16; i++) snare(t + (i * bar) / 16, 0.1 + (k + i / 16) * 0.3);
    }

    // bass riff (always) — filter opens with intensity and in builds
    const cutoff = 500 + intensity * 1300 + (sec.roll ? (barInSec / sec.bars) * 900 : 0);
    for (let i = 0; i < 8; i++) {
      const off = BASS_RIFF[i];
      fatSaw(midiHz(root - 12 + off), t + i * step, step * 0.9, 0.42, cutoff);
    }

    // offbeat chord stabs
    if (sec.stabs) {
      for (const i of [1, 3, 5, 7]) {
        fatSaw(midiHz(root + 12), t + i * step, step * 0.45, 0.1, 2200);
        fatSaw(midiHz(root + 19), t + i * step, step * 0.45, 0.08, 2200);
      }
    }

    // 16th-note arp over chord tones
    if (sec.arp) {
      const patt = [0, 1, 2, 1];
      for (let i = 0; i < 16; i++) {
        const m = chord[patt[i % 4]] + 24;
        pluck(midiHz(m), t + (i * bar) / 16, bar / 16, 0.05, 0.15);
      }
    }

    // phrase-based lead: 2-bar question/answer phrases
    if (sec.lead) {
      const pairIdx = Math.floor(barInSec / 2);
      const phrase = PHRASES[pairIdx % PHRASES.length];
      const half = (barInSec % 2) * 8;
      for (let i = 0; i < 8; i++) {
        const iv = phrase[half + i];
        if (iv < 0) continue;
        pluck(midiHz(root + 12 + iv), t + i * step, step * 1.1, 0.14, 0.35);
      }
    }

    // breakdown pad
    if (sec.pad) pad(chord, t, bar * 1.02, 0.14);
  };

  // ── calm bar: pads + soft arp + occasional bell, no drums ──
  const calmBar = (t: number, globalBar: number): void => {
    const bar = CALM_BAR;
    const chord = CALM_PROG[globalBar % CALM_PROG.length];
    pad(chord, t, bar * 1.05, 0.12);
    fatSaw(midiHz(chord[0] - 12), t, bar * 0.9, 0.16, 700);
    const patt = [0, 2, 1, 2, 0, 1, 2, 1];
    for (let i = 0; i < 8; i++) {
      pluck(midiHz(chord[patt[i]] + 24), t + (i * bar) / 8, bar / 8, 0.06, 0.45);
    }
    if (globalBar % 4 === 2) {
      pluck(midiHz(chord[2] + 36), t + bar * 0.5, 1.2, 0.05, 0.6);
    }
  };

  // ── sequencer state ──
  let nextBarTime = -1;
  let songPos = 0;
  let barInSection = 0;
  let globalBar = 0;
  let prevMode: MusicMode | null = null;

  return {
    scheduleUntil(untilTime: number, mode: MusicMode, intensity: number): void {
      if (nextBarTime < 0) nextBarTime = ctx.currentTime + 0.08;
      if (prevMode !== mode) {
        // restart the song of the new mode
        songPos = 0;
        barInSection = 0;
        globalBar = 0;
        nextBarTime = Math.max(nextBarTime, ctx.currentTime + 0.08);
        prevMode = mode;
      }
      while (nextBarTime < untilTime) {
        if (mode === 'combat') {
          let sec = COMBAT_SONG[songPos];
          if (intensity >= 0.9 && sec === SEC_BREAK) sec = SEC_BUILD; // no breathers on boss waves
          combatBar(nextBarTime, sec.prog[barInSection % sec.prog.length], sec, barInSection, globalBar, intensity);
          nextBarTime += COMBAT_BAR;
          barInSection++;
          if (barInSection >= sec.bars) {
            barInSection = 0;
            songPos++;
            if (songPos >= COMBAT_SONG.length) songPos = COMBAT_LOOP_FROM;
          }
        } else {
          calmBar(nextBarTime, globalBar);
          nextBarTime += CALM_BAR;
        }
        globalBar++;
      }
    },
  };
}

let engine: MusicEngine | null = null;

function startMusicLoop(): void {
  if (!ac || !musicGain || musicTimer !== null) return;
  engine = createMusicEngine(ac, musicGain);
  const schedule = (): void => {
    if (!ac || !engine) return;
    engine.scheduleUntil(ac.currentTime + 2.4, musicMode, musicIntensity);
  };
  schedule();
  musicTimer = window.setInterval(schedule, 400);
}

/** Dev/test helper: render a few seconds of a track offline and report loudness stats. */
export async function renderMusicSample(seconds = 8, mode: MusicMode = 'combat'): Promise<{ rms: number; peak: number }> {
  const octx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
  const g = octx.createGain();
  g.gain.value = 0.14;
  g.connect(octx.destination);
  const eng = createMusicEngine(octx, g);
  eng.scheduleUntil(seconds + 1, mode, mode === 'combat' ? 1 : 0.6);
  const buf = await octx.startRendering();
  let peak = 0;
  let sum = 0;
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sum += d[i] * d[i];
  }
  return { rms: Math.sqrt(sum / d.length), peak };
}
