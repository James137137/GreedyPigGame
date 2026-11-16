import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createRoom, joinRoom, localOrigin, reachPositivePot, RoomClient, teacherStep } from './local-client.mjs';

const { values } = parseArgs({
  options: { url: { type: 'string' }, students: { type: 'string', default: '100' } },
});
const origin = localOrigin(values.url);
const count = Number(values.students);
if (!Number.isInteger(count) || count < 2 || count > 100) throw new Error('--students must be 2–100.');

const students = [];
let teacher;
const started = performance.now();
const elapsed = () => ((performance.now() - started) / 1000).toFixed(1);
const log = detail => console.log(`[${elapsed()}s] ${detail}`);

async function joinClass(code) {
  // Ten independent arrival streams share the same school network address.
  // Every successful connection stays open throughout the game.
  let nextStudent = 1;
  async function arrive() {
    while (nextStudent <= count) {
      const number = nextStudent++;
      const session = await joinRoom(origin, code, `Player ${String(number).padStart(3, '0')}`);
      students.push(await RoomClient.connect(origin, session));
    }
  }
  const streams = Array.from({ length: Math.min(10, count) }, arrive);
  const results = await Promise.allSettled(streams);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  assert.equal(new Set(students.map(client => client.session.id)).size, count);
}

try {
  const session = await createRoom(origin, 20);
  teacher = await RoomClient.connect(origin, session);
  await joinClass(session.code);
  const ids = students.map(client => client.session.id);
  await teacher.waitFor((s, online) => s.players.length === count && ids.every(id => online.includes(id)), 'full attendance');
  log(`Connected ${count} distinct student sockets plus the teacher to local room ${session.code}.`);

  const first = await reachPositivePot(teacher);
  assert.equal(first.deathNumber, 1);
  const firstGroup = students.slice(0, Math.floor(count / 2));
  const bankedIds = new Set(firstGroup.map(client => client.session.id));
  await Promise.all(firstGroup.map(async client => {
    const observed = await client.waitFor(s => s.turn === first.turn && s.pot === first.pot, 'first shared pot');
    await client.sendAction({ type: 'bank', turn: observed.turn });
  }));
  await teacher.waitFor(s => s.players.filter(p => p.status === 'banked').length === firstGroup.length, 'first banking wave');

  let rolled;
  for (let attempt = 0; attempt < 200; attempt++) {
    await delay(425);
    rolled = await teacherStep(teacher, 'roll');
    if (rolled.phase !== 'playing') break;
  }
  assert.equal(rolled.endReason, 'bust', 'Expected a real 1 to close the round.');
  assert.equal(rolled.rolls.at(-1), 1);
  const bust = await Promise.all(students.map(client =>
    client.waitFor(s => s.round === first.round && s.endReason === 'bust', 'losing-roll broadcast')));
  for (const state of bust) {
    for (const player of state.players) {
      assert.equal(player.score, bankedIds.has(player.id) ? first.pot : 0);
      assert.equal(player.status, bankedIds.has(player.id) ? 'banked' : 'bust');
    }
  }
  log(`All ${count} clients saw the same losing roll and the correct totals for both groups.`);

  const next = await reachPositivePot(teacher);
  await Promise.all(students.map(client => client.waitFor(s => s.turn === next.turn && s.pot === next.pot, 'next shared pot')));
  await Promise.all(students.map(client => client.sendAction({ type: 'bank', turn: client.state.turn })));
  const roundEnd = await teacher.waitFor(s => s.turn > next.turn && s.endReason === 'banked', 'all banked');
  if (roundEnd.phase !== 'finished') await teacherStep(teacher, 'finish');
  const results = await Promise.all(students.map(client => client.waitFor(s => s.phase === 'finished', 'final scores')));
  for (const state of results) {
    assert.equal(state.players.length, count);
    for (const player of state.players) {
      assert.equal(player.score, next.pot + (bankedIds.has(player.id) ? first.pot : 0));
    }
    const top = Math.max(...state.players.map(player => player.score));
    const winners = state.players.filter(player => player.score === top).map(player => player.id);
    assert.deepEqual(new Set(winners), bankedIds);
  }
  log(`PASS: ${count} simultaneous banks acknowledged, all ${count} final scoreboards agreed, ${bankedIds.size} joint winner(s).`);
} catch (error) {
  console.error(`Simulation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([...students, ...(teacher ? [teacher] : [])].map(client => client.close()));
}
