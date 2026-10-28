import { CHAIN_IDS, END_SIZE, SAFE_SIZE, type ChainId } from "./config.js";
import { neighbours, type Tile } from "./tiles.js";
import { blockedThisTurn } from "./two-tiles.js";
import type { Cell, GameState } from "./types.js";

export type Placement =
	| { kind: "loose" }
	| { kind: "found" }
	| { kind: "grow"; chain: ChainId }
	| { kind: "merge"; chains: ChainId[] };

export type Legality = "playable" | "temporarilyUnplayable" | "permanentlyUnplayable";

export function chainSize(board: Cell[], chain: ChainId): number {
	return board.filter((cell) => cell === chain).length;
}

export function activeChains(board: Cell[]): ChainId[] {
	return CHAIN_IDS.filter((chain) => board.includes(chain));
}

export function isSafe(board: Cell[], chain: ChainId): boolean {
	return chainSize(board, chain) >= SAFE_SIZE;
}

/** rules.md §5.1: what placing this tile on the current board would do. */
export function placementEffect(board: Cell[], tile: Tile): Placement {
	const adjacent = neighbours(tile).map((t) => board[t] ?? null);
	const chains = CHAIN_IDS.filter((chain) => adjacent.includes(chain));
	if (chains.length >= 2) {
		return { kind: "merge", chains };
	}
	if (chains.length === 1) {
		return { kind: "grow", chain: chains[0]! };
	}
	return adjacent.includes("loose") ? { kind: "found" } : { kind: "loose" };
}

/** rules.md §5.2, computed fresh from the board every time. */
export function tileLegality(board: Cell[], tile: Tile): Legality {
	const effect = placementEffect(board, tile);
	if (effect.kind === "merge" && effect.chains.filter((chain) => isSafe(board, chain)).length >= 2) {
		return "permanentlyUnplayable";
	}
	if (effect.kind === "found" && activeChains(board).length === CHAIN_IDS.length) {
		return "temporarilyUnplayable";
	}
	return "playable";
}

/** Tiles `seat` may place now, including the rules.md §15 twoTiles limits on the active turn. */
export function playableTiles(state: GameState, seat: number): Tile[] {
	return (state.seats[seat]?.hand ?? []).filter(
		(tile) => tileLegality(state.board, tile) === "playable" && !blockedThisTurn(state, tile)
	);
}

/** The tile plus every loose tile connected to it through other loose tiles. */
export function connectedLoose(board: Cell[], tile: Tile): Tile[] {
	const group = new Set<Tile>([tile]);
	const frontier = [tile];
	while (frontier.length > 0) {
		const current = frontier.pop()!;
		for (const next of neighbours(current)) {
			if (board[next] === "loose" && !group.has(next)) {
				group.add(next);
				frontier.push(next);
			}
		}
	}
	return [...group];
}

/** rules.md §11.1: any chain has reached the end size (§15 endSize), or every active chain is safe. */
export function endConditionHolds(board: Cell[], endSize = END_SIZE): boolean {
	const chains = activeChains(board);
	if (chains.some((chain) => chainSize(board, chain) >= endSize)) {
		return true;
	}
	return chains.length > 0 && chains.every((chain) => isSafe(board, chain));
}
