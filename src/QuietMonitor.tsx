import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './quiet.css';
import { NOISE_WINDOW_MS, type Action, type GameState } from '../shared/game';
import { microphoneLevel, noiseProgress, quietStreakMs } from '../shared/noise';

interface Props {
  state: GameState;
  busy: boolean;
  connected: boolean;
  onAction: (action: Action) => void;
  settingsTarget?: HTMLElement | null;
}

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

  const outstanding = state.noiseLosses - state.restoredRounds;
  const protectedRound = state.round >= state.rounds && state.phase !== 'lobby';
  const paused = !connected || state.paused;
  const reacting = listening && grace > 0;
  const status = !listening ? (enabled ? 'Starting microphone…' : 'Mic off')
    : reacting ? `Reaction break · ${grace}s`
    : paused ? 'Meter paused'
    : state.phase === 'lobby' ? 'Mic preview'
    : protectedRound ? 'Final round protected'
    : state.phase === 'between' ? 'Between rounds' : 'Listening';

  function toggleMicrophone() {
    setError('');
    setEnabled(active => !active);
  }

  const settings = <fieldset className="quiet-settings">
    <legend>Microphone settings</legend>
    <label>
      <span>Top of thermometer <b>{loudDb} dBFS</b></span>
      <input type="range" min="-36" max="0" step="1" value={loudDb} aria-valuetext={loudDb + ' decibels full scale'} onChange={e => {
        const value = Number(e.target.value);
        setLoudDb(value);
        try { localStorage.setItem('quiet-loud-db', String(value)); } catch { /* Storage is optional. */ }
      }} />
      <small>Move right if ordinary chatter reaches the top too easily.</small>
    </label>
    <label>
      <span>Acceptable limit <b>{limit}%</b></span>
      <input type="range" min="10" max="90" step="1" value={limit} aria-valuetext={limit + ' percent'} onChange={e => {
        const value = Number(e.target.value);
        setLimit(value);
        try { localStorage.setItem('quiet-noise-limit', String(value)); } catch { /* Storage is optional. */ }
      }} />
      <small>Noise above this line builds toward losing one future round. A death roll gives the class five seconds to react.</small>
    </label>
    <p>Twenty quiet seconds earn back all missing rounds. Microphone audio stays on this device.</p>
    <button type="button" className="quiet-action" onClick={toggleMicrophone}>{enabled ? 'Stop microphone' : 'Start microphone'}</button>
  </fieldset>;

  return <section className="quiet-card" aria-label="Quiet Mode">
    <header className="quiet-header">
      <h2>Quiet Mode</h2>
      <span className={'quiet-status' + (reacting ? ' quiet-break' : listening && !paused ? ' quiet-live' : '')} role="status"><i aria-hidden="true" />{status}</span>
    </header>
    <div className="quiet-display">
      <div className={'quiet-thermometer' + (!listening ? ' quiet-off' : level > limit ? ' quiet-loud' : '')}
        role="meter" aria-label="Room noise" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}
        aria-valuetext={listening ? level + ' percent' : 'Microphone off'}>
        <div className="quiet-track"><div className="quiet-fill" style={{ height: level + '%' }} /></div>
        <div className="quiet-bulb" />
        <div className="quiet-marker" style={{ bottom: limit + '%' }} />
      </div>
      <div className="quiet-readings">
        <div className="quiet-reading">
          <span>Room noise</span>
          <strong className={level > limit ? 'quiet-above-limit' : ''}>{listening ? level : '—'}{listening && <small>%</small>}</strong>
        </div>
        <p className="quiet-limit"><i aria-hidden="true" />Acceptable limit <b>{limit}%</b></p>
        {!enabled && <button type="button" className="quiet-action" onClick={toggleMicrophone}>Start microphone</button>}
      </div>
    </div>
    {error && <p className="quiet-error" role="alert">{error}</p>}
    {listening && state.phase !== 'lobby' && <div className="quiet-progress">
      {!protectedRound && <label><span>Round-loss meter <b>{progress}%</b></span><progress value={progress} max={100} /></label>}
      {outstanding > 0 && <label><span>Earn back {outstanding} {outstanding === 1 ? 'round' : 'rounds'} <b>{quietSeconds} / 20s</b></span><progress value={quietSeconds} max={20} /></label>}
    </div>}
    {props.settingsTarget ? createPortal(settings, props.settingsTarget) :
      <details className="quiet-settings-disclosure"><summary>Microphone settings</summary>{settings}</details>}
  </section>;
}
