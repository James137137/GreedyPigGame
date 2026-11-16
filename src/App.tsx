import { useCallback, useEffect, useRef, useState } from 'react';
import { Brand, Landing } from './Landing';
import { Room } from './Room';
import { HttpError, rememberedRoom, rememberRoom, sessionRequest, useRoomConnection, type Identity } from './session';

const queryCode = new URLSearchParams(location.search).get('room') || '';
const firstCode = queryCode || rememberedRoom();
const canRestore = /^\d{6}$/.test(firstCode);

function NavIcon({ sound }: { sound?: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {sound === undefined ? <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.6 2.6 0 0 1 5 .9c0 2-2.5 2.3-2.5 4M12 17h.01"/></> :
      <><path d="M3 9h4l5-4v14l-5-4H3z" />{sound ? <path d="M16 8q4 4 0 8m3-11q7 7 0 14"/> : <path d="m16.5 9 5 6m0-6-5 6" />}</>}
  </svg>;
}

function Rules({ face, onClose }: { face: number; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = box.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={box} className="rules-dialog" onCancel={onClose} aria-labelledby="rules-title" onClick={event => { if (event.target === box.current) onClose(); }}>
    <div className="rules-inner">
      <h2 id="rules-title">How to play</h2>
      <ol>
        <li><strong>Join the room.</strong> Enter the teacher’s six-digit code or scan the QR code. Choose a classroom-friendly nickname.</li>
        <li><strong>Watch the rolls.</strong> The first two rolls of the game are always 2–6. Each safe roll adds its face value to the shared round pot.</li>
        <li><strong>Bank or keep playing.</strong> Press Bank to keep the current pot and sit out until next round. Your teacher decides when to roll again.</li>
        <li><strong>Watch out for {face}.</strong> The death number ends the round. Anyone still playing loses their unbanked points.</li>
      </ol>
      <p>The highest total wins. Players with equal scores share their rank.</p>
      <button type="button" className="shell-button" onClick={onClose} autoFocus>Got it</button>
    </div>
  </dialog>;
}

function soundPulse(ctx: AudioContext, frequency: number) {
  if (ctx.state !== 'running') return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.8, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.15);
}

export function App() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [initialCode, setInitialCode] = useState(queryCode);
  const [working, setWorking] = useState(canRestore);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const [retry, setRetry] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const enter = useCallback((session: Identity) => {
    rememberRoom(session.code);
    history.replaceState(null, '', '?room=' + session.code);
    setInitialCode(session.code);
    setIdentity(session);
    setError('');
    setRestoreFailed(false);
  }, []);
  const leave = useCallback((reason: string) => {
    rememberRoom('');
    history.replaceState(null, '', location.pathname);
    setIdentity(null);
    setInitialCode('');
    setWorking(false);
    setRestoreFailed(false);
    setError(reason);
  }, []);
  useEffect(() => {
    if (!canRestore) return;
    let cancelled = false;
    setWorking(true);
    setError('');
    sessionRequest('/api/rooms/' + firstCode + '/session').then(result => {
      if (!cancelled) enter(result);
    }).catch(err => {
      if (cancelled) return;
      if (err instanceof HttpError && [401, 403, 404, 410].includes(err.status)) {
        if (rememberedRoom() === firstCode) rememberRoom('');
        setRestoreFailed(false);
        if (err.status !== 401 && !queryCode) setError(err.message);
      } else {
        setError('Could not check your room. Check your connection and try again.');
        setRestoreFailed(true);
      }
    }).finally(() => { if (!cancelled) setWorking(false); });
    return () => { cancelled = true; };
  }, [enter, retry]);
  const live = useRoomConnection(identity, leave);
  const game = live.snapshot?.state;
  const rollKey = game && game.rolls.length ? [game.code, game.round, game.rolls.length].join('-') : '';
  const previousRoll = useRef('');
  useEffect(() => {
    if (sound && audio.current && rollKey && previousRoll.current !== rollKey && game) {
      soundPulse(audio.current, game.rolls.at(-1) === game.deathNumber ? 170 : 560);
    }
    previousRoll.current = rollKey;
  }, [rollKey, game, sound]);

  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      soundPulse(audio.current, 670);
      setSound(true);
    } catch { setError('Audio is unavailable in this browser.'); }
  }
  async function submit(path: string, body: object) {
    setWorking(true);
    setError('');
    try { enter(await sessionRequest(path, body)); }
    catch (err) { setError(err instanceof HttpError ? err.message : 'Could not reach the game. Check your connection and try again.'); }
    finally { setWorking(false); }
  }
  return <>
    <header className="site-header"><div className="header-inner">
      {identity ? <button type="button" className="brand-home" aria-label="Greedy Pig home" title="Return to the joining screen" onClick={() => leave('')}><Brand /></button> : <Brand />}
      <nav className="header-actions" aria-label="Game options">
        <button className="header-action" type="button" aria-label={sound ? 'Turn sound off' : 'Turn sound on'} aria-pressed={sound} onClick={() => void toggleSound()}><NavIcon sound={sound} /><span>Sound {sound ? 'on' : 'off'}</span></button>
        <button className="header-action" type="button" onClick={() => setHelp(true)}><NavIcon /><span>How to play</span></button>
      </nav>
    </div></header>
    {identity ? (live.snapshot ?
      <Room state={live.snapshot.state} online={live.snapshot.online} identity={identity} connected={live.connected}
        busy={live.busy} error={live.error || error} onAction={live.send} onNewRoom={() => leave('')} />
      : <main className="shell-width connecting-room"><h1>Connecting to room {identity.code}</h1><p role="status">Waiting for the live game board…</p><button className="header-action" onClick={() => leave('')}>Back to lobby</button></main>)
      : <>
        {restoreFailed && <div className="shell-width retry-room"><button type="button" className="header-action" disabled={working} onClick={() => setRetry(n => n + 1)}>Reconnect to room {firstCode}</button></div>}
        <Landing initialCode={initialCode} busy={working} error={error} onCreate={rounds => submit('/api/rooms', { rounds })}
          onJoin={(code, name) => submit('/api/rooms/' + code + '/join', { name })} />
      </>}
    {help && <Rules face={game?.deathNumber || 1} onClose={() => setHelp(false)} />}
  </>;
}
