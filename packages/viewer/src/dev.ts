// Local dev harness (not part of the BGS bundle): runs the real engine in the page, plays
// random moves on request, and lets you view the game as any player or as a spectator.
// URL parameters: players=2..6, seed=..., view=N, hotseat=0, theme=light|dark, locale=de, and any game option, e.g. publicHoldings=1,
// twoPlayerMode=fourHands, teamPlay=1, autoEnd=1, endSize=31. For reproducible screenshots: moves=N plays N random moves,
// merger=1 then plays on to the next merger decision, bar=0 hides this toolbar.
import * as rules from "acquire-engine";
import { currentSeat, legalMoves, type GameState } from "acquire-engine";
import * as engine from "acquire-engine/wrapper.js";
import { LOCALES } from "./lib/i18n.ts";

const params = new URLSearchParams(window.location.search);
const viewer = params.get("bundle") === "1" ? await loadBuiltViewer() : (await import("./viewer")).viewer;

async function loadBuiltViewer(): Promise<typeof import("./viewer").viewer> {
	const revision = Date.now();
	const style = document.createElement("link");
	style.rel = "stylesheet";
	style.href = `/dist/acquire-viewer.css?build=${revision}`;
	document.head.append(style);
	await new Promise<void>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = `/dist/acquire-viewer.iife.js?build=${revision}`;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Build the viewer with pnpm build before using bundle=1"));
		document.head.append(script);
	});
	return (window as unknown as { acquire: typeof import("./viewer").viewer }).acquire;
}
const players = Math.min(6, Math.max(2, Number(params.get("players") ?? 4)));
const seed = params.get("seed") ?? "dev";
const options: Record<string, unknown> = {};
for (const key of ["publicHoldings", "teamPlay", "autoEnd", "twoTiles", "limitedLog"]) {
	if (params.get(key) === "1") {
		options[key] = true;
	}
}
for (const key of ["twoPlayerMode", "endSize", "stockSwap"]) {
	const value = params.get(key);
	if (value) {
		options[key] = value;
	}
}

const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Flo"];
let state: GameState = engine.init(players, [], options, seed);
NAMES.slice(0, players).forEach((name, player) => engine.setPlayerMetaData(state, player, { name }));
let viewAs: number | undefined = Number(params.get("view") ?? 0);
if (Number.isNaN(viewAs) || viewAs >= players) {
	viewAs = undefined;
}

if (params.has("tutorial")) {
	await viewer.launchTutorial("#app", { chapter: params.get("tutorial")!, locale: params.get("locale") ?? "en" });
} else {
	const emitter = viewer.launch("#app");

	let hotSeat = params.get("hotseat") !== "0";

	function sync(): void {
		if (hotSeat && !state.ended) {
			viewAs = engine.currentPlayer(state);
			select.value = String(viewAs);
		}
		emitter.emit("player", { index: viewAs });
		emitter.emit("state", engine.stripSecret(structuredClone(state), viewAs));
		status.textContent = state.ended
			? "Game over"
			: `Move ${state.log.filter((e) => e.type === "move" && !e.auto).length} · acting: player ${engine.currentPlayer(state)}`;
	}

	let rng = 1;
	function randomMove(): boolean {
		if (state.ended) {
			return false;
		}
		const moves = legalMoves(state).filter((move) => move.type !== "announce");
		rng = (Math.imul(rng, 1103515245) + 12345) >>> 0;
		const move = (moves.length > 0 ? moves : legalMoves(state))[rng % Math.max(1, moves.length)]!;
		engine.move(state, move, state.seatOwner[currentSeat(state)!]!);
		return true;
	}

	function play(count: number): void {
		for (let i = 0; i < count && randomMove(); i++) {}
		sync();
	}

	const bar = document.getElementById("dev")!;
	const status = document.createElement("span");
	const button = (label: string, action: () => void) => {
		const b = document.createElement("button");
		b.textContent = label;
		b.addEventListener("click", action);
		bar.append(b);
	};
	button("Random move", () => play(1));
	button("10 moves", () => play(10));
	button("100 moves", () => play(100));
	function nextMerger(): void {
		// Plays random moves until someone faces a merger decision (survivor, order or disposal).
		for (let i = 0; i < 2000 && !["survivor", "defunctOrder", "dispose"].includes(state.phase) && randomMove(); i++) {}
	}
	button("Next merger", () => {
		nextMerger();
		sync();
	});
	button("Announce", () => {
		const move = legalMoves(state).find((m) => m.type === "announce");
		if (move) {
			engine.move(state, move, state.seatOwner[currentSeat(state)!]!);
			sync();
		}
	});
	button("Restart", () => {
		state = engine.init(players, [], options, seed);
		NAMES.slice(0, players).forEach((name, player) => engine.setPlayerMetaData(state, player, { name }));
		sync();
	});
	const select = document.createElement("select");
	for (let p = 0; p < players; p++) {
		select.append(new Option(`View as ${NAMES[p]}`, String(p)));
	}
	select.append(new Option("Spectator", ""));
	select.value = viewAs === undefined ? "" : String(viewAs);
	select.addEventListener("change", () => {
		viewAs = select.value === "" ? undefined : Number(select.value);
		sync();
	});
	const hot = document.createElement("label");
	const hotBox = document.createElement("input");
	hotBox.type = "checkbox";
	hotBox.checked = hotSeat;
	hotBox.addEventListener("change", () => {
		hotSeat = hotBox.checked;
		sync();
	});
	hot.append(hotBox, " Hot seat (view as whoever must act)");
	// Player appearance as BGS sends it: host-resolved colours and Supporter flags in player
	// order, plus avatars. Avatars are neutral silhouettes and the badge is served by the dev server,
	// so the dev page needs no network. BGS requires the badge URL to be http(s).
	const COLORS = ["#4595d1", "#e68b32", "#8a5cc2", "#3aa35b", "#d14545", "#7a7a7a"];
	const svg = (body: string) =>
		`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`)}`;
	const avatars = NAMES.slice(0, players).map(() =>
		svg(
			`<rect width="24" height="24" fill="#cfcfcf"/><circle cx="12" cy="9" r="5" fill="#888"/><path d="M3 24c1-6 5-8 9-8s8 2 9 8z" fill="#888"/>`
		)
	);
	const appearance = {
		players: NAMES.slice(0, players).map((_, i) => ({ pro: i === 1 })),
		supporterBadge: { url: `${location.origin}/dev-badge.svg`, label: "Supporter" },
		playerColors: COLORS.slice(0, players),
	};
	// The BGS interface language, sent as preferences.locale.
	const language = document.createElement("select");
	language.append(...LOCALES.map((locale) => new Option(`Language: ${locale}`, locale)));
	language.value = params.get("locale") ?? "en";
	language.addEventListener("change", () => {
		const url = new URL(location.href);
		url.searchParams.set("locale", language.value);
		history.replaceState(null, "", url);
		sendPreferences();
	});
	const sendPreferences = () => emitter.emit("preferences", { bgs: appearance, locale: language.value });
	emitter.emit("avatars", avatars);
	// Theme as BGS would send it. "Not sent" leaves the viewer on its prefers-color-scheme fallback,
	// which can only be restored by reloading, as in BGS before the first theme event.
	const theme = document.createElement("select");
	theme.append(
		new Option("Theme: not sent (system)", ""),
		new Option("Theme: BGS light", "light"),
		new Option("Theme: BGS dark", "dark")
	);
	theme.value = params.get("theme") ?? "";
	function applyTheme(): void {
		if (theme.value) {
			emitter.emit("theme", { dark: theme.value === "dark" });
			document.documentElement.style.colorScheme = theme.value;
		}
	}
	theme.addEventListener("change", () => {
		const url = new URL(location.href);
		url.searchParams.set("theme", theme.value);
		history.replaceState(null, "", url);
		if (theme.value) {
			applyTheme();
		} else {
			location.reload();
		}
	});
	// BGS replay controls: the viewer answers with replay:info, which drives the step buttons.
	let replayInfo: { start: number; current: number; end: number } | undefined;
	const replayLabel = document.createElement("span");
	emitter.on("replay:info", (info) => {
		replayInfo = info;
		replayLabel.textContent = ` replay ${info.current}/${info.end}`;
	});
	button("Replay", () => emitter.emit("replay:start"));
	button("◀", () => replayInfo && emitter.emit("replay:to", Math.max(replayInfo.start, replayInfo.current - 10)));
	button("▶", () => replayInfo && emitter.emit("replay:to", Math.min(replayInfo.end, replayInfo.current + 10)));
	button("Live", () => {
		replayInfo = undefined;
		replayLabel.textContent = "";
		emitter.emit("replay:end");
	});
	bar.append(select, theme, language, hot, replayLabel, status);

	// For poking at positions from the browser console: window.acquireDev.load(state).
	(window as unknown as { acquireDev: unknown }).acquireDev = {
		rules,
		engine,
		emitter,
		viewer,
		get state() {
			return state;
		},
		load(next: GameState) {
			state = next;
			sync();
		},
	};

	// Chat as BGS would run it: a short history, permission to send, and every accepted message
	// echoed back through chat:appended with an acknowledgement.
	let chatId = 0;
	const chatMessage = (author: string, text: string, playerIndex?: number) => ({
		_id: (++chatId).toString(16).padStart(24, "0"),
		author,
		text,
		type: "text" as const,
		createdAt: new Date().toISOString(),
		...(playerIndex === undefined ? {} : { playerIndex }),
		segments: [{ kind: "text" as const, text }],
	});
	emitter.emit("chat:state", { canSend: true });
	emitter.emit("chat:messages", [
		chatMessage("Bo", "Good luck everyone", 1),
		chatMessage("Cy", "Watch out for Tower", 2),
	]);
	emitter.on("chat:send", ({ text, requestId }) => {
		emitter.emit("chat:appended", [chatMessage(NAMES[viewAs ?? 0] ?? "You", text, viewAs)]);
		if (requestId) {
			emitter.emit("chat:result", { requestId, ok: true });
		}
	});

	for (let i = 0; i < Number(params.get("moves") ?? 0) && randomMove(); i++) {}
	if (params.get("merger") === "1") {
		nextMerger();
	}
	if (params.get("bar") === "0") {
		bar.style.display = "none";
	}
	emitter.on("fetchState", sync);
	applyTheme();
	sendPreferences();
	emitter.on("move", (move) => {
		if (viewAs !== undefined) {
			try {
				const result = engine.move(structuredClone(state), structuredClone(move), viewAs);
				const saved = engine.toSave(result);
				if (saved) {
					state = saved;
					sync();
				} else {
					emitter.emit("gamelog", {
						start: state.log.length,
						data: engine.logSlice(result, { start: state.log.length, player: viewAs }),
					});
				}
				emitter.emit("move:result", { move, ok: true });
			} catch (error) {
				emitter.emit("move:result", { move, ok: false, error: String(error) });
			}
		}
	});
	sync();
}
