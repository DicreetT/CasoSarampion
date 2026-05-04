import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  applyChoice,
  createInitialState,
  getActionOutcomePreview,
  getOutcomeTone,
  getPatientSummary,
  getTurn,
  turns,
  type ActionKey,
  type GameState,
  type MedicationKey,
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

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45 },
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

const PatientIllustration = ({ state }: { state: GameState }) => {
  const svgState = state.visualState;
  const breathingMotion =
    svgState === "critical"
      ? { y: [0, -2, 0], scale: [1, 1.01, 1], rotate: [0, 0.25, -0.25, 0] }
      : svgState === "respiratory distress"
        ? { y: [0, -3, 0], scale: [1, 1.013, 1] }
        : { y: [0, -2, 0], scale: [1, 1.008, 1] };

  return (
    <motion.svg
      className={`patientIllustration ${svgState}`}
      viewBox="0 0 1200 760"
      role="img"
      aria-label="Paciente joven recostado en una camilla hospitalaria"
      animate={breathingMotion}
      transition={{ duration: svgState === "respiratory distress" ? 1.2 : 3.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <defs>
        <linearGradient id="sheetGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#eef5f8" />
          <stop offset="100%" stopColor="#c8d5dd" />
        </linearGradient>
        <linearGradient id="skinGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f6cfba" />
          <stop offset="100%" stopColor="#d5a88e" />
        </linearGradient>
        <linearGradient id="blanketGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e5eef2" />
          <stop offset="100%" stopColor="#b9cad4" />
        </linearGradient>
        <radialGradient id="glowGrad" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(123, 255, 138, 0.22)" />
          <stop offset="100%" stopColor="rgba(123, 255, 138, 0)" />
        </radialGradient>
      </defs>

      <rect x="120" y="390" width="960" height="18" rx="9" fill="#4c5d69" />
      <rect x="150" y="405" width="900" height="22" rx="11" fill="#2d3941" />
      <rect x="190" y="190" width="820" height="270" rx="34" fill="url(#sheetGrad)" opacity="0.95" />
      <rect x="204" y="220" width="792" height="224" rx="28" fill="rgba(255,255,255,0.65)" />
      <rect x="336" y="522" width="528" height="38" rx="19" fill="#73808b" opacity="0.35" />

      <g className="patientIllustration__figure">
        <ellipse cx="600" cy="265" rx="170" ry="138" fill="rgba(0,0,0,0.14)" />
        <ellipse cx="600" cy="250" rx="158" ry="128" fill="url(#skinGrad)" />
        <path
          d="M498 215c18-46 59-72 102-72 48 0 92 24 116 72 7 15 12 38 12 58-20-13-36-25-60-28-20-3-35 5-52 10-17 6-33 8-51 3-24-6-39-19-64-13-13 3-28 10-45 28 1-23 5-43 12-58Z"
          fill="#6c4534"
        />
        <ellipse cx="535" cy="230" rx="20" ry="15" fill="#ffffff" opacity="0.92" />
        <ellipse cx="665" cy="230" rx="20" ry="15" fill="#ffffff" opacity="0.92" />
        <circle cx="535" cy="232" r="7" fill="#cf4c53" />
        <circle cx="665" cy="232" r="7" fill="#cf4c53" />
        <path d="M525 208c9-4 20-5 30-2" stroke="#5d2f2c" strokeWidth="6" strokeLinecap="round" />
        <path d="M645 208c10-4 21-5 30-2" stroke="#5d2f2c" strokeWidth="6" strokeLinecap="round" />
        <path d="M580 256c6 6 34 6 40 0" stroke="#b0665e" strokeWidth="5" strokeLinecap="round" />
        <circle cx="546" cy="282" r="4.5" fill="#d94e5b" opacity="0.9" />
        <circle cx="683" cy="286" r="4.5" fill="#d94e5b" opacity="0.9" />
        <circle cx="488" cy="292" r="4.5" fill="#d94e5b" opacity="0.8" />
        <circle cx="720" cy="275" r="4.5" fill="#d94e5b" opacity="0.8" />
        <circle cx="575" cy="210" r="4" fill="#f9c6b9" />
        <circle cx="632" cy="210" r="4" fill="#f9c6b9" />
        <path d="M455 326c72-38 222-38 290 0 48 26 82 74 90 128-118 16-342 16-470 0 8-54 42-102 90-128Z" fill="url(#blanketGrad)" />
        <path d="M455 326c72-38 222-38 290 0 48 26 82 74 90 128-118 16-342 16-470 0 8-54 42-102 90-128Z" fill="rgba(123,255,138,0.08)" />
        <path d="M455 326c72-38 222-38 290 0 48 26 82 74 90 128-118 16-342 16-470 0 8-54 42-102 90-128Z" fill="rgba(255,255,255,0.16)" opacity="0.42" />
        <circle cx="485" cy="350" r="10" fill="#db5969" opacity="0.8" />
        <circle cx="532" cy="392" r="11" fill="#d54f63" opacity="0.78" />
        <circle cx="610" cy="360" r="12" fill="#cf445c" opacity="0.78" />
        <circle cx="698" cy="386" r="10" fill="#d54f63" opacity="0.8" />
        <circle cx="760" cy="352" r="11" fill="#db5969" opacity="0.82" />
        <circle cx="810" cy="396" r="9" fill="#d54f63" opacity="0.82" />
        <circle cx="560" cy="430" r="9" fill="#cf445c" opacity="0.8" />
        <circle cx="650" cy="438" r="10" fill="#d54f63" opacity="0.8" />
        <circle cx="736" cy="428" r="8" fill="#db5969" opacity="0.82" />
        <path d="M558 354c20 8 36 24 48 44" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
        <path d="M677 348c18 9 31 24 40 43" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" />
        <path d="M517 302l-70 70" stroke="rgba(255,255,255,0.14)" strokeWidth="16" strokeLinecap="round" />
        <path d="M690 302l66 72" stroke="rgba(255,255,255,0.14)" strokeWidth="16" strokeLinecap="round" />
        <path d="M600 458c-36 0-72 18-96 44" stroke="#94a4ad" strokeWidth="18" strokeLinecap="round" />
        <path d="M600 458c36 0 72 18 96 44" stroke="#94a4ad" strokeWidth="18" strokeLinecap="round" />
      </g>

      <ellipse cx="600" cy="260" rx="200" ry="160" fill="url(#glowGrad)" />
    </motion.svg>
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
  const contagionOpacity = state.flags.isolated ? 0 : Math.min(0.95, state.hidden.outbreakRisk / 5);
  const contagionActive = contagionOpacity > 0.04;
  const patientSummary = getPatientSummary(state);
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
    <motion.div className={`appShell ${visualClass} mx-auto flex min-h-[100dvh] w-full max-w-[930px] flex-col gap-4 px-3 py-3 text-slate-100 sm:px-4 sm:py-4`}>
      <div className="backgroundGrid" />

      <motion.section className="introGrid" {...fadeUp}>
        <motion.article className="introCard introCard--stats" {...fadeUp}>
          <div className="compactStatGrid">
            <StatBar icon="❤" label="VIDA" value={state.stats.life} max={4} />
            <StatBar icon="🌡" label="FIEBRE" value={state.stats.fever} max={5} />
            <StatBar icon="⚠" label="COMPLICACIONES" value={state.stats.complications} max={5} />
            <StatBar icon="☠" label="IATROGENIA" value={state.stats.iatrogenia} max={3} />
          </div>
        </motion.article>

        <motion.article className="introCard patientCard" {...fadeUp}>
          <div className="patientCard__top">
            <div className="patientCard__avatar" aria-hidden="true">
              <span>◔</span>
            </div>
            <div className="patientCard__meta">
              <span>Paciente: A.R.M.</span>
              <span>Edad: 21 años</span>
              <span>Sexo: Masculino</span>
            </div>
          </div>
          <div className="patientCard__divider" />
          <strong>Sospecha diagnóstica:</strong>
          <p className="patientCard__diagnosis">Sarampión</p>
          <p className="patientCard__summary">{patientSummary}</p>
        </motion.article>
      </motion.section>

      <motion.section className={`patientStage ${visualClass}`} {...fadeUp}>
        <div className="turnCallout">
          <p className="turnCallout__label">TURNO {turn.id + 1} DE {turns.length}</p>
          <p className="turnCallout__body">{turn.scene}</p>
          <p className="turnCallout__question">¿Qué decides hacer?</p>
        </div>

        <div className="patientStage__monitor">
          <div className={`monitor ${visualClass}`}>
            <div className="monitor__header">
              <span>Monitor de cabecera</span>
              <strong>{state.visualState.replace("respiratory distress", "distress")}</strong>
            </div>
            <div className="monitorAlarm" aria-hidden="true" />
            <div className="monitorWave" />
            <div className="vitalsGrid vitalsGrid--compact">
              <VitalPill label="HR" value={`${state.vitals.hr} bpm`} tone="neutral" />
              <VitalPill label="RR" value={`${state.vitals.rr}/min`} tone={state.vitals.rr >= 28 ? "danger" : "neutral"} />
              <VitalPill label="Temp" value={`${state.vitals.temperature.toFixed(1)} C`} tone={state.vitals.temperature >= 39 ? "warning" : "neutral"} />
              <VitalPill label="SpO2" value={`${state.vitals.spo2}%`} tone={state.vitals.spo2 <= 92 ? "danger" : "neutral"} />
              <VitalPill label="BP" value={state.vitals.bp} tone="neutral" />
            </div>
          </div>
        </div>

        {contagionActive && (
          <div className="contagionBackdrop" aria-hidden="true" style={{ opacity: contagionOpacity }}>
            <span className="contagionSilhouette contagionSilhouette--one" />
            <span className="contagionSilhouette contagionSilhouette--two" />
            <span className="contagionSilhouette contagionSilhouette--three" />
            <span className="contagionSilhouette contagionSilhouette--four" />
            <span className="contagionParticle contagionParticle--one" />
            <span className="contagionParticle contagionParticle--two" />
            <span className="contagionParticle contagionParticle--three" />
          </div>
        )}

        <div className="patientStage__body">
          <PatientIllustration state={state} />
        </div>

        <div className={`resultStrip ${outcomeTone} ${currentOutcome ? "visible" : ""}`}>
          <strong>{currentOutcome?.title ?? "Caso en curso"}</strong>
          <p>{currentOutcome?.description ?? "La historia avanza turno a turno. El desenlace todavía depende de la toma de decisiones."}</p>
        </div>
      </motion.section>

      <motion.section className="pocketPanel" {...fadeUp}>
        <div className="pocketPanel__head">
          <div>
            <p className="pocketPanel__eyebrow">BOLSILLO MÉDICO</p>
            <h3>Medicamentos, acciones y soporte</h3>
          </div>
          <motion.button type="button" className="ghostButton" onClick={resetGame} {...tapFeedback}>
            Reiniciar caso
          </motion.button>
        </div>

        <div className="pocketGrid">
          <article className="pocketColumn">
            <p className="pocketColumn__title">Medicamentos</p>
            <div className="optionGrid optionGrid--stack">
              {medicationOptions.map((med) => (
                <motion.button
                  key={med.key}
                  type="button"
                  className={`optionCard ${state.selectedMedication === med.key ? "active" : ""}`}
                  onClick={() => chooseMedication(med.key)}
                  {...tapFeedback}
                >
                  <span>{med.label}</span>
                  <small>{med.help}</small>
                </motion.button>
              ))}
            </div>
            <label className="doseInput">
              <span>Dosis en mg</span>
              <input
                type="number"
                min="0"
                step="50"
                value={state.selectedDoseMg}
                onChange={(event) => {
                  setState((current) => ({ ...current, selectedDoseMg: event.target.value }));
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

          <article className="pocketColumn">
            <p className="pocketColumn__title">Acciones</p>
            <div className="optionGrid optionGrid--stack">
              {actionOptions.map((action) => (
                <motion.button
                  key={action.key}
                  type="button"
                  className={`optionCard ${selectedAction === action.key ? "active" : ""}`}
                  onClick={() => chooseAction(action.key)}
                  {...tapFeedback}
                >
                  <span>{action.label}</span>
                  <small>{action.help}</small>
                </motion.button>
              ))}
            </div>
          </article>

          <article className="pocketColumn">
            <p className="pocketColumn__title">Soporte</p>
            <div className="optionGrid optionGrid--stack">
              {supportOptions.map((support) => (
                <motion.button
                  key={support.key}
                  type="button"
                  className={`optionCard ${selectedSupport === support.key ? "active" : ""}`}
                  onClick={() => chooseSupport(support.key)}
                  {...tapFeedback}
                >
                  <span>{support.label}</span>
                  <small>{support.help}</small>
                </motion.button>
              ))}
            </div>
          </article>
        </div>

        <div className="actionDock">
          <motion.button type="button" className="primaryButton" onClick={submitChoice} disabled={isFinished} {...tapFeedback}>
            APLICAR DECISIÓN
          </motion.button>
        </div>
      </motion.section>

      <motion.section className="historyPanel" {...fadeUp}>
        <div className="historyPanel__head">
          <p className="pocketPanel__eyebrow">HISTORIAL DE DECISIONES</p>
        </div>
        <div className="historyList">
          {historyRows.map((row) => (
            <div key={row.label} className="historyRow">
              <strong>{row.label}</strong>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.nav className="bottomNav" aria-label="Secciones" {...fadeUp}>
        <motion.button type="button" className="bottomNav__item active" {...tapFeedback}>
          <span>Paciente</span>
        </motion.button>
        <motion.button type="button" className="bottomNav__item" {...tapFeedback}>
          <span>Objetivos</span>
        </motion.button>
        <motion.button type="button" className="bottomNav__item" {...tapFeedback}>
          <span>Resultados</span>
        </motion.button>
      </motion.nav>
    </motion.div>
  );
}
