import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase, hasSupabaseConfig } from "./lib/supabase";
import {
  applyChoices,
  createInitialState,
  getActionOutcomePreview,
  getOutcomeTone,
  getTurn,
  turns,
  type ActionKey,
  type AdministrationRoute,
  type GameState,
  type DoseScheduleMode,
  type MedicationKey,
  type VisualState,
  type SupportKey,
  type TurnChoice,
} from "./game/gameLogic";
import {
  loadSavedGameState,
  loadSavedTurnHistory,
  saveGameState,
  saveTurnHistory,
} from "./services/sessionStore";

const medicationOptions: Array<{ key: MedicationKey; label: string; help: string }> = [
  { key: "paracetamol", label: "Paracetamol", help: "Antitérmico con ajuste de dosis" },
  { key: "amoxicilina", label: "Amoxicilina", help: "Solo si el razonamiento lo justifica" },
  { key: "ceftriaxona", label: "Ceftriaxona", help: "Cobertura parenteral selectiva" },
  { key: "corticoides", label: "Corticoides", help: "No a ciegas" },
  { key: "vitaminaA", label: "Vitamina A", help: "Apoyo en casos seleccionados" },
  { key: "benzodiacepina", label: "Lorazepam", help: "Crisis convulsiva / encefalitis" },
];

const doseModeOptions: Array<{ key: DoseScheduleMode; label: string; help: string }> = [
  { key: "interval", label: "Horas", help: "Pauta repetida" },
  { key: "single", label: "Dosis única", help: "Solo una administración" },
];

const administrationRouteOptions: Array<{ key: AdministrationRoute; label: string; help: string }> = [
  { key: "oral", label: "Oral", help: "Vía digestiva" },
  { key: "iv", label: "IV", help: "Acceso intravenoso" },
  { key: "intramuscular", label: "Intramuscular", help: "Vía IM" },
];

const actionOptions: Array<{ key: ActionKey; label: string; help: string }> = [
  { key: "aislamiento", label: "Aislamiento respiratorio", help: "El riesgo visible no es el único" },
  { key: "epis", label: "EPIs / FFP2 protection", help: "Protección del equipo" },
  { key: "notificar", label: "Notificar salud pública", help: "La prevención se juega fuera de la habitación" },
  { key: "contactos", label: "Identificar contactos", help: "Corta cadenas de transmisión" },
  { key: "suspender", label: "Suspender medicación", help: "Elige qué pauta retirar" },
  { key: "planta", label: "Vacunar", help: "Seguimiento y vigilancia" },
  { key: "uci", label: "Ingreso UCI", help: "Escalada cuando la gravedad manda" },
  { key: "alta", label: "Alta con control ambulatorio", help: "Solo cuando el caso ya está contenido" },
  { key: "observar", label: "Seguir observando", help: "Tiempo clínico para no precipitarse" },
];

const supportOptions: Array<{ key: SupportKey; label: string; help: string }> = [
  { key: "oral", label: "Hidratación oral", help: "Deshidratación leve" },
  { key: "iv", label: "Suero IV", help: "Más útil si el déficit es mayor" },
  { key: "oxigeno", label: "Oxígeno", help: "Hypoxemia / distress" },
  { key: "reposo", label: "Reposo", help: "Baja el coste fisiológico" },
  { key: "dieta", label: "Dieta blanda", help: "Acompañamiento clínico" },
];

const medicationLabelByKey = new Map(medicationOptions.map((option) => [option.key, option.label]));
const actionLabelByKey = new Map(actionOptions.map((option) => [option.key, option.label]));
const supportLabelByKey = new Map(supportOptions.map((option) => [option.key, option.label]));
const doseModeLabelByKey = new Map(doseModeOptions.map((option) => [option.key, option.label]));
const routeLabelByKey = new Map(administrationRouteOptions.map((option) => [option.key, option.label]));
type MedicationChoice = Extract<TurnChoice, { kind: "medication" }>;

const initialState = createInitialState();

const normalizeGameState = (saved: GameState): GameState => {
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

const tapFeedback = {
  whileTap: { scale: 0.985 },
  whileHover: { y: -2 },
  transition: { duration: 0.18 },
};

const progressColor = (value: number, max: number) => {
  const ratio = value / max;
  if (ratio >= 0.75) return "danger";
  if (ratio >= 0.45) return "warning";
  return "safe";
};

const StatBar = ({
  icon,
  label,
  value,
  max,
}: {
  icon: string;
  label: string;
  value: number;
  max: number;
}) => {
  const width = `${Math.max(8, (value / max) * 100)}%`;
  return (
    <div className="statBar">
      <div className="statBar__top">
        <span className="statBar__label">
          <span className="statBar__icon" aria-hidden="true">
            {icon}
          </span>
          {label}
        </span>
        <strong>
          {value}/{max}
        </strong>
      </div>
      <div className="statBar__track">
        <div className={`statBar__fill ${progressColor(value, max)}`} style={{ width }} />
      </div>
    </div>
  );
};

const VitalPill = ({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) => (
  <div className={`vitalPill ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const choiceId = (choice: TurnChoice) => `${choice.kind}:${choice.key}`;

const choiceLabel = (choice: TurnChoice) => {
  if (choice.kind === "medication") {
    const label = medicationLabelByKey.get(choice.key) ?? choice.key;
    const interval =
      choice.doseMode === "single"
        ? "dosis única"
        : choice.everyHours && Number.parseFloat(choice.everyHours) > 0
          ? `c/${choice.everyHours}h`
          : "sin intervalo";
    const route = routeLabelByKey.get(choice.route) ?? choice.route;
    return `${label} ${choice.doseMg}mg · ${interval} · ${route}`;
  }

  if (choice.kind === "suspension") {
    const label = medicationLabelByKey.get(choice.key) ?? choice.key;
    return `Suspender: ${label}`;
  }

  if (choice.kind === "action") {
    return actionLabelByKey.get(choice.key) ?? choice.key;
  }

  return supportLabelByKey.get(choice.key) ?? choice.key;
};

const buildMedicationChoice = (state: GameState, key: MedicationKey): MedicationChoice => ({
  kind: "medication",
  key,
  doseMg: state.selectedDoseMg,
  everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
  doseMode: state.selectedDoseMode,
  route: state.selectedAdministrationRoute,
});

const syncMedicationChoice = (
  choice: MedicationChoice,
  state: GameState,
): MedicationChoice => ({
  ...choice,
  doseMg: state.selectedDoseMg,
  everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
  doseMode: state.selectedDoseMode,
  route: state.selectedAdministrationRoute,
});

const PatientIllustration = ({ state }: { state: GameState }) => {
  const svgState = state.visualState;
  const assetBase = `${import.meta.env.BASE_URL}assets/images/`;
  const normalImage = `${assetBase}normal.png`;
  const feverImage = `${assetBase}fever.png`;
  const r1Image = `${assetBase}r1.png`;
  const dehydratedImage = `${assetBase}dehydrated.png`;
  const respiratoryDistressImage = `${assetBase}respiratorydistress.png`;
  const convulsionImage = `${assetBase}convulsion.png`;
  const healthyImage = `${assetBase}healthy.png`;
  const [imageSrc, setImageSrc] = useState(normalImage);
  const getPatientImage = () => {
    if (state.turnIndex === 0) return normalImage;
    if (state.turnIndex === 1) return feverImage;
    if (state.turnIndex === 2) return r1Image;
    if (state.turnIndex === 3) return dehydratedImage;
    if (state.turnIndex === 4 || state.visualState === "respiratory distress") return respiratoryDistressImage;
    if (state.turnIndex === 5) return convulsionImage;
    if (state.turnIndex === 6) return healthyImage;
    if (state.stats.life <= 1) return `${assetBase}critical.png`;
    if (state.stats.fever >= 3) return `${assetBase}fever.png`;
    return normalImage;
  };
  const breathingMotion =
    svgState === "critical"
      ? { y: [0, -2, 0], scale: [1, 1.01, 1], rotate: [0, 0.25, -0.25, 0] }
      : svgState === "respiratory distress"
        ? { y: [0, -3, 0], scale: [1, 1.013, 1] }
        : { y: [0, -2, 0], scale: [1, 1.008, 1] };

  useEffect(() => {
    setImageSrc(getPatientImage());
  }, [
    state.turnIndex,
    state.stats.life,
    state.stats.complications,
    state.stats.fever,
    state.visualState,
    r1Image,
    dehydratedImage,
    respiratoryDistressImage,
    convulsionImage,
    healthyImage,
  ]);

  return (
    <div className="patientIllustrationFrame">
      <motion.img
        className={`patientIllustrationRaster ${svgState}`}
        src={imageSrc}
        alt="Paciente joven recostado en una camilla hospitalaria"
        onError={() => {
          if (imageSrc !== normalImage) {
            setImageSrc(normalImage);
          }
        }}
        animate={breathingMotion}
        transition={{ duration: svgState === "respiratory distress" ? 1.2 : 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<GameState>(() => {
    const saved = loadSavedGameState();
    if (!saved) return initialState;

    return normalizeGameState(saved);
  });
  const [selectedChoices, setSelectedChoices] = useState<TurnChoice[]>([]);
  const [turnHistory, setTurnHistory] = useState<GameState[]>(() =>
    loadSavedTurnHistory().map(normalizeGameState),
  );
  const [previewText, setPreviewText] = useState(
    "Selecciona una intervención del pocket médico y aplica la decisión para avanzar al siguiente turno.",
  );

  useEffect(() => {
    saveGameState(state);
  }, [state]);

  useEffect(() => {
    saveTurnHistory(turnHistory);
  }, [turnHistory]);

  useEffect(() => {
    const client = supabase;

    if (!hasSupabaseConfig || !client) {
      console.warn("SUPABASE NOT CONFIGURED");
      return;
    }

    const testSupabaseConnection = async () => {
      try {
        await client.auth.getSession();
        console.log("SUPABASE CONNECTED");
      } catch (error) {
        console.error("SUPABASE CONNECTION FAILED", error);
      }
    };

    void testSupabaseConnection();
  }, []);

  const turn = getTurn(state);
  const outcomeTone = getOutcomeTone(state.outcome);
  const isFinished = state.finished;
  const suspenderMode = selectedChoices.some(
    (choice) => choice.kind === "action" && choice.key === "suspender",
  );
  const suspensionChoice = selectedChoices.find((choice) => choice.kind === "suspension") ?? null;

  const visualClass = useMemo(() => {
    switch (state.visualState) {
      case "fever":
        return "is-fever";
      case "dehydrated":
        return "is-dehydrated";
      case "respiratory distress":
        return "is-respiratory";
      case "critical":
        return "is-critical";
      case "improved":
        return "is-improved";
      default:
        return "";
    }
  }, [state.visualState]);

  const goBackTurn = () => {
    setTurnHistory((current) => {
      if (!current.length) {
        const fresh = createInitialState();
        setState(fresh);
        setSelectedChoices([]);
        setPreviewText("No había historial guardado, así que volvimos al inicio del caso.");
        return current;
      }

      const previous = current[current.length - 1];
      setState(previous);
      setSelectedChoices([]);
      setPreviewText("Volviste al turno anterior. Ajusta la decisión antes de seguir.");
      return current.slice(0, -1);
    });
  };

  const hasChoice = (choice: TurnChoice) => selectedChoices.some((item) => choiceId(item) === choiceId(choice));

  const clearSuspensionChoices = (choices: TurnChoice[]) =>
    choices.filter((item) => item.kind !== "suspension" && !(item.kind === "action" && item.key === "suspender"));

  const updateMedicationChoice = (key: MedicationKey) => {
    const medicationPreview = getActionOutcomePreview({
      kind: "medication",
      key,
      doseMg: state.selectedDoseMg,
      everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
      doseMode: state.selectedDoseMode,
      route: state.selectedAdministrationRoute,
    });

    setSelectedChoices((current) => {
      const suspensionIndex = current.findIndex((item) => item.kind === "suspension");
      const existingMedicationIndex = current.findIndex((item) => item.kind === "medication");
      const updatedMedicationChoice = buildMedicationChoice(state, key);
      const updatedSuspensionChoice: TurnChoice = { kind: "suspension", key };

      if (suspenderMode) {
        if (suspensionIndex >= 0) {
          const updated = [...current];
          updated[suspensionIndex] = updatedSuspensionChoice;
          setPreviewText(`Se suspende ${medicationLabelByKey.get(key) ?? key}.`);
          return updated;
        }

        if (existingMedicationIndex >= 0) {
          const updated = [...current];
          updated[existingMedicationIndex] = updatedSuspensionChoice;
          setPreviewText(`Se suspende ${medicationLabelByKey.get(key) ?? key}.`);
          return updated;
        }

        if (current.length >= 2) {
          setPreviewText("Máximo 2 decisiones por turno.");
          return current;
        }

        setPreviewText(`Se suspende ${medicationLabelByKey.get(key) ?? key}.`);
        return [...current, updatedSuspensionChoice];
      }

      if (existingMedicationIndex >= 0) {
        const updated = [...current];
        updated[existingMedicationIndex] = updatedMedicationChoice;
        setPreviewText(medicationPreview);
        return updated;
      }

      if (current.length >= 2) {
        setPreviewText("Máximo 2 decisiones por turno.");
        return current;
      }

      setPreviewText(medicationPreview);
      return [...current, updatedMedicationChoice];
    });
    if (!suspenderMode) {
      setState((current) => ({ ...current, selectedMedication: key }));
    }
  };

  const setDoseMode = (mode: DoseScheduleMode) => {
    setState((current) => {
      const next = {
        ...current,
        selectedDoseMode: mode,
      };

      if (current.selectedMedication) {
        setSelectedChoices((choices) =>
          choices.map((choice) => (choice.kind === "medication" ? syncMedicationChoice(choice, next) : choice)),
        );
        setPreviewText(
          getActionOutcomePreview({
            kind: "medication",
            key: current.selectedMedication,
            doseMg: current.selectedDoseMg,
            everyHours: mode === "single" ? "" : current.selectedDoseEveryHours,
            doseMode: mode,
            route: current.selectedAdministrationRoute,
          }),
        );
      }

      return next;
    });
  };

  const setAdministrationRoute = (route: AdministrationRoute) => {
    setState((current) => {
      const next = {
        ...current,
        selectedAdministrationRoute: route,
      };

      if (current.selectedMedication) {
        setSelectedChoices((choices) =>
          choices.map((choice) => (choice.kind === "medication" ? syncMedicationChoice(choice, next) : choice)),
        );
        setPreviewText(
          getActionOutcomePreview({
            kind: "medication",
            key: current.selectedMedication,
            doseMg: current.selectedDoseMg,
            everyHours: current.selectedDoseMode === "single" ? "" : current.selectedDoseEveryHours,
            doseMode: current.selectedDoseMode,
            route,
          }),
        );
      }

      return next;
    });
  };

  const toggleActionChoice = (key: ActionKey) => {
    setSelectedChoices((current) => {
      const existing = current.findIndex((item) => item.kind === "action" && item.key === key);
      if (existing >= 0) {
        let updated = current.filter((item) => !(item.kind === "action" && item.key === key));
        if (key === "suspender") {
          updated = clearSuspensionChoices(updated);
        }
        setPreviewText(
          updated.length
            ? getActionOutcomePreview(
                updated[updated.length - 1].kind === "medication"
                  ? {
                      kind: "medication",
                      key: updated[updated.length - 1].key,
                      doseMg: state.selectedDoseMg,
                      everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
                      doseMode: state.selectedDoseMode,
                      route: state.selectedAdministrationRoute,
                    }
                  : updated[updated.length - 1].kind === "action"
                    ? { kind: "action", key: updated[updated.length - 1].key }
                    : { kind: "support", key: updated[updated.length - 1].key },
              )
            : "Selecciona una intervención del pocket médico y aplica la decisión para avanzar al siguiente turno.",
        );
        return updated;
      }

      if (current.length >= 2) {
        setPreviewText("Máximo 2 decisiones por turno.");
        return current;
      }

      if (key === "suspender") {
        setPreviewText(getActionOutcomePreview({ kind: "action", key }));
        return [...current, { kind: "action", key }];
      }

      setPreviewText(getActionOutcomePreview({ kind: "action", key }));
      return [...current, { kind: "action", key }];
    });
  };

  const toggleSupportChoice = (key: SupportKey) => {
    setSelectedChoices((current) => {
      const existing = current.findIndex((item) => item.kind === "support" && item.key === key);
      if (existing >= 0) {
        const updated = current.filter((item) => !(item.kind === "support" && item.key === key));
        setPreviewText(getActionOutcomePreview({ kind: "support", key }));
        return updated;
      }

      if (current.length >= 2) {
        setPreviewText("Máximo 2 decisiones por turno.");
        return current;
      }

      setPreviewText(getActionOutcomePreview({ kind: "support", key }));
      return [...current, { kind: "support", key }];
    });
  };

  const submitChoice = () => {
    if (!selectedChoices.length) {
      setPreviewText("Necesitas elegir al menos una intervención antes de avanzar.");
      return;
    }

    if (suspenderMode && !suspensionChoice) {
      setPreviewText("Primero elige qué medicación quieres suspender.");
      return;
    }

    const next = applyChoices(
      state,
      selectedChoices.map((choice) =>
          choice.kind === "medication"
            ? {
                ...choice,
                doseMg: state.selectedDoseMg,
                everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
                doseMode: state.selectedDoseMode,
                route: state.selectedAdministrationRoute,
              }
            : choice,
      ),
    );

    setTurnHistory((current) => [...current, state]);
    setState({
      ...next,
      selectedMedication: null,
      selectedDoseMg: "0",
      selectedDoseEveryHours: initialState.selectedDoseEveryHours,
      selectedDoseMode: initialState.selectedDoseMode,
      selectedAdministrationRoute: initialState.selectedAdministrationRoute,
    });
    setSelectedChoices([]);
    setPreviewText(next.narrative);
  };

  const currentOutcome = state.outcome;
  const assetBase = `${import.meta.env.BASE_URL}assets/images/`;
  const outbreakFinalImage = `${assetBase}finalconbrote.png`;
  const resolvedFinalImage = `${assetBase}finalsinbrote.png`;
  const contagionOpacity = state.flags.isolated ? 0 : Math.min(0.95, state.hidden.outbreakRisk / 4);
  const contagionActive = contagionOpacity > 0.04;
  const isFatalOutcome = currentOutcome?.id === "fallecido";
  const isOutbreakOutcome = currentOutcome?.id === "brote_hospitalario";
  const isTerminalOutcome = state.finished && currentOutcome;
  const historyRows = [
    {
      label: "Turno 0",
      value: state.eventLog[0] ?? "Aún sin decisiones tomadas.",
    },
    {
      label: "Turno 1",
      value:
        state.turnIndex > 0
          ? state.eventLog[1] ?? "Esperando tu decisión..."
          : "Esperando tu decisión...",
    },
  ];

  return (
    <motion.div
      className={`appShell ${visualClass}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="backgroundGrid" />

      {isTerminalOutcome &&
        (isFatalOutcome ? (
          <motion.section
            className={`finalScreen ${outcomeTone} fatal`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="finalScreen__card">
              <span className="finalScreen__eyebrow">Desenlace crítico</span>
              <h1>{currentOutcome?.title}</h1>
              <p>{currentOutcome?.description}</p>
              <p className="finalScreen__note">
                El paciente ha fallecido y no se puede seguir jugando.
              </p>
            </div>
          </motion.section>
        ) : (
          <motion.section
            className={`finalScreen finalScreen--image ${outcomeTone} ${isOutbreakOutcome ? "outbreak" : "resolved"}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <img
              className="finalScreen__image"
              src={isOutbreakOutcome ? outbreakFinalImage : resolvedFinalImage}
              alt={isOutbreakOutcome ? "Final con brote hospitalario" : "Final sin brote hospitalario"}
            />
            <div className="finalScreen__shade" />
          </motion.section>
        ))}

      <main className="simulatorFrame">
        <section className={`heroScene ${visualClass}`}>
          <div className="turnBanner">
            <div className="turnBanner__head">
              <span>TURNO {turn.id} DE {turns.length}</span>
              <motion.button
                type="button"
                className="turnBackButton"
                onClick={goBackTurn}
                {...tapFeedback}
              >
                Volver al anterior
              </motion.button>
            </div>
            <p>{turn.scene}</p>
            <strong>¿Qué decides hacer?</strong>
          </div>

          <div className="patientCenter">
            {contagionActive && (
              <div className="contagionBackdrop" style={{ opacity: contagionOpacity }}>
                <span className="contagionSilhouette contagionSilhouette--one" />
                <span className="contagionSilhouette contagionSilhouette--two" />
                <span className="contagionSilhouette contagionSilhouette--three" />
              </div>
            )}

            <div className="hudOverlay">
              <div className="hudPanel hudPanel--left">
                <StatBar icon="❤️" label="VIDA" value={state.stats.life} max={4} />
                <StatBar icon="🌡️" label="FIEBRE" value={state.stats.fever} max={3} />
                <StatBar icon="⚠️" label="COMPLICACIONES" value={state.stats.complications} max={3} />
              </div>

              <div className="vitalMonitor">
                <div className="monitorHeader">
                  <span>Monitor de cabecera</span>
                  <strong>{state.visualState.replace("respiratory distress", "distress")}</strong>
                </div>

                <div className="monitorWave" />

                <div className="vitalRows">
                  <VitalPill label="FC" value={`${state.vitals.hr} lpm`} tone={state.vitals.hr > 115 ? "danger" : "neutral"} />
                  <VitalPill label="FR" value={`${state.vitals.rr}/min`} tone={state.vitals.rr >= 28 ? "danger" : "neutral"} />
                  <VitalPill label="SpO₂" value={`${state.vitals.spo2}%`} tone={state.vitals.spo2 <= 92 ? "danger" : "neutral"} />
                  <VitalPill label="TEMP" value={`${state.vitals.temperature.toFixed(1)} °C`} tone={state.vitals.temperature >= 39 ? "warning" : "neutral"} />
                  <VitalPill label="TA" value={state.vitals.bp} tone="neutral" />
                </div>
              </div>
            </div>

            <div className="patientStage__body">
              <PatientIllustration state={state} />
            </div>
          </div>

          <div className="currentStateStrip">
            <strong>Estado actual:</strong>
            <span>Fiebre · Exantema · Tos · Coriza · Conjuntivitis</span>
          </div>
        </section>

        <section className="medicalPocket">
          <div className="medicalPocket__title">
            <span>🧰</span>
            <h2>Bolsillo médico</h2>
          </div>

          <div className="selectionSummary" aria-live="polite">
            <strong>{selectedChoices.length}/2 decisiones</strong>
            <div className="selectionChips">
              {selectedChoices.length === 0 ? (
                <span className="selectionChip selectionChip--muted">Aún no has elegido nada</span>
              ) : (
                selectedChoices.map((choice) => (
                  <span key={choiceId(choice)} className="selectionChip">
                    {choiceLabel(choice)}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="pocketColumns">
            <article className="pocketColumn pocketColumn--meds">
              <h3>💊 Medicamentos</h3>

              {suspenderMode && (
                <div className="modeNotice">
                  Elige ahora qué medicación vas a suspender.
                </div>
              )}

              {medicationOptions.map((med) => (
                <motion.button
                  key={med.key}
                  type="button"
                  className={`pocketItem ${
                    (suspenderMode && hasChoice({ kind: "suspension", key: med.key })) ||
                    (!suspenderMode &&
                      hasChoice(buildMedicationChoice(state, med.key)))
                      ? "active"
                      : ""
                  }`}
                  onClick={() => updateMedicationChoice(med.key)}
                  {...tapFeedback}
                >
                  <div>
                    <strong>{med.label}</strong>
                  </div>
                </motion.button>
              ))}

              <label className="doseControl">
                <span>Dosis en mg</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={state.selectedDoseMg}
                  readOnly={suspenderMode}
                  onChange={(event) => {
                    const dose = event.target.value;
                    setState((current) => ({
                      ...current,
                      selectedDoseMg: dose,
                    }));

                    if (!suspenderMode) {
                      setSelectedChoices((current) =>
                        current.map((choice) =>
                          choice.kind === "medication"
                            ? {
                                ...choice,
                                doseMg: dose,
                                everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
                                doseMode: state.selectedDoseMode,
                                route: state.selectedAdministrationRoute,
                              }
                            : choice,
                        ),
                      );

                      if (state.selectedMedication) {
                        setPreviewText(
                          getActionOutcomePreview({
                            kind: "medication",
                            key: state.selectedMedication,
                            doseMg: dose,
                            everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
                            doseMode: state.selectedDoseMode,
                            route: state.selectedAdministrationRoute,
                          }),
                        );
                      }
                    }
                  }}
                />
              </label>

              <div className="controlGroup">
                <span className="controlGroup__label">Pauta</span>
                <div className="toggleRow">
                  {doseModeOptions.map((option) => (
                    <motion.button
                      key={option.key}
                      type="button"
                      className={`toggleButton ${state.selectedDoseMode === option.key ? "active" : ""}`}
                      onClick={() => {
                        if (!suspenderMode) setDoseMode(option.key);
                      }}
                      disabled={suspenderMode}
                      {...tapFeedback}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.help}</small>
                    </motion.button>
                  ))}
                </div>
              </div>

              {state.selectedDoseMode !== "single" && (
                <label className="doseControl">
                  <span>Cada cuántas horas</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={state.selectedDoseEveryHours}
                    readOnly={suspenderMode}
                    onChange={(event) => {
                      const everyHours = event.target.value;
                      setState((current) => ({
                        ...current,
                        selectedDoseEveryHours: everyHours,
                      }));

                      if (!suspenderMode) {
                        setSelectedChoices((current) =>
                          current.map((choice) =>
                            choice.kind === "medication"
                              ? {
                                  ...choice,
                                  doseMg: state.selectedDoseMg,
                                  everyHours,
                                  doseMode: state.selectedDoseMode,
                                  route: state.selectedAdministrationRoute,
                                }
                              : choice,
                          ),
                        );

                        if (state.selectedMedication) {
                          setPreviewText(
                            getActionOutcomePreview({
                              kind: "medication",
                              key: state.selectedMedication,
                              doseMg: state.selectedDoseMg,
                              everyHours,
                              doseMode: state.selectedDoseMode,
                              route: state.selectedAdministrationRoute,
                            }),
                          );
                        }
                      }
                    }}
                  />
                </label>
              )}

              <div className="controlGroup">
                <span className="controlGroup__label">Vía de administración</span>
                <div className="toggleRow toggleRow--routes">
                  {administrationRouteOptions.map((option) => (
                    <motion.button
                      key={option.key}
                      type="button"
                      className={`toggleButton ${state.selectedAdministrationRoute === option.key ? "active" : ""}`}
                      onClick={() => {
                        if (!suspenderMode) setAdministrationRoute(option.key);
                      }}
                      disabled={suspenderMode}
                      {...tapFeedback}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.help}</small>
                    </motion.button>
                  ))}
                </div>
              </div>
            </article>

            <article className="pocketColumn pocketColumn--actions">
              <h3>🖐️ Acciones</h3>

              {actionOptions.map((action) => (
                <motion.button
                  key={action.key}
                  type="button"
                  className={`pocketItem ${hasChoice({ kind: "action", key: action.key }) ? "active" : ""}`}
                  onClick={() => toggleActionChoice(action.key)}
                  {...tapFeedback}
                >
                  <div>
                    <strong>{action.label}</strong>
                  </div>
                </motion.button>
              ))}
            </article>

            <article className="pocketColumn pocketColumn--support">
              <h3>💧 Soporte</h3>

              {supportOptions.map((support) => (
                <motion.button
                  key={support.key}
                  type="button"
                  className={`pocketItem ${hasChoice({ kind: "support", key: support.key }) ? "active" : ""}`}
                  onClick={() => toggleSupportChoice(support.key)}
                  {...tapFeedback}
                >
                  <div>
                    <strong>{support.label}</strong>
                  </div>
                </motion.button>
              ))}
            </article>
          </div>

          <motion.button
            type="button"
            className="applyDecisionButton"
            onClick={submitChoice}
            disabled={isFinished}
            {...tapFeedback}
          >
            APLICAR DECISIÓN →
          </motion.button>
        </section>

        <section className={`resultStrip ${outcomeTone} ${currentOutcome ? "visible" : ""}`}>
          <strong>{currentOutcome?.title ?? "Caso en curso"}</strong>
          <p>
            {currentOutcome?.description ??
              "La historia avanza turno a turno. El desenlace todavía depende de tus decisiones."}
          </p>
        </section>

        <section className="historyPanel">
          <h3>📋 Historial de decisiones</h3>

          <div className="historyList">
            {historyRows.map((row) => (
              <div key={row.label} className="historyRow">
                <strong>{row.label}</strong>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </motion.div>
  );
}
