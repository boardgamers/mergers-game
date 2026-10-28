import type { GameState, LogEntry } from "./types.js";
import { seatsOf } from "./view.js";

/** Setup entries describe options and turn order, not play, so they always stay visible. */
const SETUP: LogEntry["type"][] = ["init", "optionIgnored", "turnOrder"];

/**
 * rules.md §13 limitedLog: the first log index `player` may read (undefined for a
 * spectator). Players see from the start of their own last turn before the current one, so
 * the current turn, including a merger in progress, is always visible. Spectators see as much
 * as the active player. The whole log is visible when the option is off or the game is over.
 */
export function logWindowStart(state: GameState, player: number | undefined): number {
	if (!state.options.limitedLog || state.ended) {
		return 0;
	}
	const own = player === undefined ? [state.activeSeat] : seatsOf(state, player);
	let current = true;
	for (let index = state.log.length - 1; index >= 0; index--) {
		const entry = state.log[index]!;
		if (entry.type !== "turn") {
			continue;
		}
		if (!current && own.includes(entry.seat)) {
			return index;
		}
		current = false;
	}
	return 0;
}

/** The log as `player` may read it: earlier entries become placeholders, keeping its length. */
export function visibleLog(state: GameState, player: number | undefined): LogEntry[] {
	const start = logWindowStart(state, player);
	return state.log.map((entry, index) =>
		index >= start || SETUP.includes(entry.type) ? structuredClone(entry) : { type: "hidden" }
	);
}
