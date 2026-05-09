import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { supabase, hasSupabaseConfig } from "./lib/supabase";
import {
  applyChoices,
  createInitialState,
  getActionOutcomePreview,
  getOutcomeTone,
  getTurn,
  advanceTurn,
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
import { PlayerLobby } from "./multiplayer/PlayerLobby";
import { HostControls } from "./multiplayer/HostDashboard";

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

type HostSession = {
  id?: string | number;
  code: string;
  current_turn: number;
  status: string;
};

type HostErrorStage = "auth" | "insert" | "general";

type HostErrorState = {
  stage: HostErrorStage;
  message: string;
  code: string | number | null;
  raw: unknown;
};

type HostDebugState = {
  currentAuthSession: unknown;
  currentUserId: string | null;
  insertPayload: Record<string, unknown> | null;
  authError: HostErrorState | null;
  insertError: HostErrorState | null;
};

const initialState = createInitialState();

const getSearchParam = (name: string) => {
  if (typeof window === "undefined") return null;

  return new URLSearchParams(window.location.search).get(name);
};

const generateSessionCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

const getSupabaseErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
};

const getSupabaseErrorCode = (error: unknown) => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      return code;
    }
  }

  return null;
};

const createHostErrorState = (
  error: unknown,
  stage: HostErrorStage,
  fallback: string,
): HostErrorState => ({
  stage,
  message: getSupabaseErrorMessage(error, fallback),
  code: getSupabaseErrorCode(error),
  raw: error,
});

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const logSupabaseError = (label: string, error: unknown) => {
  const asRecord =
    error && typeof error === "object"
      ? {
          message: "message" in error ? (error as { message?: unknown }).message : undefined,
          code: "code" in error ? (error as { code?: unknown }).code : undefined,
          details: "details" in error ? (error as { details?: unknown }).details : undefined,
          hint: "hint" in error ? (error as { hint?: unknown }).hint : undefined,
          status: "status" in error ? (error as { status?: unknown }).status : undefined,
          statusCode:
            "statusCode" in error ? (error as { statusCode?: unknown }).statusCode : undefined,
        }
      : error;

  console.error(`[Supabase] ${label}`, asRecord, error);
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const ensureSupabaseAnonymousSession = async () => {
  if (!supabase) {
    throw new Error("Supabase no está inicializado.");
  }

  const { data: currentSessionData, error: currentSessionError } = await supabase.auth.getSession();
  console.log("[Supabase host] current session", currentSessionData.session ?? null);
  console.log("[Supabase host] current user id", currentSessionData.session?.user?.id ?? null);
  logSupabaseError("[Supabase host] auth error", currentSessionError);

  if (currentSessionData.session) {
    return currentSessionData.session;
  }

  const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
  console.log("[Supabase host] anonymous sign-in session", anonData.session ?? null);
  console.log("[Supabase host] anonymous sign-in user id", anonData.session?.user?.id ?? null);
  logSupabaseError("[Supabase host] anonymous sign-in error", anonError);

  if (anonError) {
    throw anonError;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: refreshedSessionData, error: refreshedSessionError } =
      await supabase.auth.getSession();
    console.log(
      `[Supabase host] refreshed session attempt ${attempt + 1}`,
      refreshedSessionData.session ?? null,
    );
    console.log(
      `[Supabase host] refreshed user id attempt ${attempt + 1}`,
      refreshedSessionData.session?.user?.id ?? null,
    );
    logSupabaseError(
      `[Supabase host] refreshed session error attempt ${attempt + 1}`,
      refreshedSessionError,
    );

    if (refreshedSessionError) {
      throw refreshedSessionError;
    }

    if (refreshedSessionData.session) {
      return refreshedSessionData.session;
    }

    await sleep(150);
  }

  const { data: finalUserData, error: finalUserError } = await supabase.auth.getUser();
  console.log("[Supabase host] final user id", finalUserData.user?.id ?? null);
  logSupabaseError("[Supabase host] final user error", finalUserError);

  if (finalUserError) {
    throw finalUserError;
  }

  if (!finalUserData.user) {
    throw new Error("No se pudo completar la autenticación anónima de Supabase.");
  }

  return finalUserData.user;
};

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

const HostLobby = () => {
  const [session, setSession] = useState<HostSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [hostError, setHostError] = useState<HostErrorState | null>(null);
  const [debugState, setDebugState] = useState<HostDebugState>({
    currentAuthSession: null,
    currentUserId: null,
    insertPayload: null,
    authError: null,
    insertError: null,
  });

  const playerUrl =
    typeof window === "undefined" || !session
      ? ""
      : `${window.location.origin}/CasoSarampion/?mode=player&session=${session.code}`;

  const createSession = async () => {
    if (!hasSupabaseConfig || !supabase) {
      const configError = createHostErrorState(
        new Error("Supabase no está configurado para crear sesiones."),
        "general",
        "Supabase no está configurado para crear sesiones.",
      );
      setHostError(configError);
      return;
    }

    setCreating(true);
    setHostError(null);
    setDebugState({
      currentAuthSession: null,
      currentUserId: null,
      insertPayload: null,
      authError: null,
      insertError: null,
    });

    const code = generateSessionCode();
    const payload = {
      code,
      current_turn: 0,
      status: "lobby",
    };

    try {
      await ensureSupabaseAnonymousSession();

      const { data: currentSessionData, error: currentSessionError } = await supabase.auth.getSession();
      const currentAuthSession = currentSessionData.session ?? null;
      const currentUserId = currentAuthSession?.user?.id ?? null;

      console.log("[Supabase host] current session after auth", currentAuthSession);
      console.log("[Supabase host] current user id after auth", currentUserId);
      logSupabaseError("[Supabase host] current session error after auth", currentSessionError);

      if (currentSessionError) {
        const authError = createHostErrorState(
          currentSessionError,
          "auth",
          "Supabase no devolvió un mensaje de error de autenticación.",
        );
        setDebugState((current) => ({
          ...current,
          currentAuthSession,
          currentUserId,
          authError,
        }));
        setHostError({
          ...authError,
          message: `AUTH ERROR: ${authError.message}`,
        });
        return;
      }

      if (!currentAuthSession || !currentUserId) {
        const authError = createHostErrorState(
          new Error("No se pudo completar la autenticación anónima de Supabase."),
          "auth",
          "No se pudo completar la autenticación anónima de Supabase.",
        );
        setDebugState((current) => ({
          ...current,
          currentAuthSession,
          currentUserId,
          authError,
        }));
        setHostError({
          ...authError,
          message: `AUTH ERROR: ${authError.message}`,
        });
        return;
      }

      setDebugState((current) => ({
        ...current,
        currentAuthSession,
        currentUserId,
        authError: null,
        insertPayload: payload,
      }));

      console.log("[Supabase host] insert payload", payload);

      const { data, error: insertError } = await supabase
        .from("game_sessions")
        .insert(payload)
        .select("code, current_turn, status")
        .single();

      if (insertError) {
        logSupabaseError("[Supabase host] insert error", insertError);
        const normalizedInsertError = createHostErrorState(
          insertError,
          "insert",
          "Supabase no devolvió un mensaje de error de inserción.",
        );
        setDebugState((current) => ({
          ...current,
          insertPayload: payload,
          insertError: normalizedInsertError,
        }));
        setHostError({
          ...normalizedInsertError,
          message: `INSERT ERROR: ${normalizedInsertError.message}`,
        });
        throw insertError;
      }

      setSession((data ?? payload) as HostSession);
      // Redirect to host dashboard
      if (typeof window !== "undefined") {
        window.location.assign(`?mode=host&session=${code}`);
      }
      logSupabaseError("[Supabase host] create session failed", insertError);
      const fallbackError = createHostErrorState(
        insertError,
        "general",
        "Supabase no devolvió un mensaje de error.",
      );

      setHostError((current) => current ?? fallbackError);
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      className="appShell hostShell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="backgroundGrid" />
      <main className="hostFrame">
        <motion.section
          className="hostCard"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="hostCard__header">
            <span className="hostBadge">Host mode</span>
            <h1>Crear sesión clínica</h1>
            <p>
              Genera un código y comparte el QR para que el grupo entre como jugador desde su móvil.
            </p>
          </div>

          <div className="hostCard__actions">
            <motion.button
              type="button"
              className="hostButton"
              onClick={createSession}
              disabled={creating}
              whileTap={{ scale: 0.985 }}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.18 }}
            >
              {creating ? "Creando sesión..." : "Crear sesión"}
            </motion.button>
          </div>

          {hostError && (
            <div className="hostError">
              <strong>
                {hostError.stage === "auth"
                  ? "AUTH ERROR"
                  : hostError.stage === "insert"
                  ? "INSERT ERROR"
                  : "ERROR"}
                {hostError.code !== null ? ` (${hostError.code})` : ""}
              </strong>
              <span>{hostError.message}</span>
              <details className="hostError__details">
                <summary>Ver error completo</summary>
                <pre>{safeStringify(hostError.raw)}</pre>
              </details>
            </div>
          )}

          <div className="hostDetails">
            <div className="hostDetail">
              <span>Estado</span>
              <strong>{session ? session.status : "Sin sesión"}</strong>
            </div>
            <div className="hostDetail">
              <span>Turno</span>
              <strong>{session ? session.current_turn : 0}</strong>
            </div>
            <div className="hostDetail">
              <span>User ID</span>
              <strong>{debugState.currentUserId ?? "Sin autenticación aún"}</strong>
            </div>
            <div className="hostDetail">
              <span>Auth</span>
              <strong>{debugState.authError ? "Error" : debugState.currentUserId ? "OK" : "Pendiente"}</strong>
            </div>
          </div>

          <div className="hostDebugPanel">
            <div className="hostDebugPanel__header">
              <strong>Debug host</strong>
              <span>Visible solo en modo host</span>
            </div>
            <div className="hostDebugPanel__grid">
              <div>
                <span>Current user id</span>
                <code>{debugState.currentUserId ?? "null"}</code>
              </div>
              <div>
                <span>Auth session</span>
                <code>{safeStringify(debugState.currentAuthSession)}</code>
              </div>
              <div>
                <span>Insert payload</span>
                <code>{safeStringify(debugState.insertPayload)}</code>
              </div>
              <div>
                <span>Auth error</span>
                <code>{debugState.authError ? safeStringify(debugState.authError) : "null"}</code>
              </div>
              <div>
                <span>Insert error</span>
                <code>{debugState.insertError ? safeStringify(debugState.insertError) : "null"}</code>
              </div>
            </div>
          </div>

          {session ? (
            <div className="hostSessionPanel">
              <div className="hostSessionCode">
                <span>Código de sesión</span>
                <strong>{session.code}</strong>
              </div>

              <div className="hostQrBlock">
                <div className="hostQr">
                  <QRCodeSVG value={playerUrl} size={232} includeMargin bgColor="#061018" fgColor="#d9ffe8" />
                </div>
                <div className="hostQrMeta">
                  <span>Jugador</span>
                  <code>{playerUrl}</code>
                </div>
              </div>
            </div>
          ) : (
            <div className="hostEmpty">
              <strong>Aún no has creado ninguna sesión.</strong>
              <p>Al crearla aparecerá aquí el código y el QR para el equipo.</p>
            </div>
          )}

          <p className="hostHint">
            La URL del jugador se genera como <code>?mode=player&session=CODIGO</code>.
          </p>
        </motion.section>
      </main>
    </motion.div>
  );
};

function GameModeApp({ sessionCode, player, hostSession, isHostView }: { sessionCode?: string; player?: any; hostSession?: any; isHostView?: boolean }) {
  const [state, setState] = useState<GameState>(() => {
    if (isHostView && hostSession?.game_state) {
      return normalizeGameState(hostSession.game_state);
    }
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
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [sessionPhase, setSessionPhase] = useState("voting");

  // Sync state for Host
  const [sessionStatus, setSessionStatus] = useState(hostSession?.status || "playing");
  useEffect(() => {
    if (isHostView && hostSession?.game_state) {
      setState(normalizeGameState(hostSession.game_state));
      setSessionPhase(hostSession.turn_phase || "voting");
      setSessionStatus(hostSession.status || "playing");
    }
  }, [isHostView, hostSession]);

  // Subscribe to session changes
  useEffect(() => {
    if (!sessionCode) return;

    const fetchSession = async () => {
      const { data } = await supabase!.from("game_sessions").select("*").eq("code", sessionCode).single();
      if (data) {
        setSessionPhase(data.turn_phase || "voting");
        if (data.current_turn > state.turnIndex) {
          let next = { ...state };
          while (next.turnIndex < data.current_turn && !next.finished) {
            next = advanceTurn(next);
          }
          setState(next);
        } else if (data.current_turn < state.turnIndex) {
          // Player's local storage is from an old session that was further ahead.
          // Reset to match the host's current state.
          let next = normalizeGameState(data.game_state || initialState);
          while (next.turnIndex < data.current_turn && !next.finished) {
            next = advanceTurn(next);
          }
          setState(next);
        } else if (data.current_turn === 0 && state.turnIndex === 0) {
          setState(normalizeGameState(data.game_state || initialState));
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
                setWaitingForHost(false); // Unblock for next turn
                setSelectedChoices([]);
                setPreviewText(next.narrative);
                return next;
              } else if (hostTurn < curr.turnIndex) {
                // Host restarted the session or went backwards
                let next = normalizeGameState(payload.new.game_state || initialState);
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

    return () => {
      supabase!.removeChannel(sub);
    };
  }, [sessionCode, isHostView]);

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
    const suspensionIndex = selectedChoices.findIndex((item) => item.kind === "suspension");
    const existingChoiceIndex = selectedChoices.findIndex((item) => item.kind === "medication" && item.key === key);
    const updatedSuspensionChoice: TurnChoice = { kind: "suspension", key };

    if (suspenderMode) {
      if (suspensionIndex >= 0) {
        const updated = [...selectedChoices];
        if (updated[suspensionIndex].key === key) {
          updated.splice(suspensionIndex, 1);
          setPreviewText("Selecciona qué medicación suspender.");
          setSelectedChoices(updated);
          return;
        }
        updated[suspensionIndex] = updatedSuspensionChoice;
        setPreviewText(`Se suspende ${medicationLabelByKey.get(key) ?? key}.`);
        setSelectedChoices(updated);
        return;
      }

      if (selectedChoices.length >= 2) {
        setPreviewText("Máximo 2 decisiones por turno.");
        return;
      }

      setPreviewText(`Se suspende ${medicationLabelByKey.get(key) ?? key}.`);
      setSelectedChoices([...selectedChoices, updatedSuspensionChoice]);
      return;
    }

    if (existingChoiceIndex >= 0) {
      if (state.selectedMedication === key) {
        const updated = [...selectedChoices];
        updated.splice(existingChoiceIndex, 1);
        const remainingMed = updated.find(c => c.kind === "medication") as MedicationChoice | undefined;
        
        if (remainingMed) {
          setPreviewText(getActionOutcomePreview(remainingMed));
          setState((curr) => ({
            ...curr,
            selectedMedication: remainingMed.key,
            selectedDoseMg: remainingMed.doseMg,
            selectedDoseEveryHours: remainingMed.doseMode === "single" ? "8" : remainingMed.everyHours || "8",
            selectedDoseMode: remainingMed.doseMode,
            selectedAdministrationRoute: remainingMed.route
          }));
        } else {
          setPreviewText("Medicación deseleccionada.");
          setState((curr) => ({ ...curr, selectedMedication: null }));
        }
        setSelectedChoices(updated);
      } else {
        const focusChoice = selectedChoices[existingChoiceIndex] as MedicationChoice;
        setPreviewText(getActionOutcomePreview(focusChoice));
        setState((curr) => ({
          ...curr,
          selectedMedication: key,
          selectedDoseMg: focusChoice.doseMg,
          selectedDoseEveryHours: focusChoice.doseMode === "single" ? "8" : focusChoice.everyHours || "8",
          selectedDoseMode: focusChoice.doseMode,
          selectedAdministrationRoute: focusChoice.route
        }));
      }
      return;
    }

    if (selectedChoices.length >= 2) {
      setPreviewText("Máximo 2 decisiones por turno.");
      return;
    }

    const updatedMedicationChoice = buildMedicationChoice(state, key);
    setPreviewText(getActionOutcomePreview(updatedMedicationChoice));
    setSelectedChoices([...selectedChoices, updatedMedicationChoice]);
    setState((curr) => ({ ...curr, selectedMedication: key }));
  };

  const setDoseMode = (mode: DoseScheduleMode) => {
    setState((current) => {
      const next = {
        ...current,
        selectedDoseMode: mode,
      };

      if (current.selectedMedication) {
        setSelectedChoices((choices) =>
          choices.map((choice) => (choice.kind === "medication" && choice.key === current.selectedMedication ? syncMedicationChoice(choice, next) : choice)),
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
          choices.map((choice) => (choice.kind === "medication" && choice.key === current.selectedMedication ? syncMedicationChoice(choice, next) : choice)),
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

  const submitChoice = async () => {
    if (!selectedChoices.length) {
      setPreviewText("Necesitas elegir al menos una intervención antes de avanzar.");
      return;
    }

    if (suspenderMode && !suspensionChoice) {
      setPreviewText("Primero elige qué medicación quieres suspender.");
      return;
    }

    const finalChoices = selectedChoices.map((choice) =>
      choice.kind === "medication"
        ? {
            ...choice,
            doseMg: state.selectedDoseMg,
            everyHours: state.selectedDoseMode === "single" ? "" : state.selectedDoseEveryHours,
            doseMode: state.selectedDoseMode,
            route: state.selectedAdministrationRoute,
          }
        : choice
    );

    if (sessionCode && player) {
      // Multiplayer mode: send vote to Host and apply locally
      setWaitingForHost(true);
      
      try {
        await supabase!.from("session_votes").insert({
          session_code: sessionCode,
          turn: getTurn(state).id,
          user_id: player.user_id,
          choice_a: JSON.stringify(finalChoices[0]),
          choice_b: finalChoices[1] ? JSON.stringify(finalChoices[1]) : null
        });
      } catch (err) {
        console.error(err);
      }
      
      // Apply the choices locally to see the patient's reaction
      const next = applyChoices(state, finalChoices);
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
      return;
    }

    // Solo Mode logic
    const nextApplied = applyChoices(state, finalChoices);
    const next = advanceTurn(nextApplied);

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

  const InstructionsContent = () => (
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

  if (sessionStatus === "instructions") {
    if (isHostView) {
      return (
        <div className="appShell hostShell">
          <div className="backgroundGrid" />
          <main className="hostFrame" style={{ display: "flex", flexDirection: "column", gap: "2rem", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "1rem" }}>
            <motion.section className="hostCard" style={{ width: "100%", maxWidth: "800px", margin: "auto", background: "rgba(6, 16, 24, 0.9)", backdropFilter: "blur(12px)", borderRadius: "24px", border: "1px solid rgba(123, 255, 138, 0.2)", padding: "2rem" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <InstructionsContent />
            </motion.section>
            <motion.section className="hostCard" style={{ width: "100%", maxWidth: "800px", margin: "auto" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <HostControls session={{ ...hostSession!, status: sessionStatus, game_state: state, turn_phase: sessionPhase, current_turn: state.turnIndex }} />
            </motion.section>
          </main>
        </div>
      );
    } else {
      return (
        <div className="appShell playerShell">
          <div className="backgroundGrid" />
          <main className="playerFrame" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "20px" }}>
            <motion.section className="playerCard" style={{ background: "rgba(6, 16, 24, 0.8)", backdropFilter: "blur(12px)", borderRadius: "24px", border: "1px solid rgba(123, 255, 138, 0.2)", width: "100%", maxWidth: "600px", margin: "auto", padding: "1rem" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <InstructionsContent />
            </motion.section>
          </main>
        </div>
      );
    }
  }

  if (sessionStatus === "lobby") {
    if (isHostView) {
      return (
        <div className="appShell hostShell">
          <div className="backgroundGrid" />
          <main className="hostFrame" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "1rem" }}>
            <motion.section className="hostCard" style={{ width: "100%", maxWidth: "800px", margin: "auto" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <HostControls session={{ ...hostSession, status: sessionStatus, game_state: state, turn_phase: sessionPhase, current_turn: state.turnIndex }} />
            </motion.section>
          </main>
        </div>
      );
    } else {
      return (
        <div className="appShell playerShell">
          <div className="backgroundGrid" />
          <main className="playerFrame" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "20px", textAlign: "center" }}>
            <motion.section className="playerCard" style={{ padding: "3rem", background: "rgba(6, 16, 24, 0.8)", backdropFilter: "blur(12px)", borderRadius: "24px", border: "1px solid rgba(123, 255, 138, 0.2)", width: "100%", maxWidth: "400px", margin: "auto" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 style={{ color: "#d9ffe8", fontSize: "1.5rem", marginBottom: "1rem" }}>Sala de Espera</h2>
              <p style={{ color: "#9ca3af", fontSize: "1.1rem" }}>Esperando a que el anfitrión inicie el juego...</p>
              <div style={{ marginTop: "2rem" }}>
                <span style={{ fontSize: "3rem", display: "inline-block", animation: "pulse 2s infinite" }}>⏳</span>
              </div>
            </motion.section>
          </main>
        </div>
      );
    }
  }

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
            <div className="turnBanner__actions">
              {isHostView && hostSession?.status === "lobby" && (
                <span style={{ color: "#10b981", fontWeight: "bold" }}>EN LOBBY</span>
              )}
            </div>
          </div>
            <p>{turn.scene}</p>
            <strong>¿Qué decides hacer?</strong>
          </div>

          <div className="patientCenter" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
            <div className="hudPanel horizontal" style={{ display: "flex", flexWrap: "wrap", flexDirection: "row", gap: "8px", justifyContent: "space-between", background: "rgba(2, 8, 12, 0.76)", padding: "12px", borderRadius: "18px", border: "1px solid rgba(45, 212, 191, 0.22)", zIndex: 10 }}>
              <div style={{ flex: "1 1 calc(50% - 4px)", minWidth: "100px" }}><StatBar icon="❤️" label="VIDA" value={state.stats.life} max={4} /></div>
              <div style={{ flex: "1 1 calc(50% - 4px)", minWidth: "100px" }}><StatBar icon="🌡️" label="FIEBRE" value={state.stats.fever} max={3} /></div>
              <div style={{ flex: "1 1 100%" }}><StatBar icon="⚠️" label="COMPLIC" value={state.stats.complications} max={3} /></div>
            </div>

            <div className="patientStage__body" style={{ flex: 1, position: "relative", minHeight: "350px", borderRadius: "18px", overflow: "hidden", border: "1px solid rgba(123, 255, 138, 0.04)", background: "radial-gradient(circle at center, rgba(123, 255, 138, 0.1), transparent 48%), linear-gradient(180deg, rgba(5, 10, 15, 0.7), rgba(3, 7, 10, 0.82))" }}>
              {contagionActive && (
                <div className="contagionBackdrop" style={{ opacity: contagionOpacity, position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
                  <span className="contagionSilhouette contagionSilhouette--one" />
                  <span className="contagionSilhouette contagionSilhouette--two" />
                  <span className="contagionSilhouette contagionSilhouette--three" />
                </div>
              )}
              <PatientIllustration state={state} />
            </div>

            <div className="vitalMonitor" style={{ width: "100%", position: "relative", zIndex: 10 }}>
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
          </div>

          <div className="currentStateStrip">
            <strong>Estado actual:</strong>
            <span>Fiebre · Exantema · Tos · Coriza · Conjuntivitis</span>
          </div>
        </section>

        <section className="medicalPocket" style={{ position: "relative" }}>
          {isHostView ? (
            <HostControls session={{ ...hostSession, status: sessionStatus, game_state: state, turn_phase: sessionPhase, current_turn: state.turnIndex }} />
          ) : (
            <>
              {sessionPhase === "review" ? (
                <div className="medicalPocket__title">
                  <span>✅</span>
                  <h2>Respuesta Ideal del Turno</h2>
                </div>
              ) : (
                <div className="medicalPocket__title">
                  <span>🧰</span>
                  <h2>Bolsillo médico</h2>
                </div>
              )}

              {sessionPhase === "review" && (
                <div style={{ padding: "1.5rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "12px", marginTop: "1rem" }}>
                  <p style={{ color: "#d1fae5", fontSize: "1.1rem", lineHeight: "1.6" }}>
                    {turn.correctAnswer || "Ninguna intervención destacada definida para este turno."}
                  </p>
                </div>
              )}

              {(waitingForHost || sessionPhase !== "voting") && sessionPhase !== "review" && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(6, 16, 24, 0.85)", backdropFilter: "blur(4px)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "1rem" }}>
                  <div style={{ textAlign: "center", padding: "2rem", maxWidth: "90%" }}>
                    <h3 style={{ color: "#4ade80", marginBottom: "0.5rem", fontSize: "1.5rem" }}>
                      {waitingForHost ? "Decisión enviada" : "Votaciones cerradas"}
                    </h3>
                    <p style={{ color: "#d9ffe8", fontSize: "1.1rem", marginBottom: "1rem", lineHeight: "1.5" }}>
                      {renderNarrative(previewText)}
                    </p>
                    <p style={{ color: "#9ca3af", fontSize: "0.95rem" }}>
                      Tus constantes se han actualizado. Espera a que el Host pase al siguiente turno...
                    </p>
                  </div>
                </div>
              )}

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
                        suspenderMode && hasChoice({ kind: "suspension", key: med.key })
                          ? "active-blue"
                          : !suspenderMode && hasChoice(buildMedicationChoice(state, med.key))
                          ? "active-green"
                          : ""
                      }`}
                      onClick={() => updateMedicationChoice(med.key)}
                      disabled={sessionPhase !== "voting" || waitingForHost}
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
                      readOnly={suspenderMode || sessionPhase !== "voting" || waitingForHost}
                      onChange={(event) => {
                        const dose = event.target.value;
                        setState((current) => ({
                          ...current,
                          selectedDoseMg: dose,
                        }));

                        if (!suspenderMode) {
                          setSelectedChoices((current) =>
                            current.map((choice) =>
                              choice.kind === "medication" && choice.key === state.selectedMedication
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
                          disabled={suspenderMode || sessionPhase !== "voting" || waitingForHost}
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
                        readOnly={suspenderMode || sessionPhase !== "voting" || waitingForHost}
                        onChange={(event) => {
                          const everyHours = event.target.value;
                          setState((current) => ({
                            ...current,
                            selectedDoseEveryHours: everyHours,
                          }));

                          if (!suspenderMode) {
                            setSelectedChoices((current) =>
                              current.map((choice) =>
                                choice.kind === "medication" && choice.key === state.selectedMedication
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
                          disabled={suspenderMode || sessionPhase !== "voting" || waitingForHost}
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
                      className={`pocketItem ${hasChoice({ kind: "action", key: action.key }) ? "active-green" : ""}`}
                      onClick={() => toggleActionChoice(action.key)}
                      disabled={sessionPhase !== "voting" || waitingForHost}
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
                      className={`pocketItem ${hasChoice({ kind: "support", key: support.key }) ? "active-green" : ""}`}
                      onClick={() => toggleSupportChoice(support.key)}
                      disabled={sessionPhase !== "voting" || waitingForHost}
                      {...tapFeedback}
                    >
                      <div>
                        <strong>{support.label}</strong>
                      </div>
                    </motion.button>
                  ))}
                </article>
              </div>

              <div className="actionPreview" style={{ marginTop: "1rem" }}>
                <p>{previewText}</p>
                <motion.button
                  type="button"
                  className="applyDecisionButton"
                  onClick={submitChoice}
                  disabled={isFinished || waitingForHost || sessionPhase !== "voting"}
                  {...tapFeedback}
                >
                  {waitingForHost ? "ESPERANDO AL HOST..." : "APLICAR DECISIÓN →"}
                </motion.button>
              </div>
            </>
          )}
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

export default function App() {
  const mode = getSearchParam("mode");
  const sessionCode = getSearchParam("session");
  const [player, setPlayer] = useState<any>(null);
  const [hostSession, setHostSession] = useState<any>(null);
  const [playerSession, setPlayerSession] = useState<any>(null);

  // If we have a session code, we load it (both for host and player)
  useEffect(() => {
    if (sessionCode) {
      supabase?.from("game_sessions").select("*").eq("code", sessionCode).single().then(({ data }) => {
        if (data) {
          if (mode === "host") setHostSession(data);
          else setPlayerSession(data);
        }
      });

      const sub = supabase!
        .channel(`app_game_sessions-${sessionCode}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: `code=eq.${sessionCode}` }, (payload) => {
          if (mode === "host") setHostSession(payload.new);
          else setPlayerSession(payload.new);
        })
        .subscribe();

      return () => {
        supabase!.removeChannel(sub);
      };
    }
  }, [mode, sessionCode]);

  if (mode === "host") {
    if (hostSession) {
      return <GameModeApp sessionCode={sessionCode || ""} hostSession={hostSession} isHostView={true} />;
    }
    return <HostLobby />;
  }

  // Player mode
  if (sessionCode) {
    if (!player) {
      return <PlayerLobby sessionCode={sessionCode} onJoined={setPlayer} />;
    }
    
    // Wait for the host to start the game
    if (playerSession && playerSession.status === "lobby") {
      return (
        <motion.div className="appShell hostShell" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="backgroundGrid" />
          <main className="hostFrame">
            <motion.section className="hostCard" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="hostCard__header">
                <span className="hostBadge">Jugador</span>
                <h1>¡Hola, {player.nickname}!</h1>
                <p>Estás conectado a la sesión <strong>{sessionCode}</strong>.</p>
              </div>
              <div className="hostEmpty" style={{ marginTop: "2rem" }}>
                <strong>Esperando al Host...</strong>
                <p>El juego comenzará cuando el host inicie el turno 0.</p>
              </div>
            </motion.section>
          </main>
        </motion.div>
      );
    }

    return <GameModeApp sessionCode={sessionCode} player={player} />;
  }

  // Fallback to offline/solo mode if no session in URL
  return <GameModeApp />;
}
