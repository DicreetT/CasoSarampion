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
  | "iatrogenia_alta"
  | "complicacion_grave"
  | "manejo_incompleto";

export interface Stats {
  life: number;
  iatrogenia: number;
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
  publicHealthNotified: boolean;
  contactsIdentified: boolean;
  admittedWard: boolean;
  admittedUci: boolean;
  improvedAtLeastOnce: boolean;
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

export const turns: TurnDefinition[] = [
  {
    id: 0,
    label: "Llamada desde el coffee break",
    scene: "Paciente de 21 años con fiebre, tos, coriza, conjuntivitis y exantema.",
    focus: "Caso en evolución desde el coffee break. Lee la escena con calma antes de decidir.",
  },
  {
    id: 1,
    label: "Fiebre 39.5 C",
    scene: "La temperatura sube y la sala empieza a parecer demasiado pequeña.",
    focus: "El control sintomático puede ayudar, pero hay que evitar iatrogenia.",
  },
  {
    id: 2,
    label: "R1 propone escarlatina",
    scene: "Un residente junior sugiere amoxicilina por una hipótesis de faringitis bacteriana.",
    focus: "No todo exantema necesita antibiótico.",
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

const normalizeDose = (dose: string) => {
  const parsed = Number.parseFloat(dose);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const createInitialState = (): GameState => ({
  turnIndex: 0,
  finished: false,
  stats: {
    life: 4,
    iatrogenia: 0,
    complications: 0,
    fever: 1,
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
  selectedDoseMg: "500",
  narrative:
    "Un paciente joven entra con un cuadro compatible con sarampión. El caso avanza por turnos y cada decisión modifica su evolución personal.",
  eventLog: [],
  flags: {
    isolated: false,
    ppe: false,
    publicHealthNotified: false,
    contactsIdentified: false,
    admittedWard: false,
    admittedUci: false,
    improvedAtLeastOnce: false,
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
  if (state.stats.life <= 0 || state.stats.iatrogenia >= 3 || state.stats.complications >= 5) {
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
  const goodClinical = state.stats.life > 0 && state.stats.iatrogenia <= 1 && state.stats.complications <= 2 && state.stats.fever <= 2;

  if (state.stats.life <= 0) {
    return {
      id: "complicacion_grave",
      title: "Complicación grave",
      description: "El paciente entra en un desenlace crítico pese a la asistencia prestada.",
    };
  }

  if (state.hidden.outbreakRisk >= 3) {
    return {
      id: "brote_hospitalario",
      title: "Paciente vivo, pero causaste un brote hospitalario",
      description: "El control clínico no evitó el riesgo asistencial oculto y el caso se convierte en un problema institucional.",
    };
  }

  if (state.stats.iatrogenia >= 3) {
    return {
      id: "iatrogenia_alta",
      title: "Iatrogenia elevada",
      description: "Las decisiones terapéuticas añadieron daño evitable al proceso.",
    };
  }

  if (state.stats.complications >= 4 || state.stats.life <= 1) {
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
  const stats = { ...next.stats };
  const vitals = { ...next.vitals };
  let narrative = "";

  switch (next.selectedMedication) {
    case "paracetamol": {
      if (doseMg >= 500 && doseMg <= 1000) {
        stats.fever = clamp(stats.fever - 1, 0, 5);
        vitals.temperature = Math.max(36.8, vitals.temperature - 0.6);
        narrative = "El paracetamol baja la curva térmica y da un respiro clínico.";
        next.flags.improvedAtLeastOnce = true;
      } else if (doseMg > 1500) {
        stats.iatrogenia = clamp(stats.iatrogenia + 1, 0, 3);
        narrative = "La dosis supera lo prudente y deja una sombra clara de iatrogenia.";
      } else if (doseMg > 0) {
        stats.fever = clamp(stats.fever - 1, 0, 5);
        narrative = "La analgesia-antitérmica ayuda, aunque el efecto es menos redondo de lo esperado.";
      } else {
        narrative = "No se administra una dosis útil.";
      }
      break;
    }
    case "amoxicilina": {
      stats.iatrogenia = clamp(stats.iatrogenia + 1, 0, 3);
      narrative = "El antibiótico no cambia el cuadro viral y añade ruido terapéutico.";
      if (turn === 2) {
        next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk + 1, 0, 5);
      }
      break;
    }
    case "ceftriaxona": {
      if (turn >= 4) {
        stats.complications = clamp(stats.complications - 1, 0, 5);
        narrative = "La cobertura parenteral solo encaja si sospechas complicación bacteriana real.";
      } else {
        stats.iatrogenia = clamp(stats.iatrogenia + 1, 0, 3);
        narrative = "El uso precoz de ceftriaxona no resuelve el escenario y sí suma iatrogenia.";
      }
      break;
    }
    case "corticoides": {
      stats.iatrogenia = clamp(stats.iatrogenia + 1, 0, 3);
      narrative = "Los corticoides sin indicación clara pesan más como riesgo que como ayuda.";
      break;
    }
    case "vitaminaA": {
      if (state.turnIndex >= 1 && (state.stats.fever >= 2 || state.stats.complications >= 1)) {
        stats.complications = clamp(stats.complications - 1, 0, 5);
        stats.fever = clamp(stats.fever - 1, 0, 5);
        narrative = "La vitamina A apoya casos seleccionados y no sustituye el resto del manejo.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        narrative = "Se administra un apoyo biológico que no cambia demasiado el curso del caso.";
      }
      break;
    }
    case "benzodiacepina": {
      if (turn === 5) {
        stats.complications = clamp(stats.complications - 2, 0, 5);
        stats.life = clamp(stats.life + 1, 0, 4);
        narrative = "La crisis cede con un manejo rápido y el paciente deja de luchar tanto contra su propio sistema nervioso.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        stats.iatrogenia = clamp(stats.iatrogenia + 1, 0, 3);
        narrative = "La sedación fuera de contexto clínico añade un coste innecesario.";
      }
      break;
    }
    default:
      narrative = "No hay un fármaco activo seleccionado.";
  }

  next.stats = stats;
  next.vitals = vitals;
  addLog(next, narrative);
  return next;
};

const applyAction = (state: GameState, action: ActionKey) => {
  const next = { ...state };
  const stats = { ...next.stats };
  const vitals = { ...next.vitals };
  let narrative = "";

  switch (action) {
    case "aislamiento":
      next.flags.isolated = true;
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 2, 0, 5);
      narrative = "Se activa aislamiento respiratorio y el circuito asistencial deja de estar tan expuesto.";
      break;
    case "epis":
      next.flags.ppe = true;
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 1, 0, 5);
      narrative = "La protección del equipo mejora y el contacto cercano pierde parte de su peligro.";
      break;
    case "notificar":
      next.flags.publicHealthNotified = true;
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 1, 0, 5);
      narrative = "Salud pública entra en escena y el caso deja de ser solo un problema de la sala.";
      break;
    case "contactos":
      next.flags.contactsIdentified = true;
      next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk - 1, 0, 5);
      narrative = "Se reconstruye la lista de contactos y la prevención gana terreno.";
      break;
    case "planta":
      next.flags.admittedWard = true;
      stats.complications = clamp(stats.complications + 1, 0, 5);
      narrative = "El ingreso en planta ordena el seguimiento, aunque también añade exposición si no se ha cerrado el control de infecciones.";
      if (!next.flags.isolated || !next.flags.ppe) {
        next.hidden.outbreakRisk = clamp(next.hidden.outbreakRisk + 1, 0, 5);
      }
      break;
    case "uci":
      next.flags.admittedUci = true;
      stats.life = clamp(stats.life + 1, 0, 4);
      stats.complications = clamp(stats.complications - 1, 0, 5);
      vitals.spo2 = Math.min(99, vitals.spo2 + 3);
      narrative = "La UCI llega a tiempo para la fase de mayor gravedad y estabiliza el escenario.";
      next.flags.improvedAtLeastOnce = true;
      break;
    case "alta":
      if (state.stats.complications <= 1 && state.stats.fever <= 1) {
        narrative = "El alta con control ambulatorio encaja con una evolución ya contenida.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        stats.life = clamp(stats.life - 1, 0, 4);
        stats.complications = clamp(stats.complications + 1, 0, 5);
        narrative = "Dar el alta demasiado pronto deja piezas importantes sin resolver.";
      }
      break;
    case "observar":
      stats.fever = clamp(stats.fever - 1, 0, 5);
      narrative = "La observación gana tiempo clínico y permite ver si el cuadro realmente gira a mejor.";
      break;
  }

  next.stats = stats;
  next.vitals = vitals;
  addLog(next, narrative);
  return next;
};

const applySupport = (state: GameState, support: SupportKey) => {
  const next = { ...state };
  const stats = { ...next.stats };
  const vitals = { ...next.vitals };
  let narrative = "";

  switch (support) {
    case "oral":
      if (state.turnIndex === 3 || state.stats.complications >= 1) {
        stats.complications = clamp(stats.complications - 1, 0, 5);
        vitals.bp = "112/72";
        narrative = "La hidratación oral ayuda si la deshidratación es leve y el paciente todavía puede beber.";
        next.flags.improvedAtLeastOnce = true;
      } else {
        narrative = "La hidratación oral no cambia mucho si no hay déficit claro.";
      }
      break;
    case "iv":
      stats.complications = clamp(stats.complications - 2, 0, 5);
      stats.life = clamp(stats.life + 1, 0, 4);
      vitals.bp = "116/74";
      narrative = "El suero IV corrige mejor el volumen cuando el cuadro ya pesa más.";
      next.flags.improvedAtLeastOnce = true;
      break;
    case "oxigeno":
      vitals.spo2 = Math.min(99, vitals.spo2 + 4);
      stats.complications = clamp(stats.complications - 1, 0, 5);
      narrative = "El oxígeno sostiene la oxigenación y compra tiempo para el resto del manejo.";
      next.flags.improvedAtLeastOnce = true;
      break;
    case "reposo":
      stats.fever = clamp(stats.fever - 1, 0, 5);
      narrative = "El reposo baja un poco el coste fisiológico del episodio.";
      break;
    case "dieta":
      narrative = "La dieta blanda acompaña, pero no altera por sí sola la historia clínica.";
      break;
  }

  next.stats = stats;
  next.vitals = vitals;
  addLog(next, narrative);
  return next;
};

const applyTurnPressure = (state: GameState) => {
  const next = { ...state };
  const stats = { ...next.stats };
  const hidden = { ...next.hidden };
  const vitals = { ...next.vitals };
  const turn = getTurn(next).id;

  if (turn === 0 && (!next.flags.isolated || !next.flags.ppe)) {
    hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 5);
  }

  if (turn === 1) {
    stats.fever = clamp(stats.fever + 1, 0, 5);
    vitals.temperature = Math.max(vitals.temperature, 39.5);
  }

  if (turn === 2) {
    if (!next.flags.publicHealthNotified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 5);
    }
    if (!next.flags.contactsIdentified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 5);
    }
  }

  if (turn === 3) {
    stats.complications = clamp(stats.complications + 1, 0, 5);
    stats.fever = clamp(stats.fever + 1, 0, 5);
  }

  if (turn === 4) {
    stats.complications = clamp(stats.complications + 1, 0, 5);
    stats.life = clamp(stats.life - 1, 0, 4);
    vitals.spo2 = Math.min(vitals.spo2, 91);
  }

  if (turn === 5) {
    stats.complications = clamp(stats.complications + 1, 0, 5);
    stats.life = clamp(stats.life - 1, 0, 4);
  }

  if (turn === 6) {
    if (!next.flags.publicHealthNotified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 5);
    }
    if (!next.flags.contactsIdentified) {
      hidden.outbreakRisk = clamp(hidden.outbreakRisk + 1, 0, 5);
    }
  }

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

  if (currentTurn >= turns.length - 1 && progressed.finished === false) {
    progressed.finished = true;
    progressed.outcome = setOutcome(progressed);
  }

  return progressed;
};

export const applyChoice = (
  state: GameState,
  choice:
    | { kind: "medication"; key: MedicationKey; doseMg: string }
    | { kind: "action"; key: ActionKey }
    | { kind: "support"; key: SupportKey },
) => {
  let next = { ...state };

  if (choice.kind === "medication") {
    next.selectedMedication = choice.key;
    next.selectedDoseMg = choice.doseMg;
    next = applyMedication(next, normalizeDose(choice.doseMg));
  }

  if (choice.kind === "action") {
    next = applyAction(next, choice.key);
  }

  if (choice.kind === "support") {
    next = applySupport(next, choice.key);
  }

  next = advanceTurn(next);
  next.outcome = next.finished ? setOutcome(next) : next.outcome;
  next.visualState = getVisualState(next);
  next.narrative = next.eventLog[next.eventLog.length - 1] ?? next.narrative;

  return next;
};

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
  if (outcome.id === "iatrogenia_alta") return "warning";
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
      if (dose > 1500) return "La dosis es más alta de lo razonable y añade iatrogenia.";
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
    if (choice.key === "planta") return "Puede ordenar cuidados, pero no sustituye el control infeccioso.";
    if (choice.key === "uci") return "Útil cuando la gravedad ya no permite media tinta.";
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
