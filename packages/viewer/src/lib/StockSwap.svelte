<script lang="ts">
	import {
		activeChains,
		chainSize,
		sharePrice,
		sharePurchaseLimit,
		stockSwapCost,
		stockSwapsRemaining,
		type ChainId,
	} from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import { ofType } from "./decisions";
	import { chainName } from "./format";
	import type { ViewerStore } from "./store.svelte";

	let { store, open = $bindable(false) }: { store: ViewerStore; open?: boolean } = $props();
	const game = $derived(store.state!);
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);
	const choices = $derived(ofType(store.moves, "swap"));
	const active = $derived(activeChains(game.board));
	const held = $derived(game.seats[game.activeSeat]!.shares);
	const remaining = $derived(stockSwapsRemaining(game));
	let from = $state<ChainId>("tower");
	let to = $state<ChainId>("continental");
	let count = $state<number | undefined>(1);
	$effect(() => {
		void store.state;
		const first = choices[0];
		if (first) {
			from = first.from;
			to = first.to;
		}
		count = 1;
	});
	const pair = $derived(choices.filter((move) => move.from === from && move.to === to));
	const max = $derived(pair.at(-1)?.count ?? 0);
	const selected = $derived(pair.find((move) => move.count === count));
	const cost = $derived(selected ? stockSwapCost(game, from, to, selected.count) : 0);
	const cash = $derived(
		cost === 0 ? t("swap.even") : t(cost > 0 ? "swap.pay" : "swap.receive", { amount: money(Math.abs(cost)) })
	);
	const price = (chain: ChainId) => money(sharePrice(chain, chainSize(game.board, chain)));
</script>

<details class="stock-swap" bind:open>
	<summary
		><span aria-hidden="true">⇄</span>
		{t("swap.title")}
		<small>· {remaining === Infinity ? t("swap.unlimited") : t("swap.remaining", { count: remaining })}</small></summary
	>
	<p class="note">{t("swap.note", { limit: sharePurchaseLimit(game.options) })}</p>
	{#if choices.length}
		<div class="chains">
			<label
				>{t("swap.give")}
				<select
					bind:value={from}
					aria-label={t("swap.give")}
					onchange={(event) => {
						count = 1;
						to = choices.find((move) => move.from === event.currentTarget.value)?.to ?? to;
					}}
				>
					{#each active.filter((chain) => held[chain] > 0) as chain (chain)}
						<option value={chain}>{chainName(chain)} · {held[chain]} · {price(chain)}</option>
					{/each}
				</select>
			</label>
			<label
				>{t("swap.take")}
				<select aria-label={t("swap.take")} bind:value={to} onchange={() => (count = 1)}>
					{#each active.filter((chain) => chain !== from) as chain (chain)}
						<option value={chain}>{chainName(chain)} · {game.bank[chain]} · {price(chain)}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="swap-controls">
			<label>{t("swap.count")}<input type="number" min="1" {max} step="1" bind:value={count} /></label>
			<div class="exchange" aria-live="polite">
				<ChainMark chain={from} /><span aria-hidden="true">→</span><ChainMark chain={to} />
				<strong>{selected ? cash : t("swap.unavailable")}</strong>
			</div>
		</div>
		<button
			type="button"
			class:actionable={!!selected}
			disabled={!selected}
			onclick={() => selected && store.send(selected)}>{t("swap.confirm")}</button
		>
	{:else}
		<p>{t("swap.unavailable")}</p>
	{/if}
</details>

<style>
	.stock-swap {
		border-bottom: 1px solid var(--ink-muted);
		padding-bottom: 10px;
		margin-bottom: 12px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	small,
	.note {
		color: var(--ink-muted);
		font-size: 13px;
		font-weight: 400;
	}
	p {
		margin: 8px 0;
	}
	.chains {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
		gap: 8px;
	}
	label {
		display: grid;
		gap: 4px;
		font-size: 13px;
		min-width: 0;
	}
	select,
	input {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		font: inherit;
		color: var(--ink);
		background: var(--page);
		border: 1px solid var(--ink-muted);
		padding: 6px;
	}
	.swap-controls {
		display: flex;
		align-items: end;
		gap: 12px;
		margin: 10px 0;
	}
	.swap-controls label {
		flex: 0 0 72px;
	}
	.exchange {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.exchange strong {
		flex-basis: 100%;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	button {
		min-height: 44px;
		padding: 6px 12px;
		color: var(--ink);
		background: var(--page);
		border: none;
		font: inherit;
	}
	button:disabled {
		color: var(--ink-muted);
	}
	@media (max-width: 400px) {
		.chains {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
