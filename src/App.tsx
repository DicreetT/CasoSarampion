import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  applyChoice,
  createInitialState,
  getActionOutcomePreview,
  getOutcomeTone,
  getTurn,
  turns,
  type ActionKey,
  type GameState,
  type MedicationKey,
  type VisualState,
  type SupportKey,
} from "./game/gameLogic";
import { clearSavedGameState, loadSavedGameState, saveGameState } from "./services/sessionStore";

const medicationOptions: Array<{ key: MedicationKey; label: string; help: string }> = [
  { key: "paracetamol", label: "Paracetamol", help: "Antitérmico con ajuste de dosis" },
  { key: "amoxicilina", label: "Amoxicilina", help: "Solo si el razonamiento lo justifica" },
  { key: "ceftriaxona", label: "Ceftriaxona", help: "Cobertura parenteral selectiva" },
  { key: "corticoides", label: "Corticoides", help: "No a ciegas" },
  { key: "vitaminaA", label: "Vitamina A", help: "Apoyo en casos seleccionados" },
  { key: "benzodiacepina", label: "Benzodiacepina", help: "Crisis convulsiva / encefalitis" },
];

const actionOptions: Array<{ key: ActionKey; label: string; help: string }> = [
  { key: "aislamiento", label: "Aislamiento respiratorio", help: "El riesgo visible no es el único" },
  { key: "epis", label: "EPIs / FFP2 protection", help: "Protección del equipo" },
  { key: "notificar", label: "Notificar salud pública", help: "La prevención se juega fuera de la habitación" },
  { key: "contactos", label: "Identificar contactos", help: "Corta cadenas de transmisión" },
  { key: "planta", label: "Ingreso en planta", help: "Seguimiento y vigilancia" },
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

const initialState = createInitialState();

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

const PatientIllustration = ({ state }: { state: GameState }) => {
  const svgState = state.visualState;
  const assetBase = `${import.meta.env.BASE_URL}assets/images/`;
  const normalImage = `${assetBase}normal.png`;
  const [imageSrc, setImageSrc] = useState(normalImage);
  const getPatientImage = () => {
    if (state.stats.life <= 1) return `${assetBase}critical.png`;
    if (state.stats.complications > 3) return `${assetBase}respiratory.png`;
    if (state.stats.fever > 3) return `${assetBase}fever.png`;
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
  }, [svgState]);

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
  const [state, setState] = useState<GameState>(() => loadSavedGameState() ?? initialState);
  const [selectedAction, setSelectedAction] = useState<ActionKey | null>(null);
  const [selectedSupport, setSelectedSupport] = useState<SupportKey | null>(null);
  const [previewText, setPreviewText] = useState(
    "Selecciona una intervención del pocket médico y aplica la decisión para avanzar al siguiente turno.",
  );

  useEffect(() => {
    saveGameState(state);
  }, [state]);

  const turn = getTurn(state);
  const outcomeTone = getOutcomeTone(state.outcome);
  const isFinished = state.finished;

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

  const resetGame = () => {
    const fresh = createInitialState();
    clearSavedGameState();
    setState(fresh);
    setSelectedAction(null);
    setSelectedSupport(null);
    setPreviewText("Selecciona una intervención del pocket médico y aplica la decisión para avanzar al siguiente turno.");
  };

  const chooseMedication = (key: MedicationKey) => {
    setState((current) => ({ ...current, selectedMedication: key }));
    setSelectedAction(null);
    setSelectedSupport(null);
    setPreviewText(getActionOutcomePreview({ kind: "medication", key, doseMg: state.selectedDoseMg }));
  };

  const chooseAction = (key: ActionKey) => {
    setSelectedAction(key);
    setSelectedSupport(null);
    setState((current) => ({ ...current, selectedMedication: null }));
    setPreviewText(getActionOutcomePreview({ kind: "action", key }));
  };

  const chooseSupport = (key: SupportKey) => {
    setSelectedSupport(key);
    setSelectedAction(null);
    setState((current) => ({ ...current, selectedMedication: null }));
    setPreviewText(getActionOutcomePreview({ kind: "support", key }));
  };

  const submitChoice = () => {
    if (state.selectedMedication) {
      const next = applyChoice(state, {
        kind: "medication",
        key: state.selectedMedication,
        doseMg: state.selectedDoseMg,
      });
      setState({ ...next, selectedMedication: null, selectedDoseMg: "500" });
      setPreviewText(next.narrative);
      setSelectedAction(null);
      setSelectedSupport(null);
      return;
    }

    if (selectedAction) {
      const next = applyChoice(state, {
        kind: "action",
        key: selectedAction,
      });
      setState(next);
      setPreviewText(next.narrative);
      setSelectedAction(null);
      setSelectedSupport(null);
      return;
    }

    if (selectedSupport) {
      const next = applyChoice(state, {
        kind: "support",
        key: selectedSupport,
      });
      setState(next);
      setPreviewText(next.narrative);
      setSelectedAction(null);
      setSelectedSupport(null);
      return;
    }

    setPreviewText("Necesitas elegir una intervención antes de avanzar.");
  };

  const currentOutcome = state.outcome;
  const contagionOpacity = state.flags.isolated ? 0 : Math.min(0.95, state.hidden.outbreakRisk / 4);
  const contagionActive = contagionOpacity > 0.04;
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

      <main className="simulatorFrame">
        <section className={`heroScene ${visualClass}`}>
          <div className="turnBanner">
            <span>TURNO {turn.id} DE {turns.length}</span>
            <p>{turn.scene}</p>
            <strong>¿Qué decides hacer?</strong>
          </div>

          <div className="hudPanel hudPanel--left">
            <StatBar icon="❤️" label="VIDA" value={state.stats.life} max={4} />
            <StatBar icon="🌡️" label="FIEBRE" value={state.stats.fever} max={5} />
            <StatBar icon="⚠️" label="COMPLICACIONES" value={state.stats.complications} max={5} />
            <StatBar icon="☠️" label="IATROGENIA" value={state.stats.iatrogenia} max={3} />
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

          {contagionActive && (
            <div className="contagionBackdrop" style={{ opacity: contagionOpacity }}>
              <span className="contagionSilhouette contagionSilhouette--one" />
              <span className="contagionSilhouette contagionSilhouette--two" />
              <span className="contagionSilhouette contagionSilhouette--three" />
            </div>
          )}

          <div className="patientCenter">
            <PatientIllustration state={state} />
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

          <div className="pocketColumns">
            <article className="pocketColumn pocketColumn--meds">
              <h3>💊 Medicamentos</h3>

              {medicationOptions.map((med) => (
                <motion.button
                  key={med.key}
                  type="button"
                  className={`pocketItem ${state.selectedMedication === med.key ? "active" : ""}`}
                  onClick={() => chooseMedication(med.key)}
                  {...tapFeedback}
                >
                  <div>
                    <strong>{med.label}</strong>
                    <small>{med.help}</small>
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
                  onChange={(event) => {
                    setState((current) => ({
                      ...current,
                      selectedDoseMg: event.target.value,
                    }));

                    if (state.selectedMedication) {
                      setPreviewText(
                        getActionOutcomePreview({
                          kind: "medication",
                          key: state.selectedMedication,
                          doseMg: event.target.value,
                        }),
                      );
                    }
                  }}
                />
              </label>
            </article>

            <article className="pocketColumn pocketColumn--actions">
              <h3>🖐️ Acciones</h3>

              {actionOptions.map((action) => (
                <motion.button
                  key={action.key}
                  type="button"
                  className={`pocketItem ${selectedAction === action.key ? "active" : ""}`}
                  onClick={() => chooseAction(action.key)}
                  {...tapFeedback}
                >
                  <div>
                    <strong>{action.label}</strong>
                    <small>{action.help}</small>
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
                  className={`pocketItem ${selectedSupport === support.key ? "active" : ""}`}
                  onClick={() => chooseSupport(support.key)}
                  {...tapFeedback}
                >
                  <div>
                    <strong>{support.label}</strong>
                    <small>{support.help}</small>
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

          <motion.button
            type="button"
            className="ghostButton"
            onClick={resetGame}
            {...tapFeedback}
          >
            Reiniciar caso
          </motion.button>
        </section>
      </main>
    </motion.div>
  );
}
