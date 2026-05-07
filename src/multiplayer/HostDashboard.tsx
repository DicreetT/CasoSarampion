import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { applyChoices, createInitialState, type GameState, type TurnChoice } from "../game/gameLogic";

export const HostDashboard = ({ session }: { session: any }) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We parse the current game state from the session or use initial state
  const gameState: GameState = session.game_state || createInitialState();

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

  const advanceTurn = async () => {
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
          current_turn: session.current_turn + 1,
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

  return (
    <motion.div className="appShell hostShell" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="backgroundGrid" />
      <main className="hostFrame">
        <motion.section className="hostCard" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="hostCard__header">
            <span className="hostBadge">Host Dashboard</span>
            <h1>Sesión: {session.code}</h1>
            <p>Turno Actual: {session.current_turn} / {gameState.turnIndex}</p>
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

          <div className="hostCard__actions" style={{ marginTop: "2rem" }}>
            {error && <div className="hostError">{error}</div>}
            <motion.button
              type="button"
              className="hostButton"
              onClick={advanceTurn}
              disabled={advancing}
              whileTap={{ scale: 0.985 }}
              whileHover={{ y: -2 }}
            >
              {advancing ? "Procesando..." : session.status === "lobby" ? "Empezar Juego" : "Cerrar Votaciones y Avanzar"}
            </motion.button>
          </div>
        </motion.section>
      </main>
    </motion.div>
  );
};
