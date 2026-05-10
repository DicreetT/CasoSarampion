import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { GameState, advanceTurn, createInitialState } from "../game/gameLogic";

export function useGameSession(
  sessionCode: string | undefined,
  isHostView: boolean | undefined,
  state: GameState,
  setState: (state: GameState | ((prev: GameState) => GameState)) => void,
  normalizeGameState: (state: GameState) => GameState,
  setSelectedChoices: (choices: any[]) => void,
  setPreviewText: (text: string) => void,
  setWaitingForHost: (waiting: boolean) => void
) {
  const [sessionPhase, setSessionPhase] = useState("voting");
  const [sessionStatus, setSessionStatus] = useState("playing");
  const [playerCount, setPlayerCount] = useState(0);
  const [voteCount, setVoteCount] = useState(0);

  useEffect(() => {
    if (!sessionCode) return;

    const fetchSession = async () => {
      const { data } = await supabase!.from("game_sessions").select("*").eq("code", sessionCode).single();
      if (data) {
        setSessionPhase(data.turn_phase || "voting");
        if (data.status) setSessionStatus(data.status);
        if (data.current_turn > state.turnIndex) {
          let next = { ...state };
          while (next.turnIndex < data.current_turn && !next.finished) {
            next = advanceTurn(next);
          }
          setState(next);
        } else if (data.current_turn < state.turnIndex) {
          let next = normalizeGameState(data.game_state || createInitialState());
          while (next.turnIndex < data.current_turn && !next.finished) {
            next = advanceTurn(next);
          }
          setState(next);
        } else if (data.current_turn === 0 && state.turnIndex === 0) {
          setState(normalizeGameState(data.game_state || createInitialState()));
        }
      }
    };
    fetchSession();

    const sub = supabase!
      .channel(`game_sessions-${sessionCode}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: `code=eq.${sessionCode}` }, (payload) => {
        if (payload.new) {
          setSessionPhase(payload.new.turn_phase || "voting");
          if (payload.new.status) {
            setSessionStatus(payload.new.status);
          }

          if (isHostView) {
            if (payload.new.game_state) {
              setState(normalizeGameState(payload.new.game_state));
            }
          } else {
            const hostTurn = payload.new.current_turn;
            setState((curr) => {
              if (hostTurn > curr.turnIndex) {
                let next = { ...curr };
                while (next.turnIndex < hostTurn && !next.finished) {
                  next = advanceTurn(next);
                }
                setWaitingForHost(false);
                setSelectedChoices([]);
                setPreviewText(next.narrative);
                return next;
              } else if (hostTurn < curr.turnIndex) {
                let next = normalizeGameState(payload.new.game_state || createInitialState());
                while (next.turnIndex < hostTurn && !next.finished) {
                  next = advanceTurn(next);
                }
                setWaitingForHost(false);
                setSelectedChoices([]);
                setPreviewText(next.narrative);
                return next;
              }
              return curr;
            });
          }
        }
      })
      .subscribe();

    let pSub: any;
    let vSub: any;

    if (!isHostView) {
      const fetchCounts = async () => {
        const [{ count: pCount }, { count: vCount }] = await Promise.all([
          supabase!.from("session_players").select("*", { count: "exact", head: true }).eq("session_code", sessionCode),
          supabase!.from("session_votes").select("*", { count: "exact", head: true }).eq("session_code", sessionCode).eq("turn_index", state.turnIndex)
        ]);
        setPlayerCount(pCount || 0);
        setVoteCount(vCount || 0);
      };
      
      fetchCounts();

      pSub = supabase!
        .channel(`player-counts-${sessionCode}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "session_players", filter: `session_code=eq.${sessionCode}` }, fetchCounts)
        .subscribe();
        
      vSub = supabase!
        .channel(`vote-counts-${sessionCode}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "session_votes", filter: `session_code=eq.${sessionCode}` }, fetchCounts)
        .subscribe();
    }

    return () => {
      supabase!.removeChannel(sub);
      if (pSub) supabase!.removeChannel(pSub);
      if (vSub) supabase!.removeChannel(vSub);
    };
  }, [sessionCode, isHostView, state.turnIndex, normalizeGameState, setPreviewText, setSelectedChoices, setState, setWaitingForHost, setSessionStatus, setSessionPhase]);

  return { sessionPhase, setSessionPhase, sessionStatus, setSessionStatus, playerCount, voteCount };
}
