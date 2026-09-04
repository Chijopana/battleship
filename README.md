# 🚢 Battleship — React Edition

Hundir la flota en el navegador: cinco modos de juego, un rival con IA en tres niveles y
duelos online por código de sala con un servidor Socket.IO **autoritativo**.

👉 **Demo:** https://battleship-web-game.netlify.app/

---

## ✨ Qué tiene

| | |
|---|---|
| **5 modos** | Clásico · Salva (disparas tantas veces como barcos te queden) · Fuego rápido (3/turno) · Niebla (no sabes el resultado hasta el final) · Hardcore (fallas y pierdes) |
| **IA en 3 niveles** | Grumete (azar), Oficial (remata lo tocado), Almirante (extiende la línea del barco y peina en patrón de damas) |
| **Online** | Salas por código, turnos y resultados calculados en el servidor, reconexión con periodo de gracia y revancha con aceptación bilateral |
| **Accesibilidad** | Tableros navegables con flechas + Enter, coordenadas A-J / 1-10, `aria-label` por casilla, anuncios en `role="status"` y respeto por `prefers-reduced-motion` |
| **Sonido** | Efectos sintetizados con la Web Audio API (sin archivos que descargar), volumen y silencio persistentes |

El rival **no hace trampas**: `chooseBotShot` solo recibe el tablero con lo que ya ha
disparado y el resultado que se le comunicó, igual que vería una persona.

---

## 🏗️ Estructura

```
frontend/
  src/
    game/          Lógica pura sin React: tablero, disparos, IA y modos
      logic.js     createEmptyBoard, placeShips, applyShot, markEnemyShot
      bot.js       IA: modo caza (persigue un barco) y modo búsqueda (patrón de damas)
      modes.js     Configuración de los cinco modos y las tres dificultades
    components/    Board, Cell, FleetStatus, OnlineMode, AudioController
    hooks/         useSound (Web Audio API)
    App.jsx        Estado de partida y orquestación de turnos
backend/
  server.js        Servidor Socket.IO autoritativo
  test/            Tests de integración con dos clientes reales
```

La lógica de juego vive fuera de React a propósito: se puede testear sin montar
componentes y la comparten el modo local y el online.

---

## 🔐 Cómo funciona el modo online

El servidor es la única fuente de verdad:

1. Cada cliente manda su flota con `sendBoard`. El servidor **valida** que sean cinco
   barcos de los tamaños correctos, rectos, contiguos, dentro del tablero y sin solaparse.
2. Al disparar, el cliente solo manda coordenadas. El servidor comprueba el turno,
   resuelve el impacto contra la flota del rival y avisa a los dos.
3. El resultado de un disparo nunca lo decide quien recibe el disparo, así que un cliente
   modificado no puede responder «agua» a todo ni colocar una flota imposible.

Si el rival pierde la conexión hay 60 s de gracia para volver: la sesión se recupera con el
`sessionId` guardado y el servidor reenvía el estado de la partida.

---

## ⚙️ Puesta en marcha

Necesitas Node 20 o superior (hay un `.nvmrc`).

```bash
# Backend (terminal 1)
cd backend
npm install
npm run dev          # escucha en :3001

# Frontend (terminal 2)
cd frontend
npm install
npm run dev          # abre http://localhost:5173
```

En desarrollo el frontend apunta a `http://localhost:3001` (`frontend/.env.development`).
En producción usa `VITE_SOCKET_URL` de `frontend/.env.production`.

### Tests

```bash
cd frontend && npm test   # lógica de juego + interfaz (jsdom)
cd backend  && npm test   # partidas online completas entre dos clientes
```

### Despliegue

- **Frontend:** Netlify, con la configuración de `netlify.toml`.
- **Backend:** Render (o cualquier host de Node). Variables en `backend/.env.example`.
  Añade el dominio del frontend a `ALLOWED_ORIGINS` si cambias de dominio.

---

## 🎯 Cómo jugar

1. Elige modo y nivel del rival.
2. Dispara en el tablero de la derecha: con el ratón, o moviéndote con las flechas y
   pulsando Enter.
3. Hunde los cinco barcos enemigos antes de que caiga tu flota.
4. Para jugar contra alguien, pulsa **Crear sala** y pásale el código.

---

## 🧠 Aprendizajes del proyecto

- Separar la lógica de juego de la capa de React para poder testearla de verdad.
- Por qué un juego por turnos necesita un servidor autoritativo: mientras el cliente
  reportaba sus propios resultados, cualquiera podía responder «agua» a todos los disparos.
- Encadenar turnos con temporizadores sin dejar `setTimeout` huérfanos al reiniciar.
- Escribir una IA que juegue bien con información parcial en lugar de leer el tablero rival.

---

## 🛠️ Stack

React 18 · Vite 7 · Tailwind CSS 3 · Socket.IO 4 · Express 5 · Vitest · node:test
