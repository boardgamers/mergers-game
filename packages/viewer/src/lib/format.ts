import {
	CHAINS,
	HIDDEN,
	currentSeat,
	merger,
	secondPlacementDue,
	tileLabel,
	type ChainId,
	type GameState,
	type LogEntry,
} from "acquire-engine";
import { formatMoney, joinList, translate, type Locale, type MessageKey, type Params } from "./i18n.ts";

/** Text helpers for one language. Components get theirs from the store, so they follow BGS. */
export interface Lang {
	locale: Locale;
	t: (key: MessageKey, params?: Params) => string;
	list: (items: string[]) => string;
	money: (amount: number) => string;
	count: (value: number) => string;
}

export function langFor(locale: Locale): Lang {
	const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
	return {
		locale,
		t,
		list: (items) => joinList(locale, items),
		money: (amount) => (amount === HIDDEN ? t("hidden") : formatMoney(locale, amount)),
		count: (value) => (value === HIDDEN ? t("hidden") : String(value)),
	};
}

/** Chain names are proper nouns and stay in English in every language. */
export function chainName(chain: ChainId): string {
	return CHAINS.find((c) => c.id === chain)!.name;
}

/** A seat's display name; in fourHands each player has two seats, so the seat number is added. */
export function seatName(state: GameState, seat: number, lang: Lang): string {
	const name = state.seats[seat]?.name ?? `${seat + 1}`;
	return state.players === state.seats.length ? name : lang.t("seat.name", { name, seat: seat + 1 });
}

/** Who must act now and on what, in plain words. */
export function pendingDecision(state: GameState, lang: Lang): string {
	if (state.ended) {
		return lang.t("status.gameOver");
	}
	const seat = currentSeat(state);
	if (seat === undefined) {
		return "";
	}
	const name = seatName(state, seat, lang);
	switch (state.phase) {
		case "place":
			return lang.t(secondPlacementDue(state) ? "status.placeSecond" : "status.place", { name });
		case "found":
			return lang.t("status.found", { name });
		case "survivor":
			return lang.t("status.survivor", { name });
		case "defunctOrder":
			return lang.t("status.defunctOrder", { name });
		case "dispose":
			return lang.t("status.dispose", { name, chain: chainName(merger(state).current!) });
		case "buy":
			return lang.t("status.buy", { name });
		default:
			return "";
	}
}

const BANK_TILE_KEYS = {
	loose: "log.bankLoose",
	joined: "log.bankJoined",
	merger: "log.bankMerger",
	removed: "log.bankRemoved",
} as const satisfies Record<string, MessageKey>;

/** One log line, or undefined for entries that another line already describes. */
export function describeEntry(
	state: GameState,
	entry: LogEntry,
	lang: Lang,
	format: {
		seat?: (index: number) => string;
		chain?: (id: ChainId) => string;
		money?: (amount: number) => string;
	} = {}
): string | undefined {
	const { t, list } = lang;
	const money = format.money ?? lang.money;
	const seat = format.seat ?? ((index: number) => seatName(state, index, lang));
	const chain = format.chain ?? chainName;
	const tiles = (count: number) => t("tiles", { count });
	const shares = (count: number, id: ChainId) => t("log.shares", { count, chain: chain(id) });
	switch (entry.type) {
		case "init":
			return t("log.init", { count: entry.players });
		case "optionIgnored": {
			const count = entry.option === "teamPlay" ? 4 : entry.option === "twoPlayerMode" ? 2 : undefined;
			return count !== undefined && entry.reason.startsWith("only applies")
				? t("log.optionIgnored.players", { option: entry.option, count })
				: t("log.optionIgnored.value", { option: entry.option });
		}
		case "turnOrder":
			return t("log.turnOrder", {
				tiles: list(entry.tiles.map((tile, i) => `${seat(i)} ${tileLabel(tile)}`)),
				name: seat(entry.first),
			});
		case "turn":
			return t("log.turn", { name: seat(entry.seat) });
		case "move": {
			const name = seat(entry.seat);
			switch (entry.move.type) {
				case "place":
					return t(entry.auto ? "log.placedAuto" : "log.placed", { name, tile: entry.move.tile });
				case "survivor":
					return t(entry.auto ? "log.survivorAuto" : "log.survivor", { name, chain: chain(entry.move.chain) });
				case "defunctOrder":
					return t(entry.auto ? "log.orderAuto" : "log.order", {
						name,
						chains: list(entry.move.chains.map(chain)),
					});
				default:
					return undefined;
			}
		}
		case "skipPlace":
			return t("log.skipPlace", { name: seat(entry.seat) });
		case "founded":
			return t(entry.bonus ? "log.founded" : "log.foundedNoShare", {
				name: seat(entry.seat),
				chain: chain(entry.chain),
				tiles: tiles(entry.size),
			});
		case "grew":
			return t("log.grew", { chain: chain(entry.chain), tiles: tiles(entry.size) });
		case "merger": {
			const chains = list(Object.entries(entry.sizes).map(([id, size]) => `${chain(id as ChainId)} (${size})`));
			return entry.byBank
				? t("log.mergerBank", { tile: tileLabel(entry.tile), chains })
				: t("log.merger", { name: seat(entry.seat), tile: tileLabel(entry.tile), chains });
		}
		case "mergerPlan":
			return t("log.mergerPlan", { survivor: chain(entry.survivor), chains: list(entry.defunct.map(chain)) });
		case "bonuses": {
			const params = { chain: chain(entry.chain), size: entry.size };
			const paid = entry.payouts.map(({ seat: s, amount }) => `${seat(s)} ${money(amount)}`);
			let line =
				paid.length > 0 ? t("log.bonuses", { ...params, payouts: list(paid) }) : t("log.bonusesNobody", params);
			if (entry.bank) {
				line +=
					entry.bank.tile === null
						? t("log.bankHeldEmpty")
						: t("log.bankHeld", { count: entry.bank.shares, tile: tileLabel(entry.bank.tile) });
				if (entry.bank.amount > 0) {
					line += t("log.bankKept", { amount: money(entry.bank.amount) });
				}
			}
			return line;
		}
		case "disposed": {
			const actions = [
				entry.sold > 0 ? t("log.sold", { shares: shares(entry.sold, entry.chain), amount: money(entry.proceeds) }) : "",
				entry.traded > 0 ? t("log.traded", { shares: shares(entry.traded, entry.chain), count: entry.traded / 2 }) : "",
				entry.held > 0 ? t("log.kept", { shares: shares(entry.held, entry.chain) }) : "",
			].filter(Boolean);
			return actions.length > 0
				? t("log.disposed", { name: seat(entry.seat), actions: list(actions) })
				: t("log.disposedNothing", { name: seat(entry.seat) });
		}
		case "merged":
			return t("log.merged", { chain: chain(entry.survivor), tiles: tiles(entry.size) });
		case "bankTile":
			return t(BANK_TILE_KEYS[entry.result], { tile: tileLabel(entry.tile) });
		case "swapped":
			return t("log.swapped", {
				name: seat(entry.seat),
				count: entry.count,
				from: chain(entry.from),
				to: chain(entry.to),
				cash:
					entry.cost === 0
						? t("swap.even")
						: t(entry.cost > 0 ? "swap.pay" : "swap.receive", { amount: money(Math.abs(entry.cost)) }),
			});
		case "bought": {
			const bought = Object.entries(entry.shares).map(([id, n]) => `${n} ${chain(id as ChainId)}`);
			return bought.length > 0
				? t("log.bought", { name: seat(entry.seat), shares: list(bought), cost: money(entry.cost) })
				: t("log.boughtNothing", { name: seat(entry.seat) });
		}
		case "discarded":
			return t("log.discarded", { name: seat(entry.seat), tiles: list(entry.tiles.map(tileLabel)) });
		case "drew":
			return t("log.drew", { name: seat(entry.seat), count: entry.count });
		case "dropped":
			return t("log.dropped", { name: seat(entry.seat) });
		case "announced":
			return t("log.announced", { name: seat(entry.seat) });
		case "gameEnd":
			return t(`log.end.${entry.reason}`);
		case "finalSale":
			return t("log.finalSale", {
				name: seat(entry.seat),
				count: entry.shares,
				chain: chain(entry.chain),
				amount: money(entry.proceeds),
			});
		case "result":
			return t("log.result", { results: list(entry.cash.map((cash, s) => `${seat(s)} ${money(cash)}`)) });
		case "hidden":
			return undefined;
	}
}

export type LogPart =
	| { kind: "text" | "money"; text: string }
	| { kind: "player"; seat: number; text: string }
	| { kind: "chain"; chain: ChainId; text: string };

/** Preserve translated word order and lists without matching names or inserting HTML. */
export function describeEntryParts(state: GameState, entry: LogEntry, lang: Lang): LogPart[] | undefined {
	const references: LogPart[] = [];
	const token = (part: LogPart) => `\uFFF9${references.push(part) - 1}\uFFFB`;
	const line = describeEntry(state, entry, lang, {
		seat: (seat) => token({ kind: "player", seat, text: seatName(state, seat, lang) }),
		chain: (chain) => token({ kind: "chain", chain, text: chainName(chain) }),
		money: (amount) => token({ kind: "money", text: lang.money(amount) }),
	});
	if (line === undefined) {
		return undefined;
	}
	const parts: LogPart[] = [];
	let offset = 0;
	for (const match of line.matchAll(/\uFFF9(\d+)\uFFFB/g)) {
		if (match.index > offset) {
			parts.push({ kind: "text", text: line.slice(offset, match.index) });
		}
		parts.push(references[Number(match[1])] ?? { kind: "text", text: match[0] });
		offset = match.index + match[0].length;
	}
	if (offset < line.length) {
		parts.push({ kind: "text", text: line.slice(offset) });
	}
	return parts;
}
