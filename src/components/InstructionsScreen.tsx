import React from "react";

export const InstructionsContent = () => (
  <div style={{ textAlign: "left", color: "#d1d5db", lineHeight: "1.6", maxWidth: "600px", margin: "0 auto", padding: "1rem" }}>
    <h1 style={{ color: "#4ade80", fontSize: "2rem", marginBottom: "1.5rem", textAlign: "center" }}>🧪 CÓMO JUGAR</h1>
    
    <h2 style={{ color: "#38bdf8", fontSize: "1.25rem", marginTop: "1.5rem" }}>Objetivo</h2>
    <p>Mantener vivo a tu paciente evitando:</p>
    <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
      <li>Fiebre</li>
      <li>Complicaciones</li>
    </ul>

    <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "1.5rem 0" }}/>

    <h2 style={{ color: "#38bdf8", fontSize: "1.25rem" }}>Cada turno:</h2>
    <ol style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
      <li style={{ marginBottom: "0.5rem" }}>Lee el caso clínico.</li>
      <li style={{ marginBottom: "0.5rem" }}>Selecciona <strong>2 items</strong> del bolsillo médico entre medicamentos, acciones y medidas de soporte.</li>
      <li style={{ marginBottom: "0.5rem" }}>Si eliges medicamento: introduce la dosis.</li>
      <li style={{ marginBottom: "0.5rem" }}>Envía tu decisión antes de que el host cierre la votación.</li>
    </ol>

    <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "1.5rem 0" }}/>

    <h2 style={{ color: "#facc15", fontSize: "1.25rem" }}>Importante</h2>
    <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
      <li style={{ marginBottom: "0.5rem" }}>Tu paciente individual puede empeorar aunque la mayoría gane.</li>
      <li style={{ marginBottom: "0.5rem" }}>El host sigue la decisión más votada.</li>
      <li style={{ marginBottom: "0.5rem" }}>Tus decisiones afectan: vida, fiebre y complicaciones.</li>
      <li style={{ color: "#f87171" }}>→ Completar la barra de fiebre o de complicaciones equivale a perder 1p de vida.</li>
    </ul>

    <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "1.5rem 0" }}/>

    <h2 style={{ color: "#ef4444", fontSize: "1.25rem" }}>Pierdes si:</h2>
    <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
      <li style={{ marginBottom: "0.5rem" }}>La vida llega a 0.</li>
      <li style={{ marginBottom: "0.5rem" }}>O si fiebre/complicaciones llegan a 3 las veces suficientes para que pierdas todos los puntos de vida.</li>
    </ul>
  </div>
);
