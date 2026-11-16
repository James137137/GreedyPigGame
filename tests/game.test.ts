import assert from "node:assert/strict";
import test from "node:test";
import { addPlayer, applyAction, createGame, GameError, normalizeNickname, ranks, type Action, type GameState } from "../shared/game";

function classroom(rounds = 2, names = ["Aroha", "Hemi"]): GameState {
  return names.reduce((state, name) => addPlayer(state, name, name), createGame("012345", rounds));
}

function teacher(state: GameState, type: Exclude<Action["type"], "remove" | "bank" | "configure">, die?: number) {
  return applyAction(state, "teacher", { type, turn: state.turn }, die === undefined ? undefined : () => die);
}

function bank(state: GameState, name: string, turn = state.turn) {
  return applyAction(state, name, { type: "bank", turn });
}

function fails(code: string) {
  return (err: unknown) => err instanceof GameError && err.code === code;
}

test("rooms preserve leading zeros, default to five rounds and validate code/round count", () => {
  assert.equal(createGame("000001").rounds, 5);
  assert.equal(createGame("000001").deathNumber, 1);
  assert.equal(createGame("000001").code, "000001");
  for (const code of ["", "12345", "1234567", " 123456", "12e456"]) {
    assert.throws(() => createGame(code), fails("invalid_code"));
  }
  for (const rounds of [-1, 0, 1.1, 21, NaN, Infinity]) {
    assert.throws(() => createGame("123456", rounds), fails("invalid_rounds"));
  }
  assert.equal(createGame("123456", 20).rounds, 20);
  assert.throws(() => teacher(classroom(2, []), "start"), fails("empty_room"));
});

test("nicknames preserve Māori spelling, normalise equivalent forms and reject unsafe input", () => {
  assert.equal(normalizeNickname("   Te    Reo   "), "Te Reo");
  assert.equal(normalizeNickname("Ma\u0304ia"), "Māia");
  const state = addPlayer(createGame("000001"), "a", "  Māia ");
  assert.throws(() => addPlayer(state, "b", "MA\u0304IA"), fails("name_taken"));
  assert.throws(() => addPlayer(state, "teacher", "Aroha"), fails("invalid_player"));
  for (const name of ["", ".", "a\u202eb", "<img>", "a".repeat(21), "a\u0000b"]) {
    assert.throws(() => normalizeNickname(name), fails("invalid_name"));
  }
});

test("every join rejects blocked nicknames before storing or displaying the submission", () => {
  const lobby = classroom();
  const between = teacher(teacher(lobby, "start"), "roll", 1);
  for (const state of [lobby, between]) {
    for (const name of ["FuCk", "Ｓｈｉｔ", "Player_f.u.c.k", "n1gg3r_42", "Fuсk", "S.h.1.t", "white power", "WhiteP0wer", "pórnhub", "d1ld0", "PlayerWankerrr", "c.u.n.t99"]) {
      assert.throws(() => addPlayer(state, "late", name), (error: unknown) =>
        error instanceof GameError && error.code === "name_blocked"
        && error.status === 400 && error.message === "Choose a different, classroom-friendly nickname.");
    }
    assert.deepEqual(state.players.map(p => p.name), ["Aroha", "Hemi"]);
  }
});

test("filter preserves ordinary names, macrons and legitimate words containing misleading fragments", () => {
  for (const name of ["Scunthorpe", "Angus", "Māia", "Tāwhirimātea", "Aroha", "Cassidy", "Penistone", "Dickens", "Peacock", "Essex", "Angus Ng", "李明", "Māori Maths", "Assistant", "MathsAs", "Class 7", "Grape"]) {
    const state = addPlayer(createGame("000001"), "id", name);
    assert.equal(state.players[0].name, name);
  }
  const state = addPlayer(createGame("000001"), "a", "Māia");
  assert.throws(() => addPlayer(state, "b", "MA\u0304IA"), fails("name_taken"));
});

test("each configured death number busts, and all remaining faces add their face value", () => {
  for (let deathNumber = 1; deathNumber <= 6; deathNumber++) {
    const lobby = classroom();
    const configured = applyAction(lobby, "teacher", { type: "configure", turn: lobby.turn, rounds: 1, deathNumber });
    assert.equal(configured.turn, lobby.turn + 1);
    assert.equal(configured.deathNumber, deathNumber);
    let game = teacher(configured, "start");
    let expectedPot = 0;
    for (let die = 1; die <= 6; die++) {
      if (die === deathNumber) continue;
      game = teacher(game, "roll", die);
      expectedPot += die;
      assert.equal(game.pot, expectedPot);
    }
    game = teacher(bank(game, "Hemi"), "roll", deathNumber);
    assert.equal(game.phase, "finished");
    assert.equal(game.endReason, "bust");
    assert.equal(game.pot, 0);
    assert.deepEqual(game.players.map(p => [p.status, p.score]), [["bust", 0], ["banked", expectedPot]]);
  }
});

test("only a teacher can change settings, in the lobby and within the supported ranges", () => {
  const lobby = classroom();
  const options = { type: "configure", turn: lobby.turn, rounds: 3, deathNumber: 6 } as const;
  assert.throws(() => applyAction(lobby, "Hemi", options), fails("teacher_only"));
  for (const deathNumber of [-1, 0, 2.5, 7, NaN, Infinity]) {
    assert.throws(() => applyAction(lobby, "teacher", { ...options, deathNumber }), fails("invalid_death_number"));
  }
  for (const rounds of [0, 5.5, 21, NaN]) {
    assert.throws(() => applyAction(lobby, "teacher", { ...options, rounds }), fails("invalid_rounds"));
  }
  const configured = applyAction(lobby, "teacher", options);
  assert.throws(() => applyAction(configured, "teacher", options), fails("stale_turn"));
  const started = teacher(configured, "start");
  const between = teacher(started, "roll", 6);
  const finished = teacher(between, "finish");
  for (const state of [started, between, finished]) {
    assert.throws(() => applyAction(state, "teacher", { ...options, turn: state.turn }), fails("wrong_phase"));
  }
});

test("faces 2–6 grow only the shared pot and preserve prior immutable snapshots", () => {
  const lobby = classroom();
  const first = teacher(lobby, "start");
  let game = first;
  for (let die = 2; die <= 6; die++) {
    const before = game;
    game = teacher(game, "roll", die);
    assert.equal(game.pot, before.pot + die);
    assert.equal(game.turn, before.turn + 1);
  }
  assert.equal(lobby.phase, "lobby");
  assert.deepEqual(first.rolls, []);
  assert.deepEqual(game.rolls, [2, 3, 4, 5, 6]);
  assert.equal(game.pot, 20);
  assert.deepEqual(game.players.map(p => p.score), [0, 0]);
});

test("bank locks the displayed pot for that student, a second bank cannot credit it again", () => {
  const offered = teacher(teacher(classroom(), "start"), "roll", 5);
  const banked = bank(offered, "Aroha");
  assert.equal(banked.turn, offered.turn);
  assert.equal(banked.players[0].banked, 5);
  assert.equal(banked.players[0].status, "banked");
  assert.equal(banked.players[1].status, "active");
  assert.throws(() => bank(banked, "Aroha"), fails("bank_closed"));
  const later = teacher(banked, "roll", 6);
  assert.throws(() => bank(later, "Aroha"), fails("bank_closed"));
  assert.deepEqual(later.players.map(p => p.score), [5, 0]);
});

test("a one closes the round, preserves banked points and loses only the unbanked pot", () => {
  const offered = teacher(teacher(classroom(), "start"), "roll", 4);
  const result = teacher(bank(offered, "Hemi"), "roll", 1);
  assert.equal(result.phase, "between");
  assert.equal(result.endReason, "bust");
  assert.equal(result.pot, 0);
  assert.deepEqual(result.rolls, [4, 1]);
  assert.deepEqual(result.players.map(p => [p.status, p.score, p.banked]), [["bust", 0, 0], ["banked", 4, 4]]);
  assert.throws(() => teacher(result, "roll", 2), fails("roll_closed"));
  const next = teacher(result, "next");
  assert.equal(next.round, 2);
  assert.deepEqual(next.players.map(p => [p.status, p.score, p.banked]), [["active", 0, 0], ["active", 4, 0]]);
  assert.deepEqual(next.rolls, []);
  assert.equal(teacher(next, "roll", 1).phase, "finished");
});

test("concurrent banks at one turn all succeed once, and the last closes the final round", () => {
  const offered = teacher(teacher(classroom(1), "start"), "roll", 6);
  const first = bank(offered, "Hemi", offered.turn);
  const end = bank(first, "Aroha", offered.turn);
  assert.deepEqual(end.players.map(p => p.score), [6, 6]);
  assert.deepEqual(ranks(end.players).map(p => p.rank), [1, 1]);
  assert.equal(end.phase, "finished");
  assert.equal(end.endReason, "banked");
  assert.throws(() => bank(end, "Aroha", offered.turn), fails("stale_turn"));
  assert.throws(() => teacher(end, "next"), fails("wrong_phase"));
});

test("bank vs losing roll is resolved by server order; stale bank never claims a later pot", () => {
  const offered = teacher(teacher(classroom(), "start"), "roll", 4);
  const bankFirst = teacher(bank(offered, "Hemi"), "roll", 1);
  assert.equal(bankFirst.players[1].score, 4);
  const rollFirst = teacher(offered, "roll", 1);
  assert.throws(() => bank(rollFirst, "Hemi", offered.turn), fails("stale_turn"));
  assert.equal(rollFirst.players[1].score, 0);
  const increased = teacher(offered, "roll", 2);
  assert.throws(() => bank(increased, "Hemi", offered.turn), fails("stale_turn"));
  assert.throws(() => applyAction(increased, "teacher", { type: "roll", turn: offered.turn }, () => 6), fails("stale_turn"));
});

test("only teacher controls transitions, students can bank only their own score", () => {
  const offered = teacher(teacher(classroom(), "start"), "roll", 2);
  for (const type of ["start", "next", "roll", "finish", "pause", "resume"] as const) {
    assert.throws(() => applyAction(offered, "Hemi", { type, turn: offered.turn }), fails("teacher_only"));
  }
  assert.throws(() => applyAction(offered, "Hemi", { type: "remove", turn: offered.turn, playerId: "Aroha" }), fails("teacher_only"));
  assert.throws(() => bank(offered, "unknown"), fails("student_only"));
  assert.throws(() => bank(offered, "teacher"), fails("student_only"));
  assert.deepEqual(bank(offered, "Aroha").players.map(p => p.score), [2, 0]);
});

test("pause/resume invalidates old actions, freezes the pot and keeps banked scores", () => {
  const started = teacher(classroom(), "start");
  const paused = teacher(started, "pause");
  assert.throws(() => bank(paused, "Aroha", started.turn), fails("stale_turn"));
  assert.throws(() => bank(paused, "Aroha"), fails("bank_closed"));
  assert.throws(() => teacher(paused, "roll", 1), fails("roll_closed"));
  const resumed = teacher(paused, "resume");
  assert.equal(resumed.paused, false);
  assert.equal(bank(resumed, "Hemi").players[1].status, "banked");
  assert.equal(resumed.pot, 0);
});

test("capacity is exactly 100 and late arrivals join between rounds", () => {
  const full = classroom(2, Array.from({ length: 100 }, (_, n) => `Player ${n}`));
  assert.throws(() => addPlayer(full, "late", "Late"), fails("room_full"));
  const started = teacher(classroom(), "start");
  assert.throws(() => addPlayer(started, "late", "Late"), fails("join_closed"));
  const between = teacher(started, "roll", 1);
  const joined = addPlayer(between, "late", "Late");
  assert.equal(joined.players.at(-1)?.status, "waiting");
  assert.equal(teacher(joined, "next").players.at(-1)?.status, "active");
});

test("removing the last active student closes the round, early finish locks banked totals", () => {
  const offered = teacher(teacher(classroom(), "start"), "roll", 3);
  const banked = bank(offered, "Aroha");
  const removed = applyAction(banked, "teacher", { type: "remove", playerId: "Hemi", turn: offered.turn });
  assert.equal(removed.phase, "between");
  assert.equal(removed.players.length, 1);
  const finished = teacher(teacher(banked, "pause"), "finish");
  assert.equal(finished.phase, "finished");
  assert.equal(finished.paused, false);
  assert.equal(finished.endReason, "teacher");
  assert.deepEqual(finished.players.map(p => p.score), [3, 0]);
  assert.throws(() => addPlayer(finished, "late", "Late"), fails("join_closed"));
  assert.throws(() => applyAction(finished, "teacher", { type: "remove", playerId: "Aroha", turn: finished.turn }), fails("game_finished"));
});

test("leaderboard uses competition ranking with shared first and lower-place ties", () => {
  const players = classroom(2, ["A", "B", "C", "D", "E"]).players.map((p, i) => ({ ...p, score: [2, 4, 2, 4, 0][i] }));
  assert.deepEqual(ranks(players).map(p => [p.name, p.rank]), [["B", 1], ["D", 1], ["A", 3], ["C", 3], ["E", 5]]);
  assert.equal(players[0].name, "A");
});
