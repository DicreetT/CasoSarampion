export type PocketTab = "Medicamentos" | "Acciones" | "Soporte";

export type VisualState =
  | "normal"
  | "fever"
  | "dehydrated"
  | "respiratory distress"
  | "critical"
  | "improved";

export type OutcomeId =
  | "manejo_excellent"
  | "brote_hospitalario"
  | "complicacion_grave"
  | "manejo_incompleto";

export interface Stats {
  life: number;
  complications: number;
  fever: number;
}

export interface Vitals {
  hr: number;
  bp: string;
  rr: number;
  spo2: number;
  temperature: number;
}

export interface Flags {
  isolated: boolean;
  ppe: boolean;
  infectionControlWindowMet: boolean;
  turn2AntibioticApplied: boolean;
  publicHealthNotified: boolean;
  contactsIdentified: boolean;
  admittedWard: boolean;
  admittedUci: boolean;
  improvedAtLeastOnce: boolean;
  paracetamolGiven: boolean;
}

export interface GameState {
  turnIndex: number;
  finished: boolean;
  stats: Stats;
  hidden: {
    outbreakRisk: number;
  };
  vitals: Vitals;
  visualState: VisualState;
  selectedTab: PocketTab;
  selectedMedication: MedicationKey | null;
  selectedDoseMg: string;
  narrative: string;
  eventLog: string[];
  flags: Flags;
  outcome: Outcome | null;
}

export interface TurnDefinition {
  id: number;
  label: string;
  scene: string;
  focus: string;
}

export interface Outcome {
  id: OutcomeId;
  title: string;
  description: string;
}

export type MedicationKey =
  | "paracetamol"
  | "amoxicilina"
  | "ceftriaxona"
  | "corticoides"
  | "vitaminaA"
  | "benzodiacepina";

export type ActionKey =
  | "aislamiento"
  | "epis"
  | "notificar"
  | "contactos"
  | "suspender"
  | "planta"
  | "uci"
  | "alta"
  | "observar";

export type SupportKey =
  | "oral"
  | "iv"
  | "oxigeno"
  | "reposo"
  | "dieta";

export type TurnChoice =
  | { kind: "medication"; key: MedicationKey; doseMg: string }
  | { kind: "action"; key: ActionKey }
  | { kind: "suspension"; key: MedicationKey }
  | { kind: "support"; key: SupportKey };

export const turns: TurnDefinition[] = [
  {
    id: 0,
    label: "Coffee break",
    scene: "Te llaman mientras tomas café: paciente de 21 años con fiebre, tos, coriza, conjuntivitis y exantema.",
    focus: "El primer gesto clínico importa más que la prisa.",
  },
  {
    id: 1,
    label: "Fiebre 39.5 C",
    scene: "La temperatura del paciente sube y la tos continua.",
    focus: "El control sintomático puede ayudar, pero hay que evitar complicaciones.",
  },
  {
    id: 2,
    label: "R1 pauta corticoides",
    scene: "Le he puesto corticoides para controlar la inflamación y el paciente muestra mejoria.",
    focus: "Aquí la duda antiinflamatoria suele traducirse en más complicaciones.",
  },
  {
    id: 3,
    label: "Diarrea y deshidratación",
    scene: "La ingesta cae, la mucosa se seca y el paciente pierde volumen.",
    focus: "La hidratación correcta cambia el pronóstico.",
  },
  {
    id: 4,
    label: "Deterioro respiratorio",
    scene: "Baja la SpO2 y aumenta la frecuencia respiratoria.",
    focus: "Aquí importa reconocer gravedad, oxígeno y escalada de cuidados.",
  },
  {
    id: 5,
    label: "Convulsión / encefalitis",
    scene: "Aparece un episodio convulsivo y el equipo sospecha afectación neurológica.",
    focus: "La protección de la vía aérea y el manejo de crisis son prioritarios.",
  },
  {
    id: 6,
    label: "Cierre administrativo y salud pública",
    scene: "Llega la parte que nadie estudia a tiempo: notificación, contactos y cierre del caso.",
    focus: "El riesgo oculto se revela al final, cuando ya no sirve improvisar.",
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const MAX_FEVER = 3;
const MAX_COMPLICATIONS = 3;

const applyThresholdPenalties = (previousStats: Stats, stats: Stats) => {
  const nextStats = { ...stats };
  const messages: string[] = [];

  if (previousStats.fever < MAX_FEVER && nextStats.fever >= MAX_FEVER) {
    nextStats.life = clamp(nextStats.life - 1, 0, 4);
    nextStats.complications = clamp(nextStats.complications + 2, 0, MAX_COMPLICATIONS);
    messages.push("La fiebre llena su barra y arrastra más complicaciones.");
  }

  if (previousStats.complications < MAX_COMPLICATIONS && nextStats.complications >= MAX_COMPLICATIONS) {
    nextStats.life = clamp(nextStats.life - 1, 0, 4);
    messages.push("Las complicaciones llenan su barra y pasan factura.");
  }

  return { stats: nextStats, messages };
};

const normalizeDose = (dose: string) => {
  const parsed = Number.parseFloat(dose);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const createInitialState = (): GameState => ({
  turnIndex: 0,
  finished: false,
  stats: {
    life: 4,
    complications: 0,
    fever: 2,
  },
  hidden: {
    outbreakRisk: 0,
  },
  vitals: {
    hr: 96,
    bp: "118/76",
    rr: 18,
    spo2: 98,
    temperature: 38.1,
  },
  visualState: "normal",
  selectedTab: "Acciones",
  selectedMedication: null,
  selectedDoseMg: "0",
  narrative:
    "Un paciente joven entra con un cuadro compatible con sarampión. El caso avanza por turnos y cada decisión modifica su evolución personal.",
  eventLog: [],
  flags: {
    isolated: false,
    ppe: false,
    infectionControlWindowMet: false,
    turn2AntibioticApplied: false,
    publicHealthNotified: false,
    contactsIdentified: false,
    admittedWard: false,
    admittedUci: false,
    improvedAtLeastOnce: false,
    paracetamolGiven: false,
  },
  outcome: null,
});

export const getTurn = (state: GameState) => turns[state.turnIndex] ?? turns[turns.length - 1];

export const getPatientSummary = (state: GameState) => {
  const status =
    state.visualState === "critical"
      ? "inestable"
      : state.visualState === "respiratory distress"
        ? "respiratorio"
        : state.visualState === "dehydrated"
          ? "deshidratación"
          : state.visualState === "fever"
            ? "fiebre alta"
            : state.visualState === "improved"
              ? "mejoría"
              : "estable";

  return `Varón de 21 años con exantema, fiebre y clínica respiratoria alta. Estado actual: ${status}.`;
};

const getVisualState = (state: GameState): VisualState => {
  if (state.stats.life <= 0 || state.stats.complications >= MAX_COMPLICATIONS) {
    return "critical";
  }

  if (state.turnIndex === 4 || state.vitals.spo2 <= 92 || state.vitals.rr >= 28) {
    return "respiratory distress";
  }

  if (state.turnIndex === 3 || state.stats.complications >= 2) {
    return "dehydrated";
  }

  if (state.stats.fever >= 3 || state.vitals.temperature >= 39) {
    return "fever";
  }

  if (state.flags.improvedAtLeastOnce) {
    return "improved";
  }

  return "normal";
};

const updateVitalsForTurn = (state: GameState) => {
  const turn = getTurn(state).id;
  const vitals = { ...state.vitals };

  if (turn === 0) {
    vitals.temperature = Math.max(vitals.temperature, 38.2);
    vitals.hr = Math.max(vitals.hr, 98);
  }

  if (turn === 1) {
    vitals.temperature = Math.max(vitals.temperature, 39.5);
    vitals.hr = Math.max(vitals.hr, 110);
  }

  if (turn === 2) {
    vitals.temperature = Math.max(vitals.temperature, 39.1);
    vitals.hr = Math.max(vitals.hr, 108);
  }

  if (turn === 3) {
    vitals.hr = Math.max(vitals.hr, 116);
    vitals.rr = Math.max(vitals.rr, 22);
    vitals.bp = "108/68";
  }

  if (turn === 4) {
    vitals.hr = Math.max(vitals.hr, 124);
    vitals.rr = Math.max(vitals.rr, 30);
    vitals.spo2 = Math.min(vitals.spo2, 91);
    vitals.bp = "104/64";
  }

  if (turn === 5) {
    vitals.hr = Math.max(vitals.hr, 128);
    vitals.rr = Math.max(vitals.rr, 24);
    vitals.spo2 = Math.min(vitals.spo2, 90);
  }

  if (turn === 6) {
    vitals.temperature = Math.min(vitals.temperature, 38.0);
    vitals.rr = Math.max(16, vitals.rr - 2);
  }

  if (state.flags.improvedAtLeastOnce) {
    vitals.hr = Math.max(86, vitals.hr - 6);
    vitals.rr = Math.max(14, vitals.rr - 2);
    vitals.spo2 = Math.min(99, vitals.spo2 + 2);
    vitals.temperature = Math.max(36.9, vitals.temperature - 0.2);
  }

  return vitals;
};

const addLog = (state: GameState, message: string) => {
  state.eventLog = [...state.eventLog.slice(-5), message];
};

const setOutcome = (state: GameState): Outcome => {
  const overallClarity = state.flags.isolated && state.flags.ppe && state.flags.publicHealthNotified && state.flags.contactsIdentified;
  const goodClinical = state.stats.life > 0 && state.stats.complications <= 2 && state.stats.fever <= 2;

  if (state.stats.life <= 0) {
    return {
      id: "complicacion_grave",
      title: "Complicación grave",
      description: "El paciente entra en un desenlace crítico pese a la asistencia prestada.",
    };
  }

  if (!state.flags.infectionControlWindowMet || state.hidden.outbreakRisk >= 4) {
    return {
      id: "brote_hospitalario",
      title: "Paciente vivo, pero causaste un brote hospitalario",
      description: "El control clínico no evitó el riesgo asistencial oculto y el caso se convierte en un problema institucional.",
    };
  }

  if (state.stats.complications >= MAX_COMPLICATIONS || state.stats.life <= 1) {
    return {
      id: "complicacion_grave",
      title: "Complicación grave",
      description: "La evolución clínica fue mala y se perdió margen de recuperación.",
    };
  }

  if (goodClinical && overallClarity && state.hidden.outbreakRisk <= 1) {
    return {
      id: "manejo_excellent",
      title: "Manejo excelente",
      description: "Control clínico, aislamiento y salud pública estuvieron alineados desde el inicio.",
    };
  }

  return {
    id: "manejo_incompleto",
    title: "Manejo incompleto",
    description: "Hubo avances, pero faltó cerrar varias piezas del caso.",
  };
};

const applyMedication = (state: GameState, doseMg: number) => {
  const turn = getTurn(state).id;
  const next = { ...state };
  const previousStats = { ...next.stats };
  let stats = { ...next.stats };
  const vitals = { ...next.vitals };
  let narrative = "";

  switch (next.selectedMedication) {
    case "paracetamol": {
      if (doseMg >= 500 && doseMg <= 1000) {
        stats.fever = clamp(stats.fever - 1, 0, MAX_FEVER);
        vitals.temperature = Math.max(36.8, vitals.temperature - 0.6);
        narrative = "El paracetamol baja la curva térmica y da un respiro clínico.";
        next.flags.improvedAtLeastOnce = true;
        next.flags.paracetamolGiven = true;
      } else if (doseMg > 0) {
        stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
        narrative = "La dosis fuera de rango suma complicaciones y no deja un control limpio de la fiebre.";
      } else {
        narrative = "No se administra una dosis útil.";
      }
      break;
    }
    case "amoxicilina": {
      stats.complications = clamp(stats.complications + 2, 0, MAX_COMPLICATIONS);
      narrative = "El antibiótico no cambia el cuadro viral y añade ruido terapéutico.";
      if (turn === 2) {
        next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk + 1, 0, 4);
      }
      break;
    }
    case "ceftriaxona": {
      if (turn >= 4) {
        stats.complications = clamp(stats.complications - 1, 0, MAX_COMPLICATIONS);
        narrative = "La cobertura parenteral solo encaja si sospechas complicación bacteriana real.";
      } else {
        stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
        narrative = "El uso precoz de ceftriaxona no resuelve el escenario y sí suma complicaciones.";
      }
      break;
    }
    case "corticoides": {
      stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
      narrative = "Los corticoides sin indicación clara pesan más como riesgo que como ayuda.";
      break;
    }
    case "vitaminaA": {
      if (state.turnIndex >= 1 && (state.stats.fever >= 2 || state.stats.complications >= 1)) {
        stats.complications = clamp(stats.complications - 1, 0, MAX_COMPLICATIONS);
        stats.fever = clamp(stats.fever - 1, 0, MAX_FEVER);
        narrative = "La vitamina A apoya casos seleccionados y no sustituye el resto del manejo.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        narrative = "Se administra un apoyo biológico que no cambia demasiado el curso del caso.";
      }
      break;
    }
    case "benzodiacepina": {
      if (turn === 5) {
        stats.complications = clamp(stats.complications - 2, 0, MAX_COMPLICATIONS);
        stats.life = clamp(stats.life + 1, 0, 4);
        narrative = "La crisis cede con un manejo rápido y el paciente deja de luchar tanto contra su propio sistema nervioso.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
        narrative = "La sedación fuera de contexto clínico añade un coste innecesario.";
      }
      break;
    }
    default:
      narrative = "No hay un fármaco activo seleccionado.";
  }

  const threshold = applyThresholdPenalties(previousStats, stats);
  stats = threshold.stats;
  narrative = [narrative, ...threshold.messages].filter(Boolean).join(" ");

  next.stats = stats;
  next.vitals = vitals;
  addLog(next, narrative);
  return next;
};

const applySuspension = (state: GameState, medication: MedicationKey) => {
  const next = { ...state };
  const previousStats = { ...next.stats };
  let stats = { ...next.stats };
  let narrative = "";

  switch (medication) {
    case "paracetamol":
      stats.fever = clamp(stats.fever + 1, 0, MAX_FEVER);
      narrative = "Retirar el antitérmico hace que la fiebre vuelva a asomar con más facilidad.";
      break;
    case "amoxicilina":
    case "ceftriaxona":
    case "corticoides":
      stats.complications = clamp(stats.complications - 1, 0, MAX_COMPLICATIONS);
      narrative = "Se suspende una pauta innecesaria y el ruido iatrogénico empieza a aflojar.";
      next.flags.improvedAtLeastOnce = true;
      break;
    case "vitaminaA":
      narrative = "Suspender este apoyo no cambia demasiado la trayectoria clínica.";
      break;
    case "benzodiacepina":
      if (state.turnIndex === 5) {
        stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
        narrative = "Retirar la benzodiacepina en plena crisis no ayuda al paciente.";
      } else {
        narrative = "Fuera de la crisis, suspenderla no deja una huella clínica clara.";
      }
      break;
    default:
      narrative = "La medicación suspendida no cambia mucho el caso.";
  }

  const threshold = applyThresholdPenalties(previousStats, stats);
  stats = threshold.stats;
  narrative = [narrative, ...threshold.messages].filter(Boolean).join(" ");

  next.stats = stats;
  addLog(next, narrative);
  return next;
};

const applyAction = (state: GameState, action: ActionKey) => {
  const next = { ...state };
  const previousStats = { ...next.stats };
  let stats = { ...next.stats };
  const vitals = { ...next.vitals };
  const turn = getTurn(state).id;
  let narrative = "";

  switch (action) {
    case "aislamiento":
      next.flags.isolated = true;
      if (turn <= 1) {
        next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 2, 0, 4);
        narrative = "Se activa aislamiento respiratorio y el circuito asistencial deja de estar tan expuesto.";
      } else {
        narrative = "El aislamiento llega tarde para cambiar el contagio hospitalario ya decidido.";
      }
      break;
    case "epis":
      next.flags.ppe = true;
      if (turn <= 1) {
        next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 1, 0, 4);
        narrative = "La protección del equipo mejora y el contacto cercano pierde parte de su peligro.";
      } else {
        narrative = "Los EPIs llegan tarde para revertir el riesgo oculto del caso.";
      }
      break;
    case "notificar":
      next.flags.publicHealthNotified = true;
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 1, 0, 4);
      narrative = "Salud pública entra en escena y el caso deja de ser solo un problema de la sala.";
      break;
    case "contactos":
      next.flags.contactsIdentified = true;
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 1, 0, 4);
      narrative = "Se reconstruye la lista de contactos y la prevención gana terreno.";
      break;
    case "suspender":
      narrative = "Primero hay que elegir qué medicación se va a suspender.";
      break;
    case "planta":
      next.flags.admittedWard = true;
      stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
      narrative = "El ingreso en planta ordena el seguimiento, aunque también añade exposición si no se ha cerrado el control de infecciones.";
      if (!next.flags.isolated || !next.flags.ppe) {
        next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk + 1, 0, 4);
      }
      break;
    case "uci":
      next.flags.admittedUci = true;
      if (turn === 5) {
        stats.life = clamp(stats.life + 1, 0, 4);
        stats.complications = clamp(stats.complications - 1, 0, MAX_COMPLICATIONS);
        vitals.spo2 = Math.min(99, vitals.spo2 + 3);
        narrative = "La UCI llega a tiempo para la fase de mayor gravedad y estabiliza el escenario.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
        narrative = "No tenemos camillas disponibles: este ingreso en UCI no está justificado ahora mismo.";
      }
      break;
    case "alta":
      if (state.turnIndex >= 5 && state.stats.complications <= 1 && state.stats.fever <= 1) {
        narrative = "El alta con control ambulatorio encaja con una evolución ya contenida.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        stats.life = clamp(stats.life - 3, 0, 4);
        stats.complications = clamp(stats.complications + 3, 0, MAX_COMPLICATIONS);
        narrative = "Dar el alta demasiado pronto deja al paciente expuesto y empeora el caso.";
      }
      break;
    case "observar":
      stats.fever = clamp(stats.fever - 1, 0, MAX_FEVER);
      narrative = "La observación gana tiempo clínico y permite ver si el cuadro realmente gira a mejor.";
      break;
  }

  const threshold = applyThresholdPenalties(previousStats, stats);
  stats = threshold.stats;
  narrative = [narrative, ...threshold.messages].filter(Boolean).join(" ");

  next.stats = stats;
  next.vitals = vitals;
  addLog(next, narrative);
  return next;
};

const applySupport = (state: GameState, support: SupportKey) => {
  const next = { ...state };
  const previousStats = { ...next.stats };
  let stats = { ...next.stats };
  const vitals = { ...next.vitals };
  let narrative = "";

  switch (support) {
    case "oral":
      if (state.turnIndex === 3 || state.stats.complications >= 1) {
        stats.complications = clamp(stats.complications - 1, 0, MAX_COMPLICATIONS);
        vitals.bp = "112/72";
        narrative = "La hidratación oral ayuda si la deshidratación es leve y el paciente todavía puede beber.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        narrative = "La hidratación oral no cambia mucho si no hay déficit claro.";
      }
      break;
    case "iv":
      stats.complications = clamp(stats.complications - 2, 0, MAX_COMPLICATIONS);
      stats.life = clamp(stats.life + 1, 0, 4);
      vitals.bp = "116/74";
      narrative = "El suero IV corrige mejor el volumen cuando el cuadro ya pesa más.";
      next.flags.improvedAtLeastOnce = true;
      break;
    case "oxigeno":
      vitals.spo2 = Math.min(99, vitals.spo2 + 4);
      stats.complications = clamp(stats.complications - 1, 0, MAX_COMPLICATIONS);
      narrative = "El oxígeno sostiene la oxigenación y compra tiempo para el resto del manejo.";
      next.flags.improvedAtLeastOnce = true;
      break;
    case "reposo":
      stats.fever = clamp(stats.fever - 1, 0, MAX_FEVER);
      narrative = "El reposo baja un poco el coste fisiológico del episodio.";
      break;
    case "dieta":
      narrative = "La dieta blanda acompaña, pero no altera por sí sola la historia clínica.";
      break;
  }

  const threshold = applyThresholdPenalties(previousStats, stats);
  stats = threshold.stats;
  narrative = [narrative, ...threshold.messages].filter(Boolean).join(" ");

  next.stats = stats;
  next.vitals = vitals;
  addLog(next, narrative);
  return next;
};

const applyTurnPressure = (state: GameState) => {
  const next = { ...state };
  const previousStats = { ...next.stats };
  let stats = { ...next.stats };
  const hidden = { ...next.hidden };
  const vitals = { ...next.vitals };
  const turn = getTurn(next).id;

  if (turn === 1) {
    stats.fever = clamp(stats.fever + 2, 0, MAX_FEVER);

    if (next.flags.paracetamolGiven) {
      vitals.temperature = Math.max(37.8, vitals.temperature - 0.2);
    } else {
      stats.life = clamp(stats.life - 1, 0, 4);
      vitals.temperature = Math.max(vitals.temperature, 39.5);
    }

    next.flags.infectionControlWindowMet = next.flags.isolated && next.flags.ppe;

    if (!next.flags.infectionControlWindowMet) {
      hidden.outbreakRisk = 4;
    }
  }

  if (turn > 1 && !next.flags.infectionControlWindowMet) {
    hidden.outbreakRisk = 4;
  }

  if (turn === 2) {
    if (!next.flags.turn2AntibioticApplied) {
      stats.complications = clamp(stats.complications + 2, 0, MAX_COMPLICATIONS);
      next.flags.turn2AntibioticApplied = true;
      addLog(next, "Le he puesto corticoides para controlar la inflamación y el paciente muestra mejoria.");
    }
    if (!next.flags.publicHealthNotified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 4);
    }
    if (!next.flags.contactsIdentified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 4);
    }
  }

  if (turn === 3) {
    stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
    stats.fever = clamp(stats.fever + 1, 0, MAX_FEVER);
  }

  if (turn === 4) {
    stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
    stats.life = clamp(stats.life - 1, 0, 4);
    vitals.spo2 = Math.min(vitals.spo2, 91);
  }

  if (turn === 5) {
    stats.complications = clamp(stats.complications + 1, 0, MAX_COMPLICATIONS);
    stats.life = clamp(stats.life - 1, 0, 4);
  }

  if (turn === 6) {
    if (!next.flags.publicHealthNotified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 4);
    }
    if (!next.flags.contactsIdentified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 4);
    }
  }

  const threshold = applyThresholdPenalties(previousStats, stats);
  stats = threshold.stats;

  next.stats = stats;
  next.hidden = hidden;
  next.vitals = vitals;
  return next;
};

export const advanceTurn = (state: GameState) => {
  const afterPressure = applyTurnPressure(state);
  const currentTurn = afterPressure.turnIndex;
  const nextTurn = Math.min(afterPressure.turnIndex + 1, turns.length - 1);
  const progressed: GameState = {
    ...afterPressure,
    turnIndex: nextTurn,
    vitals: updateVitalsForTurn({
      ...afterPressure,
      turnIndex: nextTurn,
    }),
  };

  progressed.visualState = getVisualState(progressed);

  if (progressed.turnIndex === 2 && !progressed.flags.turn2AntibioticApplied) {
    progressed.stats.complications = clamp(progressed.stats.complications + 2, 0, MAX_COMPLICATIONS);
    progressed.flags.turn2AntibioticApplied = true;
    addLog(progressed, "Le he puesto corticoides para controlar la inflamación y el paciente muestra mejoria.");
    progressed.visualState = getVisualState(progressed);
  }

  if (currentTurn >= turns.length - 1 && progressed.finished === false) {
    progressed.finished = true;
    progressed.outcome = setOutcome(progressed);
  }

  return progressed;
};

const applySingleChoice = (state: GameState, choice: TurnChoice) => {
  let next = { ...state };

  if (choice.kind === "medication") {
    next.selectedMedication = choice.key;
    next.selectedDoseMg = choice.doseMg;
    next = applyMedication(next, normalizeDose(choice.doseMg));
  }

  if (choice.kind === "suspension") {
    next = applySuspension(next, choice.key);
  }

  if (choice.kind === "action") {
    next = applyAction(next, choice.key);
  }

  if (choice.kind === "support") {
    next = applySupport(next, choice.key);
  }

  return next;
};

export const applyChoices = (state: GameState, choices: TurnChoice[]) => {
  let next = { ...state };

  for (const choice of choices) {
    next = applySingleChoice(next, choice);
  }

  if (state.turnIndex === 0) {
    const turnZeroProtected = choices.some(
      (choice) =>
        choice.kind === "action" &&
        (choice.key === "aislamiento" || choice.key === "epis" || choice.key === "notificar"),
    );

    if (!turnZeroProtected) {
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk + 3, 0, 4);
    }
  }

  next = advanceTurn(next);
  next.outcome = next.finished ? setOutcome(next) : next.outcome;
  next.visualState = getVisualState(next);
  next.narrative = next.eventLog[next.eventLog.length - 1] ?? next.narrative;

  return next;
};

export const applyChoice = (state: GameState, choice: TurnChoice) => applyChoices(state, [choice]);

export const getPocketSummary = (tab: PocketTab) => {
  switch (tab) {
    case "Medicamentos":
      return "Ajusta la pauta con cuidado: la dosis importa tanto como la molécula.";
    case "Acciones":
      return "Lo invisible aquí también mata: aislamiento, EPI y notificación pesan mucho.";
    case "Soporte":
      return "El soporte correcto puede comprar tiempo clínico y evitar descompensación.";
  }
};

export const getOutcomeTone = (outcome: Outcome | null) => {
  if (!outcome) return "neutral";
  if (outcome.id === "manejo_excellent") return "positive";
  if (outcome.id === "brote_hospitalario" || outcome.id === "complicacion_grave") return "danger";
  return "neutral";
};

export const getActionOutcomePreview = (choice: {
  kind: "medication" | "action" | "support";
  key: string;
  doseMg?: string;
}) => {
  if (choice.kind === "medication") {
    if (choice.key === "paracetamol") {
      const dose = normalizeDose(choice.doseMg ?? "0");
      if (dose >= 500 && dose <= 1000) return "Una dosis prudente puede bajar la fiebre sin sumar ruido.";
      if (dose > 0) return "Fuera de rango, suma complicaciones y no controla bien la fiebre.";
      return "El efecto antitérmico será modesto.";
    }

    if (choice.key === "amoxicilina") return "Su uso aquí suele hablar más de incertidumbre que de precisión clínica.";
    if (choice.key === "ceftriaxona") return "Solo gana valor si sospechas una complicación bacteriana concreta.";
    if (choice.key === "corticoides") return "Sin indicación clara, el riesgo pesa más que el beneficio.";
    if (choice.key === "vitaminaA") return "Puede ayudar en casos seleccionados, pero no sustituye el manejo integral.";
    if (choice.key === "benzodiacepina") return "En la crisis convulsiva adecuada, sí cambia el escenario.";
  }

  if (choice.kind === "action") {
    if (choice.key === "aislamiento") return "El aislamiento temprano reduce el riesgo oculto que luego se convierte en brote.";
    if (choice.key === "epis") return "La protección del equipo no es un detalle decorativo.";
    if (choice.key === "notificar") return "La salud pública bien activada cambia el final del caso.";
    if (choice.key === "contactos") return "Rastrear contactos corta cadenas de transmisión.";
    if (choice.key === "suspender") return "Elige qué medicación retirar antes de avanzar.";
    if (choice.key === "planta") return "Puede ordenar cuidados, pero no sustituye el control infeccioso.";
    if (choice.key === "uci") return "Útil solo cuando la gravedad ya no permite media tinta.";
    if (choice.key === "alta") return "Dar el alta demasiado pronto puede dejar riesgos sin cerrar.";
    if (choice.key === "observar") return "A veces observar es exactamente la intervención correcta.";
  }

  if (choice.kind === "support") {
    if (choice.key === "oral") return "Funciona mejor cuando la deshidratación es leve.";
    if (choice.key === "iv") return "Más útil cuando el volumen ya está comprometido.";
    if (choice.key === "oxigeno") return "Aporta tiempo y protege mientras decides la escalada.";
    if (choice.key === "reposo") return "Una medida humilde, pero no inútil.";
    if (choice.key === "dieta") return "Acompaña, aunque no cambia la trayectoria por sí sola.";
  }

  return "La decisión se integra en la historia clínica del turno.";
};
