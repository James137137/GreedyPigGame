import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const TIMEOUT_MS = 60_000;

// These tools create rooms and concurrent traffic. Keep them local to Wrangler.
export function localOrigin(value = process.env.GAME_URL ?? 'http://127.0.0.1:8787') {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use the origin of a local Wrangler server, for example http://127.0.0.1:8787');
  }
  return url.origin;
}

export async function request(origin, path, { method = 'GET', body, cookie, browserOrigin = origin } = {}) {
  const headers = { Origin: browserOrigin };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(new URL(path, origin), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function sessionFrom(response) {
  if (!response.ok) throw new Error(`Room request failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  const cookie = response.headers.getSetCookie().map(header => header.split(';', 1)[0]).join('; ');
  if (!cookie) throw new Error('The server did not set a session cookie.');
  const { code, role, id } = await response.json();
  if (!/^\d{6}$/.test(code) || !['teacher', 'student'].includes(role) || !id) {
    throw new Error('Invalid session response.');
  }
  return { code, role, id, cookie };
}

export async function createRoom(origin, rounds = 5) {
  return sessionFrom(await request(origin, '/api/rooms', { method: 'POST', body: { rounds } }));
}

export async function joinRoom(origin, code, name) {
  return sessionFrom(await request(origin, `/api/rooms/${code}/join`, { method: 'POST', body: { name } }));
}

export function socketUrl(origin, code) {
  const url = new URL(`/api/rooms/${code}/socket`, origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
}

export class RoomClient {
  static async connect(origin, session) {
    const client = new RoomClient(origin, session);
    try {
      await client.waitFor(() => true, 'initial room state');
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  constructor(origin, session) {
    this.session = session;
    this.state = null;
    this.online = [];
    this.waiters = new Set();
    this.pending = new Map();
    this.socket = new WebSocket(socketUrl(origin, session.code), {
      origin,
      headers: { Cookie: session.cookie },
      handshakeTimeout: TIMEOUT_MS,
    });
    this.socket.on('message', data => {
      const text = data.toString();
      if (text === 'pong') return;
      try {
        this.receive(JSON.parse(text));
      } catch (error) {
        this.fail(error);
      }
    });
    this.socket.on('error', error => this.fail(error));
    this.socket.on('close', code => this.fail(new Error(`Room socket closed with code ${code}.`)));
  }

  receive(message) {
    if (message.type === 'state') {
      this.state = message.state;
      this.online = message.online;
      for (const waiter of this.waiters) {
        if (waiter.matches(this.state, this.online)) waiter.resolve(this.state);
      }
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (message.type === 'ack') pending?.resolve();
    if (message.type === 'error' && pending) pending.reject(new Error(message.message));
  }

  fail(error) {
    this.failure ??= error;
    for (const waiter of this.waiters) waiter.reject(error);
    for (const pending of this.pending.values()) pending.reject(error);
  }

  waitFor(matches, description) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.state && matches(this.state, this.online)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const clear = () => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
      };
      const waiter = {
        matches,
        resolve: state => { clear(); resolve(state); },
        reject: error => { clear(); reject(error); },
      };
      const timer = setTimeout(() => waiter.reject(new Error(`Timed out waiting for ${description}.`)), TIMEOUT_MS);
      this.waiters.add(waiter);
    });
  }

  sendAction(action, requestId = randomUUID()) {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const clear = () => {
        clearTimeout(timer);
        this.pending.delete(requestId);
      };
      const pending = {
        resolve: () => { clear(); resolve(); },
        reject: error => { clear(); reject(error); },
      };
      const timer = setTimeout(() => pending.reject(new Error(`No acknowledgement for ${action.type}.`)), TIMEOUT_MS);
      this.pending.set(requestId, pending);
      this.socket.send(JSON.stringify({ requestId, action }), error => {
        if (error) pending.reject(error);
      });
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => this.socket.terminate(), 1500);
      this.socket.once('close', () => { clearTimeout(timer); resolve(); });
      this.socket.close();
    });
  }
}

export async function teacherStep(client, type) {
  const turn = client.state.turn;
  await client.sendAction({ type, turn });
  return client.waitFor(state => state.turn > turn, type);
}

// A real die can bust on the first roll. Start the next round until the class
// has an actual pot to bank. The production application supplies every roll.
export async function reachPositivePot(teacher) {
  while (teacher.state.phase !== 'finished') {
    if (teacher.state.phase === 'lobby') await teacherStep(teacher, 'start');
    if (teacher.state.phase === 'between') await teacherStep(teacher, 'next');
    if (teacher.state.phase === 'playing') {
      if (teacher.state.pot > 0) return teacher.state;
      const state = await teacherStep(teacher, 'roll');
      if (state.phase === 'playing' && state.pot > 0) return state;
    }
  }
  throw new Error('Every available round began with the losing face. Rerun to exercise positive-pot banking.');
}
