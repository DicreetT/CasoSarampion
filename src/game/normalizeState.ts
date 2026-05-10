import { GameState, createInitialState } from "./gameLogic";

const initialState = createInitialState();

export const normalizeGameState = (saved: GameState): GameState => {
  const clampStat = (value: number | undefined, max: number) => Math.max(0, Math.min(max, value ?? 0));

  const migratedStats =
    saved.turnIndex === 1
      ? {
          ...initialState.stats,
          ...saved.stats,
          life: Math.min(saved.stats?.life ?? initialState.stats.life, 3),
          fever: clampStat(Math.max(saved.stats?.fever ?? 0, 3), 3),
          complications: clampStat(Math.max(saved.stats?.complications ?? 0, 2), 3),
        }
      : saved.turnIndex >= 2
      ? {
          ...initialState.stats,
          ...saved.stats,
          complications: clampStat(
            Math.max(saved.stats?.complications ?? 0, saved.flags?.corticoidesSuspended ? 2 : 3),
            3,
          ),
          fever: clampStat(saved.stats?.fever, 3),
        }
      : {
          ...initialState.stats,
          ...saved.stats,
          complications: clampStat(saved.stats?.complications, 3),
          fever: clampStat(saved.stats?.fever, 3),
        };

  const migratedFlags =
    saved.turnIndex >= 2
      ? {
          ...initialState.flags,
          ...saved.flags,
          turn2AntibioticApplied: true,
        }
      : { ...initialState.flags, ...saved.flags };

  const migratedVitals =
    saved.turnIndex === 1
      ? {
          ...initialState.vitals,
          ...saved.vitals,
          temperature: Math.max(saved.vitals?.temperature ?? initialState.vitals.temperature, 39.3),
        }
      : { ...initialState.vitals, ...saved.vitals };

  return {
    ...initialState,
    ...saved,
    stats: migratedStats,
    vitals: migratedVitals,
    hidden: { ...initialState.hidden, ...saved.hidden },
    flags: migratedFlags,
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
