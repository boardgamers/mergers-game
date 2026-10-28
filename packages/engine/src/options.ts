import { END_SIZE, HAND_SIZE, TWO_TILE_HAND_SIZE } from "./config.js";

/** rules.md §15, after normalisation against the player count. */
export interface GameOptions {
	publicHoldings: boolean;
	teamPlay: boolean;
	twoPlayerMode: "bank" | "fourHands";
	autoEnd: boolean;
	endSize: number;
	/** Omitted when off, preserving the init log of games created before this variant. */
	stockSwap?: 3 | 5 | 7 | "unlimited";
	/** Omitted when off, like stockSwap. */
	twoTiles?: true;
	/** Omitted when off, like stockSwap. */
	limitedLog?: true;
}

export interface IgnoredOption {
	option: string;
	value: unknown;
	reason: string;
}

export const DEFAULT_OPTIONS: GameOptions = {
	publicHoldings: false,
	teamPlay: false,
	twoPlayerMode: "bank",
	autoEnd: false,
	endSize: END_SIZE,
};

const END_SIZES = [41, 31];

/**
 * Reads the creator's options defensively. BGS omits unticked checkboxes and always sends
 * selects (as strings), so a missing checkbox means false. Options are never rejected
 * (rules.md §3.5/§15): anything that does not apply, or has an unknown value, is ignored
 * and reported so the log can say so.
 */
export function normalizeOptions(
	players: number,
	raw: Record<string, unknown>
): { options: GameOptions; ignored: IgnoredOption[] } {
	const options: GameOptions = { ...DEFAULT_OPTIONS };
	const ignored: IgnoredOption[] = [];

	options.publicHoldings = raw.publicHoldings === true;
	options.autoEnd = raw.autoEnd === true;

	if (raw.teamPlay === true) {
		if (players === 4) {
			options.teamPlay = true;
		} else {
			ignored.push({ option: "teamPlay", value: true, reason: "only applies with exactly 4 players" });
		}
	}

	if (raw.twoPlayerMode === "fourHands") {
		if (players === 2) {
			options.twoPlayerMode = "fourHands";
		} else {
			ignored.push({ option: "twoPlayerMode", value: "fourHands", reason: "only applies with exactly 2 players" });
		}
	} else if (raw.twoPlayerMode !== undefined && raw.twoPlayerMode !== "bank") {
		ignored.push({ option: "twoPlayerMode", value: raw.twoPlayerMode, reason: "unknown value" });
	}

	if (raw.endSize !== undefined) {
		const size = Number(raw.endSize);
		if (END_SIZES.includes(size)) {
			options.endSize = size;
		} else {
			ignored.push({ option: "endSize", value: raw.endSize, reason: "unknown value" });
		}
	}

	if (raw.stockSwap === "unlimited") {
		options.stockSwap = "unlimited";
	} else if (raw.stockSwap !== undefined && raw.stockSwap !== "off") {
		if ([3, 5, 7, "3", "5", "7"].includes(raw.stockSwap as number | string)) {
			options.stockSwap = Number(raw.stockSwap) as 3 | 5 | 7;
		} else {
			ignored.push({ option: "stockSwap", value: raw.stockSwap, reason: "unknown value" });
		}
	}

	if (raw.twoTiles === true) {
		options.twoTiles = true;
	}
	if (raw.limitedLog === true) {
		options.limitedLog = true;
	}

	return { options, ignored };
}

/** rules.md §15 twoTiles: hands hold 8 tiles instead of 6. */
export function handSize(options: GameOptions): number {
	return options.twoTiles ? TWO_TILE_HAND_SIZE : HAND_SIZE;
}

/** Internal seats per real player: fourHands gives each of the 2 players two seats. */
export function seatOwners(players: number, options: GameOptions): number[] {
	if (players === 2 && options.twoPlayerMode === "fourHands") {
		// rules.md §15: player A has seats 1 and 3, player B seats 2 and 4.
		return [0, 1, 0, 1];
	}
	return Array.from({ length: players }, (_, seat) => seat);
}
