import { activeChains, chainSize, playableTiles, tileLegality } from "./board.js";
import { AUTO_TURN_LIMIT } from "./config.js";
import { handSize } from "./options.js";
import { sharePrice } from "./prices.js";
import { canAnnounce, endConditionMet, endGame } from "./scoring.js";
import type { Tile } from "./tiles.js";
import { secondPlacementDue } from "./two-tiles.js";
import type { GameState } from "./types.js";

export function drawTile(state: GameState): Tile | undefined {
	return state.pool.pop();
}

/**
 * rules.md §9.6: whether the buy step has anything to offer. Only public facts count unless
 * holdings are public, so skipping the step never reveals a player's cash.
 */
export function buyStepAvailable(state: GameState): boolean {
	const seat = state.seats[state.activeSeat]!;
	// A swap may release cash even when buying is unaffordable. Do not use hidden holdings
	// to decide whether this step is shown; opponents must not learn them from an auto-skip.
	const active = activeChains(state.board);
	if (state.options.stockSwap && active.length > 1 && active.some((chain) => state.bank[chain] > 0)) {
		return true;
	}
	const cashIsPublic = state.options.publicHoldings;
	return activeChains(state.board).some(
		(chain) => state.bank[chain] > 0 && (!cashIsPublic || sharePrice(chain, chainSize(state.board, chain)) <= seat.cash)
	);
}

/**
 * Advance from the start of the active seat's turn until a player has a decision to make.
 * Placement is skipped when no tile is playable (rules.md §5.3) and buying when there is
 * nothing to buy (§9.6), but never at an announcement point (§4).
 */
export function startTurn(state: GameState): void {
	for (let advances = 0; ; advances++) {
		if (advances >= AUTO_TURN_LIMIT) {
			throw new Error(`Deadlock: ${AUTO_TURN_LIMIT} turns passed automatically with no player able to act`);
		}
		state.turn += 1;
		state.placedThisTurn = false;
		state.log.push({ type: "turn", seat: state.activeSeat });
		if (state.options.twoTiles) {
			// rules.md §15 twoTiles: dead tiles are replaced at the start of the turn instead.
			replaceDeadTiles(state);
		}
		if (playableTiles(state, state.activeSeat).length > 0 || canAnnounce(state)) {
			state.phase = "place";
			return;
		}
		state.log.push({ type: "skipPlace", seat: state.activeSeat });
		if (buyStepAvailable(state)) {
			state.phase = "buy";
			return;
		}
		if (finishTurn(state)) {
			return;
		}
	}
}

/**
 * Called once a placement and everything it caused (a founding, a merger, bank tiles) is
 * resolved. With twoTiles the seat then places its second tile, if any is playable.
 */
export function afterPlacement(state: GameState): void {
	if (secondPlacementDue(state) && playableTiles(state, state.activeSeat).length > 0) {
		state.phase = "place";
		return;
	}
	enterBuyPhase(state);
}

export function enterBuyPhase(state: GameState): void {
	if (buyStepAvailable(state) || canAnnounce(state)) {
		state.phase = "buy";
		return;
	}
	endTurn(state);
}

export function endTurn(state: GameState): void {
	if (!finishTurn(state)) {
		startTurn(state);
	}
}

/** rules.md §5.3: discard the active seat's permanently unplayable tiles and refill the hand. */
function replaceDeadTiles(state: GameState): void {
	const seat = state.seats[state.activeSeat]!;
	const dead = seat.hand.filter((tile) => tileLegality(state.board, tile) === "permanentlyUnplayable");
	if (dead.length > 0) {
		seat.hand = seat.hand.filter((tile) => !dead.includes(tile));
		state.removed.push(...dead);
		state.log.push({ type: "discarded", seat: state.activeSeat, tiles: dead });
	}
	refillHand(state);
}

function refillHand(state: GameState): void {
	const seat = state.seats[state.activeSeat]!;
	let drawn = 0;
	while (seat.hand.length < handSize(state.options)) {
		const tile = drawTile(state);
		if (tile === undefined) {
			break;
		}
		seat.hand.push(tile);
		drawn++;
	}
	if (drawn > 0) {
		state.log.push({ type: "drew", seat: state.activeSeat, count: drawn });
	}
}

/**
 * rules.md §4.4-4.5: replace permanently unplayable tiles (with twoTiles, only refill) and
 * draw. Then either end the game (an announcement this turn, or the §11.1 stall rule) or pass
 * the turn on. Returns whether the game ended.
 */
function finishTurn(state: GameState): boolean {
	if (state.options.twoTiles) {
		refillHand(state);
	} else {
		replaceDeadTiles(state);
	}
	state.turnsWithoutPlacement = state.placedThisTurn ? 0 : state.turnsWithoutPlacement + 1;
	if (state.endAnnounced !== null) {
		endGame(state, "announced");
		return true;
	}
	if (state.options.autoEnd && endConditionMet(state)) {
		endGame(state, "condition");
		return true;
	}
	if (state.turnsWithoutPlacement >= state.seats.length) {
		endGame(state, "stall");
		return true;
	}
	state.activeSeat = (state.activeSeat + 1) % state.seats.length;
	return false;
}
