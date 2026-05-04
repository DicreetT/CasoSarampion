import type { GameState } from "../game/gameLogic";

const STORAGE_KEY = "codigo-sarampion.session.v1";

export const loadSavedGameState = (): GameState | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
};

export const saveGameState = (state: GameState) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local storage can be unavailable in private mode or locked-down browsers.
  }
};

export const clearSavedGameState = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
};

