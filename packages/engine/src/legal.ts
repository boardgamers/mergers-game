import { activeChains } from "./board.js";
import { CHAIN_IDS, type ChainId } from "./config.js";
import { merger } from "./merger.js";
import { currentSeat, sanitizeMove } from "./moves.js";
import { sharePurchaseLimit } from "./options.js";
import { maxStockSwap } from "./stock-swap.js";
import { tileLabel } from "./tiles.js";
import type { GameState, Move, Shares } from "./types.js";

function buyCombinations(chains: ChainId[], limit: number): Partial<Shares>[] {
	const result: Partial<Shares>[] = [];
	const visit = (from: number, remaining: number, current: Partial<Shares>) => {
		result.push({ ...current });
		if (remaining === 0) {
			return;
		}
		for (let i = from; i < chains.length; i++) {
			const chain = chains[i]!;
			current[chain] = (current[chain] ?? 0) + 1;
			visit(i, remaining - 1, current);
			current[chain]! -= 1;
			if (current[chain] === 0) {
				delete current[chain];
			}
		}
	};
	visit(0, limit, {});
	return result;
}

function permutations<T>(items: T[]): T[][] {
	if (items.length <= 1) {
		return [items];
	}
	return items.flatMap((item, i) =>
		permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
	);
}

function candidates(state: GameState): Move[] {
	const announce: Move[] = state.phase === "place" || state.phase === "buy" ? [{ type: "announce" }] : [];
	return [...announce, ...phaseCandidates(state)];
}

function phaseCandidates(state: GameState): Move[] {
	switch (state.phase) {
		case "place":
			return [
				{ type: "pass" },
				...state.seats[state.activeSeat]!.hand.map((tile): Move => ({ type: "place", tile: tileLabel(tile) })),
			];
		case "found":
			return CHAIN_IDS.map((chain) => ({ type: "found", chain }));
		case "survivor":
			return CHAIN_IDS.map((chain) => ({ type: "survivor", chain }));
		case "defunctOrder":
			return permutations(
				CHAIN_IDS.filter((chain) => {
					const m = merger(state);
					return m.sizes[chain] !== undefined && chain !== m.survivor;
				})
			).map((chains) => ({ type: "defunctOrder", chains }));
		case "dispose": {
			const m = merger(state);
			const held = state.seats[currentSeat(state)!]!.shares[m.current!];
			const moves: Move[] = [];
			for (let trade = 0; trade <= held; trade += 2) {
				for (let sell = 0; sell + trade <= held; sell++) {
					moves.push({ type: "dispose", sell, trade });
				}
			}
			return moves;
		}
		case "buy": {
			const active = activeChains(state.board);
			const moves: Move[] = buyCombinations(active, sharePurchaseLimit(state.options)).map((shares) => ({
				type: "buy",
				shares,
			}));
			for (const from of active) {
				for (const to of active) {
					const max = maxStockSwap(state, from, to);
					for (let count = 1; count <= max; count++) {
						moves.push({ type: "swap", from, to, count });
					}
				}
			}
			return moves;
		}
		default:
			return [];
	}
}

/** Every move the current seat may make, each one accepted by sanitizeMove. */
export function legalMoves(state: GameState): Move[] {
	if (state.ended) {
		return [];
	}
	return candidates(state).filter((move) => {
		try {
			sanitizeMove(state, move, currentSeat(state)!);
			return true;
		} catch {
			return false;
		}
	});
}
