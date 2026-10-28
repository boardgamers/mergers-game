import { CHAIN_IDS, MAX_PLAYERS, MIN_PLAYERS, SHARES_PER_CHAIN, STARTING_CASH } from "./config.js";
import { handSize, normalizeOptions, seatOwners } from "./options.js";
import { shuffle } from "./prng.js";
import { allTiles } from "./tiles.js";
import { drawTile, startTurn } from "./turn.js";
import type { GameState, Shares } from "./types.js";

function sharesOf(count: number): Shares {
	return Object.fromEntries(CHAIN_IDS.map((chain) => [chain, count])) as Shares;
}

/** Creates a game for `players` real players; fourHands gives each of them two seats. */
export function initGame(players: number, rawOptions: Record<string, unknown>, seed: string): GameState {
	if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
		throw new Error(`Acquire needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
	}
	const { options, ignored } = normalizeOptions(players, rawOptions);
	const seatOwner = seatOwners(players, options);
	const seats = seatOwner.length;
	const state: GameState = {
		seed,
		rngCounter: 0,
		options,
		players,
		seatOwner,
		seats: Array.from({ length: seats }, (_, seat) => ({
			name: `Player ${seat + 1}`,
			cash: STARTING_CASH,
			shares: sharesOf(0),
			hand: [],
			dropped: false,
		})),
		board: allTiles().map(() => null),
		pool: [],
		removed: [],
		bank: sharesOf(SHARES_PER_CHAIN),
		activeSeat: 0,
		phase: "place",
		pendingTile: null,
		merger: null,
		bankTiles: [],
		endAnnounced: null,
		placedThisTurn: false,
		turnsWithoutPlacement: 0,
		turn: 0,
		log: [{ type: "init", players, seats, options: { ...options }, rawOptions: structuredClone(rawOptions) }],
		ended: false,
	};
	for (const entry of ignored) {
		state.log.push({ type: "optionIgnored", ...entry });
	}
	state.pool = shuffle(state, allTiles());

	// rules.md §3.2-3.3: one tile each, placed as loose tiles; the lowest tile goes first.
	const orderTiles = state.seats.map(() => drawTile(state)!);
	for (const tile of orderTiles) {
		state.board[tile] = "loose";
	}
	const first = orderTiles.indexOf(Math.min(...orderTiles));
	state.log.push({ type: "turnOrder", tiles: orderTiles, first });

	for (const seat of state.seats) {
		for (let i = 0; i < handSize(options); i++) {
			seat.hand.push(drawTile(state)!);
		}
	}

	state.activeSeat = first;
	startTurn(state);
	return state;
}
