// Synthesised noise-burst sound effects.
var AC = null, soundOn = true;

export function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) { } }
  return AC;
}
export function isSoundOn() { return soundOn; }
export function setSoundOn(v) { soundOn = !!v; }

function noise(dur, freq, gain, type) {
  if (!soundOn) return;
  try {
    var a = ac(); if (!a) return;
    var n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = a.createBufferSource(); s.buffer = b;
    var f = a.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    var g = a.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  } catch (e) { }
}
export function sfx(k) {
  if (k === 'boom') noise(0.55, 500, 0.7, 'lowpass');
  else if (k === 'shot') noise(0.09, 3000, 0.35, 'highpass');
  else if (k === 'big') noise(0.35, 1600, 0.5, 'lowpass');
  else if (k === 'hit') noise(0.06, 900, 0.3, 'lowpass');
}
