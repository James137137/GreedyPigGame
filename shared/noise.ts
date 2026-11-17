import { NOISE_WINDOW_MS } from './game';

// Relative digital microphone level, independent of sound-pressure calibration.
export function microphoneLevel(samples: Float32Array, loudDb = -12): number {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const db = 10 * Math.log10(Math.max(1e-10, energy / samples.length));
  return Math.min(1, Math.max(0, (db + 60) / (loudDb + 60)));
}

export function quietStreakMs(previous: number, level: number, elapsedMs: number, limit = 0.5): number {
  if (level > limit || elapsedMs >= 1000) return 0;
  return Math.min(NOISE_WINDOW_MS, previous + elapsedMs);
}

export function noiseProgress(previous: number, level: number, elapsedMs: number, limit = 0.5): number {
  const rate = (level - limit) / (level > limit ? 1 - limit : limit);
  return Math.min(1, Math.max(0, previous + rate * elapsedMs / NOISE_WINDOW_MS));
}
