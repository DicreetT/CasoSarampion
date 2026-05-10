import { GameState, createInitialState } from "./gameLogic";

const initialState = createInitialState();

export const normalizeGameState = (saved: GameState): GameState => {
  return {
    ...initialState,
    ...saved,
    stats: {
      ...initialState.stats,
      ...(saved.stats || {}),
    },
    vitals: {
      ...initialState.vitals,
      ...(saved.vitals || {}),
    },
    hidden: {
      ...initialState.hidden,
      ...(saved.hidden || {}),
    },
    flags: {
      ...initialState.flags,
      ...(saved.flags || {}),
    },
    eventLog: saved.eventLog ?? [],
    selectedDoseMg: saved.selectedMedication ? saved.selectedDoseMg : "0",
    selectedDoseEveryHours: saved.selectedMedication ? saved.selectedDoseEveryHours ?? initialState.selectedDoseEveryHours : initialState.selectedDoseEveryHours,
    selectedDoseMode: saved.selectedMedication ? saved.selectedDoseMode ?? initialState.selectedDoseMode : initialState.selectedDoseMode,
    selectedAdministrationRoute: saved.selectedMedication
      ? saved.selectedAdministrationRoute ?? initialState.selectedAdministrationRoute
      : initialState.selectedAdministrationRoute,
    narrative: saved.narrative ?? initialState.narrative,
    outcome: saved.outcome ?? null,
  };
};
