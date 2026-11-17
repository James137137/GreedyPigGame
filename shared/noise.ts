import { NOISE_WINDOW_MS } from './game';

// Relative digital microphone level, independent of sound-pressure calibration.
export function microphoneLevel(samples: Float32Array): number {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const db = 10 * Math.log10(Math.max(1e-10, energy / samples.length));
  return Math.min(1, Math.max(0, (db + 60) / 48));
}

export function noiseProgress(previous: number, level: number, elapsedMs: number): number {
  // Below halfway, quiet drains the meter. Above halfway, louder fills it faster.
  return Math.min(1, Math.max(0, previous + (2 * level - 1) * elapsedMs / NOISE_WINDOW_MS));
}
