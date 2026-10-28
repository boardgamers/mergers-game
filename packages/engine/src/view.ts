import { CHAIN_IDS } from "./config.js";
import { visibleLog } from "./limited-log.js";
import type { GameState, Shares } from "./types.js";

/** Value sent in place of anything the viewer may not see. */
export const HIDDEN = -1;

const HIDDEN_SHARES = Object.fromEntries(CHAIN_IDS.map((chain) => [chain, HIDDEN])) as Shares;

/** The internal seats a real player controls (two in fourHands); none for a spectator. */
export function seatsOf(state: GameState, player: number | undefined): number[] {
	return state.seatOwner.flatMap((owner, seat) => (owner === player ? [seat] : []));
}

/**
 * rules.md §13: the state as `player` may see it (undefined for a spectator). Hidden numbers
 * are replaced by HIDDEN so the shape stays the same. Hands and the pool order are always
 * private; holdings and cash are private unless publicHoldings is on or the game has ended.
 * With limitedLog, older log entries are replaced. The seed is removed because it determines
 * the pool order.
 */
export function viewFor(state: GameState, player: number | undefined): GameState {
	const own = seatsOf(state, player);
	const holdingsPublic = state.options.publicHoldings || state.ended;
	return {
		...structuredClone(state),
		seed: "",
		rngCounter: 0,
		pool: state.pool.map(() => HIDDEN),
		log: visibleLog(state, player),
		seats: state.seats.map((seat, index) => {
			if (own.includes(index)) {
				return structuredClone(seat);
			}
			return {
				...structuredClone(seat),
				hand: seat.hand.map(() => HIDDEN),
				...(holdingsPublic ? {} : { cash: HIDDEN, shares: { ...HIDDEN_SHARES } }),
			};
		}),
	};
}
