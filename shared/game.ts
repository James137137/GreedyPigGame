import { nicknameIsBlocked } from "./nickname-filter";
import { isPigFace, type PigFace } from "./avatar";

export const MAX_PLAYERS = 100;
export const MAX_ROUNDS = 20;
export const QUIET_MAX_ROUNDS = 100;
export const NOISE_WINDOW_MS = 20_000;

export interface Player {
  id: string;
  name: string;
  score: number;
  status: "waiting" | "active" | "banked" | "bust";
  banked: number;
  avatar?: PigFace;
}

export interface GameState {
  code: string;
  rounds: number;
  deathNumber: number;
  quietMode: boolean;
  noiseLosses: number;
  restoredRounds: number;
  graceUntil: number;
  lastNoiseLossAt: number | null;
  round: number;
  phase: "lobby" | "playing" | "between" | "finished";
  paused: boolean;
  autoRoll: boolean;
  nextRollAt: number | null;
  pot: number;
  rolls: number[];
  totalRolls: number;
  turn: number;
  players: Player[];
  endReason: "bust" | "banked" | "teacher" | null;
}

export type Action =
  | { type: "start" | "next" | "roll" | "pause" | "resume" | "finish" | "bank"; turn: number }
  | { type: "autoRoll"; enabled: boolean; turn: number }
  | { type: "quietMode"; enabled: boolean; turn: number }
  | { type: "noisePenalty" | "quietRestore"; expectedLosses: number; turn: number }
  | { type: "configure"; rounds: number; deathNumber: number; turn: number }
  | { type: "avatar"; avatar: PigFace; turn: number }
  | { type: "remove"; playerId: string; turn: number };

export class GameError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number = 409) {
    super(message);
    this.name = "GameError";
  }
}

function validateRounds(rounds: number, limit = MAX_ROUNDS) {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > limit) {
    throw new GameError("invalid_rounds", `Choose 1 to ${limit} rounds.`, 400);
  }
}

export function createGame(code: string, rounds = 5): GameState {
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
    throw new GameError("invalid_code", "Enter a six-digit room code.", 400);
  }
  validateRounds(rounds);
  return {
    code, rounds, deathNumber: 1, quietMode: false, graceUntil: 0, noiseLosses: 0, restoredRounds: 0, lastNoiseLossAt: null, round: 0, phase: "lobby", paused: false, pot: 0, rolls: [],
    autoRoll: false, nextRollAt: null, totalRolls: 0, turn: 0, players: [], endReason: null,
  };
}

export function normalizeNickname(input: string): string {
  if (typeof input !== "string" || input.length > 128) {
    throw new GameError("invalid_name", "Enter a nickname of 1–20 characters.", 400);
  }
  const name = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!/^[\p{L}\p{M}\p{N} ._'’\-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)
    || Array.from(name).length > 20) {
    throw new GameError("invalid_name", "Use 1–20 letters, numbers, spaces or simple punctuation for your nickname.", 400);
  }
  if (nicknameIsBlocked(name)) {
    throw new GameError("name_blocked", "Choose a different, classroom-friendly nickname.", 400);
  }
  return name;
}

export function addPlayer(state: GameState, id: string, input: string): GameState {
  if (state.phase !== "lobby" && state.phase !== "between") {
    throw new GameError("join_closed", state.phase === "finished" ? "This game has finished." : "Join when the current round ends.");
  }
  if (state.players.length >= MAX_PLAYERS) throw new GameError("room_full", "This room has reached 100 players.");
  if (!id || id === "teacher" || state.players.some(player => player.id === id)) {
    throw new GameError("invalid_player", "This player ID is unavailable.");
  }
  const name = normalizeNickname(input);
  if (state.players.some(player => player.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError("name_taken", "That nickname is taken. Choose another one.");
  }
  const player: Player = { id, name, score: 0, status: "waiting", banked: 0 };
  return updateCountdown(state, { ...state, players: [...state.players, player] }, Date.now());
}

// Reject the incomplete final group of byte values so each face is equally likely.
export function randomDie(): number {
  const sample = new Uint8Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= 252);
  return sample[0] % 6 + 1;
}

function startRound(state: GameState): GameState {
  if (!state.players.length) throw new GameError("empty_room", "At least one student must join before a round starts.");
  return {
    ...state, round: state.round + 1, phase: "playing", paused: false, pot: 0, rolls: [],
    endReason: null, turn: state.turn + 1,
    players: state.players.map(player => ({ ...player, status: "active", banked: 0 })),
  };
}

function closeRound(state: GameState, reason: "banked" | "bust"): GameState {
  return {
    ...state, phase: state.round === state.rounds ? "finished" : "between",
    paused: false, endReason: reason, turn: state.turn + 1,
  };
}

function finishIfAllBanked(state: GameState): GameState {
  if (state.phase === "playing" && !state.players.some(player => player.status === "active")) {
    return closeRound(state, "banked");
  }
  return state;
}

// A turn identifies a specific opportunity to act. Banking and roster changes
// leave it open for other students. Rolls, pauses and phase changes close it.
export const AUTO_INTERVAL_SECONDS = 5;

function updateCountdown(previous: GameState, next: GameState, now: number): GameState {
  if (!next.autoRoll || next.paused || !next.players.length || (next.phase !== "playing" && next.phase !== "between")) return { ...next, nextRollAt: null };
  const restart = previous.nextRollAt === null || next.phase !== previous.phase || next.totalRolls !== previous.totalRolls;
  return { ...next, nextRollAt: restart ? now + AUTO_INTERVAL_SECONDS * 1000 : previous.nextRollAt };
}

export function rollIfDue(state: GameState, now: number, rollDie = randomDie): GameState {
  if (!state.autoRoll || state.paused || (state.phase !== "playing" && state.phase !== "between") || state.nextRollAt === null || now < state.nextRollAt) return state;
  const type = state.phase === "between" ? "next" : "roll";
  const next = transition(state, "teacher", { type, turn: state.turn }, rollDie, now);
  return updateCountdown(state, next, now);
}

export function applyAction(state: GameState, actor: string, action: Action, rollDie = randomDie, now = Date.now()): GameState {
  if (action?.type === "roll" && actor === "teacher" && state.autoRoll) throw new GameError("automatic", "Turn off auto-roll to roll manually.");
  if (action?.type === "bank" && state.nextRollAt !== null && now >= state.nextRollAt) throw new GameError("time_up", "Time is up for that roll.");
  return updateCountdown(state, transition(state, actor, action, rollDie, now), now);
}

function transition(state: GameState, actor: string, action: Action, rollDie: () => number, now: number): GameState {
  if (!action || typeof action !== "object" || !Number.isSafeInteger(action.turn)) {
    throw new GameError("invalid_action", "Invalid game action.", 400);
  }
  if (action.type !== "bank" && action.type !== "avatar" && actor !== "teacher") {
    throw new GameError("teacher_only", "Only the teacher can do that.", 403);
  }
  if (action.turn !== state.turn) throw new GameError("stale_turn", "The game has moved on. Check the latest board.");

  switch (action.type) {
    case "avatar": {
      if (state.phase !== "lobby") throw new GameError("avatar_closed", "Pig faces can be changed in the waiting room.");
      if (!state.players.some(player => player.id === actor)) {
        throw new GameError("student_only", "Join as a student to choose a pig face.", 403);
      }
      if (!isPigFace(action.avatar)) throw new GameError("invalid_avatar", "Choose from the available pig face options.", 400);
      const players = state.players.map(player => player.id === actor ? { ...player, avatar: { ...action.avatar } } : player);
      return { ...state, players };
    }
    case "autoRoll":
      if (state.phase === "finished" || typeof action.enabled !== "boolean") throw new GameError("invalid_auto_roll", "Auto-roll cannot be changed right now.");
      return { ...state, autoRoll: action.enabled, turn: state.turn + 1 };
    case "quietMode":
      if (state.phase !== "lobby" || typeof action.enabled !== "boolean") throw new GameError("wrong_phase", "Choose Quiet Mode before starting.");
      if (state.quietMode === action.enabled) return state;
      return { ...state, quietMode: action.enabled, rounds: action.enabled ? 20 : 5, turn: state.turn + 1 };
    case "quietRestore": {
      // Losses and restorations are cumulative. Their difference is exactly
      // the number of rounds missing from the teacher's starting total.
      const missing = state.noiseLosses - state.restoredRounds;
      if (!state.quietMode || state.phase !== "playing" || state.paused || missing <= 0
        || action.expectedLosses !== state.noiseLosses || state.lastNoiseLossAt === null
        || now - state.lastNoiseLossAt < NOISE_WINDOW_MS) {
        throw new GameError("restore_closed", "Rounds cannot be restored right now.");
      }
      return { ...state, rounds: state.rounds + missing, restoredRounds: state.noiseLosses };
    }
    case "noisePenalty":
      if (!state.quietMode || state.phase !== "playing" || state.paused || now < state.graceUntil || state.rounds <= state.round
        || action.expectedLosses !== state.noiseLosses
        || (state.lastNoiseLossAt !== null && now - state.lastNoiseLossAt < NOISE_WINDOW_MS)) {
        throw new GameError("noise_closed", "A round cannot be removed right now.");
      }
      return { ...state, rounds: state.rounds - 1, noiseLosses: state.noiseLosses + 1, lastNoiseLossAt: now };
    case "configure":
      if (state.phase !== "lobby") throw new GameError("wrong_phase", "Settings are locked once the game starts.");
      validateRounds(action.rounds, state.quietMode ? QUIET_MAX_ROUNDS : MAX_ROUNDS);
      if (!Number.isInteger(action.deathNumber) || action.deathNumber < 1 || action.deathNumber > 6) {
        throw new GameError("invalid_death_number", "Choose a death number from 1 to 6.", 400);
      }
      return { ...state, rounds: action.rounds, deathNumber: action.deathNumber, turn: state.turn + 1 };
    case "start":
    case "next":
      if (state.phase !== (action.type === "start" ? "lobby" : "between")) {
        throw new GameError("wrong_phase", "A new round cannot start right now.");
      }
      return startRound(state);
    case "pause":
    case "resume": {
      const pause = action.type === "pause";
      if (state.phase !== "playing" || state.paused === pause) {
        throw new GameError("wrong_phase", "This action is unavailable right now.");
      }
      return { ...state, paused: pause, turn: state.turn + 1 };
    }
    case "roll": {
      if (state.phase !== "playing" || state.paused) throw new GameError("roll_closed", "The die can only be rolled during play.");
      let face: number;
      do {
        face = rollDie();
        if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error("Die source returned an invalid face.");
      } while (state.totalRolls < 2 && face === 1);
      const totalRolls = state.totalRolls + 1;
      const rolls = [...state.rolls, face];
      if (face === state.deathNumber) {
        const players = state.players.map(player => player.status === "active" ? { ...player, status: "bust" as const } : player);
        return closeRound({ ...state, pot: 0, rolls, totalRolls, players, graceUntil: now + 5000 }, "bust");
      }
      return { ...state, pot: state.pot + face, rolls, totalRolls, turn: state.turn + 1 };
    }
    case "bank": {
      const current = state.players.find(player => player.id === actor);
      if (!current) throw new GameError("student_only", "A student session is required to bank.", 403);
      if (state.phase !== "playing" || state.paused || current.status !== "active") {
        throw new GameError("bank_closed", "Banking is closed for you right now.");
      }
      const players = state.players.map(player => player.id === actor
        ? { ...player, status: "banked" as const, score: player.score + state.pot, banked: state.pot }
        : player);
      return finishIfAllBanked({ ...state, players });
    }
    case "remove": {
      if (state.phase === "finished") throw new GameError("game_finished", "The final results are locked.");
      if (!state.players.some(player => player.id === action.playerId)) throw new GameError("unknown_player", "That student has already left.", 404);
      return finishIfAllBanked({ ...state, players: state.players.filter(player => player.id !== action.playerId) });
    }
    case "finish":
      if (state.phase === "finished") throw new GameError("game_finished", "The game has already finished.");
      return {
        ...state, phase: "finished", endReason: "teacher", paused: false, pot: 0, turn: state.turn + 1,
        players: state.players.map(player => player.status === "active" ? { ...player, status: "bust" } : player),
      };
    default:
      throw new GameError("invalid_action", "Unknown game action.", 400);
  }
}

export function ranks(players: Player[]): (Player & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "en-NZ"));
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score) rank = index + 1;
    return { ...player, rank };
  });
}
