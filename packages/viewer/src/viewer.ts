import { mount, tick, unmount } from "svelte";
import { registerViewer } from "@boardgamers/protocol/viewer";
import type { GameState, Move, TurnRequest } from "acquire-engine";
import App from "./App.svelte";
import { resolveLocale } from "./lib/i18n";
import { initialTheme, themeCss } from "./lib/palette";
import { createActionSounds } from "./lib/sounds";
import { STORE, ViewerStore } from "./lib/store.svelte";
import "./lib/theme.css";
import { mountTutorial } from "./tutorial/mount.svelte";

export const viewer = registerViewer<GameState, Move | TurnRequest>(
	"acquire",
	({ target, move, setReplayInfo, fetchState }) => {
		const style = document.createElement("style");
		style.textContent = themeCss();
		document.head.append(style);
		const sounds = createActionSounds(target);
		const store = new ViewerStore(move, { turnDrafts: true, onState: (state) => sounds.onState(state) });
		store.theme = initialTheme();
		const app = mount(App, { target, props: { store }, context: new Map([[STORE, store]]) });
		return {
			chat: store.chat,
			async onState(state) {
				store.setState(state);
				await tick();
			},
			async onLog({ data }) {
				const preview = (data as { preview?: GameState } | undefined)?.preview;
				if (preview) {
					store.preview(preview);
				} else {
					fetchState();
				}
				await tick();
			},
			onPlayer({ index }) {
				store.setPlayer(index);
			},
			onPreferences(preferences) {
				sounds.onPreferences(preferences);
				store.appearance = preferences.bgs;
				store.analysis = preferences.analysis === true;
				store.locale = resolveLocale(preferences.locale);
			},
			onAvatars(avatars) {
				store.avatars = avatars;
			},
			onTheme({ dark }) {
				store.theme = dark ? "dark" : "light";
			},
			onReplayStart() {
				const { start, end } = store.replayRange();
				if (store.replayable) {
					sounds.onReplayStart();
					store.replayAt = end;
				}
				setReplayInfo({ start, current: end, end });
			},
			onReplayTo(index) {
				const { start, end } = store.replayRange();
				if (store.replayable) {
					store.replayAt = Math.min(end, Math.max(start, index));
				}
				setReplayInfo({ start, current: store.replayAt ?? end, end });
			},
			onReplayEnd() {
				sounds.onReplayEnd();
				store.replayAt = undefined;
			},
			onMoveResult({ move, ok }) {
				store.moveResult(move, ok);
			},
			destroy() {
				sounds.destroy();
				style.remove();
				void unmount(app);
			},
		};
	},
	{ tutorial: mountTutorial }
);
