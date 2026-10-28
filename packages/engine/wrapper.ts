import { applyTurnRequest, earnedTimeIncrements, isTurnRequest } from "./src/turn-draft.js";
import { visibleLog } from "./src/limited-log.js";
import { applyMove, currentSeat, dropPlayerSeats } from "./src/moves.js";
import { replayGame } from "./src/replay.js";
import { playerRankings, playerScores } from "./src/scoring.js";
import { initGame } from "./src/setup.js";
import { simpleLine, simpleLineAt } from "./src/simple.js";
import type { GameState, LogEntry } from "./src/types.js";
import { seatsOf, viewFor } from "./src/view.js";

// The seed fixes the hidden tile order, so BGS must hash it before init (rules.md §13).
export const hashSeed = true;

// BGS addresses real players; the engine works in internal seats. They are the same except in
// fourHands, where each of the 2 players controls two seats (state.seatOwner).

export function init(
	players: number,
	_expansions: string[],
	options: Record<string, unknown>,
	seed: string,
	_creator?: number
): GameState {
	return initGame(players, options ?? {}, seed);
}

export function move(data: GameState, mv: unknown, player: number): GameState {
	if (isTurnRequest(mv)) {
		return applyTurnRequest(data, mv, player);
	}
	// Bare moves retain the existing protocol for older viewers and analyses.
	const seat = currentSeat(data);
	if (seat === undefined || data.seatOwner[seat] !== player) {
		throw new Error("It is not your turn");
	}
	// mv is untrusted JSON from the network; applyMove validates it before any mutation.
	return applyMove(data, mv, seat);
}

export function ended(data: GameState): boolean {
	return data.ended;
}

export function scores(data: GameState): number[] {
	return playerScores(data);
}

export function rankings(data: GameState): number[] {
	return playerRankings(data);
}

export function dropPlayer(data: GameState, player: number): GameState {
	return dropPlayerSeats(data, player);
}

export function currentPlayer(data: GameState): number | undefined {
	const seat = currentSeat(data);
	return seat === undefined ? undefined : data.seatOwner[seat];
}

export function stripSecret(data: GameState, player?: number): GameState {
	return { ...viewFor(data, player), supportsTurnDrafts: true };
}

export function logLength(data: GameState): number {
	return data.log.length;
}

export interface LogSliceOptions {
	player?: number;
	start?: number;
	end?: number;
}

// Both endpoints are inclusive. The log is public (rules.md §13) except with limitedLog, where
// entries before the player's window are placeholders. Each entry gets a `simple` line for
// BGS's last-move display.
export function logSlice(
	data: GameState,
	options?: LogSliceOptions
): {
	log: (LogEntry & { simple: string })[];
	preview?: GameState;
} {
	const start = Math.max(0, options?.start ?? 0);
	const end = options?.end ?? data.log.length - 1;
	const log = visibleLog(data, options?.player);
	return {
		log: log.slice(start, end + 1).map((entry, i) => ({
			...entry,
			simple: entry.type === "hidden" ? simpleLine(data, entry) : simpleLineAt(data, start + i),
		})),
		...(data.tentative && data.tentative.player === options?.player
			? { preview: stripSecret(data, options.player) }
			: {}),
	};
}

export function setPlayerMetaData(data: GameState, player: number, metaData: { name: string }): GameState {
	for (const seat of seatsOf(data, player)) {
		data.seats[seat]!.name = metaData.name;
	}
	return data;
}

export function round(data: GameState): number {
	return Math.ceil(data.turn / data.seats.length);
}

/** BGS undo (games against bots) and analysis: `to` is a log length at a move boundary. */
export function replay(data: GameState, options?: { to?: number }): GameState {
	return replayGame(data, options?.to);
}

/** Private previews do not save history, send notifications or award clock increments. */
export function toSave(data: GameState): GameState | undefined {
	return data.tentative ? undefined : data;
}

export const timeIncrements = earnedTimeIncrements;
