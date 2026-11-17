import { useEffect, useRef, useState } from 'react';
import type { Action, GameState } from '../shared/game';
import { microphoneLevel, noiseProgress } from '../shared/noise';

type Props = { state: GameState; busy: boolean; connected: boolean; onAction: (action: Action) => void };

export function QuietMonitor(props: Props) {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const { state, connected } = props;

  useEffect(() => {
    setListening(false);
    setLevel(0);
    setProgress(0);
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
        let previous = performance.now();
        let losses = latest.current.state.noiseLosses;
        let retryAfter = 0;
        setListening(true);
        timer = window.setInterval(() => {
          const now = performance.now();
          const elapsed = now - previous;
          previous = now;
          const { state: game, connected, busy, onAction } = latest.current;
          if (losses !== game.noiseLosses) { losses = game.noiseLosses; fill = 0; }
          const receiving = !document.hidden && context?.state === 'running' && !track.muted && connected;
          if (receiving) analyser.getFloatTimeDomainData(data);
          const volume = receiving ? microphoneLevel(data) : 0;
          setLevel(Math.round(volume * 100));
          if (receiving && game.phase === 'playing' && !game.paused && game.round < game.rounds && elapsed < 1000) {
            fill = noiseProgress(fill, volume, elapsed);
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
    <p className="room-copy">Sustained noise fills the meter. A full meter removes one future round. Audio stays on this device.</p>
    <div className="room-actions"><button className="room-button room-minor" type="button" onClick={() => { setError(''); setEnabled(!enabled); }}>{enabled ? 'Stop microphone' : 'Start microphone'}</button><span>{enabled && !listening ? 'Waiting for microphone…' : status}</span></div>
    {error && <p className="room-error" role="alert">{error}</p>}
    <label>Room volume <meter min={0} max={100} value={level} /></label>
    <label>Round-loss meter · {progress}% <progress value={progress} max={100} /></label>
  </section>;
}
