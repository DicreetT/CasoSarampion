import { GameState } from "../game/gameLogic";

const progressColor = (value: number, max: number) => {
  const ratio = value / max;
  if (ratio >= 0.75) return "danger";
  if (ratio >= 0.45) return "warning";
  return "safe";
};

export const StatBar = ({
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

export const VitalPill = ({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) => (
  <div className={`vitalPill ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

export const VitalMonitor = ({ state }: { state: GameState }) => {
  return (
    <>
      <div className="hudPanel horizontal" style={{ display: "flex", flexWrap: "wrap", flexDirection: "row", gap: "8px", justifyContent: "space-between", background: "rgba(2, 8, 12, 0.76)", padding: "12px", borderRadius: "18px", border: "1px solid rgba(45, 212, 191, 0.22)", zIndex: 10 }}>
        <div style={{ flex: "1 1 calc(50% - 4px)", minWidth: "100px" }}><StatBar icon="❤️" label="VIDA" value={state.stats.life} max={4} /></div>
        <div style={{ flex: "1 1 calc(50% - 4px)", minWidth: "100px" }}><StatBar icon="🌡️" label="FIEBRE" value={state.stats.fever} max={3} /></div>
        <div style={{ flex: "1 1 100%" }}><StatBar icon="⚠️" label="COMPLIC" value={state.stats.complications} max={3} /></div>
      </div>

      <div className="vitalMonitor" style={{ width: "100%", position: "relative", zIndex: 10, marginTop: "16px" }}>
        <div className="monitorHeader">
          <span>Monitor de cabecera</span>
          <strong>{state.visualState.replace("respiratory distress", "distress")}</strong>
        </div>

        <div className="monitorWave" />

        <div className="vitalRows" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
          <VitalPill label="FC" value={`${state.vitals.hr}`} tone={state.vitals.hr > 115 ? "danger" : "neutral"} />
          <VitalPill label="FR" value={`${state.vitals.rr}`} tone={state.vitals.rr >= 28 ? "danger" : "neutral"} />
          <VitalPill label="SpO₂" value={`${state.vitals.spo2}%`} tone={state.vitals.spo2 <= 92 ? "danger" : "neutral"} />
          <VitalPill label="TEMP" value={`${state.vitals.temperature.toFixed(1)}`} tone={state.vitals.temperature >= 39 ? "warning" : "neutral"} />
          <VitalPill label="TA" value={state.vitals.bp} tone="neutral" />
        </div>
      </div>
    </>
  );
};
