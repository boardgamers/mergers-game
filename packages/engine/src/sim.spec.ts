import assert from "node:assert/strict";
import { test } from "node:test";
import { legalMoves } from "./legal.js";
import { remainingPlayers } from "./moves.js";
import { checkInvariants } from "./test/helpers.js";
import type { GameState } from "./types.js";
import * as wrapper from "../wrapper.js";

function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/**
 * Every valid rules.md §15 combination for a player count, in the shape BGS sends: unticked
 * checkboxes are absent, selects are always present as strings. teamPlay only applies with 4
 * players and twoPlayerMode only with 2, so other counts get the default for those.
 */
function optionCombinations(players: number): Record<string, unknown>[] {
	const combos: Record<string, unknown>[] = [];
	for (const publicHoldings of [false, true]) {
		for (const twoTiles of [false, true]) {
			for (const autoEnd of [false, true]) {
				for (const endSize of ["41", "31"]) {
					for (const twoPlayerMode of players === 2 ? ["bank", "fourHands"] : ["bank"]) {
						for (const teamPlay of players === 4 ? [false, true] : [false]) {
							combos.push({
								...(publicHoldings ? { publicHoldings } : {}),
								...(autoEnd ? { autoEnd } : {}),
								...(twoTiles ? { twoTiles } : {}),
								...(teamPlay ? { teamPlay } : {}),
								twoPlayerMode,
								endSize,
							});
						}
					}
				}
			}
		}
	}
	return combos;
}

const MOVE_LIMIT = 5000;
const REPLAY_SAMPLES = 6;

interface Boundary {
	logLength: number;
	state: GameState;
}

/**
 * Plays one random game to the end through the BGS wrapper, round-tripping the state through
 * JSON between calls as BGS storage does. With `drops`, players occasionally drop out.
 */
function simulate(players: number, options: Record<string, unknown>, seed: string, drops: boolean) {
	const random = lcg([...seed].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7) >>> 0);
	let state = wrapper.init(players, [], options, seed);
	checkInvariants(state);
	const boundaries: Boundary[] = [{ logLength: wrapper.logLength(state), state: structuredClone(state) }];
	let actions = 0;
	while (!wrapper.ended(state)) {
		assert.ok(actions++ < MOVE_LIMIT, `§14.8 ${seed} did not finish`);
		if (drops && random() < 0.01) {
			const candidates = Array.from({ length: players }, (_, p) => p).filter((p) =>
				state.seatOwner.some((owner, seat) => owner === p && !state.seats[seat]!.dropped)
			);
			const before = remainingPlayers(state);
			wrapper.dropPlayer(state, candidates[Math.floor(random() * candidates.length)]!);
			assert.equal(state.ended, before - 1 <= 1, "§16 the game ends exactly when one player or none remains");
		} else {
			const player = wrapper.currentPlayer(state);
			assert.notEqual(player, undefined, "an unfinished game always has a player to act");
			const moves = legalMoves(state);
			assert.ok(moves.length > 0, `${seed}: the acting player always has a legal move`);
			const announce = moves.filter((move) => move.type === "announce");
			const others = moves.filter((move) => move.type !== "announce");
			const choices = announce.length > 0 && (others.length === 0 || random() < 0.1) ? announce : others;
			wrapper.move(state, choices[Math.floor(random() * choices.length)]!, player!);
		}
		state = JSON.parse(JSON.stringify(state)) as GameState;
		checkInvariants(state);
		boundaries.push({ logLength: wrapper.logLength(state), state: structuredClone(state) });
	}
	assert.equal(wrapper.currentPlayer(state), undefined);
	assert.equal(wrapper.scores(state).length, players);
	assert.equal(wrapper.rankings(state).length, players);
	return { state, boundaries, random };
}

function checkReplay(seed: string, final: GameState, boundaries: Boundary[], random: () => number): void {
	assert.deepEqual(wrapper.replay(final), final, `§14.7 ${seed}: replaying the whole log rebuilds the final state`);
	const picks = new Set([0, boundaries.length - 1]);
	while (picks.size < Math.min(REPLAY_SAMPLES + 2, boundaries.length)) {
		picks.add(Math.floor(random() * boundaries.length));
	}
	for (const index of picks) {
		const { logLength, state } = boundaries[index]!;
		const replayed = wrapper.replay(final, { to: logLength });
		assert.equal(wrapper.logLength(replayed), logLength);
		assert.deepEqual(replayed, state, `§14.7 ${seed}: replay to ${logLength} rebuilds the state at that point`);
	}
}

for (let players = 2; players <= 6; players++) {
	test(`§14 simulation: ${players} players, every valid option combination, with and without drops`, () => {
		const seen = { drops: 0, autoMoves: 0, autoDisposals: 0 };
		for (const options of optionCombinations(players)) {
			for (const drops of [false, true]) {
				const seed = `sim-${players}-${drops ? "drops" : "full"}-${JSON.stringify(options)}`;
				const { state, boundaries, random } = simulate(players, options, seed, drops);
				checkReplay(seed, state, boundaries, random);
				for (const entry of state.log) {
					seen.drops += entry.type === "dropped" ? 1 : 0;
					if (entry.type === "move" && entry.auto === true) {
						seen.autoMoves++;
						seen.autoDisposals += entry.move.type === "dispose" ? 1 : 0;
					}
				}
			}
		}
		assert.ok(seen.drops > 0, "the simulation includes drops");
		if (players >= 3) {
			// With two players any drop ends the game, so only larger games auto-play.
			assert.ok(
				seen.autoMoves > 0 && seen.autoDisposals > 0,
				"the simulation includes auto-played moves and disposals"
			);
		}
	});
}

test("§15 the simulation covers every valid option combination", () => {
	assert.deepEqual(
		[2, 3, 4, 5, 6].map((players) => optionCombinations(players).length),
		[32, 16, 32, 16, 16]
	);
});
