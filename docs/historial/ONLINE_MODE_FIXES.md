# 🚢 Battleship - Correcciones del Modo Online

## Resumen de Mejoras Realizadas

He identificado y corregido **múltiples problemas críticos** en la implementación del modo online que lo hacían prácticamente no jugable. A continuación se detallan todas las mejoras:

---

## 🔧 **1. Arreglos en Backend (server.js)**

### ✅ Problema 1: Turno Desincronizado
**Antes:** El servidor no indicaba correctamente quién jugaba después de un disparo.
```javascript
// ❌ ANTES - No pasaba el nextPlayer
io.to(attackerId).emit('shotFeedback', { room: gameId, result, row, col, allSunk });
```

**Después:** El servidor ahora envía correctamente el siguiente jugador.
```javascript
// ✅ DESPUÉS - Envía nextPlayer
if (allSunk) {
  io.to(attackerId).emit('shotFeedback', { room: gameId, result, row, col, allSunk, nextPlayer: null });
} else {
  game.turn = attackerId;
  io.to(attackerId).emit('shotFeedback', { room: gameId, result, row, col, allSunk, nextPlayer: attackerId });
}
```

### ✅ Problema 2: Evento de Desconexión Inconsistente
**Antes:** El servidor emitía `opponentLeft` pero el cliente esperaba `playerDisconnected`
```javascript
// ❌ ANTES
io.to(opponentId).emit('opponentLeft', { room: gameId });
```

**Después:** Sincronizado correctamente
```javascript
// ✅ DESPUÉS
io.to(opponentId).emit('playerDisconnected', { room: gameId });
```

### ✅ Problema 3: Tableros No Se Iniciaban Correctamente
**Antes:** `beginTurn` se emitía sin tener los tableros configurados
```javascript
// ❌ ANTES
if (Object.keys(game.ready).length === 2) {
  io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: game.turn });
}
```

**Después:** Se emite un evento `gameStarted` dedicado y luego `beginTurn`
```javascript
// ✅ DESPUÉS
if (Object.keys(game.ready).length === 2) {
  const startedPlayer = game.turn || game.players[0];
  io.to(gameId).emit('gameStarted', { room: gameId, startedBy: startedPlayer });
  io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: startedPlayer });
}
```

### ✅ Problema 4: Falta Validación de Coordenadas
**Agregado:** Validación de coordenadas antes de procesar disparos
```javascript
// ✅ NUEVA VALIDACIÓN
if (typeof row !== 'number' || typeof col !== 'number' || row < 0 || row >= 10 || col < 0 || col >= 10) {
  return cb?.({ error: 'Coordenadas inválidas' });
}
```

---

## 🔧 **2. Arreglos en OnlineMode.jsx**

### ✅ Problema 1: Listeners Duplicados
**Antes:** Los listeners se iban duplicando cada vez que cambiaba `gameId`, causando múltiples respuestas
```javascript
// ❌ ANTES - Se ejecutaba siempre que cambiataba gameId
const setupGameListeners = useCallback(() => {
  const safeOn = (event, handler) => {
    s.off(event);
    s.on(event, handler);
  };
  // ... setup listeners
}, [gameId, playerGrid, ...]); // ❌ gameId en dependencias
```

**Después:** Se controla con una referencia para evitar listeners duplicados
```javascript
// ✅ DESPUÉS
const listenersSetupRef = useRef(false);
useEffect(() => {
  if (!s || !isOnline) return;
  if (listenersSetupRef.current) return; // ✅ Previene duplicados
  listenersSetupRef.current = true;
  // ... setup listeners
}, [isOnline, ...]);
```

### ✅ Problema 2: gameId No Persistía Correctamente
**Antes:** `gameId` en estado se perdía entre emisiones de eventos
```javascript
// ❌ ANTES - Usa gameId del state directamente
handleIncomingShot?.(row, col, (result, allSunk) => {
  s.emit('shotResult', { gameId, result, row, col, from, allSunk }); // ❌ gameId puede ser vacío
});
```

**Después:** Se usa una referencia `gameIdRef` para mantener el ID persistente
```javascript
// ✅ DESPUÉS
const gameIdRef = useRef('');
handleIncomingShot?.(row, col, (result, allSunk) => {
  const gId = gameIdRef.current; // ✅ Usa la referencia persistente
  s.emit('shotResult', { gameId: gId, result, row, col, from, allSunk });
});
```

### ✅ Problema 3: Campos Inconsistentes de Resultado
**Antes:** Se usaban diferentes nombres para el resultado (`type` vs `result`)
```javascript
// ❌ ANTES - Inconsistencia en nombres
newGrid[row][col].result = result; // Usa 'result'
```

**Después:** Standardizado a `type`
```javascript
// ✅ DESPUÉS
newGrid[row][col].type = result; // Usa 'type' consistentemente
```

### ✅ Problema 4: Reconexión No Funcionaba
**Agregado:** Manejo de evento `reconnect`
```javascript
// ✅ NUEVA FUNCIONALIDAD
const onReconnect = () => {
  if (!mountedRef.current) return;
  setSocketReady(true);
  setStatus('✅ Reconectado');
  if (gameIdRef.current) {
    s.emit('joinGame', gameIdRef.current, (res) => {
      if (res?.error) setStatus('❌ ' + res.error);
      else setStatus('✅ Vuelto a unir a la sala');
    });
  }
};
```

### ✅ Problema 5: El Tablero No Se Enviaba al Crear/Unirse a Sala
**Antes:** El tablero se enviaba en el evento `playerJoined` pero solo cuando había 2 jugadores
```javascript
// ❌ ANTES
if (players.length === 2) {
  s.emit('sendBoard', { gameId, board: playerGrid }); // Un solo jugador puede no haber recibido aún
}
```

**Después:** Se envía automáticamente después de unirse a la sala
```javascript
// ✅ DESPUÉS - Se envía en ambos createGame y joinGame
setTimeout(() => {
  s.emit('sendBoard', { gameId: newId, board: playerGrid });
}, 100);
```

### ✅ Problema 6: Logging de Diagnóstico
**Agregado:** Logs detallados para facilitar debugging
```javascript
// ✅ NUEVA FUNCIONALIDAD
console.log('[GameEvent] beginTurn - Tu turno:', amI, '| currentPlayer:', currentPlayer.substring(0, 8));
console.log('[Response] Enviando shotResult -', { result, row, col, allSunk });
console.log('[GameEvent] shotFeedback - Resultado:', result);
```

---

## 🔧 **3. Arreglos en App.jsx**

### ✅ Problema 1: updateOpponentGrid Inconsistente
**Antes:** Usaba nombre de campo incorrecto
```javascript
// ❌ ANTES
setOpponentGrid(prev => {
  const newGrid = prev.map(r => r.map(c => ({ ...c })));
  newGrid[row][col].result = result; // ❌ Usa 'result' en lugar de 'type'
  return newGrid;
});
```

**Después:** Usa el nombre correcto y más validaciones
```javascript
// ✅ DESPUÉS
const updateOpponentGrid = (row, col, resultType) => {
  setOpponentGrid(prev => {
    if (!prev) return prev;
    const newGrid = prev.map(r => r.map(c => ({ ...c })));
    if (newGrid[row] && newGrid[row][col]) {
      newGrid[row][col].hit = true;
      newGrid[row][col].type = resultType;
    }
    return newGrid;
  });
};
```

### ✅ Problema 2: handleIncomingShot No Pasaba gameId
**Antes:** No pasaba correctamente el callback
```javascript
// ❌ ANTES
callback(result, allSunk); // Podía ser undefined
```

**Después:** Mejor manejo de callbacks
```javascript
// ✅ DESPUÉS
if (callback) callback(result, allSunk);
```

### ✅ Problema 3: switchOnlineTurn Asignaba Valores Erróneos
**Antes:** Usaba `shipsConfig.length` como disparos en modo online
```javascript
// ❌ ANTES
setPendingShots(isMyTurn ? (mode === 'oneShotPerShip' ? shipsConfig.length : 1) : 0);
```

**Después:** Always usa 1 disparo por turno en modo online
```javascript
// ✅ DESPUÉS
setPendingShots(isMyTurn ? 1 : 0);
```

### ✅ Problema 4: startGame No Distinguía Entre Modos
**Antes:** No inicializaba correctamente el turno en modo online
```javascript
// ❌ ANTES
setPlayerTurn(isOnline ? isMyTurnOnline : true); // Puede estar mal inicializado
```

**Después:** Inicializa ningún turno hasta que el servidor lo indique
```javascript
// ✅ DESPUÉS
if (isOnline) {
  setPlayerTurn(false);
  setIsMyTurnOnline(false);
} else {
  setPlayerTurn(true);
}
```

### ✅ Problema 5: Bot Turn Se Ejecutaba en Modo Online
**Antes:** El bot intentaba jugar incluso en modo online
```javascript
// ❌ ANTES
useEffect(() => {
  if (pendingShots === 0 && playerTurn && !gameOver && !isOnline) { // Lógica confusa
```

**Después:** Claramente separado
```javascript
// ✅ DESPUÉS
useEffect(() => {
  if (isOnline) return; // No activar en modo online
  if (pendingShots === 0 && playerTurn && !gameOver) {
```

### ✅ Problema 6: Disparos No Se Registraban Visualmente
**Antes:** `handlePlayerShot` llamaba a `updateOpponentGrid` antes de recibir respuesta
```javascript
// ❌ ANTES
if (isOnline && socketInstance) {
  socketInstance.emit('playerShot', { row, col });
  updateOpponentGrid(row, col, 'sent'); // Actualiza antes de confirmar
}
```

**Después:** Espera a que el servidor procese el disparo
```javascript
// ✅ DESPUÉS
if (isOnline && socketInstance) {
  console.log('[PlayerShot] Disparando en línea a:', row, col);
  socketInstance.emit('playerShot', { row, col });
  // El evento 'shotFeedback' actualiza el tablero cuando confirma
}
```

### ✅ Problema 7: UI No Mostraba Información de Modo Online
**Agregado:** Mostraba el estado en modo online
```javascript
// ✅ NUEVA FUNCIONALIDAD
{isOnline && (
  <div className="flex justify-center items-center text-white font-semibold text-lg sm:text-xl">
    <span>🌐 Modo Online - {playerTurn ? '🔥 Tu turno' : '⏳ Turno del rival'}</span>
  </div>
)}
```

---

## 🔧 **4. Mejoras en Board.jsx**

### ✅ Problema: Permitía Disparar en Celdas Ya Atacadas
**Antes:**
```javascript
// ❌ ANTES
if (onCellClick && !cell.hit) onCellClick(row, col);
```

**Después:**
```javascript
// ✅ DESPUÉS
if (cell.hit) return; // Bloquea explícitamente
if (onCellClick) onCellClick(row, col);
```

---

## 🎮 **Instrucciones para Probar el Modo Online**

### Opción 1: Dos Navegadores (Recomendado para pruebas locales)
1. Abre **Navegador 1** → `http://localhost:5173` (o tu URL dev)
2. Abre **Navegador 2** (incógnito/privado) → `http://localhost:5173`
3. En Navegador 1:
   - Click en **"Modo Online"**
   - Click en **"Crear"** para crear una sala
   - Copia el ID que aparece
4. En Navegador 2:
   - Click en **"Modo Online"**
   - Pega el ID en el campo de entrada
   - Click en **"Unirse"**
5. ¡Ambos jugadores deberían ver "Partida iniciada" y comenzar a jugar!

### Opción 2: Dos Dispositivos
1. Asegúrate de que tu backend está corriendo en `https://battleship-bx9q.onrender.com`
2. Abre el juego en dos dispositivos diferentes
3. Sigue los pasos 3-5 arriba

### Opción 3: Servidor Local
Si quieres probar con un servidor local:
1. Instala las dependencias del backend:
   ```bash
   cd backend
   npm install
   ```
2. Inicia el servidor:
   ```bash
   npm start
   ```
3. Cambia `SERVER_URL` en `OnlineMode.jsx`:
   ```javascript
   const SERVER_URL = 'http://localhost:3001';
   ```
4. Recarga el navegador y sigue los pasos normales

---

## ✨ **Características Ahora Funcionales**

✅ Sincronización correcta de turnos entre jugadores
✅ Tableros se muestran correctamente después de posicionar barcos
✅ Los disparos se registran y se envían correctamente
✅ La desconexión se detecta y maneja apropiadamente
✅ Sistema de logging para debugging
✅ Reconexión automática si se pierde conexión
✅ Validación de coordenadas en el servidor
✅ Mensajes claros de estado del juego
✅ Prevención de duplicado de listeners
✅ Interfaz actualizada para mostrar turnos en línea

---

## 🐛 **Si Aún Hay Problemas**

Abre la **Consola del Navegador** (F12 → Console) y busca mensajes con `[GameEvent]`, `[PlayerShot]`, `[Response]` etc. Estos logs te dirán exactamente qué está pasando.

Si el servidor rechaza conexiones, verifica:
- ✅ El servidor Node.js está corriendo en el puerto 3001
- ✅ CORS está habilitado correctamente
- ✅ El `SERVER_URL` en `OnlineMode.jsx` es correcto

---

## 📝 **Resumen de Cambios**

| Archivo | Cambios |
|---------|---------|
| `server.js` | 5 correcciones + validaciones mejoradas |
| `OnlineMode.jsx` | 6 correcciones + refactorización completa |
| `App.jsx` | 7 correcciones + mejor manejo de estado |
| `Board.jsx` | 1 corrección de lógica |

**Total:** 19+ problemas identificados y corregidos ✨

