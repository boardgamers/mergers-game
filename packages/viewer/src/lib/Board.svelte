<script lang="ts">
	import {
		BOARD_COLUMNS,
		BOARD_ROWS,
		HIDDEN,
		parseTile,
		tileLabel,
		tileLegality,
		type GameState,
		type Tile,
	} from "acquire-engine";
	import { ofType, turnLimit } from "./decisions";
	import { chainName } from "./format";
	import { CHAIN_STYLES } from "./palette";
	import { safeBorders } from "./safeBorders";
	import { useStore } from "./store.svelte";

	let {
		state,
		selected,
		onplace,
	}: {
		state: GameState;
		/** A tile selected in the hand: its square is highlighted and clicking it places the tile. */
		selected?: Tile;
		onplace: (tile: Tile) => void;
	} = $props();

	// Rows A-I down, columns 1-12 across, like the printed board. Tile index = (column - 1) * 9 + row.
	const ROW_LETTERS = "ABCDEFGHI";
	const rows = Array.from({ length: BOARD_ROWS }, (_, row) => row);
	const columns = Array.from({ length: BOARD_COLUMNS }, (_, column) => column);
	const tileAt = (row: number, column: number) => column * BOARD_ROWS + row;
	const pendingTile = $derived(state.merger?.tile ?? state.pendingTile);
	const store = useStore();
	const t = $derived(store.lang.t);
	const playable = $derived(new Set(ofType(store.moves, "place").map((move) => parseTile(move.tile)!)));
	const borders = $derived(safeBorders(state.board));

	/** Why one of the viewer's tiles can't be placed now, or undefined. */
	function heldNote(tile: Tile): string | undefined {
		const legality = tileLegality(state.board, tile);
		if (legality === "permanentlyUnplayable") {
			return t("hand.dead");
		}
		if (legality === "temporarilyUnplayable") {
			return t("hand.eighth");
		}
		const seat = store.seats.find((s) => state.seats[s]?.hand.includes(tile));
		const limit = seat === undefined ? undefined : turnLimit(state, seat, tile);
		return limit && t(`hand.${limit}`);
	}
	const safeChains = $derived(new Set(borders.map(({ chain }) => chain)));
	const held = $derived(
		new Set(
			store.replayAt === undefined && !store.readOnly
				? store.seats.flatMap((seat) => state.seats[seat]?.hand.filter((tile) => tile !== HIDDEN) ?? [])
				: []
		)
	);
</script>

<div class="frame" dir="ltr">
	<div></div>
	<div class="numbers" aria-hidden="true">
		{#each columns as column (column)}<span>{column + 1}</span>{/each}
	</div>
	<div class="letters" aria-hidden="true">
		{#each rows as row (row)}<span>{ROW_LETTERS[row]}</span>{/each}
	</div>
	<div class="board" aria-label={t("board.label")}>
		{#each rows as row (row)}
			{#each columns as column (column)}
				{@const tile = tileAt(row, column)}
				{@const cell = state.board[tile] ?? null}
				{@const label = tileLabel(tile)}
				{@const legality = held.has(tile) ? tileLegality(state.board, tile) : undefined}
				{@const note = held.has(tile) ? heldNote(tile) : undefined}
				{#if playable.has(tile) && cell === null}
					<button
						type="button"
						class="square empty held playable actionable"
						class:selected={tile === selected}
						aria-label={t("board.place", { tile: label })}
						disabled={store.sending}
						onclick={() => onplace(tile)}
					>
						<span class="coord">{label}</span>
					</button>
				{:else if cell === null}
					<div
						class="square empty"
						class:held={held.has(tile)}
						class:unavailable={note !== undefined}
						class:dead={legality === "permanentlyUnplayable"}
						aria-label={note !== undefined
							? `${label} — ${note}`
							: held.has(tile)
								? `${label} — ${t("hand.yours")}`
								: t("board.empty", { tile: label })}
						title={note}
					>
						<span class="coord">{label}</span>
					</div>
				{:else if cell === "loose"}
					<div class="square loose" class:pending={tile === pendingTile} aria-label={t("board.loose", { tile: label })}>
						<span class="coord">{label}</span>
					</div>
				{:else}
					{@const style = CHAIN_STYLES[cell]}
					{@const safe = safeChains.has(cell)}
					<div
						class="square chain"
						class:safe
						style:background={style.fill}
						style:color={style.text}
						aria-label={`${t("board.chain", { tile: label, chain: chainName(cell) })}${safe ? ` — ${t("chains.safe")}` : ""}`}
						title={safe ? `${chainName(cell)} — ${t("chains.safe")}` : undefined}
					>
						<span class="corner-label">{label}</span>
						<span class="letter">{style.letter}</span>
					</div>
				{/if}
			{/each}
		{/each}
		{#if borders.length > 0}
			<svg
				class="safe-borders"
				viewBox={`0 0 ${BOARD_COLUMNS} ${BOARD_ROWS}`}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				{#each borders as { chain, path } (chain)}
					<g data-chain={chain}>
						<path d={path} stroke={CHAIN_STYLES[chain].text} stroke-width="5" />
						<path d={path} stroke={CHAIN_STYLES[chain].fill} stroke-width="3" />
						<path d={path} stroke={CHAIN_STYLES[chain].text} stroke-width="1" />
					</g>
				{/each}
			</svg>
		{/if}
	</div>
</div>

<style>
	.frame {
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr);
		grid-template-rows: 18px auto;
		width: 100%;
	}
	/* Edge labels use the same 2px padding and gaps as the board so they line up with squares. */
	.numbers,
	.letters {
		display: grid;
		gap: 2px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-muted);
	}
	.numbers {
		grid-template-columns: repeat(12, minmax(0, 1fr));
		padding: 0 2px;
		align-items: end;
		text-align: center;
	}
	.letters {
		grid-template-rows: repeat(9, minmax(0, 1fr));
		padding: 2px 0;
		align-items: center;
	}
	/* The dark board shows through 2px gaps between squares; the gaps are not outlines. */
	.board {
		position: relative;
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 2px;
		padding: 2px;
		background: var(--gap);
	}
	.safe-borders {
		/* Inset to the centre of the outside gap: each SVG unit is one tile plus its 2px gap. */
		position: absolute;
		inset: 1px;
		width: calc(100% - 2px);
		height: calc(100% - 2px);
		overflow: visible;
		pointer-events: none;
	}
	.safe-borders path {
		fill: none;
		stroke-linecap: square;
		vector-effect: non-scaling-stroke;
	}
	.square {
		position: relative;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		overflow: hidden;
		margin: 0;
		padding: 0;
		border: none;
		font: inherit;
	}
	/* An empty square only shows its small, muted coordinate, like the printed board. */
	.empty {
		background: var(--empty);
	}
	.empty .coord {
		font-size: 10px;
		color: var(--on-empty);
	}
	.empty.held {
		background: var(--panel);
		border: 2px dashed var(--ink-muted);
	}
	.empty.held .coord {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink);
	}
	.empty.playable {
		border-color: transparent;
	}
	.empty.unavailable {
		background: var(--empty);
		border-color: var(--on-empty);
	}
	.empty.unavailable .coord {
		color: var(--on-empty);
		background: var(--empty);
	}
	.empty.dead {
		background-image: repeating-linear-gradient(
			135deg,
			transparent 0 5px,
			color-mix(in srgb, var(--on-empty) 18%, transparent) 5px 7px
		);
	}
	.empty.selected {
		background: var(--page);
		outline: 4px solid var(--accent);
		outline-offset: -4px;
	}
	/* A loose tile is black with a light coordinate. */
	.loose {
		background: var(--loose);
	}
	.loose .coord {
		font-size: 11px;
		font-weight: 600;
		color: var(--on-loose);
	}
	/* The merging tile, or a tile waiting for a chain name: an accent stripe on a thin page-coloured
	   line, so the accent never sits directly on the black tile. */
	.loose.pending {
		box-shadow:
			inset 0 -6px 0 var(--accent),
			inset 0 -8px 0 var(--page);
	}
	/* Some chain colours are close to the grey in brightness; the bold letter tells them apart. */
	.chain .letter {
		font-weight: 800;
		font-size: clamp(14px, 2.6vw, 22px);
		line-height: 1;
	}
	/* On narrow screens the edge labels give the coordinates; corner labels would crowd the letter. */
	@media (max-width: 520px) {
		.chain .corner-label {
			display: none;
		}
		.empty .coord {
			font-size: 9px;
		}
		.loose .coord {
			font-size: 10px;
		}
	}
	.chain .corner-label {
		position: absolute;
		top: 1px;
		left: 2px;
		font-size: 8px;
		line-height: 1;
	}
	.chain.safe .corner-label {
		top: 4px;
		left: 5px;
	}
</style>
