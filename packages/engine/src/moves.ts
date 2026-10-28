import { activeChains, chainSize, connectedLoose, placementEffect, playableTiles, tileLegality } from "./board.js";
import { defaultMove } from "./autoplay.js";
import { AUTO_MOVE_LIMIT, CHAIN_IDS, MAX_BUY, isChainId, type ChainId } from "./config.js";
import {
	dispose,
	isValidDefunctOrder,
	maxTrade,
	merger,
	setDefunctOrder,
	setSurvivor,
	startMerger,
	survivorCandidates,
} from "./merger.js";
import { maxStockSwap, swapStock } from "./stock-swap.js";
import { sharePrice } from "./prices.js";
import { canAnnounce, endGame } from "./scoring.js";
import { parseTile, tileLabel, type Tile } from "./tiles.js";
import { afterPlacement, endTurn, enterBuyPhase } from "./turn.js";
import { blockedThisTurn } from "./two-tiles.js";
import type { GameState, Move, Shares } from "./types.js";

export function currentSeat(state: GameState): number | undefined {
	if (state.ended) {
		return undefined;
	}
	// During stock disposal the player who must act is often not the one whose turn it is.
	return state.phase === "dispose" ? merger(state).disposers[0] : state.activeSeat;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted move against the current state and rebuilds it from whitelisted
 * fields only. Throws before anything is mutated.
 */
export function sanitizeMove(state: GameState, raw: unknown, seat: number): Move {
	if (state.ended) {
		throw new Error("The game has ended");
	}
	if (seat !== currentSeat(state)) {
		throw new Error("It is not your turn");
	}
	if (!isRecord(raw)) {
		throw new Error("A move must be an object");
	}
	if (raw.type === "announce") {
		// rules.md §4/§11.1: before placing (with twoTiles, also before the second tile) or
		// during the buy step, checked at this moment.
		if (state.phase !== "place" && state.phase !== "buy") {
			throw new Error("The end can only be announced before placing a tile or while buying");
		}
		if (!canAnnounce(state)) {
			throw new Error("The game cannot be ended now");
		}
		return { type: "announce" };
	}
	if (state.phase === "place" && raw.type === "pass") {
		// Only reachable at an announcement point (rules.md §4) with nothing to place.
		if (playableTiles(state, seat).length > 0) {
			throw new Error("You must place a tile");
		}
		return { type: "pass" };
	}
	if (raw.type === "swap") {
		if (!isChainId(raw.from) || !isChainId(raw.to) || !Number.isInteger(raw.count) || (raw.count as number) < 1) {
			throw new Error("Choose two different active chains and a positive whole number of shares");
		}
		if ((raw.count as number) > maxStockSwap(state, raw.from, raw.to)) {
			throw new Error("That stock swap exceeds the allowance, your holdings, available bank stock or cash");
		}
		return { type: "swap", from: raw.from, to: raw.to, count: raw.count as number };
	}
	if (raw.type !== state.phase) {
		throw new Error(`Expected a "${state.phase}" move`);
	}
	switch (state.phase) {
		case "place": {
			const tile = parseTile(raw.tile);
			if (tile === undefined) {
				throw new Error("Choose a tile such as 5C");
			}
			if (!state.seats[seat]!.hand.includes(tile)) {
				throw new Error(`Tile ${tileLabel(tile)} is not in your hand`);
			}
			if (tileLegality(state.board, tile) !== "playable") {
				throw new Error(`Tile ${tileLabel(tile)} cannot be played now`);
			}
			if (blockedThisTurn(state, tile)) {
				throw new Error("A turn cannot found two chains, or both found a chain and cause a merger");
			}
			return { type: "place", tile: tileLabel(tile) };
		}
		case "found": {
			if (!isChainId(raw.chain)) {
				throw new Error("Choose a chain to found");
			}
			if (activeChains(state.board).includes(raw.chain)) {
				throw new Error("That chain is already on the board");
			}
			return { type: "found", chain: raw.chain };
		}
		case "survivor": {
			if (!isChainId(raw.chain) || !survivorCandidates(merger(state)).includes(raw.chain)) {
				throw new Error("Choose one of the largest chains as the survivor");
			}
			return { type: "survivor", chain: raw.chain };
		}
		case "defunctOrder": {
			const chains = raw.chains;
			if (!Array.isArray(chains) || !chains.every(isChainId) || !isValidDefunctOrder(merger(state), chains)) {
				throw new Error("List every defunct chain, largest first");
			}
			return { type: "defunctOrder", chains: [...chains] };
		}
		case "dispose": {
			const { sell, trade } = raw;
			if (!Number.isInteger(sell) || !Number.isInteger(trade) || (sell as number) < 0 || (trade as number) < 0) {
				throw new Error("Sell and trade must be non-negative integers");
			}
			const held = state.seats[seat]!.shares[merger(state).current!];
			if ((sell as number) + (trade as number) > held) {
				throw new Error("You do not hold that many shares");
			}
			if ((trade as number) % 2 !== 0) {
				throw new Error("Shares are traded two for one");
			}
			if ((trade as number) > maxTrade(state, seat)) {
				throw new Error("The bank does not have enough survivor shares for that trade");
			}
			return { type: "dispose", sell: sell as number, trade: trade as number };
		}
		case "buy": {
			if (!isRecord(raw.shares)) {
				throw new Error("Shares must be an object of chain counts");
			}
			const shares: Partial<Shares> = {};
			let total = 0;
			let cost = 0;
			const active = activeChains(state.board);
			for (const [key, count] of Object.entries(raw.shares)) {
				if (!isChainId(key)) {
					throw new Error(`Unknown chain ${key}`);
				}
				if (!Number.isInteger(count) || (count as number) < 0) {
					throw new Error("Share counts must be non-negative integers");
				}
				const n = count as number;
				if (n === 0) {
					continue;
				}
				if (!active.includes(key)) {
					throw new Error("You can only buy shares in chains on the board");
				}
				if (state.bank[key] < n) {
					throw new Error("The bank does not have that many shares");
				}
				shares[key] = n;
				total += n;
				cost += n * sharePrice(key, chainSize(state.board, key));
			}
			if (total > MAX_BUY) {
				throw new Error(`You can buy at most ${MAX_BUY} shares per turn`);
			}
			if (cost > state.seats[seat]!.cash) {
				throw new Error("You cannot afford those shares");
			}
			return { type: "buy", shares };
		}
		default:
			throw new Error("No move is expected now");
	}
}

/** Applies a move by `seat`, mutating and returning the state. */
export function applyMove(state: GameState, raw: unknown, seat: number): GameState {
	const move = sanitizeMove(state, raw, seat);
	perform(state, move, seat, false);
	autoPlayDropped(state);
	return state;
}

/** Real players with at least one seat that has not dropped. */
export function remainingPlayers(state: GameState): number {
	return new Set(state.seatOwner.filter((_, seat) => !state.seats[seat]!.dropped)).size;
}

/**
 * rules.md §16: drops all of a real player's seats at once. If that leaves one player or
 * none, the game ends and is scored immediately; otherwise dropped seats are played
 * automatically whenever they must act.
 */
export function dropPlayerSeats(state: GameState, player: number): GameState {
	const seats = state.seatOwner.flatMap((owner, seat) => (owner === player ? [seat] : []));
	if (seats.length === 0) {
		throw new Error(`Unknown player ${player}`);
	}
	if (state.ended || seats.every((seat) => state.seats[seat]!.dropped)) {
		return state;
	}
	for (const seat of seats) {
		state.seats[seat]!.dropped = true;
		state.log.push({ type: "dropped", seat });
	}
	if (remainingPlayers(state) <= 1) {
		abandonTurn(state);
		endGame(state, "dropped");
		return state;
	}
	autoPlayDropped(state);
	return state;
}

/** rules.md §16: an unfinished merger is abandoned and waiting bank tiles leave the game. */
function abandonTurn(state: GameState): void {
	state.merger = null;
	state.pendingTile = null;
	if (state.bankTiles.length > 0) {
		state.removed.push(...state.bankTiles);
		state.bankTiles = [];
	}
}

/**
 * Plays default moves (rules.md §16) for as long as the seat that must act has dropped. That
 * seat is often not the active one, e.g. a dropped holder during merger disposal. With every
 * seat dropped this plays the game to its end.
 */
function autoPlayDropped(state: GameState): void {
	for (let moves = 0; ; moves++) {
		const seat = currentSeat(state);
		if (seat === undefined || !state.seats[seat]!.dropped) {
			return;
		}
		if (moves >= AUTO_MOVE_LIMIT) {
			throw new Error(`Deadlock: ${AUTO_MOVE_LIMIT} moves were auto-played without the game ending`);
		}
		perform(state, sanitizeMove(state, defaultMove(state, seat), seat), seat, true);
	}
}

function perform(state: GameState, move: Move, seat: number, auto: boolean): void {
	state.log.push({ type: "move", seat, move, ...(auto ? { auto: true as const } : {}) });
	switch (move.type) {
		case "place":
			placeTile(state, parseTile(move.tile)!);
			break;
		case "announce":
			state.endAnnounced = seat;
			state.log.push({ type: "announced", seat });
			break;
		case "pass":
			state.log.push({ type: "skipPlace", seat });
			enterBuyPhase(state);
			break;
		case "found":
			foundChain(state, move.chain);
			afterPlacement(state);
			break;
		case "survivor":
			setSurvivor(state, move.chain);
			break;
		case "defunctOrder":
			setDefunctOrder(state, move.chains);
			break;
		case "dispose":
			dispose(state, seat, move.sell, move.trade);
			break;
		case "swap":
			swapStock(state, move.from, move.to, move.count);
			break;
		case "buy":
			buyShares(state, move.shares);
			endTurn(state);
			break;
	}
}

function placeTile(state: GameState, tile: Tile): void {
	const seat = state.seats[state.activeSeat]!;
	const effect = placementEffect(state.board, tile);
	seat.hand = seat.hand.filter((t) => t !== tile);
	state.board[tile] = "loose";
	state.placedThisTurn = true;
	if (effect.kind === "merge") {
		startMerger(state, tile, effect.chains);
		return;
	}
	if (effect.kind === "grow") {
		for (const t of connectedLoose(state.board, tile)) {
			state.board[t] = effect.chain;
		}
		state.log.push({ type: "grew", chain: effect.chain, size: chainSize(state.board, effect.chain) });
	}
	if (effect.kind === "found") {
		state.pendingTile = tile;
		const available = CHAIN_IDS.filter((chain) => !activeChains(state.board).includes(chain));
		if (available.length > 1) {
			state.phase = "found";
			return;
		}
		foundChain(state, available[0]!);
	}
	afterPlacement(state);
}

/** rules.md §6. */
function foundChain(state: GameState, chain: ChainId): void {
	const tile = state.pendingTile!;
	for (const t of connectedLoose(state.board, tile)) {
		state.board[t] = chain;
	}
	state.pendingTile = null;
	const bonus = state.bank[chain] > 0;
	if (bonus) {
		state.bank[chain] -= 1;
		state.seats[state.activeSeat]!.shares[chain] += 1;
	}
	state.log.push({ type: "founded", seat: state.activeSeat, chain, size: chainSize(state.board, chain), bonus });
}

/** rules.md §9: prices are fixed for the whole buy phase. */
function buyShares(state: GameState, shares: Partial<Shares>): void {
	const seat = state.seats[state.activeSeat]!;
	let cost = 0;
	for (const [chain, count] of Object.entries(shares) as [ChainId, number][]) {
		cost += count * sharePrice(chain, chainSize(state.board, chain));
		state.bank[chain] -= count;
		seat.shares[chain] += count;
	}
	seat.cash -= cost;
	state.log.push({ type: "bought", seat: state.activeSeat, shares, cost });
}
