// Generates assets/sounds/alarm.wav: an urgent two-tone beeping pattern (~5 seconds).
// Run with: node scripts/make-alarm-sound.js
const fs = require('fs');
const path = require('path');

const rate = 22050;
const seconds = 5;
const samples = new Int16Array(rate * seconds);
for (let i = 0; i < samples.length; i++) {
  const t = i / rate;
  const cycle = t % 1; // one "beep-beep" per second
  const on = cycle < 0.18 || (cycle > 0.3 && cycle < 0.48);
  const freq = cycle < 0.25 ? 880 : 1175;
  // Short fade in/out on each beep to avoid clicks.
  const local = cycle < 0.25 ? cycle : cycle - 0.3;
  const len = 0.18;
  const env = on ? Math.min(1, local / 0.01, (len - local) / 0.01) : 0;
  const wave = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.6 + Math.sin(2 * Math.PI * freq * t) * 0.4;
  samples[i] = Math.round(Math.max(0, env) * wave * 0.8 * 32767);
}

const data = Buffer.from(samples.buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = path.join(__dirname, '..', 'assets', 'sounds', 'alarm.wav');
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`Wrote ${out}`);
