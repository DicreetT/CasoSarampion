import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";

export const PlayerLobby = ({ sessionCode, onJoined }: { sessionCode: string; onJoined: (player: any) => void }) => {
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!nickname.trim()) {
      setError("Por favor ingresa un nombre o apodo.");
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase!.auth.signInAnonymously();
      if (authError) throw authError;

      const { data, error: insertError } = await supabase!
        .from("session_players")
        .insert({
          session_code: sessionCode,
          nickname: nickname.trim(),
        })
        .select()
        .single();

      if (insertError) throw insertError;
      onJoined(data);
    } catch (e: any) {
      setError(e.message || "Error al unirse a la sesión.");
      setJoining(false);
    }
  };

  return (
    <motion.div className="appShell hostShell" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="backgroundGrid" />
      <main className="hostFrame">
        <motion.section className="hostCard" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="hostCard__header">
            <span className="hostBadge">Jugador</span>
            <h1>Unirse a la sesión</h1>
            <p>Ingresa tu nombre o apodo para unirte al caso clínico.</p>
          </div>
          <div className="hostCard__actions" style={{ flexDirection: "column", gap: "1rem" }}>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ej: Jugador 1"
              style={{ padding: "0.75rem", borderRadius: "8px", border: "1px solid #455a64", background: "#061018", color: "white", fontSize: "1rem" }}
              disabled={joining}
            />
            {error && <div className="hostError"><strong>Error:</strong> {error}</div>}
            <motion.button
              type="button"
              className="hostButton"
              onClick={handleJoin}
              disabled={joining}
              whileTap={{ scale: 0.985 }}
              whileHover={{ y: -2 }}
            >
              {joining ? "Entrando..." : "Entrar a la sesión"}
            </motion.button>
          </div>
        </motion.section>
      </main>
    </motion.div>
  );
};
