import { DurableObject } from 'cloudflare:workers';
import { addPlayer, applyAction, createGame, GameError, type Action, type GameState } from '../shared/game';
import { InvalidRequest, isRecord, json, problem, readForm } from './http';

const LIFETIME = 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'gp_session';
const OPEN = 1;

type Grant = { actor: string; revoked: number };
type SocketIdentity = { actor: string; expires: number };
type Ack = { socket: WebSocket; requestId: string };

async function fingerprint(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function mintCredential() {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(secret, byte => byte.toString(16).padStart(2, '0')).join('');
  return { token, digest: await fingerprint(token) };
}

function sessionInfo(code: string, id: string) {
  return { code, role: id === 'teacher' ? 'teacher' : 'student', id };
}

function actionFrom(input: unknown): Action {
  if (!isRecord(input) || typeof input.turn !== 'number' || !Number.isSafeInteger(input.turn) || input.turn < 0) {
    throw new InvalidRequest(400, 'Invalid game action.');
  }
  const { type, turn } = input;
  // Accept only the parameters belonging to this command.
  const fields = type === 'configure' ? ['rounds', 'deathNumber'] : type === 'remove' ? ['playerId'] : [];
  if (Object.keys(input).some(key => key !== 'type' && key !== 'turn' && !fields.includes(key))) {
    throw new InvalidRequest(400, 'Unexpected game action parameters.');
  }
  switch (type) {
    case 'start': case 'next': case 'roll': case 'pause': case 'resume': case 'finish': case 'bank':
      return { type, turn };
    case 'remove':
      if (typeof input.playerId === 'string' && input.playerId.length <= 64) return { type, turn, playerId: input.playerId };
      break;
    case 'configure':
      if (typeof input.rounds === 'number' && typeof input.deathNumber === 'number') {
        return { type, turn, rounds: input.rounds, deathNumber: input.deathNumber };
      }
  }
  throw new InvalidRequest(400, 'Unknown game action.');
}

/** Only the router holds this namespace. One named instance owns one room.
 * Commands read, validate and commit using synchronous SQLite operations with
 * no await in between, so the object event order decides every bank/roll race.
 */
export class GameRoom extends DurableObject<unknown> {
  private game: GameState | null = null;
  private expires = 0;
  private scheduled = false;
  private acks: Ack[] = [];
  private readonly bursts = new Map<string, { since: number; count: number }>();

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // Probes for a mistyped code must not create tables in an empty room.
    const sql = ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'room'").toArray().length) {
      const row = sql.exec<{ game: string; expires: number }>('SELECT game, expires FROM room WHERE id = 1').toArray()[0];
      if (row) {
        // Previous room snapshots always used 1 as the losing face.
        const saved = JSON.parse(row.game) as Omit<GameState, 'endReason'> & { endReason: GameState['endReason'] | 'one' };
        // Older snapshots retain only the current round. Preserve normal odds for games already past round one.
        const totalRolls = saved.totalRolls ?? (saved.round <= 1 ? saved.rolls.length : 2);
        this.game = { ...saved, totalRolls, deathNumber: saved.deathNumber ?? 1, endReason: saved.endReason === 'one' ? 'bust' : saved.endReason };
        this.expires = row.expires;
      }
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private liveGame(): GameState {
    if (!this.game || Date.now() >= this.expires) throw new InvalidRequest(404, 'This room has expired or does not exist.');
    return this.game;
  }

  private async grantFor(request: Request): Promise<Grant | null> {
    const token = request.headers.get('Cookie')?.split(';').map(part => part.trim())
      .find(part => part.startsWith(COOKIE_NAME + '='))?.slice(COOKIE_NAME.length + 1);
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const digest = await fingerprint(token);
    this.liveGame();
    const grant = this.ctx.storage.sql.exec<Grant>('SELECT actor, revoked FROM sessions WHERE digest = ?', digest).toArray()[0];
    if (grant?.revoked) throw new InvalidRequest(403, 'The teacher removed you from this room.');
    return grant ?? null;
  }

  private issued(request: Request, code: string, actor: string, token: string): Response {
    const secondsLeft = Math.max(0, Math.ceil((this.expires - Date.now()) / 1000));
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    const cookie = `${COOKIE_NAME}=${token}; Path=/api/rooms/${code}; Max-Age=${secondsLeft}; HttpOnly; SameSite=Strict${secure}`;
    return json(sessionInfo(code, actor), 201, cookie);
  }

  private async create(request: Request, code: string): Promise<Response> {
    const form = await readForm(request);
    const game = createGame(code, form.rounds as number);
    const secret = await mintCredential();
    // Establish the cleanup alarm before accepting a single user. An aborted
    // creation can leave only an alarm which deletes the empty instance.
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.game) return problem(409, 'This room code is already in use.');
      const expires = Date.now() + LIFETIME;
      await this.ctx.storage.setAlarm(expires);
      const sql = this.ctx.storage.sql;
      this.ctx.storage.transactionSync(() => {
        sql.exec('CREATE TABLE room (id INTEGER PRIMARY KEY CHECK(id = 1), game TEXT NOT NULL, expires INTEGER NOT NULL)');
        sql.exec('CREATE TABLE sessions (digest TEXT PRIMARY KEY, actor TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0)');
        sql.exec('CREATE TABLE receipts (actor TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY(actor, request_id)) WITHOUT ROWID');
        sql.exec('INSERT INTO room (id, game, expires) VALUES (1, ?, ?)', JSON.stringify(game), expires);
        sql.exec('INSERT INTO sessions (digest, actor) VALUES (?, ?)', secret.digest, 'teacher');
      });
      this.game = game;
      this.expires = expires;
      return this.issued(request, code, 'teacher', secret.token);
    });
  }

  private async join(request: Request, code: string, grant: Grant | null): Promise<Response> {
    if (grant) return json(sessionInfo(code, grant.actor));
    const form = await readForm(request);
    if (typeof form.name !== 'string') return problem(400, 'Enter a nickname.');
    const secret = await mintCredential();
    const actor = crypto.randomUUID();
    const next = addPlayer(this.liveGame(), actor, form.name);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO sessions (digest, actor) VALUES (?, ?)', secret.digest, actor);
      this.writeGame(next);
    });
    this.game = next;
    this.scheduleBroadcast();
    return this.issued(request, code, actor, secret.token);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const [, , , code, endpoint] = new URL(request.url).pathname.split('/');
      if (endpoint === 'create') return await this.create(request, code);
      this.liveGame();
      const grant = await this.grantFor(request);
      if (endpoint === 'join') return await this.join(request, code, grant);
      if (!grant) return problem(401, 'Join this room on this device first.');
      if (endpoint === 'socket') return this.openSocket(grant.actor);
      if (endpoint === 'session') return json(sessionInfo(code, grant.actor));
      return problem(404, 'Unknown room operation.');
    } catch (error) {
      if (error instanceof InvalidRequest || error instanceof GameError) return problem(error.status, error.message);
      throw error;
    }
  }

  private openSocket(actor: string): Response {
    const game = this.liveGame();
    if (actor !== 'teacher' && !game.players.some(player => player.id === actor)) {
      return problem(403, 'The teacher removed you from this room.');
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    if (this.ctx.getWebSockets(actor).filter(socket => socket.readyState === OPEN).length >= 3) {
      server.accept();
      server.close(4009, 'Close another game tab, then reload.');
    } else {
      this.ctx.acceptWebSocket(server, [actor]);
      server.serializeAttachment({ actor, expires: this.expires } satisfies SocketIdentity);
      this.send(server, this.currentSnapshot());
      this.scheduleBroadcast();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private writeGame(game: GameState) {
    this.ctx.storage.sql.exec('UPDATE room SET game = ? WHERE id = 1', JSON.stringify(game));
  }

  private currentSnapshot(sockets = this.ctx.getWebSockets()): string {
    const online = new Set<string>();
    for (const socket of sockets) {
      if (socket.readyState !== OPEN) continue;
      const { actor } = socket.deserializeAttachment() as SocketIdentity;
      if (actor !== 'teacher') online.add(actor);
    }
    return JSON.stringify({ type: 'state', state: this.game, online: [...online] });
  }

  private send(socket: WebSocket, payload: string) {
    if (socket.readyState !== OPEN) return;
    try { socket.send(payload); } catch { /* The transport can drop during delivery. */ }
  }

  private scheduleBroadcast(ack?: Ack) {
    if (ack) this.acks.push(ack);
    if (this.scheduled) return;
    this.scheduled = true;
    // Bursts of 100 joins/banks should cost one fan-out per frame. Keep this
    // short-lived task alive until all clients have received the newest state.
    this.ctx.waitUntil(new Promise<void>(resolve => setTimeout(() => {
      try {
        if (this.game && Date.now() < this.expires) {
          const sockets = this.ctx.getWebSockets();
          const snapshot = this.currentSnapshot(sockets);
          for (const socket of sockets) this.send(socket, snapshot);
          for (const { socket, requestId } of this.acks) this.send(socket, JSON.stringify({ type: 'ack', requestId }));
        }
      } finally {
        this.scheduled = false;
        this.acks = [];
        resolve();
      }
    }, 35)));
  }

  private withinRate(actor: string): boolean {
    const now = Date.now();
    let burst = this.bursts.get(actor);
    if (!burst || now - burst.since >= 10_000) {
      burst = { since: now, count: 0 };
      this.bursts.set(actor, burst);
    }
    return ++burst.count <= 32;
  }

  webSocketMessage(socket: WebSocket, payload: string | ArrayBuffer) {
    if (socket.readyState !== OPEN) return;
    const { actor, expires } = socket.deserializeAttachment() as SocketIdentity;
    if (!this.game || expires !== this.expires || Date.now() >= expires) {
      socket.close(4004, 'Room expired.');
      return;
    }
    if (actor !== 'teacher' && !this.game.players.some(player => player.id === actor)) {
      socket.close(4003, 'Removed by teacher.');
      return;
    }
    if (typeof payload !== 'string' || payload.length > 1024) {
      socket.close(1009, 'Send a small text command.');
      return;
    }
    if (!this.withinRate(actor)) {
      socket.close(1013, 'Too many commands. Reconnect shortly.');
      return;
    }
    let requestId: string | undefined;
    try {
      let message: unknown;
      try { message = JSON.parse(payload); } catch { throw new InvalidRequest(400, 'Invalid command format.'); }
      if (!isRecord(message) || typeof message.requestId !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(message.requestId)) {
        throw new InvalidRequest(400, 'A valid command ID is required.');
      }
      requestId = message.requestId;
      const action = actionFrom(message.action);
      const sql = this.ctx.storage.sql;
      const receipt = sql.exec('SELECT 1 FROM receipts WHERE actor = ? AND request_id = ?', actor, requestId).toArray()[0];
      if (receipt) {
        this.send(socket, this.currentSnapshot());
        this.send(socket, JSON.stringify({ type: 'ack', requestId }));
        return;
      }
      const next = applyAction(this.game, actor, action);
      this.ctx.storage.transactionSync(() => {
        this.writeGame(next);
        sql.exec('INSERT INTO receipts (actor, request_id) VALUES (?, ?)', actor, requestId);
        if (action.type === 'remove') sql.exec('UPDATE sessions SET revoked = 1 WHERE actor = ?', action.playerId);
      });
      this.game = next;
      if (action.type === 'remove') {
        for (const removed of this.ctx.getWebSockets(action.playerId)) {
          if (removed.readyState === OPEN) removed.close(4003, 'Removed by teacher.');
        }
        this.bursts.delete(action.playerId);
      }
      this.scheduleBroadcast({ socket, requestId });
    } catch (error) {
      const known = error instanceof GameError || error instanceof InvalidRequest;
      if (!known) console.error('Room command failed', error instanceof Error ? error.name : 'UnknownError');
      this.send(socket, JSON.stringify({ type: 'error', requestId, message: known ? error.message : 'The command could not be saved. Reconnect to check the board.' }));
    }
  }

  webSocketClose() { this.scheduleBroadcast(); }
  webSocketError(socket: WebSocket) {
    if (socket.readyState === OPEN) socket.close(1011, 'Connection interrupted.');
    this.scheduleBroadcast();
  }

  async alarm() {
    if (this.game && Date.now() < this.expires) {
      await this.ctx.storage.setAlarm(this.expires);
      return;
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const socket of this.ctx.getWebSockets()) {
        if (socket.readyState === OPEN) socket.close(4004, 'Room expired.');
      }
      await this.ctx.storage.deleteAll();
      this.game = null;
      this.expires = 0;
      this.bursts.clear();
    });
  }
}
