// English one-line summaries of log entries, shown by BGS as a game's last move. BGS uses the
// last line a move wrote; after a full turn that is the next "turn" entry, so its line sums up
// the turn that just ended. Kept defunct shares are left out while holdings are private.
import { CHAINS, type ChainId } from "./config.js";
import { tileLabel, type Tile } from "./tiles.js";
import type { GameState, LogEntry } from "./types.js";

const chainName = (chain: ChainId) => CHAINS.find((c) => c.id === chain)!.name;

function money(amount: number): string {
	return `$${String(amount).replace(/\B(?=(\d{3})+$)/g, ",")}`;
}

function list(items: string[]): string {
	return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function shareList(shares: Partial<Record<ChainId, number>>): string {
	return list(Object.entries(shares).map(([chain, n]) => `${n} ${chainName(chain as ChainId)}`));
}

const tiles = (labels: Tile[]) => list(labels.map(tileLabel));

const BANK_TILE = {
	loose: "stays loose",
	joined: "joins a chain",
	merger: "causes a merger",
	removed: "cannot be played and is removed",
} as const;

const GAME_END = {
	announced: "the end was announced",
	condition: "an end condition was met",
	stall: "a full round passed with no tile placed",
	dropped: "only one player remained",
} as const;

function seatName(state: GameState, index: number): string {
	const name = state.seats[index]?.name ?? `Seat ${index + 1}`;
	return state.players === state.seats.length ? name : `${name} (seat ${index + 1})`;
}

/** The line for the log entry at `index`: a "turn" entry sums up the turn before it. */
export function simpleLineAt(state: GameState, index: number): string {
	const entry = state.log[index]!;
	return entry.type === "turn" ? turnSummary(state, index) : simpleLine(state, entry);
}

/**
 * The turn that ended just before the "turn" entry at `index`, most important first: the
 * placements (or the foundings or mergers they caused), then purchases, then an announcement.
 * For example "Ann merged Luxor into Tower, bought 2 Tower".
 */
export function turnSummary(state: GameState, index: number): string {
	let start = index - 1;
	while (start >= 0 && state.log[start]!.type !== "turn") {
		start--;
	}
	if (start < 0) {
		return "The game started";
	}
	const seat = (state.log[start] as Extract<LogEntry, { type: "turn" }>).seat;
	// One line per placed tile (two with twoTiles), each replaced by what it caused.
	const placements: string[] = [];
	let bankMerger = false;
	const parts: string[] = [];
	for (const entry of state.log.slice(start + 1, index)) {
		if (entry.type === "move" && entry.move.type === "place") {
			placements.push(`placed ${entry.move.tile}`);
		} else if (entry.type === "founded") {
			placements[placements.length - 1] = `founded ${chainName(entry.chain)}`;
		} else if (entry.type === "merger") {
			bankMerger = entry.byBank === true;
		} else if (entry.type === "mergerPlan" && !bankMerger && !placements.at(-1)!.startsWith("merged")) {
			placements[placements.length - 1] =
				`merged ${list(entry.defunct.map(chainName))} into ${chainName(entry.survivor)}`;
		} else if (entry.type === "swapped") {
			parts.push(`swapped ${entry.count} ${chainName(entry.from)} for ${entry.count} ${chainName(entry.to)}`);
		} else if (entry.type === "bought" && Object.keys(entry.shares).length > 0) {
			parts.push(`bought ${shareList(entry.shares)}`);
		} else if (entry.type === "announced") {
			parts.push("announced the end");
		} else if (entry.type === "dropped" && entry.seat === seat) {
			parts.push("left the game");
		}
	}
	return `${seatName(state, seat)} ${[...(placements.length > 0 ? placements : ["placed no tile"]), ...parts].join(", ")}`;
}

export function simpleLine(state: GameState, entry: LogEntry): string {
	const seat = (index: number) => seatName(state, index);
	switch (entry.type) {
		case "init":
			return `New game for ${count(entry.players, "player")}`;
		case "optionIgnored":
			return `Option ${entry.option} was ignored: ${entry.reason}`;
		case "turnOrder":
			return `Turn order tiles: ${list(entry.tiles.map((tile, i) => `${seat(i)} ${tileLabel(tile)}`))}. ${seat(entry.first)} goes first`;
		case "turn":
			return `${seat(entry.seat)}'s turn`;
		case "move": {
			const name = seat(entry.seat);
			const auto = entry.auto ? " (automatic)" : "";
			const move = entry.move;
			switch (move.type) {
				case "place":
					return `${name} placed ${move.tile}${auto}`;
				case "pass":
					return `${name} placed no tile${auto}`;
				case "announce":
					return `${name} announced the end of the game`;
				case "found":
					return `${name} named the new chain ${chainName(move.chain)}${auto}`;
				case "survivor":
					return `${name} chose ${chainName(move.chain)} to survive${auto}`;
				case "defunctOrder":
					return `${name} chose the order ${list(move.chains.map(chainName))}${auto}`;
				case "dispose":
					return `${name} sold ${move.sell} and traded ${move.trade}${auto}`;
				case "swap":
					return `${name} swapped ${move.count} ${chainName(move.from)} for ${move.count} ${chainName(move.to)}`;
				case "buy": {
					const bought = shareList(move.shares);
					return bought ? `${name} bought ${bought}${auto}` : `${name} bought nothing${auto}`;
				}
			}
			break;
		}
		case "skipPlace":
			return `${seat(entry.seat)} placed no tile`;
		case "founded":
			return `${seat(entry.seat)} founded ${chainName(entry.chain)} (${count(entry.size, "tile")})${entry.bonus ? " and received a free share" : "; no free share was left"}`;
		case "grew":
			return `${chainName(entry.chain)} grew to ${count(entry.size, "tile")}`;
		case "merger": {
			const chains = list(
				Object.entries(entry.sizes).map(([chain, size]) => `${chainName(chain as ChainId)} (${size})`)
			);
			const tile = tileLabel(entry.tile);
			return entry.byBank
				? `The bank's tile ${tile} merges ${chains}`
				: `${seat(entry.seat)}'s ${tile} merges ${chains}`;
		}
		case "mergerPlan":
			return `${chainName(entry.survivor)} survives and takes over ${list(entry.defunct.map(chainName))}`;
		case "bonuses": {
			const paid = entry.payouts.map((payout) => `${seat(payout.seat)} ${money(payout.amount)}`);
			let line = `${chainName(entry.chain)} bonuses at size ${entry.size}: ${paid.length > 0 ? list(paid) : "nobody paid"}`;
			if (entry.bank) {
				line +=
					entry.bank.tile === null
						? "; the bank held 0 shares (empty pool)"
						: `; the bank held ${count(entry.bank.shares, "share")} (drew ${tileLabel(entry.bank.tile)})`;
				if (entry.bank.amount > 0) {
					line += ` and kept ${money(entry.bank.amount)}`;
				}
			}
			return line;
		}
		case "disposed": {
			const chain = chainName(entry.chain);
			// Even "kept some" vs "kept none" reveals a holding, so ignore `held` when private.
			const actions = [
				entry.sold > 0 ? `sold ${entry.sold} ${chain} for ${money(entry.proceeds)}` : "",
				entry.traded > 0 ? `traded ${entry.traded} ${chain} for ${entry.traded / 2} of the survivor` : "",
				entry.held > 0 && state.options.publicHoldings ? `kept ${entry.held} ${chain}` : "",
			].filter(Boolean);
			if (actions.length > 0) {
				return `${seat(entry.seat)} ${list(actions)}`;
			}
			return state.options.publicHoldings && entry.held === 0
				? `${seat(entry.seat)} had nothing to dispose of`
				: `${seat(entry.seat)} kept their ${chain} shares`;
		}
		case "merged":
			return `${chainName(entry.survivor)} now has ${count(entry.size, "tile")}`;
		case "bankTile":
			return `The bank's tile ${tileLabel(entry.tile)} ${BANK_TILE[entry.result]}`;
		case "swapped":
			return `${seat(entry.seat)} swapped ${entry.count} ${chainName(entry.from)} for ${entry.count} ${chainName(entry.to)} (${entry.cost > 0 ? "paid " + money(entry.cost) : entry.cost < 0 ? "received " + money(-entry.cost) : "no cash difference"})`;
		case "bought": {
			const bought = shareList(entry.shares);
			return bought
				? `${seat(entry.seat)} bought ${bought} for ${money(entry.cost)}`
				: `${seat(entry.seat)} bought no shares`;
		}
		case "discarded":
			return `${seat(entry.seat)} discarded unplayable ${tiles(entry.tiles)}`;
		case "drew":
			return entry.count === 1 ? `${seat(entry.seat)} drew a tile` : `${seat(entry.seat)} drew ${entry.count} tiles`;
		case "dropped":
			return `${seat(entry.seat)} left the game`;
		case "announced":
			return `${seat(entry.seat)} announced the end of the game`;
		case "gameEnd":
			return `Game over: ${GAME_END[entry.reason]}`;
		case "finalSale":
			return `${seat(entry.seat)} sold ${entry.shares} ${chainName(entry.chain)} for ${money(entry.proceeds)}`;
		case "result":
			return `Final cash: ${list(entry.cash.map((cash, s) => `${seat(s)} ${money(cash)}`))}`;
		case "hidden":
			return "An earlier move (hidden until the game ends)";
	}
	return "";
}
