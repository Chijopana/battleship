# 🎮 Mejoras Completas - Battleship v2

## Resumen General

Se han implementado mejoras significativas en:
- ✅ **Notificación de abandono** - Los jugadores saben cuando el otro se va
- ✅ **UX/UI** - Interfaz más moderna, colores contextuales y mejor feedback
- ✅ **Móvil/Tablet** - Optimizado para pantallas pequeñas con mejor táctil
- ✅ **Seguridad** - Rate limiting, validación de entrada y prevención de spam
- ✅ **Accesibilidad** - Mejor soporte para teclado y lectores de pantalla

---

## 1️⃣ **Notificación de Abandono** (Server + Client)

### Problema Anterior
Cuando un jugador abandonaba la partida, el otro jugador se quedaba esperando sin saber qué pasó.

### Soluciones Implementadas

#### Backend (server.js)
```javascript
// Nuevo evento: cuando un jugador ABANDONA voluntariamente
socket.on('leaveGame', (gameIdRaw, cb) => {
  // ... notifica al oponente con 'playerLeft'
});

// Evento mejorado: cuando se DESCONECTA (accidental)
socket.on('disconnect', () => {
  // ... notifica con mensaje diferenciado
  io.to(opponentId).emit('playerDisconnected', { 
    message: 'Tu rival se desconectó. Esperando reconexión...' 
  });
});

// Nuevo evento: cuando se RECONECTA después de desconexión
if (game.disconnected[socket.id]) {
  io.to(opponentId).emit('playerReconnected', { 
    message: 'Tu rival se reconectó ✅' 
  });
}
```

#### Frontend (OnlineMode.jsx)
```javascript
// Escucha cuando el rival abandona voluntariamente
const onPlayerLeft = ({ message }) => {
  setStatus('⚠️ ' + message);
  setMessage?.(message); // "Tu rival abandonó la partida 😞"
  setGameOver?.(true);
  setIsOnline?.(false);
  setTimeout(() => startGame?.(), 2000); // Vuelve a modo local
};

// Escucha desconexión accidental
const onPlayerDisconnected = ({ message }) => {
  setStatus('⚠️ ' + message); // "Tu rival se desconectó. Esperando..."
  setMessage?.(message);
};

// Escucha reconexión
const onPlayerReconnected = ({ message }) => {
  setStatus('✅ ' + message); // "Tu rival se reconectó ✅"
  setMessage?.(message);
};

// Emite leaveGame cuando cambias a modo local
const handleModeSwitch = (toOnline) => {
  if (!toOnline) {
    if (isOnline && s && gameIdRef.current) {
      s.emit('leaveGame', gameIdRef.current);
    }
    // ... vuelve a modo local
  }
};
```

### Resultado
- ✅ Mensaje claro cuando rival abandona: "Tu rival abandonó la partida 😞"
- ✅ Distinción entre desconexión intencional vs accidental
- ✅ Auto-retorno a modo local después de 2 segundos
- ✅ Los jugadores siempre saben el estado del otro

---

## 2️⃣ **Mejoras de UX/UI**

### Mensajes Contextuales con Colores
```javascript
// Antes: Mensaje genérico en blanco
<div className="bg-white py-2 px-4">{message}</div>

// Después: Colores según el evento
<div className={`
  ${message.includes('Ganaste') ? 'bg-green-600 text-white' : ''}
  ${message.includes('Perdiste') ? 'bg-red-600 text-white' : ''}
  ${message.includes('abandonó') ? 'bg-orange-500 text-white' : ''}
  ${message.includes('Tocado') ? 'bg-yellow-500 text-white' : ''}
  ${message.includes('Hundiste') ? 'bg-purple-600 text-white' : ''}
  py-3 px-6 rounded-lg shadow-lg transition-all
`}>
  {message}
</div>
```

### Layout Mejorado para Tableros
```javascript
// Antes: Brecha vacía en móvil
<div className="flex flex-col lg:flex-row gap-6">
  {/* Tableros sin espaciado */}
</div>

// Después: Mejor distribución y visual
<div className="flex flex-col lg:flex-row items-center justify-center gap-4 sm:gap-6">
  <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-3 sm:p-4 
                  hover:shadow-2xl transition-shadow">
    <Board grid={playerGrid} isPlayer={true} />
  </div>
  
  {/* Icono decorativo entre tableros (solo desktop) */}
  <div className="hidden lg:flex items-center justify-center">
    <div className="text-4xl">⚔️</div>
  </div>
  
  {/* Tablero enemigo con efecto opacado cuando no es turno */}
  <div className={`${!playerTurn && isOnline ? 'opacity-50 pointer-events-none' : ''}`}>
    <Board grid={... } />
  </div>
</div>
```

### Botones Mejorados
```javascript
// Antes: Botones planos sin feedback
<button className="bg-blue-600 text-white px-4 py-2 rounded">
  Crear
</button>

// Después: Botones con mejor feedback táctil

<button className="bg-blue-600 text-white px-4 py-3 rounded-lg 
                   font-semibold hover:bg-blue-700 
                   active:scale-95 transition-all shadow-lg">
  ⚡ Crear
</button>
```

### Inputs Mejorados
```javascript
// Antes: Input simple
<input placeholder="ID de partida" />

// Después: Input con validación visual
<input
  placeholder="ID de partida (ej: ABC123)"
  maxLength={32}
  className="border-2 border-blue-400 focus:ring-2 focus:ring-blue-600
             focus:border-transparent px-3 py-2 rounded-lg"
/>
```

### Estados en Tiempo Real
```javascript
// Muestra estado en modo online
{isOnline && (
  <div className="flex justify-center items-center text-white 
                  font-semibold text-lg">
    <span>🌐 Modo Online - {playerTurn ? '🔥 Tu turno' : '⏳ Turno del rival'}</span>
  </div>
)}
```

---

## 3️⃣ **Optimización Móvil/Tablet**

### Tamaños de Celdas Responsive
```javascript
// Antes: Celdas fijas
className="w-7 h-7 sm:w-10 sm:h-10"

// Después: Escalas mejor
className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10"
```

### Espaciado Adaptativo
```javascript
// Tablero con padding responsive
<div className="p-3 sm:p-4 gap-0.5 sm:gap-1">
  {/* Grid de celdas */}
</div>
```

### Touch Support Mejorado
```javascript
// Nuevos handlers para touch
const handleCellTouchStart = (e) => {
  if (e.touches.length > 1) e.preventDefault(); // Prevenir zoom
};

// Efectos visuales táctiles
className="hover:scale-110 active:scale-95 transition-all"
```

### Prevención de Zoom Accidental
```javascript
// Evita zoom al hacer double-tap
const handleCellTouchStart = (e) => {
  if (e.touches.length > 1) e.preventDefault();
};
```

### Interfaz Táctil Amigable
```javascript
// Botones más grandes para dedo
<button className="w-full sm:w-auto px-4 py-3 rounded-lg">
  Unirse
</button>

// Padding extra para hits targets más grandes
className="p-3 sm:p-4 md:p-5"
```

### Overflow Handling
```javascript
// En tableros con overflow
<div className="overflow-auto">
  <Board {...props} />
</div>
```

### Layout Vertical en Móvil, Horizontal en Desktop
```javascript
// Antes: gap-6 en ambos
<div className="flex flex-col lg:flex-row gap-6">

// Después: gap adaptativo
<div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
```

---

## 4️⃣ **Medidas de Seguridad**

### Rate Limiting en el Servidor
```javascript
// Máximo 1 disparo por segundo
const RATE_LIMIT_WINDOW = 1000;
const MAX_SHOTS_PER_WINDOW = 1;

const checkRateLimit = (playerId) => {
  const now = Date.now();
  if (!playerActivity.has(playerId)) {
    playerActivity.set(playerId, []);
  }
  const times = playerActivity.get(playerId);
  playerActivity.set(playerId, times.filter(t => t > now - RATE_LIMIT_WINDOW));
  const current = playerActivity.get(playerId);
  
  if (current.length >= MAX_SHOTS_PER_WINDOW) return false;
  current.push(now);
  return true;
};

// Usar en playerShot
socket.on('playerShot', ({ gameId, row, col } = {}, cb) => {
  if (!checkRateLimit(socket.id)) {
    return cb?.({ error: 'Demasiados disparos muy rápido.' });
  }
  // ... continuar con disparo
});
```

### Validación de Coordenadas a Dos Niveles
```javascript
// Cliente (primera línea de defensa)
if (typeof row !== 'number' || typeof col !== 'number' || 
    row < 0 || row >= 10 || col < 0 || col >= 10) {
  console.error('Coordenadas inválidas');
  return;
}

// Servidor (segunda línea de defensa)
if (typeof row !== 'number' || typeof col !== 'number' || 
    row < 0 || row >= 10 || col < 0 || col >= 10) {
  return cb?.({ error: 'Coordenadas inválidas' });
}
```

### Prevención de Clicks Spam
```javascript
// En el cliente
const lastShotTimeRef = useRef(0);

const handlePlayerShot = (row, col) => {
  const now = Date.now();
  if (now - lastShotTimeRef.current < 300) {
    console.warn('Click muy rápido, ignorando');
    return;
  }
  lastShotTimeRef.current = now;
  // ... procesar disparo
};
```

### Validación de ID de Sala
```javascript
// Validar formato de ID antes de enviar
if (!/^[A-Z0-9_-]{1,32}$/i.test(gameId.trim())) {
  return setStatus('ID inválido (solo letras, números, _, -)');
}
```

### Manejo de Errores Mejorado
```javascript
// Respuestas de error con callback
socketInstance.emit('playerShot', { row, col }, (res) => {
  if (res?.error) {
    console.error('Error al disparar:', res.error);
    setMessage('❌ ' + res.error);
  }
});
```

### Limpieza de Recursos
```javascript
// Limpiar activity vieja periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [pid, times] of playerActivity.entries()) {
    const filtered = times.filter(t => t > now - RATE_LIMIT_WINDOW * 10);
    if (filtered.length === 0) {
      playerActivity.delete(pid);
    }
  }
}, 10000);
```

---

## 5️⃣ **Mejoras de Accesibilidad**

### Atributos ARIA Mejorados
```javascript
<button
  aria-label="Crear nueva partida"
  aria-disabled={isConnecting}
>
  ⚡ Crear
</button>

<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {message}
</div>
```

### Soporte para Teclado
```javascript
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleCellClick(rowIndex, colIndex, cell);
  }
}}
```

### Indicadores Visuales Claros
```javascript
// Turno actual claramente indicado
<span className="text-white font-semibold">
  {playerTurn ? '🔥 Tu turno' : '⏳ Turno del rival'}
</span>

// Elemento deshabilitado tiene apariencia clara
className={`${disabled ? 'opacity-50 pointer-events-none' : ''}`}
```

---

## 📊 Tabla de Cambios

| Área | Cambio | Impacto |
|------|--------|---------|
| **Notificación Abandono** | Nuevo evento `leaveGame` + listeners | Alto ✅ |
| **Mensajes** | Colores contextuales | Medio ✅ |
| **Tableros** | Layout mejorado + icono decorativo | Medio ✅ |
| **Botones** | Hover + active states | Bajo ✅ |
| **Inputs** | Validación visual + maxLength | Medio ✅ |
| **Celdas** | Tamaños responsive | Alto ✅ |
| **Touch** | Handlers + prevención de zoom | Alto ✅ |
| **Rate Limiting** | Máx 1 disparo/seg | Alto 🔒 |
| **Validación** | A dos niveles (cliente + servidor) | Alto 🔒 |
| **Spam prevención** | Click throttling 300ms | Medio 🔒 |

---

## 🚀 Cómo Probar las Mejoras

### 1. Abandono de Partida
```
1. Crea partida en navegador 1
2. Únete en navegador 2
3. Espera a "Partida iniciada"
4. En nav 1, click "Modo Local"
5. ✅ Nav 2 debería ver: "Tu rival abandonó la partida 😞"
```

### 2. Desconexión Accidental
```
1. Crea partida en navegador 1
2. Únete en navegador 2
3. Cierra navegador 2 (sin hacer click en Modo Local)
4. ✅ Nav 1 debería ver: "Tu rival se desconectó. Esperando..."
```

### 3. Reconexión
```
1. Sigue pasos de desconexión
2. Reabre navegador 2 inmediatamente
3. Vuelve a entrar... (o se reconecta automáticamente)
4. ✅ Nav 1 debería ver: "Tu rival se reconectó ✅"
```

### 4. Mensajes de Error
```
1. Modo Online → Unirse sin ID
2. ✅ Debe ver: "⚠️ Ingresa un ID válido"
3. Ingresa "!!!invalid!!!"
4. ✅ Debe ver: "❌ ID inválido (solo letras, números, _, -)"
```

### 5. Responsividad Móvil
```
1. F12 → Toggle device toolbar
2. Prueba en iPhone SE (375px)
3. Prueba en iPad (768px)
4. ✅ Todo debe ser usable y verse bien
```

### 6. Touch Support
```
1. En tablet o móvil físico
2. Toca celdas del tablero enemigo
3. ✅ Debe responder rápido sin lag
4. ✅ No debe hacer zoom al double-tap
```

---

## 📋 Checklist de Validación

- [ ] Mensaje "Tu rival abandonó" aparece al cambiar a modo local
- [ ] Mensaje "Tu rival se desconectó" aparece al cerrar navegador
- [ ] Mensaje "Tu rival se reconectó" aparece al volver
- [ ] Colores de mensajes son correctos (verde/rojo/naranja)
- [ ] Tableros se ven bien en móvil (no se cortan)
- [ ] Celdas son clicables sin zoom accidental
- [ ] Botones responden al táctil sin lag
- [ ] No puedes disparar 2 veces en 300ms
- [ ] ID con caracteres inválidos muestra error
- [ ] Rate limit de 1 disparo/seg funciona en servidor

---

## 🎯 Próximos Pasos Opcionales

- [ ] Agregar sonidos de disparo/impacto
- [ ] Sistema de chat entre jugadores
- [ ] Historial de movimientos
- [ ] Ranking/puntuación
- [ ] Soporte para espectadores
- [ ] Modo de práctica contra bot en línea
- [ ] Notificaciones de navegador (Web Push)

