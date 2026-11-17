import { useEffect, useRef, useState } from 'react';
import { NOISE_WINDOW_MS, type Action, type GameState } from '../shared/game';
import { microphoneLevel, noiseProgress, quietStreakMs } from '../shared/noise';

type Props = { state: GameState; busy: boolean; connected: boolean; onAction: (action: Action) => void };

export function QuietMonitor(props: Props) {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState(0);
  const [quietSeconds, setQuietSeconds] = useState(0);
  const [limit, setLimit] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('quiet-noise-limit'));
      if (saved >= 10 && saved <= 90) return saved;
    } catch { /* Storage is optional. */ }
    return 50;
  });
  const [loudDb, setLoudDb] = useState(() => {
    try {
      const saved = localStorage.getItem('quiet-loud-db');
      if (saved !== null && Number(saved) >= -36 && Number(saved) <= 0) return Number(saved);
    } catch { /* Storage is optional. */ }
    return -12;
  });
  const fullScale = useRef(loudDb);
  fullScale.current = loudDb;
  const threshold = useRef(limit);
  threshold.current = limit;
  const [grace, setGrace] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const { state, connected } = props;

  useEffect(() => {
    setListening(false);
    setLevel(0);
    setProgress(0);
    setQuietSeconds(0);
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let timer = 0;
    function stop() {
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    }
    function fail(message: string) {
      if (!cancelled) {
        setError(message);
        setEnabled(false);
      }
    }
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error();
        context = new AudioContext();
        await context.resume();
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false } });
        if (cancelled) { stop(); return; }
        const track = stream.getAudioTracks()[0];
        track.onended = () => fail('Microphone disconnected. Reconnect it and try again.');
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Float32Array(analyser.fftSize);
        let fill = 0;
        let quietMs = 0;
        let previous = performance.now();
        let losses = latest.current.state.noiseLosses;
        let retryAfter = 0;
        setListening(true);
        timer = window.setInterval(() => {
          const now = performance.now();
          const elapsed = now - previous;
          previous = now;
          const { state: game, connected, busy, onAction } = latest.current;
          if (losses !== game.noiseLosses) { losses = game.noiseLosses; fill = 0; quietMs = 0; }
          const receiving = !document.hidden && context?.state === 'running' && !track.muted && connected;
          if (receiving) analyser.getFloatTimeDomainData(data);
          const volume = receiving ? microphoneLevel(data, fullScale.current) : 0;
          setLevel(Math.round(volume * 100));
          const remaining = Math.max(0, game.graceUntil - Date.now());
          setGrace(Math.ceil(remaining / 1000));
          const missing = game.noiseLosses - game.restoredRounds;
          quietMs = receiving && game.phase === 'playing' && !game.paused && missing > 0
            ? quietStreakMs(quietMs, volume, elapsed, threshold.current / 100) : 0;
          setQuietSeconds(Math.floor(quietMs / 1000));
          if (quietMs >= NOISE_WINDOW_MS && !busy && now >= retryAfter) {
            retryAfter = now + 1500;
            onAction({ type: 'quietRestore', turn: game.turn, expectedLosses: losses });
          }
          if (!remaining && receiving && game.phase === 'playing' && !game.paused && game.round < game.rounds && elapsed < 1000) {
            fill = noiseProgress(fill, volume, elapsed, threshold.current / 100);
            if (fill >= 1 && !busy && now >= retryAfter) {
              retryAfter = now + 1500;
              onAction({ type: 'noisePenalty', turn: game.turn, expectedLosses: losses });
            }
          }
          setProgress(Math.floor(fill * 100));
        }, 200);
      } catch {
        fail('Microphone unavailable. Allow microphone access for this site and check the selected input.');
      }
    }
    void start();
    return () => { cancelled = true; stop(); };
  }, [enabled]);

  const status = !listening ? 'Monitoring off' : !connected || state.paused ? 'Meter paused' : state.phase === 'lobby' ? 'Mic preview' : state.round >= state.rounds ? 'Final round protected' : state.phase === 'between' ? 'Between rounds' : 'Listening';
  return <section className="room-box quiet-panel">
    <h2>Classroom noise</h2>
    <p className="room-copy">Sustained noise fills the meter. A full meter removes one future round. Stay quiet for 20 seconds to earn back all missing rounds. Audio stays on this device.</p>
    <div className="room-actions"><button className="room-button room-minor" type="button" onClick={() => { setError(''); setEnabled(!enabled); }}>{enabled ? 'Stop microphone' : 'Start microphone'}</button><span>{enabled && !listening ? 'Waiting for microphone…' : listening && grace > 0 ? `Reaction break · ${grace}s` : status}</span></div>
    {error && <p className="room-error" role="alert">{error}</p>}
    <div className="noise-gauge" role="meter" aria-label="Room volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} aria-valuetext={listening ? level + ' percent' : 'Microphone off'}>
      <div className="noise-glass" aria-hidden="true"><div className="noise-liquid" style={{height: level + '%'}} /></div>
      <div className="noise-scale" aria-hidden="true"><span>Loud</span><span className="noise-limit-mark" style={{bottom: limit + '%'}}>Limit {limit}%</span><span>Quiet</span></div>
      <div className="noise-reading"><small>Room volume</small><strong>{listening ? level + '%' : 'Off'}</strong></div>
    </div>
    <label>Top of thermometer (Loud) � {loudDb} dBFS<input type="range" min="-36" max="0" step="1" value={loudDb} onChange={e => {
      const value = Number(e.target.value);
      setLoudDb(value);
      try { localStorage.setItem('quiet-loud-db', String(value)); } catch { /* Keep the session preference. */ }
    }} /></label>
    <p className="room-copy">Move right if the thermometer reaches the top too easily. Move left if it barely rises.</p>
    <label>Acceptable noise limit · {limit}%<input type="range" min="10" max="90" step="1" value={limit} onChange={e => {
      const value = Number(e.target.value);
      setLimit(value);
      try { localStorage.setItem('quiet-noise-limit', String(value)); } catch { /* Keep the session preference. */ }
    }} /></label>
    <p className="room-copy">Move right to allow a louder room. After a death roll, the class gets five seconds to react.</p>
    <label>Round-loss meter · {progress}% <progress value={progress} max={100} /></label>
    {state.noiseLosses > state.restoredRounds && <label>Earn back {state.noiseLosses - state.restoredRounds} · {quietSeconds} / 20 quiet seconds <progress value={quietSeconds} max={20} /></label>}
  </section>;
}
