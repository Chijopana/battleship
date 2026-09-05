# ⚡ Guía Rápida de Pruebas - Mejoras v2

## 🚀 Inicio Rápido

### Terminal 1: Backend
```bash
cd backend
npm start
```

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

---

## 🧪 Pruebas Rápidas (5 minutos)

### Prueba 1: Abandono de Partida ⏱️ 1 min
```
1. Abre: http://localhost:5173 (Navegador 1)
2. Abre: http://localhost:5173 (Navegador 2 - Incógnito)
3. NAV 1: Modo Online → Crear
4. NAV 2: Pega el ID → Unirse
5. Espera a "Partida iniciada" en ambos
6. NAV 1: Click "Modo Local" → Confirma
7. ✅ NAV 2 debe mostrar: "Tu rival abandonó la partida 😞"
```

### Prueba 2: Desconexión Accidental ⏱️ 1 min
```
1. Repite pasos 1-5 de Prueba 1
2. NAV 2: Cierra la pestaña (X rojo)
3. ✅ NAV 1 debe mostrar: "Tu rival se desconectado. Esperando..."
```

### Prueba 3: Reconexión ⏱️ 1 min
```
1. Repite Prueba 2
2. NAV 2: Reabre localhost:5173
3. Ejecuta el mismo código para unirse rápido
4. ✅ NAV 1 debe mostrar: "Tu rival se reconectó ✅"
```

### Prueba 4: Mensajes Coloridos ⏱️ 30 seg
```
1. En cualquier partida en línea
2. Mata un barco: ✅ Mensaje PÚRPURA
3. Dispara al agua: ✅ Mensaje BLANCO
4. Pierdes la partida: ✅ Mensaje ROJO
5. Ganas: ✅ Mensaje VERDE
```

### Prueba 5: Móvil/Tablet Responsive ⏱️ 1 min
```
1. Abre Dev Tools (F12)
2. Click en icono de dispositivo (esquina arriba izq)
3. Selecciona "iPhone SE" (375px)
4. Prueba:
   - ✅ Celdas son clicables
   - ✅ No se cortan los tableros
   - ✅ Botones caben en la pantalla
5. Selecciona "iPad" (768px)
6. Verifica que todo se ve bien
```

### Prueba 6: Touch Support ⏱️ 30 seg (necesita móvil real)
```
1. En móvil o tablet real
2. Abre: https://tu-url.com
3. Modo Online → Crear/Unirse
4. ✅ Toca celdas → responden sin lag
5. ✅ No hay zoom accidental
```

### Prueba 7: Validación de ID ⏱️ 30 seg
```
1. Modo Online
2. Escribe: "!!!invalid!!!"
3. Click Unirse
4. ✅ Debe decir: "❌ ID inválido (solo letras, números, _, -)"
5. Escribe: "ABC123"
6. ✅ Debe funcionar normalmente
```

### Prueba 8: Rate Limiting ⏱️ 30 seg
```
1. Partida activa en línea, es tu turno
2. Dispara muy rápido (múltiples clicks)
3. ✅ Solo registra 1 disparo por segundo
4. Los demás clicks se ignoran
```

---

## 📊 Tabla de Resultados

Copia esto y llena después de probar:

```
Prueba 1 (Abandono)           [ ] ✅ [ ] ❌
Prueba 2 (Desconexión)        [ ] ✅ [ ] ❌
Prueba 3 (Reconexión)         [ ] ✅ [ ] ❌
Prueba 4 (Colores)            [ ] ✅ [ ] ❌
Prueba 5 (Responsive)         [ ] ✅ [ ] ❌
Prueba 6 (Touch)              [ ] ✅ [ ] ❌
Prueba 7 (Validación)         [ ] ✅ [ ] ❌
Prueba 8 (Rate Limit)         [ ] ✅ [ ] ❌

Resultado: ___ / 8 pruebas exitosas
```

---

## 🔍 Debugging

### Ver consola para logs
```
Presiona: F12 → Console
Busca mensajes con:
  [GameEvent] - Eventos principales
  [Error] - Errores del servidor
  [PlayerShot] - Disparos que haces
```

### Ver red
```
F12 → Network → WS (WebSocket)
Debe estar conectado (conexión verde)
```

### Reiniciar limpio
```
1. Cierra todas las pestañas del juego
2. F12 → Application → Clear Site Data
3. Recarga la página
4. Intenta de nuevo
```

---

## ✨ Lo Nuevo Que Deberías Ver

### Mensajes Mejorados
```
Antes: "Mi rival se fue"
Ahora: "Tu rival abandonó la partida 😞" (Naranja)
```

### Distinciones Claras
```
Abandono:        "Tu rival abandonó la partida 😞"
Desconexión:     "Tu rival se desconectó. Esperando reconexión..."
Reconexión:      "Tu rival se reconectó ✅"
```

### Colores por Evento
```
Ganas:       VERDE
Pierdes:     ROJO
Tocado:      AMARILLO
Hundido:     PÚRPURA
Abandono:    NARANJA
```

### Mejor Táctil
```
- Celdas más grandes en móvil
- Sin zoom accidental
- Feedback visual al tocar
- Scaling effect en click (scale-95/110)
```

---

## 📱 Breakpoints

```
Móvil pequeño:  320px - 375px   (iPhone SE)
Móvil:          376px - 667px   (iPhone normal)
Tablet:         668px - 1024px  (iPad)
Desktop:        1025px+         (Laptop)
```

Las celdas se ajustan automáticamente en cada breakpoint:
- Móvil: w-6 h-6 (24px)
- Tablet: w-8 h-8 (32px)
- Desktop: w-10 h-10 (40px)

---

## 🎯 Casos Especiales

### Caso: Ambos abandonan
```
NAV 1 abandona → NAV 2 ve "Tu rival abandonó"
NAV 2 abandona → ambos vuelven a local
✅ Partida se limpia en servidor
```

### Caso: Reconexión durante disparo
```
NAV 2 se desconecta mientras NAV 1 dispara
NAV 2 se reconecta
✅ El estado se sincroniza automáticamente
```

### Caso: Spam de clicks en móvil
```
Usuario toca muy rápido (300ms entre clicks)
✅ Solo procesa 1 click, ignora los demás
```

---

## 💡 pro Tips

1. **Para probar localmente rápido:**
   - Abre las dos pestañas lado a lado (F11 mitad pantalla cada una)
   - Copia/pega el ID, es más rápido

2. **Para probar desconexión:**
   - No cierres el navegador, cierra la pestaña específica
   - O presiona F5 en el navegador es lo mismo

3. **Para ver los logs:**
   - Abre consola (F12) ANTES de hacer las acciones
   - Busca `[GameEvent]` para ver el flujo

4. **Para probar móvil sin dispositivo:**
   - Usa DevTools device emulation
   - Pero el touch real es mejor si tienes tablet

---

## ✅ Conclusión

Una vez que todas las pruebas pasen:
- ✅ Notificación de abandono funciona
- ✅ UX/UI mejorado y responsivo
- ✅ Seguridad contra spam
- ✅ Mejor experiencia móvil

¡El juego está listo para uso! 🚀

