import { getAudio, getMixBeat, usePlayer } from '@/state/player';
import { readAppearancePreferences, type AppearancePreferences } from '@/lib/appearance';

type CapturableAudio = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

let audioCtx: AudioContext | null = null;
let streamAnalyser: AnalyserNode | null = null;
let masterAnalyser: AnalyserNode | null = null;
let masterCtx: AudioContext | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;

const streamAttached = new WeakSet<HTMLAudioElement>();
const failedCapture = new WeakSet<HTMLAudioElement>();

let animFrame: number | null = null;
let currentEnergy = 0;
let prevBass = 0;
let rollingPeak = 0.35;
let silentFrames = 0;
let lastFrameAt = 0;

let cachedPrefs: AppearancePreferences = readAppearancePreferences();
let prefsSubscribed = false;

function ensurePrefsListener(): void {
  if (prefsSubscribed || typeof window === 'undefined') return;
  prefsSubscribed = true;
  cachedPrefs = readAppearancePreferences();
  window.addEventListener('mellow:appearance-changed', () => {
    cachedPrefs = readAppearancePreferences();
  });
}

function createAnalyser(ctx: AudioContext): AnalyserNode {
  const node = ctx.createAnalyser();
  node.fftSize = 256;
  node.smoothingTimeConstant = 0.62;
  return node;
}

/**
 * Taps the AutoMix master GainNode once the Web Audio graph is created.
 * Passive side-branch only; never alters playback routing or gains.
 */
export function attachAutomixMasterAnalyser(ctx: AudioContext, masterNode: AudioNode): void {
  try {
    masterCtx = ctx;
    const node = createAnalyser(ctx);
    masterNode.connect(node);
    masterAnalyser = node;
    dataArray = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
    silentFrames = 0;
  } catch {
    // Tempo-clock beat fallback stays active if Web Audio analysis is unavailable.
  }
}

/**
 * Safely taps an HTMLAudioElement using captureStream() when AutoMix is inactive.
 * Never claims createMediaElementSource(), leaving Deck/AutoMix free to attach later.
 */
export function attachAudioAnalyser(audio: HTMLAudioElement | null): void {
  if (!audio || masterAnalyser || streamAttached.has(audio) || failedCapture.has(audio)) return;
  if (audio.paused || audio.readyState < 2) return;

  const capturable = audio as CapturableAudio;
  const captureFn = capturable.captureStream ?? capturable.mozCaptureStream;
  if (typeof captureFn !== 'function') {
    failedCapture.add(audio);
    return;
  }

  try {
    const stream = captureFn.call(audio);
    if (!stream || stream.getAudioTracks().length === 0) return;

    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      failedCapture.add(audio);
      return;
    }

    const ctx = audioCtx ?? new AudioContextClass({ latencyHint: 'playback' });
    audioCtx = ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }

    const source = ctx.createMediaStreamSource(stream);
    const node = createAnalyser(ctx);
    source.connect(node);
    streamAnalyser = node;
    dataArray = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
    streamAttached.add(audio);
    silentFrames = 0;
  } catch {
    failedCapture.add(audio);
  }
}

function readRealAudioEnergy(): number | null {
  const analyser = masterAnalyser ?? streamAnalyser;
  const ctx = masterAnalyser ? masterCtx : audioCtx;
  if (!analyser || !dataArray) return null;

  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  analyser.getByteFrequencyData(dataArray);

  // Bins 0..5 capture sub-bass and kick drum impact (~0-550 Hz).
  let subBass = 0;
  for (let i = 0; i < 6; i++) {
    const weight = i <= 2 ? 1.35 : 0.85;
    subBass += (dataArray[i] ?? 0) * weight;
  }
  subBass /= 6 * 255 * 1.1;

  // Bins 6..18 capture snare/clap/synth punch.
  let punch = 0;
  for (let i = 6; i < 18; i++) {
    punch += dataArray[i] ?? 0;
  }
  punch /= 12 * 255;

  const combined = subBass * 0.78 + punch * 0.22;
  if (combined < 0.008) {
    silentFrames++;
    prevBass *= 0.8;
    return silentFrames > 24 ? null : 0;
  }

  silentFrames = 0;
  const transient = Math.max(0, subBass - prevBass) * 3.4;
  prevBass = prevBass * 0.65 + subBass * 0.35;
  rollingPeak = Math.max(rollingPeak * 0.996, combined + transient * 0.5, 0.18);
  return Math.min(1, (combined * 0.85 + transient) / rollingPeak);
}

function readRhythmFallbackEnergy(audio: HTMLAudioElement | null, now: number): number {
  const phase = getMixBeat()?.phase;
  let beatFraction: number;
  let barSwell: number;

  if (typeof phase === 'number' && Number.isFinite(phase)) {
    beatFraction = ((phase % 1) + 1) % 1;
    barSwell = 0.5 + 0.5 * Math.sin(phase * Math.PI * 0.5);
  } else {
    const t =
      audio && Number.isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : now / 1000;
    const beats = t * 2.1333; // ~128 BPM groove lock
    beatFraction = ((beats % 1) + 1) % 1;
    barSwell = 0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5);
  }

  const downbeatKick = Math.exp(-beatFraction * 5.2);
  const upbeatPop = Math.exp(-(((beatFraction + 0.5) % 1) * 7.2)) * 0.45;
  return Math.min(1, downbeatKick * 0.78 + upbeatPop + barSwell * 0.22);
}

function applyEnergy(energy: number, prefs: AppearancePreferences): void {
  const root = document.documentElement;
  const strength = Math.max(0, Math.min(100, prefs.musicBeatStrength ?? 75)) / 100;
  const lowPowerMod = prefs.lowResourceMode ? 0.55 : 1;
  const scaled = Math.min(1, Math.max(0, energy) * (0.45 + strength * 0.85) * lowPowerMod);

  const scale = 1 + scaled * 0.22;
  const cardScale = 1 + scaled * 0.026;
  const opacity = 0.9 + scaled * 0.72;
  const glow = 1 + scaled * 1.5;

  root.style.setProperty('--music-beat-energy', scaled.toFixed(3));
  root.style.setProperty('--music-beat-scale', scale.toFixed(4));
  root.style.setProperty('--music-beat-card-scale', cardScale.toFixed(4));
  root.style.setProperty('--music-beat-opacity', opacity.toFixed(3));
  root.style.setProperty('--music-beat-glow', glow.toFixed(3));
}

function resetBeatVars(): void {
  const root = document.documentElement;
  root.style.setProperty('--music-beat-energy', '0');
  root.style.setProperty('--music-beat-scale', '1');
  root.style.setProperty('--music-beat-card-scale', '1');
  root.style.setProperty('--music-beat-opacity', '1');
  root.style.setProperty('--music-beat-glow', '1');
}

function tick(now: number): void {
  const prefs = cachedPrefs;
  // Cap beat sync to ~30fps in Low Resource Mode to keep CPU/GPU headroom clear.
  const minDelta = prefs.lowResourceMode ? 32 : 14;
  if (now - lastFrameAt < minDelta) {
    animFrame = requestAnimationFrame(tick);
    return;
  }
  lastFrameAt = now;

  const state = usePlayer.getState();
  const isPlaying = state.status === 'playing' || state.status === 'buffering';

  if (!prefs.musicBeatSync || !isPlaying) {
    if (currentEnergy > 0.005) {
      currentEnergy *= 0.8;
      applyEnergy(currentEnergy, prefs);
      animFrame = requestAnimationFrame(tick);
      return;
    }
    currentEnergy = 0;
    resetBeatVars();
    animFrame = null;
    return;
  }

  const audio = getAudio();
  if (audio) attachAudioAnalyser(audio);

  const targetEnergy = readRealAudioEnergy() ?? readRhythmFallbackEnergy(audio, now);
  // Snap fast up on drum kicks, decay smoothly between beats.
  const smoothing = targetEnergy > currentEnergy ? 0.58 : 0.13;
  currentEnergy += (targetEnergy - currentEnergy) * smoothing;

  applyEnergy(currentEnergy, prefs);
  animFrame = requestAnimationFrame(tick);
}

export function startMusicBeatSync(): void {
  ensurePrefsListener();
  if (animFrame !== null) return;
  lastFrameAt = 0;
  animFrame = requestAnimationFrame(tick);
}

export function stopMusicBeatSync(): void {
  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  currentEnergy = 0;
  prevBass = 0;
  resetBeatVars();
}
