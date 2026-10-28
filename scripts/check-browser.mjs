import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preparedPosition } from "../packages/viewer/src/tutorial/lessons.ts";

const base = process.env.ACQUIRE_TEST_URL ?? "http://127.0.0.1:5191";
const server = process.env.ACQUIRE_TEST_URL
	? undefined
	: spawn(
			"pnpm",
			["--filter", "acquire-viewer", "exec", "vite", "--host", "127.0.0.1", "--port", "5191", "--strictPort"],
			{
				stdio: "pipe",
				detached: process.platform !== "win32",
			}
		);
let serverOutput = "";
server?.stdout.on("data", (data) => (serverOutput += data));
server?.stderr.on("data", (data) => (serverOutput += data));
let browser;
const errors = [];
const locales = [
	"en",
	"de",
	"fr",
	"pl",
	"ro",
	"el",
	"hi",
	"ru",
	"da",
	"pt-BR",
	"ko",
	"zh-TW",
	"zh-CN",
	"vi",
	"it",
	"nl",
	"fa",
];
const output = new URL("../release/qa/", import.meta.url);
await mkdir(output, { recursive: true });
const report = { layouts: [], tutorialLayouts: [], gallery: [], diagnostics: null, scenarios: [] };

try {
	for (let attempt = 0; ; attempt++) {
		if (server && server.exitCode !== null) {
			throw new Error(serverOutput);
		}
		if (
			await fetch(base)
				.then((r) => r.ok)
				.catch(() => false)
		) {
			break;
		}
		if (attempt >= 100) {
			throw new Error(`Dev server did not start: ${serverOutput}`);
		}
		await delay(100);
	}
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
	page.on("pageerror", (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const NativeAudioContext = window.AudioContext;
		window.acquireAudioProbe = { starts: 0, closes: 0, contexts: 0 };
		window.AudioContext = class extends NativeAudioContext {
			constructor(...args) {
				super(...args);
				window.acquireAudioProbe.contexts++;
			}
			createOscillator() {
				const node = super.createOscillator();
				const start = node.start.bind(node);
				node.start = (...args) => {
					window.acquireAudioProbe.starts++;
					start(...args);
				};
				return node;
			}
			close() {
				window.acquireAudioProbe.closes++;
				return super.close();
			}
		};
	});
	const settle = async () =>
		page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const open = async (params = "") => {
		await page.goto(`${base}/?bundle=1&seed=bgs&bar=0&${params}`);
		await page.waitForSelector("main .board");
		await settle();
	};
	const preferences = async (value) => {
		await page.evaluate((prefs) => window.acquireDev.emitter.emit("preferences", prefs), value);
		await settle();
	};
	await open("players=4&moves=50&merger=1&theme=light");
	report.diagnostics = await page.evaluate(() => window.acquireDev.viewer.diagnostics(["core", "chat", "replay"]));
	assert.equal(report.diagnostics.compatible, true);
	assert.equal(report.diagnostics.recommended.percent, 100);

	// Optional swaps are private drafts, with one shared allowance and separate purchases.
	for (const width of [1280, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await open("players=3&hotseat=0&view=0&theme=dark&stockSwap=3");
		await page.evaluate((state) => {
			const { parseTile, allTiles, CHAIN_IDS } = window.acquireDev.rules;
			state.options.stockSwap = 3;
			state.board.fill(null);
			for (const label of ["1A", "2A", "3A"]) {
				state.board[parseTile(label)] = "tower";
			}
			for (const label of ["1E", "2E", "3E", "4E", "5E"]) {
				state.board[parseTile(label)] = "continental";
			}
			state.seats.forEach((seat, index) => {
				seat.hand = [parseTile(`${9 + index}I`)];
				for (const chain of CHAIN_IDS) {
					seat.shares[chain] = 0;
				}
			});
			state.seats[0].shares.tower = 10;
			state.seats[0].shares.continental = 5;
			for (const chain of CHAIN_IDS) {
				state.bank[chain] = 25 - state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
			}
			const used = new Set(state.seats.flatMap((seat) => seat.hand));
			state.pool = allTiles().filter((tile) => state.board[tile] === null && !used.has(tile));
			state.phase = "buy";
			state.placedThisTurn = true;
			window.acquireDev.load(state);
		}, preparedPosition("founding"));
		await page.locator(".stock-swap summary").click();
		await page.getByRole("spinbutton", { name: "Shares", exact: true }).fill("2");
		assert.match(await page.locator(".exchange").innerText(), /Pay \$800/);
		for (const theme of ["dark", "light"]) {
			await page.evaluate((theme) => window.acquireDev.emitter.emit("theme", { dark: theme === "dark" }), theme);
			for (const locale of locales) {
				await preferences({ locale });
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					`stock swap ${locale} ${theme} ${width}px`
				);
				assert.equal(await page.locator(".stock-swap button").isEnabled(), true);
			}
			await preferences({ locale: "en" });
			await page
				.locator(".panel")
				.screenshot({ path: fileURLToPath(new URL(`stock-swap-${theme}-${width}.png`, output)) });
		}
		const original = await page.evaluate(() => JSON.stringify(window.acquireDev.state));
		for (let revision = 0; revision < 3; revision++) {
			await page.getByRole("spinbutton", { name: "Shares", exact: true }).fill("2");
			await page.getByRole("button", { name: "Swap shares", exact: true }).click();
			await page.waitForFunction(() => document.querySelector(".stock-swap summary")?.textContent.includes("1 left"));
			assert.equal(
				await page.evaluate(() => JSON.stringify(window.acquireDev.state)),
				original,
				"swap remains a private draft"
			);
			await page.getByRole("button", { name: "Undo", exact: true }).click();
			await page.waitForFunction(() => document.querySelector(".stock-swap summary")?.textContent.includes("3 left"));
		}
		await page.getByRole("spinbutton", { name: "Shares", exact: true }).fill("2");
		await page.getByRole("button", { name: "Swap shares", exact: true }).click();
		await page.waitForFunction(() => document.querySelector(".stock-swap summary")?.textContent.includes("1 left"));
		await page.getByLabel("Give (your stock)", { exact: true }).selectOption("continental");
		await settle();
		assert.match(await page.locator(".exchange").innerText(), /Receive \$400/);
		await page.getByRole("button", { name: "Swap shares", exact: true }).click();
		await page.waitForFunction(() => document.querySelector(".stock-swap summary")?.textContent.includes("0 left"));
		for (let i = 0; i < 3; i++) {
			await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
		}
		await page.getByRole("button", { name: "Buy for $900 and end turn", exact: true }).click();
		await page.waitForFunction(() => window.acquireDev.state.turn === 2);
		assert.deepEqual(
			await page.evaluate(() => ({
				cash: window.acquireDev.state.seats[0].cash,
				swaps: window.acquireDev.state.log.filter((e) => e.type === "swapped").length,
				increments: window.acquireDev.engine.timeIncrements(window.acquireDev.state),
			})),
			{ cash: 4700, swaps: 2, increments: [1, 0, 0] }
		);
	}
	await open("players=3&hotseat=0&view=0");
	await page.evaluate((state) => {
		state.phase = "buy";
		window.acquireDev.load(state);
	}, preparedPosition("scoring"));
	assert.equal(await page.locator(".stock-swap").count(), 0, "off never adds UI to existing games");
	report.scenarios.push(
		"stock swaps in 17 languages and both themes at 1280/390/320px, pay/receive previews, shared allowance, undo without saved history and a separate three-share purchase"
	);

	for (const width of [1280, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await open("players=3&hotseat=0&view=0&theme=dark");
		await page.evaluate((state) => {
			state.options.publicHoldings = true;
			window.acquireDev.load(state);
		}, preparedPosition("scoring"));
		await page.waitForSelector(".net-worth");
		assert.deepEqual(await page.locator(".net-worth strong").allTextContents(), ["≈ $15,800", "≈ $10,900", "≈ $6,700"]);
		assert.deepEqual(
			await page.evaluate(() => window.acquireDev.engine.scores(window.acquireDev.state)),
			[15800, 10900, 6700]
		);
		await page.locator(".worth-details summary").click();
		assert.deepEqual(await page.locator(".worth-details tbody tr").first().locator("td.num").allTextContents(), [
			"$6,000",
			"$2,800",
			"$7,000",
		]);
		for (const theme of ["dark", "light"]) {
			await page.evaluate((theme) => window.acquireDev.emitter.emit("theme", { dark: theme === "dark" }), theme);
			for (const locale of locales) {
				await preferences({ locale });
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					`net worth ${locale} ${theme} ${width}px`
				);
			}
			await preferences({ locale: "en" });
			await page
				.locator(".players")
				.screenshot({ path: fileURLToPath(new URL(`net-worth-${theme}-${width}.png`, output)) });
		}
		await page.evaluate(() => {
			const state = structuredClone(window.acquireDev.state);
			state.options.publicHoldings = false;
			window.acquireDev.load(state);
		});
		await settle();
		assert.equal(await page.locator(".net-worth, .worth-details").count(), 0);
		assert.deepEqual(await page.evaluate(() => window.acquireDev.engine.scores(window.acquireDev.state)), [0, 0, 0]);
	}
	await open("players=2&publicHoldings=1&theme=dark");
	await page.locator(".worth-details summary").click();
	assert.match(await page.locator(".worth-details").innerText(), /Future bonuses excluded/);
	assert.deepEqual(await page.locator(".worth-details tbody tr td:last-child").allTextContents(), ["—", "—"]);
	await page.evaluate(() => window.acquireDev.emitter.emit("replay:start"));
	await settle();
	assert.equal(
		await page.locator(".net-worth, .worth-details").count(),
		0,
		"partial replay log entries do not show a misleading forecast"
	);
	report.scenarios.push(
		"public net worth and score equality, expandable cash/stock/bonus breakdown, all locales and themes, privacy, bank-mode note and replay masking"
	);

	// Show the known growth before the sell/trade decision, including on narrow/RTL screens.
	for (const width of [1280, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await open("players=3&theme=dark");
		await page.evaluate((state) => {
			const { parseTile, allTiles, CHAIN_IDS, applyMove } = window.acquireDev.rules;
			state.board.fill(null);
			for (const label of ["1A", "2A", "3A"]) {
				state.board[parseTile(label)] = "festival";
			}
			for (const label of ["5A", "6A", "7A"]) {
				state.board[parseTile(label)] = "imperial";
			}
			state.seats[0].shares.festival = 7;
			const held = new Set(state.seats.flatMap((seat) => seat.hand));
			state.pool = allTiles().filter((tile) => state.board[tile] === null && !held.has(tile));
			for (const chain of CHAIN_IDS) {
				state.bank[chain] = 25 - state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
			}
			applyMove(state, { type: "place", tile: "4A" }, 0);
			applyMove(state, { type: "survivor", chain: "imperial" }, 0);
			window.acquireDev.load(state);
		}, preparedPosition("mergers"));
		await page.waitForSelector(".merger-price");
		assert.match(await page.locator(".merger-price").innerText(), /Imperial/);
		assert.match(await page.locator(".merger-price strong").innerText(), /\$500\s*→\s*\$800/);
		assert.match(await page.locator(".merger-price .size").innerText(), /7 tiles/);
		assert.match(await page.locator(".steppers .label").first().innerText(), /\$400/);
		assert.match(await page.locator(".sell-all").innerText(), /Sell all · \$2,800/);
		assert.match(await page.locator(".trade-max").innerText(), /Trade 6 for 3\s+Stock value \+\$0/);
		const beforePreset = await page.evaluate(() => JSON.stringify(window.acquireDev.state));
		await page.locator(".sell-all").click();
		assert.deepEqual(await page.locator(".steppers .value").allTextContents(), ["7", "0", "0"]);
		await page.locator(".trade-max").click();
		assert.deepEqual(await page.locator(".steppers .value").allTextContents(), ["0", "6", "1"]);
		assert.equal(
			await page.evaluate(() => JSON.stringify(window.acquireDev.state)),
			beforePreset,
			"presets wait for Confirm"
		);
		for (const locale of locales) {
			await preferences({ locale });
			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
				`merger price ${locale} ${width}px`
			);
		}
		await preferences({ locale: "en" });
		await page.screenshot({ path: fileURLToPath(new URL(`merger-price-${width}.png`, output)), fullPage: true });
	}
	report.scenarios.push(
		"post-merger price visible before trading; original sale price unchanged; all 17 locales at desktop, phone and 320px"
	);

	// Trade totals use the new survivor price, leave odd shares held, and obey available bank stock.
	for (const [kind, stock, expectedTrade, value] of [
		["gain", 25, 6, "+$600"],
		["loss", 25, 6, "−$1,200"],
		["gain", 1, 2, "+$200"],
		["gain", 0, 0, undefined],
	]) {
		await page.setViewportSize({ width: 390, height: 844 });
		await open("players=3&theme=dark");
		await page.evaluate(
			({ state, kind, stock }) => {
				const { allTiles, parseTile, CHAIN_IDS, applyMove } = window.acquireDev.rules;
				if (kind === "loss") {
					state.board.fill(null);
					for (let col = 1; col <= 5; col++) {
						state.board[parseTile(`${col}A`)] = "tower";
					}
					for (let col = 7; col <= 10; col++) {
						state.board[parseTile(`${col}A`)] = "festival";
					}
					state.seats[0].hand = [parseTile("6A")];
				}
				for (const seat of state.seats) {
					for (const chain of CHAIN_IDS) {
						seat.shares[chain] = 0;
					}
				}
				state.seats[0].shares[kind === "loss" ? "festival" : "luxor"] = 7;
				state.seats[1].shares.tower = 25 - stock;
				const held = new Set(state.seats.flatMap((seat) => seat.hand));
				state.pool = allTiles().filter((tile) => state.board[tile] === null && !held.has(tile));
				for (const chain of CHAIN_IDS) {
					state.bank[chain] = 25 - state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
				}
				applyMove(state, { type: "place", tile: kind === "loss" ? "6A" : "4A" }, 0);
				window.acquireDev.load(state);
			},
			{ state: preparedPosition("mergers"), kind, stock }
		);
		await page.waitForSelector(".trade-max");
		await page.locator(".sell-all").click();
		if (expectedTrade) {
			assert.ok((await page.locator(".trade-max").innerText()).includes(`Stock value ${value}`));
			await page.locator(".trade-max").click();
			assert.deepEqual(await page.locator(".steppers .value").allTextContents(), [
				"0",
				String(expectedTrade),
				String(7 - expectedTrade),
			]);
			if (kind === "gain" && stock === 25) {
				for (const width of [1280, 390, 320]) {
					await page.setViewportSize({ width, height: 900 });
					for (const theme of ["dark", "light"]) {
						await page.evaluate((theme) => window.acquireDev.emitter.emit("theme", { dark: theme === "dark" }), theme);
						await settle();
						await page
							.locator(".controls")
							.screenshot({ path: fileURLToPath(new URL(`merger-shortcuts-${theme}-${width}.png`, output)) });
					}
				}
			}
		} else {
			assert.equal(await page.locator(".trade-max").isDisabled(), true);
			assert.deepEqual(await page.locator(".steppers .value").allTextContents(), ["7", "0", "0"]);
		}
		const cashBefore = await page.evaluate(() => window.acquireDev.state.seats[0].cash);
		await page.locator(".panel button.primary").click();
		await page.waitForSelector("table.buy");
		// Disposal remains an undoable private draft until this player finishes buying.
		await page.getByRole("button", { name: "Buy nothing and end turn", exact: true }).click();
		await page.waitForFunction(() => window.acquireDev.state.turn === 2);
		const result = await page.evaluate(() => window.acquireDev.state.seats[0]);
		assert.equal(result.shares.tower, expectedTrade / 2);
		assert.equal(result.shares[kind === "loss" ? "festival" : "luxor"], expectedTrade ? 7 - expectedTrade : 0);
		assert.equal(result.cash - cashBefore, expectedTrade ? 0 : 1400);
	}
	report.scenarios.push(
		"merger sell-all and maximum-trade presets: positive/zero/negative stock value, odd leftovers, limited/empty bank, confirmation and unchanged cash for trades"
	);

	for (const width of [1280, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await open("players=3&theme=dark");
		await page.evaluate((state) => {
			const { parseTile, allTiles } = window.acquireDev.rules;
			state.board.fill(null);
			const fill = (chain, labels) => labels.forEach((label) => (state.board[parseTile(label)] = chain));
			fill("tower", [...Array.from({ length: 9 }, (_, i) => `${i + 1}C`), "4B", "5B"]);
			fill(
				"luxor",
				Array.from({ length: 11 }, (_, i) => `${i + 1}E`)
			);
			fill("worldwide", ["1G", "2G"]);
			fill("american", ["4G", "5G"]);
			fill("festival", ["7G", "8G"]);
			fill("imperial", ["10G", "11G"]);
			fill("continental", ["1I", "2I"]);
			fill("loose", ["12H"]);
			state.seats[0].hand = ["2B", "3B", "5D", "6I", "10D", "12I"].map(parseTile);
			const remaining = allTiles().filter((tile) => state.board[tile] === null && !state.seats[0].hand.includes(tile));
			for (const seat of state.seats.slice(1)) {
				seat.hand = remaining.splice(0, 6);
			}
			state.pool = remaining;
			window.acquireDev.load(state);
		}, preparedPosition("mergers"));
		await page.waitForSelector(".hand .tile.dead");
		assert.equal(await page.locator(".hand .tile.dead .coordinate").innerText(), "5D");
		assert.equal(await page.locator(".hand .tile.paused .coordinate").innerText(), "12I");
		assert.equal(await page.locator(".hand .tile small").count(), 0);
		assert.match(await page.locator(".dead-note").innerText(), /5D.*Replaced at the end of your turn/);
		assert.match(await page.locator(".paused-note").innerText(), /12I.*can't found an 8th chain/);
		assert.match(await page.locator(".square.dead").getAttribute("aria-label"), /5D.*would merge safe chains/);
		assert.equal(await page.locator("button.tile.dead, button.tile.paused, button.square.dead").count(), 0);
		assert.equal(await page.locator(".safe-borders g").count(), 2);
		assert.equal(await page.locator(".square.chain.safe").count(), 22);
		assert.match(await page.locator(".square.chain.safe").first().getAttribute("aria-label"), /safe/);
		assert.equal(await page.locator(".safe-borders").evaluate((node) => getComputedStyle(node).pointerEvents), "none");
		for (const theme of ["dark", "light"]) {
			await page.evaluate((theme) => window.acquireDev.emitter.emit("theme", { dark: theme === "dark" }), theme);
			for (const locale of locales) {
				await preferences({ locale });
				assert.ok(
					await page.evaluate(() => {
						const tiles = [...document.querySelectorAll(".hand .tile")];
						const height = tiles[0].getBoundingClientRect().height;
						return (
							document.documentElement.scrollWidth <= innerWidth + 1 &&
							tiles.every(
								(tile) =>
									Math.abs(tile.getBoundingClientRect().height - height) < 1 &&
									tile.scrollHeight <= tile.clientHeight + 1
							)
						);
					}),
					`dead/temporary tile ${locale} ${theme} ${width}px`
				);
			}
			await preferences({ locale: "en" });
			await page
				.locator("section.hand")
				.screenshot({ path: fileURLToPath(new URL(`dead-tiles-${theme}-${width}.png`, output)) });
			await page
				.locator(".frame")
				.screenshot({ path: fileURLToPath(new URL(`safe-chains-${theme}-${width}.png`, output)) });
		}
	}
	report.scenarios.push(
		"dead tiles and temporary blocks: distinct symbols, readable coordinates and notes, equal tile heights, all locales in both themes"
	);

	await open("players=3&hotseat=0&view=0&theme=dark");
	await page.evaluate((state) => {
		const { allTiles, parseTile } = window.acquireDev.rules;
		state.board[parseTile("11A")] = null;
		state.seats[0].hand = [parseTile("11A")];
		const held = new Set(state.seats.flatMap((seat) => seat.hand));
		state.pool = allTiles().filter((tile) => state.board[tile] === null && !held.has(tile));
		window.acquireDev.load(state);
	}, preparedPosition("scoring"));
	await settle();
	assert.equal(await page.locator(".safe-borders").count(), 0);
	await page.getByRole("button", { name: "Place 11A", exact: true }).click();
	await page.waitForSelector('.safe-borders [data-chain="tower"]');
	assert.equal(await page.locator(".square.chain.safe").count(), 11);
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await page.waitForSelector(".safe-borders", { state: "detached" });
	assert.equal(await page.locator(".square.chain.safe").count(), 0);
	report.scenarios.push(
		"safe chain perimeter: both themes, narrow screens, 11-tile threshold, private placement and undo"
	);

	for (const theme of ["light", "dark"]) {
		await page.setViewportSize({ width: 1920, height: 1280 });
		await open(`players=4&moves=95&publicHoldings=1&theme=${theme}`);
		const geometry = await page.evaluate(() => {
			const main = document.querySelector("main");
			const column = document.querySelector(".layout > .board");
			const frame = column.querySelector(".frame");
			return {
				margin: getComputedStyle(document.body).margin,
				page: getComputedStyle(main).backgroundColor,
				canvas: getComputedStyle(document.documentElement).backgroundColor,
				body: getComputedStyle(document.body).backgroundColor,
				left: main.getBoundingClientRect().left,
				right: main.getBoundingClientRect().right,
				board: frame.getBoundingClientRect().width,
				column: column.getBoundingClientRect().width,
			};
		});
		assert.equal(geometry.margin, "0px");
		assert.equal(geometry.canvas, geometry.page);
		assert.equal(geometry.body, geometry.page);
		assert.equal(geometry.left, 0);
		assert.equal(geometry.right, 1920);
		assert.ok(geometry.board > 750, "board uses the wide desktop column");
		assert.ok(Math.abs(geometry.board - geometry.column) < 1);
		assert.equal(await page.locator(".chat summary").isVisible(), false);
		assert.equal(await page.locator(".chat-composer").isVisible(), true);
		const logAppearance = await page.evaluate(() => {
			const colors = Object.fromEntries(
				[...document.querySelectorAll(".players .player-name")].map((name) => [
					name.textContent,
					getComputedStyle(name).color,
				])
			);
			return {
				playersMatch: [...document.querySelectorAll(".log .player-name")].every(
					(name) => getComputedStyle(name).color === colors[name.textContent]
				),
				chains: [
					...new Set([...document.querySelectorAll(".log .chain-name")].map((name) => getComputedStyle(name).color)),
				],
				money: [...document.querySelectorAll(".log .money")].map((amount) => ({
					text: amount.textContent,
					weight: getComputedStyle(amount).fontWeight,
					numbers: getComputedStyle(amount).fontVariantNumeric,
				})),
			};
		});
		assert.equal(logAppearance.playersMatch, true, "log player colors match the player table in each theme");
		assert.ok(logAppearance.chains.length >= 3, "chain names retain distinct colors in the log");
		assert.ok(logAppearance.money.length > 0);
		for (const amount of logAppearance.money) {
			assert.match(amount.text, /^\$/);
			assert.equal(amount.weight, "600");
			assert.equal(amount.numbers, "tabular-nums");
		}
		await page.screenshot({ path: fileURLToPath(new URL(`fullscreen-${theme}.png`, output)) });
	}
	report.scenarios.push("full-window theme background, no outer gutters, wider board and permanently visible chat");
	report.scenarios.push("consistent player colors, distinct chain names and emphasized cash in light/dark logs");

	await open("players=4&hotseat=0&view=0&theme=dark");
	const inspectHand = async (view) => {
		const expected = await page.evaluate((view) => {
			const dev = window.acquireDev;
			const player =
				view === "acting"
					? dev.engine.currentPlayer(dev.state)
					: view === "waiting"
						? (dev.engine.currentPlayer(dev.state) + 1) % 4
						: undefined;
			const state = dev.engine.stripSecret(structuredClone(dev.state), player);
			dev.emitter.emit("player", { index: player });
			dev.emitter.emit("state", state);
			return player === undefined
				? []
				: state.seats
						.flatMap((seat, index) =>
							state.seatOwner[index] === player
								? seat.hand.filter((tile) => tile !== dev.rules.HIDDEN).map(dev.rules.tileLabel)
								: []
						)
						.sort();
		}, view);
		await settle();
		assert.deepEqual((await page.locator(".square.held .coord").allTextContents()).sort(), expected);
	};
	await inspectHand("waiting");
	assert.equal(await page.locator(".square.playable").count(), 0, "waiting players cannot submit a tile");
	await inspectHand("spectator");
	await inspectHand("acting");
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await open("players=4&theme=dark");
		const beforeBoardMove = await page.evaluate(() => window.acquireDev.state.log.length);
		const square = page.locator(".square.playable").first();
		const tile = await square.locator(".coord").innerText();
		await square.click();
		await page.waitForFunction((length) => window.acquireDev.state.log.length > length, beforeBoardMove);
		const placements = await page.evaluate(
			(index) =>
				window.acquireDev.state.log
					.slice(index)
					.filter((entry) => entry.type === "move" && entry.move.type === "place")
					.map((entry) => entry.move.tile),
			beforeBoardMove
		);
		assert.deepEqual(placements, [tile], "one click places the chosen board tile exactly once");
		assert.equal(await page.locator(".square.selected").count(), 0, "no placement confirmation remains");
	}
	await page.evaluate(() => window.acquireDev.emitter.emit("replay:start"));
	await settle();
	assert.equal(
		await page.locator(".square.held").count(),
		0,
		"replay does not project the current hand onto old boards"
	);
	report.scenarios.push(
		"own hand visible while waiting, spectator privacy, one-click board placement on desktop/phone and replay isolation"
	);

	await open("players=4&moves=95&theme=light");
	assert.equal(await page.locator(".chain .letter").count(), await page.locator(".square.chain").count());
	assert.equal(await page.locator(".pattern, .patterned").count(), 0);
	assert.equal(await page.locator(".player .symbol, .chat .player-symbol").count(), 0);
	const authorColors = await page
		.locator(".chat .player-name")
		.evaluateAll((names) => names.map((name) => getComputedStyle(name).color));
	assert.equal(new Set(authorColors).size, 2, "chat authors have distinct player colors");
	await page.locator(".chat-composer input").fill("Unsent draft");
	await preferences({
		locale: "en",
		colorBlind: true,
		bgs: {
			players: [{ pro: true }, { pro: true }, { pro: true }, { pro: false }],
			playerColors: ["#13b7c8", "#111111", "#ffffff", "#3aa35b"],
			playerSymbols: ["circle", "triangle", "square", "diamond"],
		},
	});
	assert.equal(
		await page.locator(".chat-composer input").inputValue(),
		"Unsent draft",
		"appearance updates preserve chat drafts"
	);
	assert.equal(
		await page.locator(".player .symbol, .chat .player-symbol").count(),
		0,
		"old BGS preferences do not restore redundant symbols"
	);
	const customAppearance = await page.evaluate(() => {
		const names = Object.fromEntries(
			[...document.querySelectorAll(".players .player-name")].map((name) => [
				name.textContent,
				getComputedStyle(name).color,
			])
		);
		return {
			markers: [...document.querySelectorAll(".players .color")].map((marker) => marker.style.background),
			matches: [...document.querySelectorAll(".log .player-name, .chat .player-name")].every(
				(name) => getComputedStyle(name).color === names[name.textContent]
			),
		};
	});
	assert.deepEqual(
		customAppearance.markers,
		["rgb(19, 183, 200)", "rgb(17, 17, 17)", "rgb(255, 255, 255)", "rgb(58, 163, 91)"],
		"BGS supporter colors take precedence over game defaults"
	);
	assert.equal(
		customAppearance.matches,
		true,
		"custom supporter colors update consistently in the table, chat and log"
	);
	await page.locator(".chat-composer input").fill("");
	report.scenarios.push(
		"always-visible chain letters, no redundant symbols, player colors and live appearance updates"
	);

	for (const [width, height] of [
		[1280, 900],
		[390, 844],
		[320, 700],
		[844, 390],
	]) {
		await page.setViewportSize({ width, height });
		for (const locale of locales) {
			await preferences({ locale, colorBlind: true });
			assert.equal(await page.locator("main").getAttribute("lang"), locale);
			assert.equal(await page.locator("main").getAttribute("dir"), locale === "fa" ? "rtl" : "ltr");
			const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
			assert.ok(scrollWidth <= width + 1, `${locale} ${width}px: page overflow ${scrollWidth}`);
			assert.equal(await page.locator(".player .symbol").count(), 0);
			report.layouts.push({ width, height, locale, scrollWidth });
		}
	}
	report.scenarios.push("17 live languages at four viewport sizes, touch controls and RTL");

	await page.setViewportSize({ width: 390, height: 844 });
	await preferences({ locale: "fr", colorBlind: true });
	await page.evaluate(() => window.acquireDev.emitter.emit("chat:state", { canSend: false, reason: "not-a-player" }));
	await settle();
	assert.match(await page.locator(".chat-status").innerText(), /Seuls les joueurs/);
	await preferences({ locale: "de", colorBlind: true });
	assert.match(await page.locator(".chat-status").innerText(), /Nur Spieler/);
	await page.evaluate(() => window.acquireDev.emitter.emit("chat:state", { canSend: true }));
	await preferences({ locale: "en" });
	await page.locator(".chat-composer input").fill("Private beta smoke test");
	await page.locator(".chat-composer button").click();
	await page.waitForFunction(() =>
		document.querySelector(".chat-messages")?.textContent.includes("Private beta smoke test")
	);
	await preferences({ locale: "en", analysis: true });
	assert.equal(await page.locator(".chat").count(), 0);
	await preferences({ locale: "en", analysis: false });
	assert.equal(await page.locator(".chat").count(), 1);
	report.scenarios.push("chat send acknowledgement, localized permissions, live language change, analysis hides chat");

	await open("players=4&theme=light");
	assert.deepEqual(await page.evaluate(() => window.acquireAudioProbe), { starts: 0, closes: 0, contexts: 0 });
	await preferences({ locale: "en", sound: false });
	await page.locator("section.hand button").first().click();
	assert.equal(await page.evaluate(() => window.acquireAudioProbe.contexts), 0, "mute does not even open audio");
	await preferences({ locale: "en", sound: true });
	await page.locator("section.hand button").first().click();
	await page.locator(".square.playable").first().click();
	await page.waitForFunction(() => window.acquireAudioProbe.starts > 0);
	const audible = await page.evaluate(() => window.acquireAudioProbe.starts);
	const soundState = await page.evaluate(() => {
		const dev = window.acquireDev;
		const state = dev.engine.stripSecret(structuredClone(dev.state), dev.engine.currentPlayer(dev.state));
		dev.emitter.emit("state", state);
		return state;
	});
	assert.equal(await page.evaluate(() => window.acquireAudioProbe.starts), audible, "duplicate state stays quiet");
	// Feed one new public action through the protocol while muted, replaying, or analysing.
	for (const mode of ["muted", "replay", "analysis"]) {
		await preferences({ locale: "en", sound: mode !== "muted", analysis: mode === "analysis" });
		if (mode === "replay") {
			await page.evaluate(() => window.acquireDev.emitter.emit("replay:start"));
		}
		await page.evaluate((state) => window.acquireDev.emitter.emit("state", state), soundState);
		await page.evaluate((state) => {
			state.log.push({ type: "move", seat: 0, move: { type: "place", tile: "12I" } });
			window.acquireDev.emitter.emit("state", state);
		}, soundState);
		await settle();
		assert.equal(await page.evaluate(() => window.acquireAudioProbe.starts), audible, `${mode} stays quiet`);
		if (mode === "replay") {
			await page.evaluate(() => window.acquireDev.emitter.emit("replay:end"));
		}
	}
	await page.evaluate(() => window.acquire.destroy());
	assert.equal(await page.evaluate(() => window.acquireAudioProbe.closes), 1, "viewer teardown closes audio");
	report.scenarios.push(
		"real Web Audio cues after interaction, silent initial load/duplicates, live mute, replay/analysis suppression and teardown"
	);

	for (const mode of ["players=6", "players=2&twoPlayerMode=fourHands"]) {
		await open(`${mode}&moves=35&hotseat=0&view=0`);
		const count = mode.startsWith("players=6") ? 6 : 2;
		for (let player = 0; player <= count; player++) {
			const view = player === count ? null : player;
			await page.evaluate((viewer) => {
				const dev = window.acquireDev;
				const index = viewer ?? undefined;
				dev.emitter.emit("player", { index });
				dev.emitter.emit("state", dev.engine.stripSecret(structuredClone(dev.state), index));
			}, view);
			await settle();
			const hands = view === null ? 0 : count === 2 ? 2 : 1;
			assert.equal(await page.locator("section.hand").count(), hands);
			const liveBoard = await page.locator("main .board").first().innerText();
			await page.evaluate(() => {
				const emitter = window.acquireDev.emitter;
				emitter.emit("replay:start");
				emitter.emit("replay:to", 0);
			});
			await settle();
			assert.equal(await page.locator("section.hand").count(), 0);
			assert.equal(await page.locator(".panel button").count(), 0);
			assert.notEqual(await page.locator("main .board").first().innerText(), liveBoard);
			await page.evaluate(() => window.acquireDev.emitter.emit("replay:end"));
			await settle();
			assert.equal(await page.locator("main .board").first().innerText(), liveBoard);
			assert.equal(await page.locator("section.hand").count(), hands);
		}
	}
	report.scenarios.push("every six-player and four-hands seat plus spectators: replay navigation and live return");

	await open("players=4&theme=light");
	const before = await page.evaluate(() => window.acquireDev.state.log.length);
	await page.locator("section.hand button").first().click();
	await page
		.locator(".panel")
		.getByRole("button", { name: /^Place / })
		.click();
	await page.waitForFunction((length) => window.acquireDev.state.log.length > length, before);
	await settle();
	assert.equal(await page.getByText("Sending…", { exact: true }).count(), 0);
	const after = await page.locator("main .board").first().innerText();
	await page.evaluate(() => window.acquireDev.emitter.emit("state:updated"));
	await settle();
	assert.equal(await page.locator("main .board").first().innerText(), after);
	report.scenarios.push("real tile move through the built viewer and state refresh");

	// Private drafts run through the real BGS-shaped engine response, never through a local rules shortcut.
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await open("players=3&hotseat=0&view=0&theme=dark");
		const original = await page.evaluate((state) => {
			window.acquireDev.load(state);
			window.undoRequests = [];
			window.acquireDev.emitter.on("move", (request) => window.undoRequests.push(request));
			return JSON.stringify(window.acquireDev.state);
		}, preparedPosition("founding"));
		await settle();
		const boardBefore = await page.locator("main .board").first().innerText();
		const undo = page.getByRole("button", { name: "Undo", exact: true });
		for (let repeat = 0; repeat < 3; repeat++) {
			await page.locator(".board").getByRole("button", { name: "Place 2A", exact: true }).click();
			await undo.waitFor();
			assert.ok((await undo.boundingBox()).height >= 44, "undo is a full touch target");
			await page.locator(".choices button").filter({ hasText: "Tower" }).click();
			await page.waitForSelector("table.buy");
			assert.equal(await page.evaluate(() => JSON.stringify(window.acquireDev.state)), original);
			await page.evaluate(() => window.acquireDev.emitter.emit("state:updated"));
			await settle();
			assert.equal(await page.locator("table.buy").count(), 1, "saved-state refresh preserves private choices");
			const count = await page.evaluate(() => window.undoRequests.length);
			await undo.click();
			await page.waitForSelector(".choices");
			await undo.click();
			await page.waitForSelector(".square.playable");
			assert.equal(await page.locator("main .board").first().innerText(), boardBefore);
			assert.equal(
				await page.evaluate(() => window.undoRequests.length),
				count,
				"undo sends no history-writing action"
			);
			assert.equal(await undo.count(), 0);
		}
		await page.locator(".board").getByRole("button", { name: "Place 2A", exact: true }).click();
		await page.locator(".choices button").filter({ hasText: "Luxor" }).click();
		await page.waitForSelector("table.buy");
		await page.screenshot({ path: fileURLToPath(new URL(`undo-${width}.png`, output)), fullPage: true });
		await page.locator(".panel .primary").click();
		await page.waitForFunction(() => window.acquireDev.state.turn === 2);
		await settle();
		assert.equal(await undo.count(), 0, "no undo after drawing and handing over");
		const committed = await page.evaluate(() => ({
			moves: window.acquireDev.state.log.filter((e) => e.type === "move").map((e) => e.move),
			increments: window.acquireDev.engine.timeIncrements(window.acquireDev.state),
		}));
		assert.deepEqual(committed.moves, [
			{ type: "place", tile: "2A" },
			{ type: "found", chain: "luxor" },
			{ type: "buy", shares: {} },
		]);
		assert.deepEqual(committed.increments, [1, 0, 0]);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	}
	report.scenarios.push(
		"desktop/phone undo, repeated private revisions, refresh, no undo network calls, one saved turn and one clock increment"
	);

	// The desktop used to stack every supporting panel in one tall sidebar. Check the rendered
	// arrangement and height, not only horizontal overflow, before creating gallery images.
	await page.setViewportSize({ width: 1280, height: 900 });
	await open("players=4&moves=95&publicHoldings=1");
	const board = await page.locator(".layout > .board").boundingBox();
	const panels = await Promise.all(
		[".players", ".history", ".conversation"].map((selector) => page.locator(`.layout > ${selector}`).boundingBox())
	);
	for (const panel of panels) {
		assert.ok(panel.y >= board.y + board.height, "supporting panels sit below the board");
		assert.ok(Math.abs(panel.y - panels[0].y) < 1, "supporting panels share a desktop row");
	}
	assert.ok((await page.locator("main").boundingBox()).height <= 900, "desktop game fits within 900px");
	assert.equal(await page.locator(".log li").count(), 8);
	await page.getByRole("button", { name: /^Show the whole log/ }).click();
	assert.ok((await page.locator(".log li").count()) > 100, "full history remains available");
	await page.locator(".history button").click();
	assert.equal(await page.locator(".log li").count(), 8);
	report.scenarios.push("balanced desktop panels, compact recent history and expandable full log");

	for (const [name, params, width, height] of [
		["overview", "players=4&moves=95&publicHoldings=1", 1280, 900],
		["merger", "players=4&moves=50&merger=1&publicHoldings=1", 1280, 900],
		["phone", "players=4&moves=50&merger=1&publicHoldings=1", 390, 844],
	]) {
		await page.setViewportSize({ width, height });
		for (const theme of ["light", "dark"]) {
			await open(`${params}&theme=${theme}`);
			const main = await page.locator("main").boundingBox();
			const hand = await page.locator(".layout > .hand").boundingBox();
			// Desktop shows the whole compact layout. On phones frame the complete decision, board
			// and hand, without appending a long column of tables, chat and history to the image.
			const captureHeight = Math.ceil(width < 700 ? hand.y + hand.height + 12 : main.height);
			assert.ok(captureHeight <= (width < 700 ? 1100 : 900), `${name}: gallery image became too tall`);
			if (captureHeight > page.viewportSize().height) {
				await page.setViewportSize({ width, height: captureHeight });
				await settle();
			}
			const screenshot = await page.screenshot({
				path: fileURLToPath(new URL(`${name}-${theme}.png`, output)),
				clip: { x: 0, y: 0, width, height: captureHeight },
			});
			assert.equal(screenshot.readUInt32BE(16), width);
			assert.equal(screenshot.readUInt32BE(20), captureHeight);
			report.gallery.push({ name, theme, width, height: captureHeight });
		}
	}
	await preferences({ locale: "fa", colorBlind: true });
	await page.screenshot({ path: fileURLToPath(new URL("phone-fa.png", output)), fullPage: true });
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		for (const chapter of ["founding", "mergers", "scoring"]) {
			await page.evaluate((id) => localStorage.removeItem(`bgs:tutorial:acquire:${id}`), chapter);
			await page.goto(`${base}/?bundle=1&tutorial=${chapter}&locale=en`);
			await page.waitForSelector('.acquire-tutorial[data-step="0"]');
			assert.equal(await page.locator(".chat").count(), 0);
			assert.equal(await page.locator(".explanation > p").count(), 2);
			const place = async (tile) => {
				await page.locator("section.hand").getByRole("button", { name: tile, exact: true }).click();
				await page
					.locator(".panel")
					.getByRole("button", { name: `Place ${tile}`, exact: true })
					.click();
			};
			if (chapter === "scoring") {
				await page.getByRole("button", { name: "Announce the end…", exact: true }).click();
				await page.getByRole("button", { name: "Announce the end", exact: true }).click();
			} else {
				await place(chapter === "founding" ? "2A" : "4A");
			}
			await page.waitForSelector('.acquire-tutorial[data-step="1"]');
			await page.reload();
			await page.waitForSelector('.acquire-tutorial[data-step="1"]');
			await page.getByRole("button", { name: "Retry step", exact: true }).click();
			if (chapter === "founding") {
				await page.locator(".choices button").filter({ hasText: "Luxor" }).click();
				await page.getByRole("alert").waitFor();
				await page.locator(".choices button").filter({ hasText: "Tower" }).click();
			} else if (chapter === "mergers") {
				await page.getByRole("button", { name: "Sell one more", exact: true }).click();
				await page.getByRole("button", { name: "Trade two more", exact: true }).click();
				await page.locator("main .panel button.primary").click();
			} else {
				await place("12A");
			}
			await page.waitForSelector('.acquire-tutorial[data-step="2"]');
			if (chapter === "founding") {
				await page.locator(".guide").getByRole("button", { name: "Price table", exact: true }).click();
				assert.equal(await page.locator(".guide .prices").count(), 1);
				await page.locator(".guide .toggle").click();
				await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
				await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
			}
			await page.locator("main .panel button.primary").click();
			if (chapter !== "scoring") {
				await page.waitForSelector('.acquire-tutorial[data-step="3"]');
				assert.match(await page.locator(".status").innerText(), /Alex/);
				await place(chapter === "founding" ? "3A" : "8F");
				await page.waitForSelector('.acquire-tutorial[data-step="4"]');
				if (chapter === "founding") {
					assert.match(await page.locator(".guide").innerText(), /\$300/);
					await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
				} else {
					await page.locator(".choices button").filter({ hasText: "Festival" }).click();
					await page.getByRole("alert").waitFor();
					await page.locator(".choices button").filter({ hasText: "Worldwide" }).click();
					await page.waitForSelector('.acquire-tutorial[data-step="5"]');
					assert.match(await page.locator(".guide").innerText(), /\$4,500/);
					// Default 0/0 keeps the Festival share after both bonuses are paid.
					await page.locator("main .panel button.primary").click();
					await page.waitForSelector('.acquire-tutorial[data-step="6"]');
				}
				await page.locator("main .panel button.primary").click();
			}
			await page.waitForSelector('.acquire-tutorial[data-completed="true"]');
			// Finishing used to make the entire game inert, including reference controls.
			assert.equal(await page.locator("main .panel button").count(), 0);
			assert.equal(await page.locator("section.hand button").count(), 0);
			await page.locator("main").getByRole("button", { name: "Price table", exact: true }).click();
			assert.equal(await page.locator("main .prices").count(), 1);
			await page.locator("main .toggle").click();
			if (chapter === "scoring") {
				assert.match(await page.locator(".results").innerText(), /15,800/);
			}
			for (const locale of ["fr", "fa"]) {
				await page.evaluate(async ({ chapter, locale }) => window.acquire.launchTutorial("#app", { chapter, locale }), {
					chapter,
					locale,
				});
				await page.waitForSelector('.acquire-tutorial[data-completed="true"]');
				assert.equal(await page.locator(".acquire-tutorial").getAttribute("lang"), locale);
				assert.equal(await page.locator("main").getAttribute("dir"), locale === "fa" ? "rtl" : "ltr");
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					`${chapter} ${locale} tutorial overflow`
				);
				await page.locator("main .market .toggle").click();
				assert.equal(await page.locator("main .prices").count(), 1, "resumed completed lesson keeps references usable");
				await page.locator("main .market .toggle").click();
			}
			await page.screenshot({
				path: fileURLToPath(new URL(`tutorial-${chapter}-${width}.png`, output)),
				fullPage: true,
			});
			await page.locator(".guide nav button").first().click();
			const lastStep = { founding: 4, mergers: 6, scoring: 2 }[chapter];
			await page.waitForSelector(`.acquire-tutorial[data-step="${lastStep}"][data-completed="false"]`);
			assert.equal(await page.locator("main .panel button.primary").count(), 1, "previous step restores game actions");
		}
	}
	report.scenarios.push(
		"three tutorials (5/7/3 steps) completed through real controls on desktop and phone; growth pricing, tied survivor, sole shareholder bonuses, reload, retry, rejected move, French/Persian resume and usable references after completion"
	);

	// The new explanations are longer than action prompts. Exercise the price and bonus lessons
	// in every language, including their tables, at both desktop and the narrowest supported phone.
	for (const width of [1280, 320]) {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of locales) {
			for (const chapter of ["founding", "mergers"]) {
				await page.evaluate(
					async ({ chapter, locale }) => {
						localStorage.removeItem(`bgs:tutorial:acquire:${chapter}`);
						await window.acquire.launchTutorial("#app", { chapter, locale });
					},
					{ chapter, locale }
				);
				await page
					.locator("section.hand")
					.getByRole("button", { name: chapter === "founding" ? "2A" : "4A", exact: true })
					.click();
				await page.locator("main .panel .primary").click();
				await page.waitForSelector('.acquire-tutorial[data-step="1"]').catch(async (error) => {
					await page.screenshot({ path: fileURLToPath(new URL("tutorial-failure.png", output)), fullPage: true });
					throw new Error(
						`${chapter} ${locale} ${width}px: ${await page.locator("#app").innerText()}\n${errors.join("\n")}`,
						{ cause: error }
					);
				});
				if (chapter === "founding") {
					await page.locator(".choices button").filter({ hasText: "Tower" }).click();
					await page.waitForSelector('.acquire-tutorial[data-step="2"]');
					await page.locator(".guide .toggle").click();
					assert.equal(await page.locator(".guide .prices").count(), 1);
				}
				assert.equal(await page.locator(".explanation > p").count(), 2);
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					`${chapter} ${locale} ${width}px explanation overflow`
				);
				if (chapter === "founding") {
					await page.locator(".guide .toggle").click();
					const buyMore = page
						.locator("main .panel .buy tbody tr")
						.filter({ hasText: "Tower" })
						.getByRole("button")
						.last();
					await buyMore.click();
					await buyMore.click();
				} else {
					await page.locator("main .panel .steppers .quantity button").nth(1).click();
					await page.locator("main .panel .steppers .quantity button").nth(3).click();
				}
				await page.locator("main .panel .primary").click();
				if (chapter === "mergers") {
					await page.locator("main .panel .primary").click();
				}
				await page.waitForSelector('.acquire-tutorial[data-step="3"]');
				await page
					.locator("section.hand")
					.getByRole("button", { name: chapter === "founding" ? "3A" : "8F", exact: true })
					.click();
				await page.locator("main .panel .primary").click();
				await page.waitForSelector('.acquire-tutorial[data-step="4"]');
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					"new explanation fits"
				);
				if (chapter === "mergers") {
					await page.locator(".choices button").filter({ hasText: "Worldwide" }).click();
					await page.waitForSelector('.acquire-tutorial[data-step="5"]');
				}
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					"new bonus lesson fits"
				);
				report.tutorialLayouts.push({ width, locale, chapter });
				if (["en", "fr", "fa"].includes(locale)) {
					await page.screenshot({
						path: fileURLToPath(new URL(`explanation-${chapter}-${locale}-${width}.png`, output)),
						fullPage: true,
					});
				}
			}
		}
	}
	report.scenarios.push(
		"share-price and bonus explanations plus added growth and tied-merger steps in all 17 languages at desktop and 320px"
	);

	await page.emulateMedia({ colorScheme: "dark" });
	await page.reload();
	await page.waitForSelector('.acquire-tutorial[data-theme="dark"]');
	await page.emulateMedia({ colorScheme: "light" });
	await page.waitForSelector('.acquire-tutorial[data-theme="light"]');

	await page.evaluate(() => window.acquire.destroy());
	await settle();
	assert.equal(await page.locator("main").count(), 0);
	assert.deepEqual(errors, []);
	report.scenarios.push("light/dark production-bundle screenshots and clean viewer teardown");
	await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2) + "\n");
	console.log(
		`Browser checks passed: ${report.layouts.length} locale/viewport combinations; ${report.scenarios.length} integration scenarios.`
	);
} finally {
	await browser?.close();
	if (server?.pid) {
		if (process.platform === "win32") {
			server.kill();
		} else {
			process.kill(-server.pid, "SIGTERM");
		}
	}
}
