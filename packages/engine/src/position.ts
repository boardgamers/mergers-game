import { connectedLoose, placementEffect } from "./board.js";
import { CHAIN_IDS, SHARES_PER_CHAIN, STARTING_CASH, type ChainId } from "./config.js";
import { handSize } from "./options.js";
import { parseTile, type Tile } from "./tiles.js";
import type { Cell, GameState, Shares } from "./types.js";

/** The public position at a point in the log: what a replay shows (no hands, no pool). */
export interface PublicPosition {
	board: Cell[];
	bank: Shares;
	/** Each seat's cash, stock and number of tiles in hand (not which tiles). */
	seats: { cash: number; shares: Shares; tiles: number }[];
}

function sharesOf(count: number): Shares {
	return Object.fromEntries(CHAIN_IDS.map((chain) => [chain, count])) as Shares;
}

/**
 * Rebuilds the public position after the first `to` log entries from the log alone, so it
 * works on a stripped state (no seed needed).
 */
export function positionAt(state: GameState, to: number): PublicPosition {
	const board: Cell[] = state.board.map(() => null);
	const bank = sharesOf(SHARES_PER_CHAIN);
	let seats: PublicPosition["seats"] = [];
	let lastTile: Tile | undefined;
	let hand = 0;
	let merger: { tile: Tile; chains: ChainId[]; survivor?: ChainId } | undefined;

	const place = (tile: Tile) => {
		const effect = placementEffect(board, tile);
		board[tile] = "loose";
		lastTile = tile;
		if (effect.kind === "grow") {
			for (const t of connectedLoose(board, tile)) {
				board[t] = effect.chain;
			}
		}
	};

	for (const entry of state.log.slice(0, Math.max(0, to))) {
		switch (entry.type) {
			case "init":
				seats = Array.from({ length: entry.seats }, () => ({ cash: STARTING_CASH, shares: sharesOf(0), tiles: 0 }));
				hand = handSize(entry.options);
				break;
			case "turnOrder":
				for (const tile of entry.tiles) {
					board[tile] = "loose";
				}
				// rules.md §3.4: every seat then draws a full hand, which is not logged as a draw.
				for (const seat of seats) {
					seat.tiles = hand;
				}
				break;
			case "move":
				if (entry.move.type === "place") {
					place(parseTile(entry.move.tile)!);
					seats[entry.seat]!.tiles -= 1;
				}
				break;
			case "drew":
				seats[entry.seat]!.tiles += entry.count;
				break;
			case "discarded":
				seats[entry.seat]!.tiles -= entry.tiles.length;
				break;
			case "founded":
				for (const t of connectedLoose(board, lastTile!)) {
					board[t] = entry.chain;
				}
				if (entry.bonus) {
					bank[entry.chain] -= 1;
					seats[entry.seat]!.shares[entry.chain] += 1;
				}
				break;
			case "bankTile":
				if (entry.result !== "removed") {
					place(entry.tile);
				}
				break;
			case "merger":
				merger = { tile: entry.tile, chains: Object.keys(entry.sizes) as ChainId[] };
				break;
			case "mergerPlan":
				merger!.survivor = entry.survivor;
				break;
			case "merged":
				for (let tile = 0; tile < board.length; tile++) {
					const cell = board[tile] ?? null;
					if (cell !== null && cell !== "loose" && merger!.chains.includes(cell)) {
						board[tile] = entry.survivor;
					}
				}
				for (const t of connectedLoose(board, merger!.tile)) {
					board[t] = entry.survivor;
				}
				merger = undefined;
				break;
			case "bonuses":
				for (const { seat, amount } of entry.payouts) {
					seats[seat]!.cash += amount;
				}
				break;
			case "disposed": {
				const seat = seats[entry.seat]!;
				seat.cash += entry.proceeds;
				seat.shares[entry.chain] -= entry.sold + entry.traded;
				bank[entry.chain] += entry.sold + entry.traded;
				seat.shares[merger!.survivor!] += entry.traded / 2;
				bank[merger!.survivor!] -= entry.traded / 2;
				break;
			}
			case "swapped": {
				const seat = seats[entry.seat]!;
				seat.cash -= entry.cost;
				seat.shares[entry.from] -= entry.count;
				bank[entry.from] += entry.count;
				seat.shares[entry.to] += entry.count;
				bank[entry.to] -= entry.count;
				break;
			}
			case "bought": {
				const seat = seats[entry.seat]!;
				seat.cash -= entry.cost;
				for (const [chain, count] of Object.entries(entry.shares) as [ChainId, number][]) {
					seat.shares[chain] += count;
					bank[chain] -= count;
				}
				break;
			}
			case "finalSale":
				seats[entry.seat]!.cash += entry.proceeds;
				seats[entry.seat]!.shares[entry.chain] -= entry.shares;
				bank[entry.chain] += entry.shares;
				break;
			default:
				break;
		}
	}
	return { board, bank, seats };
}
