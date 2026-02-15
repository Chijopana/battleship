# ✅ Checklist de Pruebas - Modo Online

## Antes de Comenzar
- [ ] Backend está corriendo correctamente
- [ ] Frontend está compilado y en desarrollo
- [ ] Dos navegadores o dispositivos disponibles

## Crear Partida (Navegador 1)
- [ ] Click en "Modo Online"
- [ ] Click en "Crear"
- [ ] Se genera un ID de sala
- [ ] Mensaje dice "Sala creada: [ID] 🧭 Esperando rival..."
- [ ] ID se puede copiar correctamente

## Unirse a Partida (Navegador 2)
- [ ] Click en "Modo Online"
- [ ] Ingresa el ID compartido
- [ ] Click en "Unirse"
- [ ] Mensaje dice "Unido a sala [ID] ✨"
- [ ] Ambos ven "👾 Rival conectado. Preparando partida..."

## Inicío del Juego
- [ ] Ambos ven el tablero con sus barcos (gris) y agua (azul)
- [ ] Se muestra "🎮 ¡Partida iniciada!"
- [ ] Uno ve "🔥 Tu turno" y otro "⏳ Turno del rival"
- [ ] El indicador muestra "🌐 Modo Online - 🔥 Tu turno" o "⏳ Turno del rival"

## Disparos
- [ ] El jugador con turno puede hacer click en el tablero enemigo
- [ ] El jugador sin turno no puede hacer click (está deshabilitado)
- [ ] Al disparar:
  - [ ] Se envía el disparo al servidor
  - [ ] El oponente ve "💥 El enemigo disparó (row,col)! Resultado: [resultado]"
  - [ ] El jugador que dispara ve el resultado (💦 Fallaste, 🎯 ¡Tocado!, etc)
  - [ ] El tablero enemigo se actualiza con el disparo
  - [ ] El turno cambia al otro jugador
  - [ ] Los estatus se actualizan correctamente

## Diferentes Resultados
- [ ] **Agua (Miss)**: Celda blanca, turno cambio
- [ ] **Tocado (Hit)**: Celda roja pulsante, turno cambia al atacante
- [ ] **Hundido (Sink)**: Celda roja oscura con efecto bounce, turno cambia al atacante

## Fin del Juego
- [ ] Cuando se hunden todos los barcos de un jugador:
  - [ ] El otro ve "🏆 ¡Ganaste la partida!" y "✅ Victoria"
  - [ ] El ganador ve "🏆 ¡Ganaste la partida!"
  - [ ] El perdedor ve "😵 ¡Perdiste la partida!"
  - [ ] Botón "🔄 Reiniciar partida" aparece

## Desconexión
- [ ] Cierra la ventana de un navegador
- [ ] El otro ve "⚠️ Rival desconectado. Volviendo a modo local..."
- [ ] Se vuelve a modo local automáticamente

## Cambio de Modo
- [ ] Desde Online a Local:
  - [ ] Click en "Modo Local"
  - [ ] Confirma en el diálogo
  - [ ] Vuelve a modo local correctamente
  - [ ] Sale de la sala online

## Bonus - Reconexión (si aplica)
- [ ] Desconexión accidental y reconexión automática
- [ ] Log muestra "✅ Reconectado"
- [ ] El juego continúa sin problemas

---

## 📊 Resultado de Pruebas

**Fecha:** _______________

| Prueba | Estado | Notas |
|--------|--------|-------|
| Crear Partida | ☐ PASS | |
| Unirse a Partida | ☐ PASS | |
| Inicio del Juego | ☐ PASS | |
| Disparos Básicos | ☐ PASS | |
| Agua | ☐ PASS | |
| Tocado | ☐ PASS | |
| Hundido | ☐ PASS | |
| Fin de Juego | ☐ PASS | |
| Desconexión | ☐ PASS | |
| Cambio de Modo | ☐ PASS | |

---

## 🔍 Debugging

Si algo no funciona:

1. **Abre la Consola** (F12 → Console)
2. **Busca logs con:**
   - `[GameEvent]` - Eventos del juego
   - `[PlayerShot]` - Disparos que haces
   - `[Response]` - Respuestas del servidor
   - `[ERROR]` - Errores

3. **Verifica en red** (F12 → Network):
   - Busca conexiones WebSocket (WS)
   - Debería decir "101 Switching Protocols"

4. **Reinicia limpio:**
   - Clear localStorage/sessionStorage
   - Cierra todos los tabs del juego
   - Abre de nuevo

