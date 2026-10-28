import assert from "node:assert/strict";
import { test } from "node:test";
import * as wrapper from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { logWindowStart } from "./limited-log.js";
import { applyMove, currentSeat } from "./moves.js";
import { normalizeOptions } from "./options.js";
import { initGame } from "./setup.js";
import type { GameState, LogEntry } from "./types.js";

const LIMITED = { limitedLog: true };

function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/** Plays random legal moves (never announcing) until `done` holds or the game ends. */
function playUntil(state: GameState, random: () => number, done: (state: GameState) => boolean = () => false) {
	while (!state.ended && !done(state)) {
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		applyMove(state, moves[Math.floor(random() * moves.length)]!, currentSeat(state)!);
	}
}

function turnIndexes(state: GameState, seat: number): number[] {
	return state.log.flatMap((entry, index) => (entry.type === "turn" && entry.seat === seat ? [index] : []));
}

const hiddenCount = (log: LogEntry[]) => log.filter((entry) => entry.type === "hidden").length;

test("§15 limitedLog defaults off: every viewer gets the whole log", () => {
	assert.equal("limitedLog" in normalizeOptions(3, {}).options, false);
	assert.equal(normalizeOptions(3, { limitedLog: "true" }).options.limitedLog, undefined);
	assert.equal(normalizeOptions(3, LIMITED).options.limitedLog, true);
	const state = initGame(3, {}, "full-log");
	playUntil(state, lcg(1), (s) => s.turn > 12);
	for (const player of [0, 1, 2, undefined]) {
		assert.deepEqual(wrapper.stripSecret(state, player).log, state.log);
	}
});

test("§13 limitedLog: a player sees the log from the start of their last turn, with setup kept", () => {
	const state = initGame(4, LIMITED, "window");
	playUntil(state, lcg(2), (s) => s.turn > 14 && s.phase === "place");
	const active = state.activeSeat;
	for (let player = 0; player < 4; player++) {
		const view = wrapper.stripSecret(state, player);
		assert.equal(view.log.length, state.log.length, "the log keeps its length for turn drafts");
		const turns = turnIndexes(state, player);
		// While it is your turn, the window starts at your previous one.
		const start = player === active ? turns.at(-2)! : turns.at(-1)!;
		assert.equal(logWindowStart(state, player), start);
		view.log.forEach((entry, index) => {
			const setup = ["init", "optionIgnored", "turnOrder"].includes(state.log[index]!.type);
			assert.deepEqual(entry, index >= start || setup ? state.log[index] : { type: "hidden" }, `entry ${index}`);
		});
		assert.ok(hiddenCount(view.log) > 0);
	}
	assert.deepEqual(
		wrapper.stripSecret(state, undefined).log,
		wrapper.stripSecret(state, active).log,
		"spectators see what the active player sees"
	);
});

test("§13 limitedLog: a merger in progress stays fully visible to every disposer", () => {
	const state = initGame(4, LIMITED, "mergers");
	const random = lcg(6);
	let disposals = 0;
	while (!state.ended && disposals < 20) {
		if (state.phase === "dispose") {
			const current = state.log.map((entry) => entry.type).lastIndexOf("turn");
			const view = wrapper.stripSecret(state, state.seatOwner[currentSeat(state)!]);
			assert.deepEqual(view.log.slice(current), state.log.slice(current));
			disposals++;
		}
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		applyMove(state, moves[Math.floor(random() * moves.length)]!, currentSeat(state)!);
	}
	assert.ok(disposals > 0, "the game reached a stock disposal");
});

test("§13 limitedLog: the whole log is revealed once the game ends", () => {
	const state = initGame(3, LIMITED, "revealed");
	playUntil(state, lcg(3));
	assert.equal(state.ended, true);
	for (const player of [0, 1, 2, undefined]) {
		assert.deepEqual(wrapper.stripSecret(state, player).log, state.log);
		assert.equal(hiddenCount(wrapper.logSlice(state, { player }).log), 0);
	}
});

test("§13 limitedLog: logSlice hides the same entries, and new entries are never hidden", () => {
	const state = initGame(3, LIMITED, "slice");
	const random = lcg(4);
	playUntil(state, random, (s) => s.turn > 10);
	for (const player of [0, 1, 2, undefined]) {
		const { log } = wrapper.logSlice(state, { player });
		assert.deepEqual(
			log.map(({ simple: _simple, ...entry }) => entry),
			wrapper.stripSecret(state, player).log
		);
		for (const entry of log) {
			assert.ok(entry.simple.length > 0);
		}
	}
	const before = state.log.length;
	playUntil(state, random, (s) => s.log.length > before + 5);
	for (const player of [0, 1, 2]) {
		assert.equal(hiddenCount(wrapper.logSlice(state, { player, start: before }).log), 0);
	}
});

test("§13 limitedLog: legal moves and turn drafts work from a player's limited view", () => {
	for (let players = 2; players <= 6; players++) {
		for (const options of [LIMITED, { ...LIMITED, twoTiles: true, stockSwap: "unlimited" }]) {
			const state = initGame(players, options, `view-${players}`);
			const random = lcg(players);
			for (let i = 0; i < 300 && !state.ended; i++) {
				const seat = currentSeat(state)!;
				const view = wrapper.stripSecret(state, state.seatOwner[seat]);
				assert.deepEqual(legalMoves(view), legalMoves(state), `${players} players, move ${i}`);
				const moves = legalMoves(state).filter((move) => move.type !== "announce");
				applyMove(state, moves[Math.floor(random() * moves.length)]!, seat);
			}
		}
	}
	const state = initGame(3, LIMITED, "draft");
	playUntil(state, lcg(5), (s) => s.turn > 9 && s.phase === "place");
	const player = wrapper.currentPlayer(state)!;
	const view = wrapper.stripSecret(state, player);
	const move = legalMoves(view).find((m) => m.type === "place")!;
	const result = wrapper.move(state, { type: "turn", from: view.log.length, moves: [move] }, player);
	assert.equal(result.log.length > state.log.length || result.tentative !== undefined, true);
});
