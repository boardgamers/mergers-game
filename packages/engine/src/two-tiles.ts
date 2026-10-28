import { placementEffect } from "./board.js";
import type { Tile } from "./tiles.js";
import type { GameState } from "./types.js";

/** What the active seat's placements have done so far this turn, read from the log. */
export function turnPlacements(state: GameState): { placed: number; founded: boolean; merged: boolean } {
	const result = { placed: 0, founded: false, merged: false };
	for (let i = state.log.length - 1; i >= 0; i--) {
		const entry = state.log[i]!;
		if (entry.type === "turn") {
			break;
		}
		if (entry.type === "move" && entry.move.type === "place") {
			result.placed++;
		} else if (entry.type === "founded") {
			result.founded = true;
		} else if (entry.type === "merger" && !entry.byBank) {
			// rules.md §15 twoTiles: mergers caused by bank tiles do not count.
			result.merged = true;
		}
	}
	return result;
}

/**
 * rules.md §15 twoTiles: a turn founds at most one chain, and never both founds a chain and
 * causes a merger. Whether `tile` is ruled out by what this turn's placements already did.
 */
export function blockedThisTurn(state: GameState, tile: Tile): boolean {
	if (!state.options.twoTiles) {
		return false;
	}
	const { founded, merged } = turnPlacements(state);
	const effect = placementEffect(state.board, tile).kind;
	return (effect === "found" && (founded || merged)) || (effect === "merge" && founded);
}

/** rules.md §15 twoTiles: whether the active seat places another tile before buying. */
export function secondPlacementDue(state: GameState): boolean {
	return state.options.twoTiles === true && turnPlacements(state).placed === 1;
}
