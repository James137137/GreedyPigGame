import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import WebSocket from 'ws';
import {
  createRoom, joinRoom, localOrigin, reachPositivePot, request, RoomClient, socketUrl, teacherStep,
} from '../scripts/local-client.mjs';

const origin = localOrigin();

async function rejectedUpgrade(code, options) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl(origin, code), { handshakeTimeout: 10_000, ...options });
    socket.on('error', reject);
    socket.once('unexpected-response', (_request, response) => {
      const status = response.statusCode;
      response.resume();
      socket.terminate();
      resolve(status);
    });
    socket.once('open', () => {
      socket.terminate();
      reject(new Error('Server accepted an unauthorised socket.'));
    });
  });
}

test('HTTP validation, identity, atomic commands and recovery on the local Worker', { timeout: 150_000 }, async t => {
  const clients = [];
  t.after(() => Promise.all(clients.map(client => client.close())));
  async function connect(session) {
    const client = await RoomClient.connect(origin, session);
    clients.push(client);
    return client;
  }

  await t.test('invalid room codes, round counts and cross-origin requests are refused', async () => {
    const invalidCode = await request(origin, '/api/rooms/abc/session');
    assert.ok([400, 404].includes(invalidCode.status), `invalid code returned ${invalidCode.status}`);
    const invalidRounds = await request(origin, '/api/rooms', { method: 'POST', body: { rounds: 0 } });
    assert.equal(invalidRounds.status, 400);
    const otherOrigin = await request(origin, '/api/rooms', {
      method: 'POST', body: { rounds: 5 }, browserOrigin: 'https://other.example',
    });
    assert.equal(otherOrigin.status, 403);
  });

  const host = await createRoom(origin, 20);
  const path = `/api/rooms/${host.code}/session`;
  const teacher = await connect(host);
  await t.test('a blocked nickname cannot enter the classroom roster', async () => {
    const blocked = await request(origin, `/api/rooms/${host.code}/join`, {
      method: 'POST', body: { name: 'f.u.c.k' },
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.headers.getSetCookie().length, 0);
    const observer = await connect(host);
    assert.equal(observer.state.players.length, 0);
    await observer.close();
  });
  const alice = await joinRoom(origin, host.code, 'Alice');
  const bob = await joinRoom(origin, host.code, 'Bob');
  const cam = await joinRoom(origin, host.code, 'Cam');
  let aliceClient = await connect(alice);
  const bobClient = await connect(bob);
  const camClient = await connect(cam);
  const roster = await teacher.waitFor((s, online) => s.players.length >= 3 && online.includes(cam.id), 'student roster');
  assert.deepEqual(roster.players.map(p => p.name).sort(), ['Alice', 'Bob', 'Cam']);

  await t.test('teacher and student sessions are distinct and the room code alone grants no access', async () => {
    assert.equal((await request(origin, path)).status, 401);
    assert.equal((await (await request(origin, path, { cookie: host.cookie })).json()).role, 'teacher');
    const restored = await (await request(origin, path, { cookie: alice.cookie })).json();
    assert.equal(restored.id, alice.id);
    assert.equal(restored.role, 'student');
    assert.equal(await rejectedUpgrade(host.code, { origin }), 401);
    assert.equal(await rejectedUpgrade(host.code, { origin: 'https://other.example', headers: { Cookie: host.cookie } }), 403);
    await assert.rejects(aliceClient.sendAction({ type: 'start', turn: teacher.state.turn }));
    assert.equal(teacher.state.phase, 'lobby');
  });

  await t.test('only the teacher can configure the lobby and every player sees the new rules', async () => {
    assert.equal(teacher.state.deathNumber, 1);
    const action = { type: 'configure', rounds: 18, deathNumber: 6, turn: teacher.state.turn };
    await assert.rejects(aliceClient.sendAction(action));
    await teacher.sendAction(action);
    await Promise.all([teacher, aliceClient, bobClient, camClient].map(client =>
      client.waitFor(s => s.rounds === 18 && s.deathNumber === 6, 'lobby configuration')));
  });

  const playable = await reachPositivePot(teacher);
  const pot = playable.pot;
  await t.test('pause blocks teaching and banking commands, then resume enables banking', async () => {
    await assert.rejects(teacher.sendAction({ type: 'configure', rounds: 18, deathNumber: 5, turn: teacher.state.turn }));
    const paused = await teacherStep(teacher, 'pause');
    assert.equal(paused.paused, true);
    await assert.rejects(teacher.sendAction({ type: 'roll', turn: paused.turn }));
    await assert.rejects(aliceClient.sendAction({ type: 'bank', turn: paused.turn }));
    assert.equal((await teacherStep(teacher, 'resume')).paused, false);
    await assert.rejects(aliceClient.sendAction({ type: 'roll', turn: teacher.state.turn }));
  });

  await t.test('a student banks once, repeated delivery cannot change their score, and a fresh socket restores the result', async () => {
    const action = { type: 'bank', turn: teacher.state.turn };
    const requestId = randomUUID();
    await aliceClient.sendAction(action, requestId);
    await teacher.waitFor(s => s.players.find(p => p.id === alice.id)?.status === 'banked', 'Alice banked');
    // Servers may replay the acknowledgement or explicitly decline an already processed ID.
    await Promise.allSettled([aliceClient.sendAction(action, requestId)]);
    await assert.rejects(aliceClient.sendAction(action));
    await aliceClient.close();
    await teacher.waitFor((_s, online) => !online.includes(alice.id), 'disconnect presence');
    aliceClient = await connect(alice);
    const player = aliceClient.state.players.find(p => p.id === alice.id);
    assert.equal(aliceClient.state.deathNumber, 6);
    assert.equal(player.score, pot);
    assert.equal(player.status, 'banked');
    assert.equal(aliceClient.state.players.length, 3);
    await assert.rejects(aliceClient.sendAction({ type: 'remove', playerId: bob.id, turn: teacher.state.turn }));
  });

  await t.test('a racing bank and dice roll follow one server order across every client', async () => {
    const turn = teacher.state.turn;
    const [bank, roll] = await Promise.allSettled([
      bobClient.sendAction({ type: 'bank', turn }),
      teacher.sendAction({ type: 'roll', turn }),
    ]);
    assert.equal(roll.status, 'fulfilled', roll.reason?.message);
    const states = await Promise.all([teacher, aliceClient, bobClient, camClient].map(
      client => client.waitFor(s => s.turn > turn, 'racing roll'),
    ));
    for (const state of states) {
      const bobScore = state.players.find(p => p.id === bob.id).score;
      assert.equal(bobScore, bank.status === 'fulfilled' ? pot : 0);
      assert.equal(state.players.find(p => p.id === alice.id).score, pot);
      assert.deepEqual(state.players, states[0].players);
    }
    await assert.rejects(bobClient.sendAction({ type: 'bank', turn }));
  });

  await t.test('teacher reconnect retains control and removing a student revokes their session', async () => {
    await teacher.close();
    const reconnected = await connect(host);
    await reconnected.sendAction({ type: 'remove', playerId: cam.id, turn: reconnected.state.turn });
    await reconnected.waitFor(s => s.players.every(p => p.id !== cam.id), 'student removal');
    assert.equal((await request(origin, path, { cookie: cam.cookie })).status, 403);
    assert.equal(await rejectedUpgrade(host.code, { origin, headers: { Cookie: cam.cookie } }), 403);
    await teacherStep(reconnected, 'finish');
    const final = await aliceClient.waitFor(s => s.phase === 'finished', 'final ranking');
    assert.equal(final.players.find(p => p.id === alice.id).score, pot);
  });
});

test('SQLite and session receipts survive forced Durable Object hibernation', { timeout: 120_000 }, async () => {
  const { createTestHarness } = await import('wrangler');
  const harness = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  const clients = [];
  try {
    const { url } = await harness.listen();
    const isolated = localOrigin(url.origin);
    const host = await createRoom(isolated, 5);
    const teacher = await RoomClient.connect(isolated, host);
    clients.push(teacher);
    const learner = await joinRoom(isolated, host.code, 'Aroha');
    const student = await RoomClient.connect(isolated, learner);
    clients.push(student);
    await teacher.sendAction({ type: 'configure', rounds: 20, deathNumber: 2, turn: teacher.state.turn });
    await teacher.waitFor(s => s.rounds === 20 && s.deathNumber === 2, 'custom rules');
    const playable = await reachPositivePot(teacher);
    const action = { type: 'bank', turn: playable.turn };
    const bankId = randomUUID();
    await student.sendAction(action, bankId);
    await teacher.waitFor(s => s.phase === 'between', 'bank completed');

    // Reset the object's in-memory instance using the Wrangler test runtime.
    // Existing hibernating sockets and local SQLite storage remain available.
    await harness.getWorker().evictDurableObject('GameRoom', { name: host.code, webSockets: 'hibernate' });
    await student.sendAction(action, bankId);
    assert.equal((await request(isolated, `/api/rooms/${host.code}/session`, { cookie: host.cookie })).status, 200);
    const freshStudent = await RoomClient.connect(isolated, learner);
    clients.push(freshStudent);
    assert.equal(freshStudent.state.deathNumber, 2);
    assert.equal(freshStudent.state.rounds, 20);
    assert.equal(freshStudent.state.phase, 'between');
    assert.equal(freshStudent.state.players.find(player => player.id === learner.id).score, playable.pot);
    const after = await teacherStep(teacher, 'next');
    assert.equal(after.round, playable.round + 1);
  } finally {
    await Promise.allSettled(clients.map(client => client.close()));
    await harness.close();
  }
});
test('auto-roll starts the next round and rolls while the teacher is disconnected', { timeout: 60000 }, async () => {
  const { createTestHarness } = await import('wrangler');
  const harness = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  const clients = [];
  try {
    const { url } = await harness.listen();
    const base = localOrigin(url.origin);
    const host = await createRoom(base, 2);
    const teacher = await RoomClient.connect(base, host);
    clients.push(teacher);
    const student = await RoomClient.connect(base, await joinRoom(base, host.code, 'Maia'));
    clients.push(student);
    await teacher.sendAction({ type: 'autoRoll', enabled: true, turn: teacher.state.turn });
    await teacherStep(teacher, 'start');
    const started = await student.waitFor(s => s.nextRollAt !== null, 'first countdown');
    await teacher.close();
    const roll = await student.waitFor(s => s.totalRolls === 1, 'automatic roll');
    assert.ok(roll.nextRollAt >= started.nextRollAt + 5000);
    await student.sendAction({ type: 'bank', turn: student.state.turn });
    assert.equal(student.state.phase, 'between');
    const nextRound = await student.waitFor(s => s.round === 2, 'automatic round start');
    assert.equal(nextRound.pot, 0);
    await student.waitFor(s => s.totalRolls === 2, 'next round automatic roll');
    await student.sendAction({ type: 'bank', turn: student.state.turn });
    assert.equal(student.state.phase, 'finished');
    assert.equal(student.state.nextRollAt, null);
  } finally {
    await Promise.allSettled(clients.map(client => client.close()));
    await harness.close();
  }
});
