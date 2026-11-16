import { MAX_ROUNDS } from '../shared/game';
import { InvalidRequest, problem, readForm } from './http';
import { GameRoom } from './room';

export { GameRoom };

interface LimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<GameRoom>;
  CREATE_LIMIT: LimitBinding;
  ACCESS_LIMIT: LimitBinding;
}

function randomRoomCode(): string {
  const sample = new Uint32Array(1);
  const range = 900_000;
  const ceiling = Math.floor(0x1_0000_0000 / range) * range;
  do { crypto.getRandomValues(sample); } while (sample[0] >= ceiling);
  return String(100_000 + sample[0] % range);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  const create = url.pathname === '/api/rooms';
  const match = /^\/api\/rooms\/([0-9]{6})\/(join|session|socket)$/.exec(url.pathname);
  if (!create && !match) return problem(404, 'Check your six-digit room code.');
  const endpoint = create ? 'create' : match![2];
  const method = endpoint === 'create' || endpoint === 'join' ? 'POST' : 'GET';
  if (request.method !== method) return problem(405, 'This method is unavailable.');
  if (method === 'POST' || endpoint === 'socket') {
    if (request.headers.get('Origin') !== url.origin) return problem(403, 'Open the game on its original website.');
  }
  if (endpoint === 'socket' && request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return problem(426, 'A WebSocket connection is required.');
  }
  // Public writes and credentials travel over HTTPS. Wrangler uses local HTTP.
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return problem(403, 'Use the secure HTTPS game link.');
  }
  // Cloudflare sets CF-Connecting-IP at the edge. Shared school networks receive
  // a much larger access budget than the separate room-creation budget.
  const key = 'greedy-pig:' + (request.headers.get('CF-Connecting-IP') ?? 'local');
  const limiter = create ? env.CREATE_LIMIT : env.ACCESS_LIMIT;
  if (!(await limiter.limit({ key })).success) return problem(429, 'Too many requests. Try again in a minute.');

  if (create) {
    const form = await readForm(request);
    const rounds = form.rounds === undefined ? 5 : form.rounds;
    if (typeof rounds !== 'number' || !Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) {
      return problem(400, `Choose 1 to ${MAX_ROUNDS} rounds.`);
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomRoomCode();
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      // This internal route is never exposed by the public router.
      const result = await room.fetch(new URL(`/api/rooms/${code}/create`, url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rounds }),
      });
      if (result.status !== 409) return result;
      await result.body?.cancel();
    }
    return problem(503, 'Room creation is busy. Please try again.');
  }
  const room = env.ROOMS.get(env.ROOMS.idFromName(match![1]));
  return room.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof InvalidRequest) return problem(error.status, error.message);
      console.error('Game API request failed', error instanceof Error ? error.name : 'UnknownError');
      return problem(503, 'The game service is temporarily unavailable. Please reconnect.');
    }
  },
} satisfies ExportedHandler<Env>;
