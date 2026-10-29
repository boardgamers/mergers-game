import assert from "node:assert/strict";
import { test } from "node:test";
import * as wrapper from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { applyMove, currentSeat } from "./moves.js";
import { DEFAULT_OPTIONS, normalizeOptions, sharePurchaseLimit } from "./options.js";
import { positionAt } from "./position.js";
import { initGame } from "./setup.js";
import { stockSwapsRemaining } from "./stock-swap.js";
import { chainAt, checkInvariants, scenario } from "./test/helpers.js";
import type { Move } from "./types.js";

function position(options: Record<string, unknown> = {}) {
	return scenario({
		board: { ...chainAt("tower", ["1A", "2A"]), ...chainAt("continental", ["1E", "2E"]) },
		hands: [["12I", "10I"], ["8I"], ["6I"], ["4I"]],
		shares: [{ tower: 6, continental: 6 }],
		options,
	});
}

test("purchase limit accepts only 3/4/5 and leaves standard and historical options unchanged", () => {
	for (let players = 2; players <= 6; players++) {
		for (const sharesPerTurn of [undefined, 3, "3"]) {
			const normalized = normalizeOptions(players, { sharesPerTurn });
			assert.deepEqual(normalized, { options: DEFAULT_OPTIONS, ignored: [] });
			assert.equal(sharePurchaseLimit(normalized.options), 3);
		}
		for (const sharesPerTurn of [4, "4", 5, "5"]) {
			const { options, ignored } = normalizeOptions(players, { sharesPerTurn });
			assert.equal(sharePurchaseLimit(options), Number(sharesPerTurn));
			assert.deepEqual(ignored, []);
		}
	}
	for (const sharesPerTurn of [null, true, 0, 2, 6, 7, -1, [], [4], {}, "4.0", "unlimited", Infinity]) {
		const { options, ignored } = normalizeOptions(3, { sharesPerTurn });
		assert.deepEqual(options, DEFAULT_OPTIONS);
		assert.deepEqual(ignored, [{ option: "sharesPerTurn", value: sharesPerTurn, reason: "unknown value" }]);
	}
	assert.deepEqual(initGame(3, {}, "old-purchases").options, DEFAULT_OPTIONS);
});

test("purchase limit applies to the total across chains in validation and legal moves", () => {
	for (const limit of [3, 4, 5]) {
		const state = position({ sharesPerTurn: String(limit) });
		applyMove(state, { type: "place", tile: "12I" }, 0);
		const choices = legalMoves(state).filter((move) => move.type === "buy");
		assert.equal(choices.length, ((limit + 1) * (limit + 2)) / 2, "all splits across two affordable chains");
		assert.deepEqual(legalMoves(wrapper.stripSecret(state, 0)), legalMoves(state));
		const original = structuredClone(state);
		for (const shares of [{ tower: limit + 1 }, { tower: 2, continental: limit - 1 }]) {
			assert.throws(() => applyMove(state, { type: "buy", shares }, 0), new RegExp(`at most ${limit}`));
			assert.deepEqual(state, original, "invalid purchases are atomic");
		}
		applyMove(state, { type: "buy", shares: { tower: 2, continental: limit - 2 } }, 0);
		assert.equal(state.seats[0]!.cash, 6000 - 400 - (limit - 2) * 400);
		assert.equal(state.seats[0]!.shares.tower, 8);
		assert.equal(state.seats[0]!.shares.continental, 6 + limit - 2);
		assert.equal(state.activeSeat, 1);
		checkInvariants(state);
	}
});

test("larger purchase limits still enforce cash, bank stock, active chains and turn ownership", () => {
	const state = position({ sharesPerTurn: 5 });
	applyMove(state, { type: "place", tile: "12I" }, 0);
	state.seats[0]!.cash = 900;
	assert.throws(() => applyMove(state, { type: "buy", shares: { tower: 5 } }, 0), /afford/);
	assert.ok(!legalMoves(state).some((m) => m.type === "buy" && m.shares.tower === 5));
	state.seats[0]!.cash = 6000;
	state.bank.tower = 4;
	assert.throws(() => applyMove(state, { type: "buy", shares: { tower: 5 } }, 0), /bank/);
	assert.ok(!legalMoves(state).some((m) => m.type === "buy" && m.shares.tower === 5));
	assert.throws(() => applyMove(state, { type: "buy", shares: { luxor: 1 } }, 0), /on the board/);
	assert.throws(() => applyMove(state, { type: "buy", shares: { tower: 1 } }, 1), /not your turn/);
});

test("five purchases remain independent of swaps and cover the whole two-tile turn", () => {
	const state = position({ sharesPerTurn: 5, stockSwap: 3, twoTiles: true });
	applyMove(state, { type: "place", tile: "12I" }, 0);
	assert.equal(state.phase, "place");
	assert.throws(() => applyMove(state, { type: "buy", shares: { tower: 5 } }, 0));
	applyMove(state, { type: "place", tile: "10I" }, 0);
	applyMove(state, { type: "swap", from: "continental", to: "tower", count: 3 }, 0);
	assert.equal(stockSwapsRemaining(state), 0);
	applyMove(state, { type: "buy", shares: { tower: 5 } }, 0);
	assert.equal(state.seats[0]!.shares.tower, 14);
	assert.equal(state.seats[0]!.cash, 5600);
	assert.equal(state.activeSeat, 1);
	assert.equal(state.log.filter((e) => e.type === "bought").length, 1);
	checkInvariants(state);
});

test("four- and five-share turn drafts commit once after revisions without extra history or time", () => {
	for (const limit of [4, 5]) {
		const base = position({ sharesPerTurn: limit, stockSwap: 3 });
		const original = structuredClone(base);
		const moves: Move[] = [
			{ type: "place", tile: "12I" },
			{ type: "swap", from: "continental", to: "tower", count: 1 },
		];
		for (let i = 0; i < 4; i++) {
			const preview = wrapper.move(
				base,
				{ type: "turn", from: base.log.length, moves: moves.slice(0, (i % 2) + 1) },
				0
			);
			assert.equal(wrapper.toSave(preview), undefined);
			assert.deepEqual(wrapper.timeIncrements(preview), [0, 0, 0]);
		}
		const saved = wrapper.move(
			base,
			{
				type: "turn",
				from: base.log.length,
				moves: [...moves, { type: "buy", shares: { tower: limit } }],
			},
			0
		);
		assert.deepEqual(base, original);
		assert.equal(wrapper.toSave(saved), saved);
		assert.equal(saved.log.filter((entry) => entry.type === "move").length, 3);
		assert.deepEqual(wrapper.timeIncrements(saved), [1, 0, 0]);
		checkInvariants(saved);
	}
});

test("purchase variants replay across bank, four-hands, team and two-tile games, including the old default", () => {
	for (const [players, options] of [
		[3, {}],
		[3, { sharesPerTurn: "3" }],
		[2, { sharesPerTurn: "4" }],
		[2, { sharesPerTurn: "5", twoPlayerMode: "fourHands" }],
		[4, { sharesPerTurn: "4", teamPlay: true }],
		[3, { sharesPerTurn: "5", twoTiles: true, limitedLog: true }],
	] as [number, Record<string, unknown>][]) {
		const state = initGame(players, options, "purchase-replay");
		let largestBuy = 0;
		for (let i = 0; i < 150 && !state.ended; i++) {
			const moves = legalMoves(state).filter((m) => m.type !== "announce");
			const move = moves.at(-1)!;
			if (move.type === "buy") {
				largestBuy = Math.max(
					largestBuy,
					Object.values(move.shares).reduce((a, b) => a + b, 0)
				);
			}
			applyMove(state, move, currentSeat(state)!);
		}
		assert.equal(largestBuy, sharePurchaseLimit(state.options));
		assert.deepEqual(wrapper.replay(state), state);
		const reconstructed = positionAt(state, state.log.length);
		assert.deepEqual(reconstructed.board, state.board);
		assert.deepEqual(reconstructed.bank, state.bank);
		checkInvariants(state);
	}
});
