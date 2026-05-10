import { advanceTurn, createInitialState } from "./src/game/gameLogic";

let state = createInitialState();
console.log("Turn 0:", state.stats);

state = advanceTurn(state);
console.log("Turn 1:", state.stats, "Life:", state.stats.life);
