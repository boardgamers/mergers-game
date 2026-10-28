import { getContext } from "svelte";
import type { PlayerAppearance } from "@boardgamers/protocol";
import { ChatController } from "@boardgamers/protocol/chat";
import { seatsOf, type GameState, type Move, type TurnRequest, type Tile } from "acquire-engine";
import { movesFor } from "./decisions";
import { langFor } from "./format";
import { isRightToLeft, type Locale } from "./i18n";
import { replayStart, replayView } from "./replay";
import { TurnDraft } from "./turn-draft";

/** Context key: the store is given to every component at mount, for viewer-wide settings. */
export const STORE = Symbol("viewer-store");

export function useStore(): ViewerStore {
	return getContext<ViewerStore>(STORE);
}

export class ViewerStore {
	state = $state<GameState | undefined>();
	/** The viewer's BGS player index; undefined for a spectator. */
	player = $state<number | undefined>();
	/** The internal seats this player controls (two in fourHands, none for a spectator). */
	seats = $derived(this.state ? seatsOf(this.state, this.player) : []);
	/** BGS replay: the log position being shown, or undefined when showing the live game. */
	replayAt = $state<number | undefined>();
	/** What the viewer shows: the live state, or the replayed position. */
	view = $derived(
		this.state && this.replayAt !== undefined ? replayView(this.state, this.player, this.replayAt) : this.state
	);
	/** Completed tutorials keep reference controls usable but no longer accept game moves. */
	readOnly = $state(false);
	/** Legal moves for this viewer right now, straight from the engine. */
	moves = $derived(this.state && this.replayAt === undefined && !this.readOnly ? movesFor(this.state, this.seats) : []);
	/** A tile chosen in the hand but not yet placed. */
	selected = $state<Tile | undefined>();
	/** Player avatars from BGS, in player order. */
	avatars = $state<string[]>([]);
	/** BGS player appearance (colours and Supporter badges), in player order; cosmetic only. */
	appearance = $state<PlayerAppearance | undefined>();
	/** BGS interface language (preferences.locale), English until BGS sends one. */
	locale = $state<Locale>("en");
	/** Text helpers in the current language. */
	lang = $derived(langFor(this.locale));
	rightToLeft = $derived(isRightToLeft(this.locale));
	/** True in a BGS analysis sandbox, where live chat is hidden. */
	analysis = $state(false);
	/** The shared BGS chat, one controller per viewer launch. */
	readonly chat = new ChatController();
	/** The BGS light/dark setting; undefined until BGS sends one (prefers-color-scheme applies). */
	theme = $state<"light" | "dark" | undefined>();
	/** True between sending a move and receiving the resulting state, so it cannot be sent twice. */
	sending = $state(false);

	private readonly draft = new TurnDraft();
	undoCount = $state(0);
	canUndo = $derived(
		this.undoCount > 0 && !this.sending && !this.readOnly && !this.analysis && this.replayAt === undefined
	);

	constructor(
		private readonly sendMove: (move: Move | TurnRequest) => boolean,
		private readonly options: { turnDrafts?: boolean; onState?: (state: GameState) => void } = {}
	) {}

	private display(state: GameState): void {
		this.state = state;
		this.selected = undefined;
		this.sending = false;
		this.undoCount = this.draft.count;
		this.options.onState?.(state);
	}

	setState(state: GameState): void {
		if (this.draft.committed(state)) {
			this.display(state);
		}
	}

	setPlayer(player: number | undefined): void {
		if (player !== this.player) {
			this.draft.reset();
			this.undoCount = 0;
		}
		this.player = player;
	}

	preview(state: GameState): void {
		if (this.draft.accept(state, this.player)) {
			this.display(state);
		}
	}

	moveResult(move: unknown, ok: boolean): void {
		// A success acknowledgement can precede the queued preview/state callback.
		if (!ok && (!this.draft.pending || this.draft.reject(move))) {
			this.sending = false;
		}
	}

	undo(): void {
		if (!this.canUndo) {
			return;
		}
		const previous = this.draft.undo();
		if (previous) {
			this.display(previous);
		}
	}

	/** With a limited log (rules.md §13), replay waits until the game ends and the log is whole. */
	replayable = $derived(!this.state?.log.some((entry) => entry.type === "hidden"));

	/** The replay range BGS shows in its controls: setup done, up to the live position. */
	replayRange(): { start: number; end: number } {
		const end = this.state!.log.length;
		return { start: this.replayable ? replayStart(this.state!) : end, end };
	}

	send(move: Move): void {
		if (this.sending || this.readOnly || this.replayAt !== undefined) {
			return;
		}
		const action = $state.snapshot(move);
		const request =
			this.options.turnDrafts && this.state?.supportsTurnDrafts && !this.analysis ? this.draft.begin(action) : action;
		this.sending = true;
		if (!this.sendMove(request)) {
			this.moveResult(request, false);
		}
	}
}
