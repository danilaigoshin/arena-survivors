import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sampleRate = 44100;
const seconds = 18;
const channels = 2;
const frameCount = sampleRate * seconds;
const samples = new Float64Array(frameCount);
const tempo = 128;
const beat = 60 / tempo;

let noiseState = 0x5a17c9e3;
const noise = () => {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
};

const add = (time, duration, generator) => {
  const start = Math.max(0, Math.floor(time * sampleRate));
  const end = Math.min(frameCount, Math.ceil((time + duration) * sampleRate));
  for (let i = start; i < end; i++) {
    const local = (i - start) / sampleRate;
    samples[i] += generator(local, duration);
  }
};

const softSquare = (phase) => Math.tanh(Math.sin(phase) * 3.2) * 0.7;

const addKick = (time, gain = 0.7) => {
  add(time, 0.34, (t) => {
    const freq = 42 + 120 * Math.exp(-t * 24);
    return Math.sin(Math.PI * 2 * freq * t) * Math.exp(-t * 12) * gain;
  });
};

const addSnare = (time, gain = 0.34) => {
  add(time, 0.22, (t) => {
    const body = Math.sin(Math.PI * 2 * 185 * t) * Math.exp(-t * 17) * 0.32;
    const fizz = noise() * Math.exp(-t * 21);
    return (body + fizz) * gain;
  });
};

const addHat = (time, gain = 0.08) => {
  add(time, 0.055, (t) => noise() * Math.exp(-t * 70) * gain);
};

const bassNotes = [82.41, 82.41, 98, 110, 82.41, 123.47, 110, 98];
for (let step = 0; step < Math.ceil(seconds / beat); step++) {
  const time = step * beat;
  addKick(time, step % 8 === 0 ? 0.82 : 0.62);
  if (step % 2 === 1) addSnare(time);
  addHat(time);
  addHat(time + beat / 2, 0.055);
  const freq = bassNotes[step % bassNotes.length];
  add(time, beat * 0.88, (t, duration) => {
    const env = Math.min(1, t * 70) * Math.exp(-t / (duration * 0.68));
    return softSquare(Math.PI * 2 * freq * t) * env * 0.14;
  });
}

const arp = [329.63, 392, 493.88, 587.33, 493.88, 392, 329.63, 293.66];
const eighth = beat / 2;
for (let step = 0; step < Math.ceil(seconds / eighth); step++) {
  const time = step * eighth;
  const freq = arp[step % arp.length] * (step % 16 >= 8 ? 1.25 : 1);
  add(time, eighth * 0.8, (t, duration) => {
    const attack = Math.min(1, t * 90);
    const env = attack * Math.exp(-t / (duration * 0.42));
    const lead = softSquare(Math.PI * 2 * freq * t);
    const octave = Math.sin(Math.PI * 4 * freq * t) * 0.22;
    return (lead + octave) * env * 0.065;
  });
}

const transitions = [0, 2.13, 5.03, 8.77, 11.93, 15.1];
for (const time of transitions) {
  addKick(time, 1.05);
  add(time, 0.58, (t) => {
    const freq = 96 + t * 260;
    const phase = Math.PI * 2 * (96 * t + 130 * t * t);
    return (Math.sin(phase) * 0.16 + noise() * 0.1) * Math.exp(-t * 5.4);
  });
}

for (const time of [1.55, 4.4, 8.1, 11.25, 14.45]) {
  add(time, 0.7, (t, duration) => {
    const env = Math.sin(Math.PI * Math.min(1, t / duration));
    const rising = 420 + 2100 * (t / duration) ** 2;
    return Math.sin(Math.PI * 2 * rising * t) * env * 0.025;
  });
}

const pcm = Buffer.alloc(frameCount * channels * 2);
for (let i = 0; i < frameCount; i++) {
  const time = i / sampleRate;
  const intro = Math.min(1, time / 0.12);
  const outro = Math.min(1, (seconds - time) / 0.55);
  const mastered = Math.tanh(samples[i] * 1.34) * intro * Math.max(0, outro) * 0.84;
  const left = mastered * (0.98 + Math.sin(time * 2.1) * 0.02);
  const right = mastered * (0.98 - Math.sin(time * 2.1) * 0.02);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left)) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right)) * 32767), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * 2, 28);
header.writeUInt16LE(channels * 2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const output = resolve('docs/trailer-audio.wav');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, pcm]));
console.log(`Generated ${output} (${seconds}s, ${sampleRate}Hz stereo)`);
