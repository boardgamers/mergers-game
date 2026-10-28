import { connectedLoose, placementEffect, tileLegality, chainSize } from "./board.js";
import { startMerger } from "./merger.js";
import { tileColumn } from "./tiles.js";
import { afterPlacement, drawTile } from "./turn.js";
import type { BankHolding, GameState } from "./types.js";

/** rules.md §12/§15: the bank is a third shareholder with exactly 2 players and twoPlayerMode "bank". */
export function isBankMode(state: GameState): boolean {
	return state.players === 2 && state.options.twoPlayerMode === "bank";
}

/**
 * rules.md §12.1.1/§12.1.5/§12.2: draw a tile; the bank holds as many shares as its column
 * number, or 0 if the pool is empty. At a merger the tile waits to be placed; at final scoring
 * it is set aside (removed from the game). Returns undefined outside bank mode.
 */
export function bankHolding(state: GameState, fate: "wait" | "setAside"): Omit<BankHolding, "amount"> | undefined {
	if (!isBankMode(state)) {
		return undefined;
	}
	const tile = drawTile(state);
	if (tile === undefined) {
		return { tile: null, shares: 0 };
	}
	if (fate === "wait") {
		state.bankTiles.push(tile);
	} else {
		state.removed.push(tile);
	}
	return { tile, shares: tileColumn(tile) };
}

/**
 * rules.md §12.1.4: place waiting bank tiles in draw order, before the active player's buy step
 * (or, with twoTiles, before their second tile).
 * A tile that causes a merger starts it; when that merger completes it calls back here, so the
 * queue (including tiles drawn by that merger) continues where it left off.
 */
export function placeNextBankTile(state: GameState): void {
	const tile = state.bankTiles.shift();
	if (tile === undefined) {
		afterPlacement(state);
		return;
	}
	if (tileLegality(state.board, tile) === "permanentlyUnplayable") {
		state.removed.push(tile);
		state.log.push({ type: "bankTile", tile, result: "removed" });
		placeNextBankTile(state);
		return;
	}
	const effect = placementEffect(state.board, tile);
	state.board[tile] = "loose";
	if (effect.kind === "merge") {
		state.log.push({ type: "bankTile", tile, result: "merger" });
		startMerger(state, tile, effect.chains, true);
		return;
	}
	if (effect.kind === "grow") {
		for (const t of connectedLoose(state.board, tile)) {
			state.board[t] = effect.chain;
		}
		state.log.push({ type: "bankTile", tile, result: "joined" });
		state.log.push({ type: "grew", chain: effect.chain, size: chainSize(state.board, effect.chain) });
	} else {
		// A tile that would found a chain stays loose, even with all 7 chains active (§12.1.4).
		state.log.push({ type: "bankTile", tile, result: "loose" });
	}
	placeNextBankTile(state);
}
