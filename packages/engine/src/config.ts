export type Tier = "minor" | "medium" | "major";

// rules.md §8: chain names and tiers live in this one table. Its order is the "config order"
// used for tie-breaking defaults (rules.md §16).
export const CHAINS = [
	{ id: "tower", name: "Tower", tier: "minor" },
	{ id: "luxor", name: "Luxor", tier: "minor" },
	{ id: "worldwide", name: "Worldwide", tier: "medium" },
	{ id: "american", name: "American", tier: "medium" },
	{ id: "festival", name: "Festival", tier: "medium" },
	{ id: "imperial", name: "Imperial", tier: "major" },
	{ id: "continental", name: "Continental", tier: "major" },
] as const satisfies readonly { id: string; name: string; tier: Tier }[];

export type ChainId = (typeof CHAINS)[number]["id"];

export const CHAIN_IDS: readonly ChainId[] = CHAINS.map((c) => c.id);

export const BOARD_COLUMNS = 12;
export const BOARD_ROWS = 9;
export const TILE_COUNT = BOARD_COLUMNS * BOARD_ROWS;
export const STARTING_CASH = 6000;
export const HAND_SIZE = 6;
export const TWO_TILE_HAND_SIZE = 8;
export const SHARES_PER_CHAIN = 25;
export const SAFE_SIZE = 11;
export const END_SIZE = 41;
/** Automatic turn advances allowed within one move before declaring a deadlock. */
export const AUTO_TURN_LIMIT = 50;
/** Moves auto-played for dropped seats within one call; a whole game needs far fewer. */
export const AUTO_MOVE_LIMIT = 20000;
export const MAX_BUY = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function chainTier(chain: ChainId): Tier {
	return CHAINS.find((c) => c.id === chain)!.tier;
}

export function isChainId(value: unknown): value is ChainId {
	return typeof value === "string" && (CHAIN_IDS as readonly string[]).includes(value);
}
