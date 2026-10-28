// Which choices the viewer offers. Validity always comes from the engine: these helpers only
// filter and look up engine.legalMoves(), so no rule is re-implemented here.
import {
	blockedThisTurn,
	CHAIN_IDS,
	chainSize,
	currentSeat,
	legalMoves,
	placementEffect,
	turnPlacements,
	type ChainId,
	type GameState,
	type Move,
	type Shares,
	type Tile,
} from "acquire-engine";
import { chainName, type Lang } from "./format.ts";

type MoveOf<T extends Move["type"]> = Extract<Move, { type: T }>;

/** The legal moves for the viewer, or none when another player must act. */
export function movesFor(state: GameState, seats: number[]): Move[] {
	const seat = currentSeat(state);
	return seat !== undefined && seats.includes(seat) ? legalMoves(state) : [];
}

export function ofType<T extends Move["type"]>(moves: Move[], type: T): MoveOf<T>[] {
	return moves.filter((move): move is MoveOf<T> => move.type === type);
}

/** What placing `tile` would do, in words (rules.md §5.1). */
export function describePlacement(state: GameState, tile: Tile, lang: Lang): string {
	const effect = placementEffect(state.board, tile);
	switch (effect.kind) {
		case "loose":
			return lang.t("place.loose");
		case "found":
			return lang.t("place.found");
		case "grow":
			return lang.t("place.joins", { chain: chainName(effect.chain) });
		case "merge":
			return lang.t("place.merges", {
				chains: lang.list(effect.chains.map((chain) => `${chainName(chain)} (${chainSize(state.board, chain)})`)),
			});
	}
}

/**
 * Why `tile` in `seat`'s hand can't be placed this turn under the two-tiles limits
 * (rules.md §4.1), or undefined when they don't block it.
 */
export function turnLimit(state: GameState, seat: number, tile: Tile): "oneFounding" | "foundOrMerge" | undefined {
	if (seat !== state.activeSeat || state.ended || !blockedThisTurn(state, tile)) {
		return undefined;
	}
	return placementEffect(state.board, tile).kind === "found" && turnPlacements(state).founded
		? "oneFounding"
		: "foundOrMerge";
}

function sameShares(a: Partial<Shares>, b: Partial<Shares>): boolean {
	return CHAIN_IDS.every((chain) => (a[chain] ?? 0) === (b[chain] ?? 0));
}

/** Whether buying exactly `shares` is a legal buy move. */
export function canBuy(moves: Move[], shares: Partial<Shares>): boolean {
	return ofType(moves, "buy").some((move) => sameShares(move.shares, shares));
}

/** `shares` with one more (or one fewer) share of `chain`, dropping zero counts. */
export function adjustShares(shares: Partial<Shares>, chain: ChainId, delta: number): Partial<Shares> {
	const next = { ...shares, [chain]: (shares[chain] ?? 0) + delta };
	if (next[chain] === 0) {
		delete next[chain];
	}
	return next;
}

/** Whether disposing with this sell/trade split is legal. */
export function canDispose(moves: Move[], sell: number, trade: number): boolean {
	return ofType(moves, "dispose").some((move) => move.sell === sell && move.trade === trade);
}

/** Presets respect the engine's stock limit; maximum trading keeps every unpaired share. */
export function disposalPresets(moves: Move[]) {
	const choices = ofType(moves, "dispose");
	return {
		sell: choices.filter((move) => move.trade === 0).sort((a, b) => b.sell - a.sell)[0],
		trade: choices.filter((move) => move.sell === 0 && move.trade > 0).sort((a, b) => b.trade - a.trade)[0],
	};
}

/** Chains that may come next after `prefix` in some legal defunct order. */
export function nextDefunctChoices(moves: Move[], prefix: ChainId[]): ChainId[] {
	const next = new Set<ChainId>();
	for (const move of ofType(moves, "defunctOrder")) {
		if (prefix.every((chain, i) => move.chains[i] === chain) && move.chains.length > prefix.length) {
			next.add(move.chains[prefix.length]!);
		}
	}
	return CHAIN_IDS.filter((chain) => next.has(chain));
}
