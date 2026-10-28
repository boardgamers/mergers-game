import type { ChainId } from "./config.js";
import type { GameOptions } from "./options.js";
import type { Tile } from "./tiles.js";

/** An empty square, a loose tile, or a tile belonging to a chain. */
export type Cell = null | "loose" | ChainId;

export type Shares = Record<ChainId, number>;

export interface SeatState {
	name: string;
	cash: number;
	shares: Shares;
	hand: Tile[];
	dropped: boolean;
}

export type Phase = "place" | "found" | "survivor" | "defunctOrder" | "dispose" | "buy" | "ended";

export type Move =
	| { type: "place"; tile: string }
	| { type: "pass" }
	| { type: "announce" }
	| { type: "found"; chain: ChainId }
	| { type: "survivor"; chain: ChainId }
	| { type: "defunctOrder"; chains: ChainId[] }
	| { type: "dispose"; sell: number; trade: number }
	| { type: "swap"; from: ChainId; to: ChainId; count: number }
	| { type: "buy"; shares: Partial<Shares> };

/** The complete private move sequence since the last saved position. */
export interface TurnRequest {
	type: "turn";
	from: number;
	moves: Move[];
}

export interface MergerState {
	/** The merging tile; it sits on the board as a loose tile until the board update (§7.3). */
	tile: Tile;
	mergermaker: number;
	/** Pre-merger sizes of every chain the tile touches (§7.1.1). */
	sizes: Partial<Record<ChainId, number>>;
	survivor: ChainId | null;
	/** Defunct chains still to resolve, in resolution order. */
	defunct: ChainId[];
	/** The defunct chain whose stock is being disposed of. */
	current: ChainId | null;
	/** Seats still to dispose of `current`, in order; the first one is acting. */
	disposers: number[];
}

export type BonusPayout = { seat: number; amount: number };

/** The two-player bank's fictional holding for one bonus payout (rules.md §12). */
export type BankHolding = { tile: Tile | null; shares: number; amount: number };

export type LogEntry =
	| { type: "init"; players: number; seats: number; options: GameOptions; rawOptions: Record<string, unknown> }
	| { type: "optionIgnored"; option: string; value: unknown; reason: string }
	| { type: "dropped"; seat: number }
	| { type: "turnOrder"; tiles: Tile[]; first: number }
	| { type: "move"; seat: number; move: Move; auto?: true }
	| { type: "turn"; seat: number }
	| { type: "skipPlace"; seat: number }
	| { type: "founded"; seat: number; chain: ChainId; size: number; bonus: boolean }
	| { type: "grew"; chain: ChainId; size: number }
	| { type: "merger"; seat: number; tile: Tile; sizes: Partial<Record<ChainId, number>>; byBank?: true }
	| { type: "mergerPlan"; survivor: ChainId; defunct: ChainId[] }
	| { type: "bonuses"; chain: ChainId; size: number; payouts: BonusPayout[]; bank?: BankHolding }
	| { type: "bankTile"; tile: Tile; result: "loose" | "joined" | "merger" | "removed" }
	| { type: "disposed"; seat: number; chain: ChainId; sold: number; traded: number; held: number; proceeds: number }
	| { type: "merged"; survivor: ChainId; size: number }
	| { type: "swapped"; seat: number; from: ChainId; to: ChainId; count: number; cost: number }
	| { type: "bought"; seat: number; shares: Partial<Shares>; cost: number }
	| { type: "discarded"; seat: number; tiles: Tile[] }
	| { type: "drew"; seat: number; count: number }
	| { type: "announced"; seat: number }
	| { type: "gameEnd"; reason: "announced" | "condition" | "stall" | "dropped" }
	| { type: "finalSale"; seat: number; chain: ChainId; shares: number; proceeds: number }
	| { type: "result"; cash: number[]; ranks: number[] }
	/** Only in a player's view: an entry from before the limitedLog window (rules.md §13). */
	| { type: "hidden" };

export interface GameState {
	/** Transient response only; toSave never persists this private draft. */
	tentative?: { player: number; from: number };
	/** Viewer capability flag, added only by the BGS wrapper. */
	supportsTurnDrafts?: true;
	seed: string;
	rngCounter: number;
	options: GameOptions;
	/** Real (BGS) players; differs from the seat count only in fourHands. */
	players: number;
	/** The real player controlling each internal seat. */
	seatOwner: number[];
	seats: SeatState[];
	board: Cell[];
	/** Draw pool; the next tile drawn is the last element. */
	pool: Tile[];
	removed: Tile[];
	bank: Shares;
	activeSeat: number;
	phase: Phase;
	/** The tile awaiting a chain name during the "found" phase. */
	pendingTile: Tile | null;
	merger: MergerState | null;
	/** Two-player bank mode: drawn bank tiles waiting to be placed, in draw order (§12.1.4). */
	bankTiles: Tile[];
	/** The seat that announced the end of the game this turn (§11.1). */
	endAnnounced: number | null;
	placedThisTurn: boolean;
	/** Consecutive completed turns in which no tile was placed (§11.1 stall rule). */
	turnsWithoutPlacement: number;
	turn: number;
	log: LogEntry[];
	ended: boolean;
}
