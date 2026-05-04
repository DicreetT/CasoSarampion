import { useEffect, useMemo, useState } from "react";
import {
  applyChoice,
  createInitialState,
  getActionOutcomePreview,
  getOutcomeTone,
  getPatientSummary,
  getPocketSummary,
  getTurn,
  turns,
  type ActionKey,
  type GameState,
  type MedicationKey,
  type SupportKey,
  type PocketTab,
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

const tabList: PocketTab[] = ["Medicamentos", "Acciones", "Soporte"];

const initialState = createInitialState();

const progressColor = (value: number, max: number) => {
  const ratio = value / max;
  if (ratio >= 0.75) return "danger";
  if (ratio >= 0.45) return "warning";
  return "safe";
};

const StatBar = ({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) => {
  const width = `${Math.max(8, (value / max) * 100)}%`;
  return (
    <div className="statBar">
      <div className="statBar__top">
        <span>{label}</span>
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

  const pickTab = (tab: PocketTab) => {
    setState((current) => ({ ...current, selectedTab: tab }));
    setPreviewText(getPocketSummary(tab));
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
  const selectedTab = state.selectedTab;

  return (
    <div className="appShell">
      <div className="backgroundGrid" />
      <header className="topBar">
        <div>
          <p className="eyebrow">Código Sarampión</p>
          <h1>Simulador clínico por turnos</h1>
          <p className="subtitle">
            Un único caso, muchas decisiones. Cada jugador compite contra la fisiopatología y contra el riesgo oculto.
          </p>
        </div>
        <div className="turnBadge">
          <span>Turno</span>
          <strong>
            {turn.id + 1} / {turns.length}
          </strong>
        </div>
      </header>

      <main className="gameLayout">
        <section className={`hudPanel ${visualClass}`}>
          <div className="hudPanel__top">
            <div className="hudBlock">
              <StatBar label="Life" value={state.stats.life} max={4} />
              <StatBar label="Fever" value={state.stats.fever} max={5} />
            </div>
            <div className="hudBlock">
              <StatBar label="Complications" value={state.stats.complications} max={5} />
              <StatBar label="Iatrogenia" value={state.stats.iatrogenia} max={3} />
            </div>
          </div>

          <div className="turnNarrative">
            <p className="turnNarrative__label">{turn.label}</p>
            <h2>{turn.scene}</h2>
            <p>{turn.focus}</p>
          </div>

          <div className="stretcherStage">
            <div className="stretcherShadow" />
            <div className="stretcherRail stretcherRail--top" />
            <div className="stretcherRail stretcherRail--bottom" />
            <div className="patientFigure">
              <div className="patientFigure__head" />
              <div className="patientFigure__torso">
                <span className="patientFigure__pulse" />
              </div>
              <div className="patientFigure__legs" />
            </div>
            <div className="clinicalOverlay">
              <span>21 años</span>
              <strong>sarampión probable</strong>
            </div>
          </div>

          <div className="storyCard">
            <p className="storyCard__title">Narrativa de turno</p>
            <p>{previewText}</p>
            <div className="storyCard__log">
              {state.eventLog.slice().reverse().map((entry, index) => (
                <span key={`${entry}-${index}`}>{entry}</span>
              ))}
            </div>
          </div>
        </section>

        <aside className="monitorPanel">
          <div className={`monitor ${visualClass}`}>
            <div className="monitor__header">
              <span>Paciente monitorizado</span>
              <strong>{state.visualState.replace("respiratory distress", "distress")}</strong>
            </div>
            <div className="monitorWave" />
            <div className="vitalsGrid">
              <VitalPill label="HR" value={`${state.vitals.hr} bpm`} tone="neutral" />
              <VitalPill label="BP" value={state.vitals.bp} tone="neutral" />
              <VitalPill label="RR" value={`${state.vitals.rr}/min`} tone={state.vitals.rr >= 28 ? "danger" : "neutral"} />
              <VitalPill label="SpO2" value={`${state.vitals.spo2}%`} tone={state.vitals.spo2 <= 92 ? "danger" : "neutral"} />
              <VitalPill label="Temp" value={`${state.vitals.temperature.toFixed(1)} C`} tone={state.vitals.temperature >= 39 ? "warning" : "neutral"} />
            </div>
          </div>

          <div className="patientCard">
            <p className="patientCard__label">Paciente</p>
            <strong>21-year-old male</strong>
            <p>{getPatientSummary(state)}</p>
            <div className="patientCard__miniStats">
              <span>
                Outbreak risk: <b>oculto</b>
              </span>
              <span>
                Riesgo clínico: <b>{state.stats.complications >= 4 ? "alto" : "moderado"}</b>
              </span>
            </div>
          </div>

          <div className={`outcomeCard ${outcomeTone}`}>
            <p className="outcomeCard__label">{isFinished ? "Resultado final" : "Estado actual"}</p>
            <strong>{currentOutcome?.title ?? "Caso en curso"}</strong>
            <p>{currentOutcome?.description ?? "La historia avanza turno a turno. El desenlace todavía depende de la toma de decisiones."}</p>
          </div>
        </aside>
      </main>

      <section className="pocketPanel">
        <div className="pocketPanel__head">
          <div>
            <p className="eyebrow">Medical pocket</p>
            <h3>{getPocketSummary(selectedTab)}</h3>
          </div>
          <button type="button" className="ghostButton" onClick={resetGame}>
            Reiniciar caso
          </button>
        </div>

        <div className="tabRow" role="tablist" aria-label="Medical pocket tabs">
          {tabList.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tabButton ${selectedTab === tab ? "active" : ""}`}
              onClick={() => pickTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="pocketContent">
          {selectedTab === "Medicamentos" && (
            <div className="optionGrid">
              {medicationOptions.map((med) => (
                <button
                  key={med.key}
                  type="button"
                  className={`optionCard ${state.selectedMedication === med.key ? "active" : ""}`}
                  onClick={() => chooseMedication(med.key)}
                >
                  <span>{med.label}</span>
                  <small>{med.help}</small>
                </button>
              ))}
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
            </div>
          )}

          {selectedTab === "Acciones" && (
            <div className="optionGrid">
              {actionOptions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className={`optionCard ${selectedAction === action.key ? "active" : ""}`}
                  onClick={() => chooseAction(action.key)}
                >
                  <span>{action.label}</span>
                  <small>{action.help}</small>
                </button>
              ))}
            </div>
          )}

          {selectedTab === "Soporte" && (
            <div className="optionGrid">
              {supportOptions.map((support) => (
                <button
                  key={support.key}
                  type="button"
                  className={`optionCard ${selectedSupport === support.key ? "active" : ""}`}
                  onClick={() => chooseSupport(support.key)}
                >
                  <span>{support.label}</span>
                  <small>{support.help}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="actionDock">
          <button type="button" className="primaryButton" onClick={submitChoice} disabled={isFinished}>
            Aplicar decisión y avanzar
          </button>
          <p className="dockHint">
            No aparece una barra de contagio. El riesgo de brote queda oculto hasta el desenlace.
          </p>
        </div>
      </section>
    </div>
  );
}
