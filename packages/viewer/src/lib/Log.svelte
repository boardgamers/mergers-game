<script lang="ts">
	import type { GameState } from "acquire-engine";
	import { describeEntryParts, type LogPart } from "./format";
	import { CHAIN_STYLES, themeInk } from "./palette";
	import { playerColor } from "./playerAppearance";
	import { useStore } from "./store.svelte";

	let { state: game }: { state: GameState } = $props();

	// The log has no scroll box of its own (nested scrolling traps touch users); it shows the most
	// recent lines and expands in place.
	const RECENT = 8;
	const store = useStore();
	const t = $derived(store.lang.t);
	let showAll = $state(false);

	// Newest first; "turn" entries become headings that group the lines below them. With a
	// limited log (rules.md §13), each run of entries the engine withheld becomes one note.
	const lines = $derived(
		game.log
			.map((entry, index) => ({
				index,
				turn: entry.type === "turn",
				hidden: entry.type === "hidden",
				parts:
					entry.type === "hidden"
						? game.log[index - 1]?.type === "hidden"
							? undefined
							: [{ kind: "text" as const, text: t("log.limited") }]
						: describeEntryParts(game, entry, store.lang),
			}))
			.filter(
				(line): line is { index: number; turn: boolean; hidden: boolean; parts: LogPart[] } => line.parts !== undefined
			)
			.reverse()
	);
</script>

<section aria-label={t("log.label")}>
	<h2>{t("log.title")}</h2>
	<ol class="log">
		{#each showAll ? lines : lines.slice(0, RECENT) as line (line.index)}
			<li class:turn={line.turn} class:hidden={line.hidden}>
				{#each line.parts as part}
					{#if part.kind === "player" || part.kind === "chain"}
						{@const color =
							part.kind === "player"
								? playerColor(game.seatOwner[part.seat] ?? part.seat, store.appearance?.playerColors)
								: CHAIN_STYLES[part.chain].fill}
						<span
							class="name"
							class:player-name={part.kind === "player"}
							class:chain-name={part.kind === "chain"}
							style:--name-ink-light={themeInk(color, "light")}
							style:--name-ink-dark={themeInk(color, "dark")}>{part.text}</span
						>
					{:else if part.kind === "money"}<span class="money">{part.text}</span>{:else}{part.text}{/if}
				{/each}
			</li>
		{/each}
	</ol>
	{#if lines.length > RECENT}
		<button type="button" class="more actionable" onclick={() => (showAll = !showAll)}>
			{showAll ? t("log.recent") : t("log.all", { count: lines.length - RECENT })}
		</button>
	{/if}
</section>

<style>
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 14px;
	}
	.log li {
		padding: 2px 6px;
	}
	.log li.turn {
		margin-top: 6px;
		font-weight: 600;
		background: var(--panel-alt);
	}
	.log li.hidden {
		margin-top: 6px;
		color: var(--ink-muted);
		font-style: italic;
	}
	.name,
	.money {
		font-weight: 600;
	}
	.money {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.more {
		margin: 8px 0 0;
		padding: 6px 12px;
		min-height: 44px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
</style>
