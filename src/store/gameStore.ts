import { create } from "zustand";
import { GameState, createInitialState } from "../game/gameLogic";
import { loadSavedGameState, saveGameState } from "../services/sessionStore";

interface GameStoreState {
  state: GameState;
  setState: (state: GameState | ((prev: GameState) => GameState)) => void;
  resetState: () => void;
}

const initializeState = (): GameState => {
  const saved = loadSavedGameState();
  return saved || createInitialState();
};

export const useGameStore = create<GameStoreState>((set) => ({
  state: initializeState(),
  setState: (updater) =>
    set((prev) => {
      const nextState = typeof updater === "function" ? updater(prev.state) : updater;
      saveGameState(nextState);
      return { state: nextState };
    }),
  resetState: () =>
    set(() => {
      const fresh = createInitialState();
      saveGameState(fresh);
      return { state: fresh };
    }),
}));
