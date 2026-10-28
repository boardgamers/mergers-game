import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyMove,
	currentSeat,
	initGame,
	legalMoves,
	placementEffect,
	tileLabel,
	turnPlacements,
	type GameState,
	type Move,
} from "acquire-engine";
import { stripSecret } from "acquire-engine/wrapper.js";
import { preparedPosition } from "../tutorial/lessons.ts";
import {
	adjustShares,
	canBuy,
	canDispose,
	disposalPresets,
	movesFor,
	nextDefunctChoices,
	turnLimit,
} from "./decisions.ts";

function playUntil(state: GameState, done: (state: GameState) => boolean): GameState {
	for (let step = 0; !done(state); step++) {
		assert.ok(!state.ended && step < 3000, "position not reached");
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		applyMove(state, moves[(step * 7919) % moves.length]!, currentSeat(state)!);
	}
	return state;
}

test("the viewer only offers moves when one of its seats must act", () => {
	const state = initGame(3, {}, "decisions");
	const acting = state.activeSeat;
	const view = stripSecret(state, acting);
	assert.deepEqual(movesFor(view, [acting]), legalMoves(state));
	assert.deepEqual(movesFor(stripSecret(state, (acting + 1) % 3), [(acting + 1) % 3]), []);
});

test("legal moves computed from a player's stripped view match the full state", () => {
	const state = initGame(4, {}, "stripped");
	for (let i = 0; i < 400 && !state.ended; i++) {
		const seat = currentSeat(state)!;
		const fromView = movesFor(stripSecret(state, seat), [seat]);
		assert.deepEqual(fromView, legalMoves(state), `move ${i}, phase ${state.phase}`);
		const moves = fromView.filter((move) => move.type !== "announce");
		applyMove(state, moves[(i * 7919) % moves.length]!, seat);
	}
});

test("buy choices: adding and removing shares follows the engine's legal buys", () => {
	const state = playUntil(
		initGame(3, {}, "buy-choices"),
		(s) => s.phase === "buy" && s.board.some((c) => c !== null && c !== "loose")
	);
	const moves = legalMoves(state);
	assert.ok(canBuy(moves, {}));
	const chain = (
		moves.find((m) => m.type === "buy" && Object.keys(m.shares).length > 0) as Extract<Move, { type: "buy" }>
	).shares;
	const [first] = Object.keys(chain) as (keyof typeof chain)[];
	const one = adjustShares({}, first!, 1);
	assert.ok(canBuy(moves, one));
	assert.deepEqual(adjustShares(one, first!, -1), {});
	assert.equal(
		canBuy(
			moves,
			adjustShares(adjustShares(adjustShares(adjustShares({}, first!, 1), first!, 1), first!, 1), first!, 1)
		),
		false,
		"never more than 3"
	);
});

test("disposal and defunct-order choices are looked up in the engine's legal moves", () => {
	const moves: Move[] = [
		{ type: "dispose", sell: 0, trade: 0 },
		{ type: "dispose", sell: 1, trade: 0 },
		{ type: "dispose", sell: 0, trade: 2 },
		{ type: "defunctOrder", chains: ["luxor", "festival", "imperial"] },
		{ type: "defunctOrder", chains: ["luxor", "imperial", "festival"] },
	];
	assert.ok(canDispose(moves, 0, 2));
	assert.equal(canDispose(moves, 1, 2), false);
	assert.deepEqual(nextDefunctChoices(moves, []), ["luxor"]);
	assert.deepEqual(nextDefunctChoices(moves, ["luxor"]), ["festival", "imperial"]);
	assert.deepEqual(nextDefunctChoices(moves, ["luxor", "imperial"]), ["festival"]);
});

test("disposal presets sell all or trade the available pairs without selling leftovers", () => {
	for (const [stock, trade] of [
		[25, 6],
		[1, 2],
		[0, 0],
	] as const) {
		const state = preparedPosition("mergers");
		state.seats[0]!.shares.luxor = 7;
		state.bank.luxor = 15;
		state.seats[1]!.shares.tower = 25 - stock;
		state.bank.tower = stock;
		applyMove(state, { type: "place", tile: "4A" }, 0);
		const moves = legalMoves(state);
		const before = structuredClone(moves);
		const presets = disposalPresets(movesFor(stripSecret(state, 0), [0]));
		assert.deepEqual(presets.sell, { type: "dispose", sell: 7, trade: 0 });
		assert.deepEqual(presets.trade, trade ? { type: "dispose", sell: 0, trade } : undefined);
		assert.deepEqual(moves, before);
		const sold = structuredClone(state);
		applyMove(sold, presets.sell!, 0);
		assert.equal(sold.seats[0]!.shares.luxor, 0);
		assert.equal(sold.seats[0]!.cash - state.seats[0]!.cash, 1400);
		if (presets.trade) {
			const cash = state.seats[0]!.cash;
			applyMove(state, presets.trade, 0);
			assert.equal(state.seats[0]!.shares.luxor, 7 - trade);
			assert.equal(state.seats[0]!.shares.tower, trade / 2);
			assert.equal(state.seats[0]!.cash, cash, "the stock-value change is not cash income");
		}
	}
	assert.deepEqual(disposalPresets([]), { sell: undefined, trade: undefined });
});

test("two-tile limits explain exactly the tiles the engine blocks this turn", () => {
	const state = initGame(4, { twoTiles: true }, "limits");
	const limited = () =>
		state.phase === "place" &&
		state.seats[state.activeSeat]!.hand.some((tile) => turnLimit(state, state.activeSeat, tile) !== undefined);
	playUntil(state, limited);
	const seat = state.activeSeat;
	const placeable = legalMoves(state).flatMap((move) => (move.type === "place" ? [move.tile] : []));
	for (const tile of state.seats[seat]!.hand) {
		const limit = turnLimit(state, seat, tile);
		if (limit === undefined) {
			continue;
		}
		assert.ok(!placeable.includes(tileLabel(tile)));
		const founding = placementEffect(state.board, tile).kind === "found";
		assert.equal(limit, founding && turnPlacements(state).founded ? "oneFounding" : "foundOrMerge");
		assert.equal(turnLimit(state, (seat + 1) % 4, tile), undefined, "limits apply only to the active seat");
	}
	const view = stripSecret(state, seat);
	assert.deepEqual(movesFor(view, [seat]), legalMoves(state));
});
