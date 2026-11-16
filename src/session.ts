import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, GameState } from '../shared/game';

export type Identity = { code: string; role: 'teacher' | 'student'; id: string };
type Snapshot = { state: GameState; online: string[] };
type Command = { id: string; timer: number };
const recentKey = 'greedy-pig:last-room';

export function rememberedRoom() {
  try { return localStorage.getItem(recentKey) || ''; } catch { return ''; }
}

export function rememberRoom(code: string) {
  try {
    if (code) localStorage.setItem(recentKey, code);
    else localStorage.removeItem(recentKey);
  } catch { /* The address bar still restores a room when storage is unavailable. */ }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function sessionRequest(path: string, body?: object): Promise<Identity> {
  const response = await fetch(path, {
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, data.message || 'Could not reach this room. Try again.');
  if (!/^\d{6}$/.test(data.code) || !['teacher', 'student'].includes(data.role) || typeof data.id !== 'string') {
    throw new Error('The game server returned an unexpected reply. Refresh and try again.');
  }
  return { code: data.code, role: data.role, id: data.id };
}

export function useRoomConnection(identity: Identity | null, onEnd: (message: string) => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<Command | null>(null);

  const release = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setBusy(false);
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setConnected(false);
    setError('');
    release();
    if (!identity) return;
    const { code } = identity;
    let stopped = false;
    let attempts = 0;
    let retryTimer = 0;
    let watchdog = 0;
    let heartbeat = 0;
    let lastHeard = 0;
    const path = '/api/rooms/' + code;
    const clearSocketTimers = () => { clearInterval(heartbeat); clearTimeout(watchdog); };

    async function connect() {
      if (stopped || socket.current) return;
      clearTimeout(retryTimer);
      if (attempts > 0) {
        try {
          await sessionRequest(path + '/session');
        } catch (err) {
          if (stopped) return;
          if (err instanceof HttpError && [401, 403, 404, 410].includes(err.status)) {
            onEnd(err.message);
          } else { scheduleRetry(); }
          return;
        }
      }
      if (stopped || socket.current) return;
      const url = new URL(path + '/socket', window.location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket.current = ws;
      lastHeard = Date.now();
      watchdog = window.setTimeout(() => ws.close(), 18000);
      ws.onmessage = (event) => {
        if (stopped || socket.current !== ws) return;
        lastHeard = Date.now();
        if (event.data === 'pong') return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { ws.close(); return; }
        if (msg.type === 'state') {
          clearTimeout(watchdog);
          attempts = 0;
          setSnapshot({ state: msg.state, online: msg.online });
          setConnected(true);
        } else if (msg.type === 'error' || msg.type === 'ack') {
          if (msg.type === 'error') setError(msg.message || 'The room could not accept that move.');
          if (pending.current?.id === msg.requestId) release();
        }
      };
      ws.onopen = () => {
        heartbeat = window.setInterval(() => {
          if (Date.now() - lastHeard > 65000) ws.close();
          else if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
      };
      ws.onclose = (event) => {
        if (stopped || socket.current !== ws) return;
        socket.current = null;
        clearSocketTimers();
        setConnected(false);
        if (pending.current) setError('Connection interrupted. Check the updated score before trying again.');
        release();
        if ([4003, 4004, 4009].includes(event.code)) {
          onEnd(({4003: 'Your teacher removed you from the room.', 4004: 'This room has expired.', 4009: 'Close another tab for this room, then try again.'})[event.code]!);
        } else { scheduleRetry(); }
      };
    }

    function scheduleRetry() {
      if (stopped) return;
      attempts++;
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, Math.min(12000, 600 * 2 ** Math.min(attempts, 5)) + Math.random() * 500);
    }
    const wake = () => {
      if (!socket.current) void connect();
      else if (socket.current.readyState === WebSocket.OPEN) {
        if (Date.now() - lastHeard > 65000) socket.current.close();
        else socket.current.send('ping');
      }
    };
    const visible = () => { if (document.visibilityState === 'visible') wake(); };
    void connect();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearSocketTimers();
      clearTimeout(retryTimer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', visible);
      socket.current?.close();
      socket.current = null;
      release();
    };
  }, [identity, onEnd, release]);

  function send(action: Action) {
    if (pending.current || !connected || socket.current?.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    setError('');
    setBusy(true);
    pending.current = { id, timer: window.setTimeout(() => {
      setError('Waiting for the server. Reconnecting to check your latest score.');
      socket.current?.close();
    }, 12000) };
    try { socket.current.send(JSON.stringify({ requestId: id, action })); }
    catch { socket.current.close(); }
  }
  return { snapshot, connected, busy, error, send };
}
