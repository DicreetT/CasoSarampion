import { useEffect, useState, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { applyChoices, createInitialState, advanceTurn, getTurn, type GameState, type TurnChoice } from "../game/gameLogic";

export const HostControls = ({ session }: { session: any }) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We parse the current game state from the session or use initial state
  const gameState: GameState = session.game_state || createInitialState();

  const renderNarrative = (text: string) => {
    if (!text) return null;
    if (text.includes("pérdida de 1 punto de vida")) {
      const parts = text.split(/(¡.*?pérdida de 1 punto de vida!)/);
      return parts.map((part, i) => 
        part.includes("pérdida de 1 punto de vida") ? 
          <span key={i} style={{ color: "#ef4444", fontWeight: "bold", display: "block", marginTop: "8px", padding: "8px", background: "rgba(239, 68, 68, 0.15)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>{part}</span> : 
          <span key={i}>{part}</span>
      );
    }
    return text;
  };

  const topVotesInfo = useMemo(() => {
    if (!votes.length) return [];
    let allChoices: TurnChoice[] = [];
    for (const v of votes) {
      if (v.choice_a) allChoices.push(JSON.parse(v.choice_a));
      if (v.choice_b) allChoices.push(JSON.parse(v.choice_b));
    }
    const counts = new Map<string, { choice: TurnChoice; count: number }>();
    for (const c of allChoices) {
      const id = `${c.kind}:${c.key}`;
      if (!counts.has(id)) counts.set(id, { choice: c, count: 0 });
      counts.get(id)!.count++;
    }
    const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    return sorted.slice(0, 2);
  }, [votes]);

  const playerUrl = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}?session=${session.code}`
    : "";

  useEffect(() => {
    // Fetch initial players and votes
    const fetchData = async () => {
      const { data: pData } = await supabase!.from("session_players").select("*").eq("session_code", session.code);
      if (pData) setPlayers(pData);

      const { data: vData } = await supabase!.from("session_votes").select("*").eq("session_code", session.code).eq("turn", session.current_turn);
      if (vData) setVotes(vData);
    };
    fetchData();

    // Subscribe to changes
    const playersSub = supabase!
      .channel(`players-${session.code}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_players", filter: `session_code=eq.${session.code}` }, (payload) => {
        setPlayers((curr) => [...curr, payload.new]);
      })
      .subscribe();

    const votesSub = supabase!
      .channel(`votes-${session.code}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_votes", filter: `session_code=eq.${session.code}` }, (payload) => {
        if (payload.new.turn === session.current_turn) {
          setVotes((curr) => [...curr, payload.new]);
        }
      })
      .subscribe();

    return () => {
      supabase!.removeChannel(playersSub);
      supabase!.removeChannel(votesSub);
    };
  }, [session.code, session.current_turn]);

  const closeVoting = async () => {
    setAdvancing(true);
    setError(null);
    try {
      if (session.status === "lobby") {
        // Just start the game
        const { error: updateError } = await supabase!
          .from("game_sessions")
          .update({
            status: "playing",
            game_state: gameState
          })
          .eq("code", session.code);
        if (updateError) throw updateError;
        return;
      }

      // In a real scenario, the host would select the top 2 votes.
      // For now, let's extract choices from the votes.
      // Votes store choices as JSON strings in choice_a and choice_b.
      let allChoices: TurnChoice[] = [];
      for (const v of votes) {
        if (v.choice_a) allChoices.push(JSON.parse(v.choice_a));
        if (v.choice_b) allChoices.push(JSON.parse(v.choice_b));
      }

      // Count occurrences to find top 2
      const counts = new Map<string, { choice: TurnChoice; count: number }>();
      for (const c of allChoices) {
        const id = `${c.kind}:${c.key}`;
        if (!counts.has(id)) counts.set(id, { choice: c, count: 0 });
        counts.get(id)!.count++;
      }

      const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
      const topChoices = sorted.slice(0, 2).map((x) => x.choice);

      // Apply choices
      const nextState = applyChoices(gameState, topChoices);

      // Save to Supabase
      const { error: updateError } = await supabase!
        .from("game_sessions")
        .update({
          turn_phase: "closed",
          game_state: nextState
        })
        .eq("code", session.code);

      if (updateError) throw updateError;
    } catch (e: any) {
      setError(e.message || "Error al avanzar de turno.");
    } finally {
      setAdvancing(false);
    }
  };

  const applyGlobalDecisions = async () => {
    setAdvancing(true);
    try {
      await supabase!.from("game_sessions").update({ turn_phase: "applied" }).eq("code", session.code);
    } finally {
      setAdvancing(false);
    }
  };

  const showCorrectAnswer = async () => {
    setAdvancing(true);
    try {
      await supabase!.from("game_sessions").update({ turn_phase: "review" }).eq("code", session.code);
    } finally {
      setAdvancing(false);
    }
  };

  const nextTurn = async () => {
    setAdvancing(true);
    try {
      const advancedState = advanceTurn(gameState);
      await supabase!.from("game_sessions").update({ 
        current_turn: session.current_turn + 1,
        turn_phase: "voting",
        game_state: advancedState
      }).eq("code", session.code);
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="medicalPocket__title" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%" }}>
      <div>
        <h2>Host Dashboard</h2>
        <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginTop: "0.25rem" }}>Sesión: {session.code} | Turno: {session.current_turn} / {gameState.turnIndex}</p>
      </div>

          {session.status === "lobby" && (
            <div className="hostSessionPanel" style={{ marginTop: "1.5rem" }}>
              <div className="hostQrBlock">
                <div className="hostQr">
                  <QRCodeSVG value={playerUrl} size={232} includeMargin bgColor="#061018" fgColor="#d9ffe8" />
                </div>
                <div className="hostQrMeta">
                  <span>Jugador</span>
                  <code style={{ wordBreak: 'break-all' }}>{playerUrl}</code>
                </div>
              </div>
            </div>
          )}

          <div className="hostDetails" style={{ marginTop: "1.5rem" }}>
            <div className="hostDetail">
              <span>Jugadores Conectados</span>
              <strong>{players.length}</strong>
            </div>
            <div className="hostDetail">
              <span>Votos Recibidos (Turno actual)</span>
              <strong>{votes.length} / {players.length}</strong>
            </div>
          </div>

          <div className="hostDetails" style={{ marginTop: "1.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <strong style={{ width: "100%", color: "#9ca3af" }}>Lista de Jugadores:</strong>
            {players.map((p) => (
               <span key={p.id} style={{ background: "#1f2937", padding: "0.25rem 0.75rem", borderRadius: "99px", fontSize: "0.875rem", color: "#d1d5db" }}>
                 {p.nickname} {votes.some(v => v.user_id === p.user_id) ? "✅" : "⏳"}
               </span>
            ))}
          </div>

          {session.status !== "lobby" && session.turn_phase !== "voting" && topVotesInfo && (
            <div className="hostDetails" style={{ marginTop: "1.5rem", flexDirection: "column", alignItems: "flex-start" }}>
              <strong style={{ color: "#4ade80", marginBottom: "0.5rem" }}>Decisiones Globales Aplicadas:</strong>
              {topVotesInfo.length > 0 ? topVotesInfo.map((tv, idx) => (
                 <div key={idx} style={{ background: "rgba(16, 185, 129, 0.1)", padding: "0.75rem", borderRadius: "12px", border: "1px solid rgba(16, 185, 129, 0.2)", width: "100%", marginBottom: "0.5rem" }}>
                   <span style={{ color: "#d1fae5", fontWeight: "bold" }}>{tv.choice.key.toUpperCase()}</span>
                   <span style={{ float: "right", color: "#a7f3d0" }}>{tv.count} votos</span>
                 </div>
              )) : (
                <div style={{ background: "rgba(255, 255, 255, 0.05)", padding: "0.75rem", borderRadius: "12px", width: "100%", marginBottom: "0.5rem", color: "#9ca3af" }}>
                  No hubo votos en este turno.
                </div>
              )}
              <div style={{ marginTop: "0.5rem", background: "rgba(34, 211, 238, 0.1)", padding: "1rem", borderRadius: "12px", border: "1px solid rgba(34, 211, 238, 0.2)", width: "100%" }}>
                <strong style={{ color: "#67e8f9" }}>Impacto en el paciente:</strong>
                <p style={{ color: "#cffafe", fontSize: "1rem", marginTop: "0.5rem", lineHeight: "1.5" }}>
                  {renderNarrative(gameState.narrative) || "Las decisiones se aplicaron sin cambios importantes."}
                </p>
              </div>
              
              {session.turn_phase === "review" && (
                <div style={{ marginTop: "0.5rem", background: "rgba(16, 185, 129, 0.15)", padding: "1rem", borderRadius: "12px", border: "1px solid rgba(16, 185, 129, 0.3)", width: "100%" }}>
                  <strong style={{ color: "#34d399" }}>✅ Respuesta Ideal del Turno:</strong>
                  <p style={{ color: "#a7f3d0", fontSize: "1rem", marginTop: "0.5rem", lineHeight: "1.5" }}>
                    {getTurn(gameState).correctAnswer || "Ninguna intervención destacada definida para este turno."}
                  </p>
                </div>
              )}
            </div>
          )}

      <div className="hostCard__actions" style={{ marginTop: "auto" }}>
        {error && <div className="hostError">{error}</div>}
        
        {session.status === "lobby" ? (
          <motion.button type="button" className="hostButton" onClick={closeVoting} disabled={advancing} whileTap={{ scale: 0.985 }}>
            {advancing ? "Procesando..." : "Empezar Juego"}
          </motion.button>
        ) : session.turn_phase === "voting" ? (
          <motion.button type="button" className="hostButton" onClick={closeVoting} disabled={advancing} whileTap={{ scale: 0.985 }}>
            {advancing ? "Procesando..." : "Cerrar Votaciones"}
          </motion.button>
        ) : session.turn_phase === "closed" ? (
          <motion.button type="button" className="hostButton" onClick={applyGlobalDecisions} disabled={advancing} whileTap={{ scale: 0.985 }}>
            {advancing ? "Procesando..." : "Aplicar Decisiones Globales"}
          </motion.button>
        ) : session.turn_phase === "applied" ? (
          <motion.button type="button" className="hostButton" onClick={showCorrectAnswer} disabled={advancing} whileTap={{ scale: 0.985 }}>
            {advancing ? "Procesando..." : "Ver Respuesta Correcta"}
          </motion.button>
        ) : (
          <motion.button type="button" className="hostButton" onClick={nextTurn} disabled={advancing} whileTap={{ scale: 0.985 }}>
            {advancing ? "Procesando..." : "Pasar al Siguiente Turno"}
          </motion.button>
        )}
      </div>
    </div>
  );
};
