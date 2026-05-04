# CasoSarampion

Juego clínico educativo de sarampión para clase médica de 5º curso.

## Stack

- React
- Vite
- TypeScript

## Desarrollo local

```bash
npm install
npm run dev
```

## Arquitectura

- `src/game/gameLogic.ts` contiene el motor central del juego, el modelo de estado y el cálculo de resultados.
- La app es local-first, con el estado serializable para que después se pueda conectar una capa Supabase o Firebase.
- El riesgo de brote se mantiene oculto al jugador hasta el final.

