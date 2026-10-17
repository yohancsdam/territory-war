# Territory War — Especificación del juego

Documento de referencia para el desarrollo. Claude Code debe leerlo al empezar cada sesión
y mantenerlo actualizado cuando se tomen decisiones nuevas.

---

## 1. Qué es

Juego 2D de combate táctico por turnos en navegador, vista lateral, con terreno destructible.
Dos equipos de 6 soldados tipo *stickman* se eliminan a tiros. Inspirado en las mecánicas de
Territory War (Afro-Ninja), pero con código, nombres y arte propios. No se copia ningún asset
ni código del original.

**Alcance de esta fase (4 horas):** juego local a dos en el mismo dispositivo + multijugador
online básico por WebRTC para jugar con amigos. Sin CPU, sin cadmpaña, sin progresión,
sin arte final.

---

## 2. Punto de partida

`territory-war-base.html` es un prototipo ya funcional y es la semilla del proyecto.
**No se reescribe desde cero.** Ya implementa:

- Terreno destructible por máscara de píxeles (`solid`, `carve`, `genTerrain`, `paintTerrain`)
- Físicas de unidades y proyectiles con paso fijo (`DT = 1/120`)
- 6 armas: pistola, escopeta, francotirador, bazuca, granada, dinamita
- Carga y suelta (mantener pulsado) para bazuca, granada y dinamita
- Turnos alternos con rotación de soldado dentro del equipo (`nextUnit`, `startTurn`, `finishTurn`)
- Fase de resolución que espera a que todo se detenga antes de pasar el turno (`updateResolve`)
- Fuego amigo, muerte por salir del mapa, barras de vida, registro de eventos, pantalla final
- Controles de teclado, ratón y táctiles
- Menú previo con nombres de equipo, tamaño, vida y estilo de mapa

Canvas de 960×540. Sin dependencias externas. Todo en un archivo.

---

## 3. Reglas del juego (estado objetivo)

### Turnos
- Empieza siempre el equipo rojo. Juega **un soldado por turno** y pasa al equipo contrario.
- Dentro de cada equipo los soldados rotan en orden (1, 2, 3, 4, 5, 6) y se vuelve a empezar.
- Si al soldado que le tocaba está muerto, se salta al siguiente vivo del mismo equipo.
- **Un solo disparo por turno.** Tras disparar, el turno termina cuando todo se detiene.
- **Temporizador: 60 segundos.** Al agotarse se pierde el turno sin disparar y pasa al rival.

### Combate
- 6 soldados por equipo, fijo. No es configurable.
- **Fuego amigo activado:** las explosiones dañan a los soldados propios.
- **Sin daño por caída.** Caerse no resta vida; solo mata salir del mapa (laterales o abismo inferior).
- Las explosiones empujan a los soldados (knockback) y destruyen terreno.
- **Sin viento.** Las trayectorias dependen solo de ángulo, potencia y gravedad.

### Victoria
- Gana el equipo que elimina a los 6 soldados rivales.
- Si los dos equipos quedan a cero a la vez, empate.

### Mapas
- Tres mapas seleccionables antes de empezar: **colinas**, **islas flotantes** y **cañón**.
- El relieve concreto se genera al azar dentro del estilo elegido, a partir de una **semilla**.
- La misma semilla produce siempre el mismo mapa. Esto es obligatorio para el online.

---

## 4. Cambios pendientes sobre el prototipo

| # | Cambio | Dónde (en el archivo base) |
|---|--------|----------------------------|
| 1 | Quitar el viento por completo | `G.wind`, `startTurn` (~607), `stepRocket` (~540), `stepThrown` (~555), HUD (~66, 141, 980) |
| 2 | Quitar el daño por caída | `updateUnit`, bloque `if(v>FALLV)` (~440) |
| 3 | Temporizador a 60 s | `TURN_TIME` (~213) |
| 4 | Fijar 6 soldados por equipo | `startBattle`, `readCfg`, selector del menú |
| 5 | Generación de terreno con semilla | `genTerrain`, sustituir `Math.random` por PRNG |
| 6 | Separar simulación de render y entrada | Refactor para el netcode |
| 7 | Multijugador online por WebRTC | Módulo nuevo |

---

## 5. Arquitectura

### Estructura del proyecto

Vite + módulos ES en JavaScript. **No se migra a TypeScript en esta fase:** convertir 1000 líneas
ya funcionales consume tiempo sin añadir nada jugable. Queda como mejora posterior.

```
territory-war/
├── index.html
├── vite.config.js
├── package.json
├── GAME_DESIGN.md
├── src/
│   ├── main.js          arranque, bucle de frames, enganchado del DOM
│   ├── config.js         constantes: W, H, GRAV, DT, WALK, TURN_TIME, armas
│   ├── rng.js            PRNG con semilla (mulberry32)
│   ├── terrain.js        genTerrain, paintTerrain, solid, carve, groundY
│   ├── units.js          updateUnit, hurt, die, tryStep
│   ├── weapons.js        doFire, explode, stepBullet, stepRocket, stepThrown
│   ├── turns.js          startTurn, beginResolve, finishTurn, updateResolve, endGame
│   ├── state.js          objeto G, teams, units, proj; serializar y aplicar snapshots
│   ├── input.js          teclado, ratón, táctil → objeto de intención
│   ├── render.js         draw, drawUnit, drawProj, drawReticle, HUD
│   ├── menu.js           pantalla previa y lobby
│   └── net.js            PeerJS: sala, host, invitado
└── test/
    └── rules.test.js     tests de reglas con Vitest
```

### Frontera crítica: entrada → simulación → render

El netcode depende de que estas tres cosas estén separadas. La regla es:

- **`input.js` no toca el estado del juego.** Produce un objeto de intención plano y nada más:
  ```js
  { left, right, up, down, jump, fireDown, fireUp, cancel, skip, weapon, aimX, aimY }
  ```
- **La simulación consume ese objeto**, venga del teclado local o de la red. No sabe ni le importa.
- **`render.js` no modifica el estado.** Solo lo dibuja.

Si esta separación está limpia, el online es una capa fina encima. Si no lo está, el online
se convierte en una pesadilla. Es el punto más importante del refactor.

---

## 6. Multijugador online

### Transporte
**PeerJS** sobre WebRTC, usando el broker público gratuito. Sin servidor propio y sin coste.
Solo 2 jugadores por partida. Sin espectadores.

### Modelo: autoridad del anfitrión

El anfitrión ejecuta la simulación completa. El invitado no simula nada: manda intenciones
y dibuja lo que recibe.

```
INVITADO                      ANFITRIÓN
--------                      ---------
teclado/ratón
  → intención  ──────────────→ valida que sea su turno
                               aplica a la simulación
                               avanza la física
  dibuja  ←────────────────── snapshot (30 Hz)
```

Al ser por turnos y moverse un solo soldado a la vez, el ancho de banda es mínimo y una
latencia de 100-200 ms no se nota. No hace falta predicción ni rollback.

### Flujo de conexión

1. El anfitrión pulsa **Crear sala** → se genera un código de 6 caracteres (ej. `K7M2PQ`)
   y se crea un `Peer` con id `tw-K7M2PQ`.
2. El anfitrión elige mapa y nombres de equipo. El invitado solo espera.
3. El invitado pulsa **Unirse**, escribe el código y conecta a `tw-K7M2PQ`.
4. El anfitrión envía `init` con la configuración y la **semilla del mapa**.
5. El invitado genera el mismo terreno con esa semilla y confirma con `ready`.
6. El anfitrión empieza la partida. El anfitrión es siempre el equipo rojo.

### Mensajes

```js
// anfitrión → invitado
{ type: 'init',     seed, style, names, hp, size }
{ type: 'snapshot', frame, g, units, proj, carves, feed, banner }
{ type: 'over',     winner, stats }

// invitado → anfitrión
{ type: 'ready' }
{ type: 'input',    intent }   // ~30 Hz, solo si es su turno
```

### Snapshot

No se manda nunca la máscara del terreno (demasiado grande). Se manda la semilla al principio
y después solo los **cráteres**: `carves: [{x, y, r}]`. El invitado los aplica con la misma
función `carve` y el terreno queda idéntico.

Contenido del snapshot, a 30 Hz:
- `g`: turno activo, índice del soldado activo, temporizador, arma, fase, elevación, carga
- `units`: por cada uno `{x, y, vx, vy, hp, alive, face}`
- `proj`: proyectiles activos `{type, x, y, vx, vy}`
- `carves`: cráteres nuevos desde el snapshot anterior
- `feed` y `banner`: mensajes nuevos

El invitado interpola posiciones entre snapshots para que el movimiento se vea suave.

### Desconexión

Si se corta la conexión, se muestra un aviso y la partida queda congelada. No hay reconexión
en esta fase: si el anfitrión cierra la pestaña, se acaba la partida. Es la limitación aceptada
a cambio de no montar servidor.

### Aviso sobre dónde publicarlo

WebRTC puede venir bloqueado dentro del iframe de un artifact de Claude. El destino para jugar
con amigos es **GitHub Pages**: `vite build` y publicar `dist/`. El modo local a dos en el mismo
dispositivo sí funciona en cualquier sitio.

---

## 7. Qué NO se hace en esta fase

Para que no se desvíe el alcance, queda explícitamente fuera:

- Oponente controlado por la CPU
- Campaña, misiones, desbloqueos o progresión
- Editor de mapas
- Arte y sonidos definitivos (se mantienen las formas y los sonidos sintéticos actuales)
- Más de 2 jugadores, espectadores o emparejamiento automático
- Reconexión, salas persistentes o servidor propio
- Migración a TypeScript o a Phaser
- Guardado de partidas o perfiles

---

## 8. Verificación

Cada etapa del desarrollo se cierra comprobando:

- `npm run dev` arranca sin errores de consola
- Una partida local completa termina con victoria de un equipo
- Los tests de `rules.test.js` pasan: rotación de turnos, soldado muerto saltado,
  temporizador que pierde el turno, victoria al eliminar a los 6, fuego amigo que resta vida,
  misma semilla → mismo terreno
- En online: dos navegadores conectados ven el mismo terreno, los mismos cráteres y el mismo
  resultado de la partida

---

## 9. Plan de 4 horas

| Tramo | Trabajo |
|-------|---------|
| 0:00 – 1:00 | Montar el proyecto con Vite, partir el HTML en módulos, cambios 1-4 (viento, caída, 60 s, 6 soldados), que arranque y se pueda jugar en local |
| 1:00 – 2:00 | PRNG con semilla, limpiar la frontera entrada/simulación/render, tests de reglas |
| 2:00 – 3:00 | `net.js` con PeerJS: sala, init, snapshots, entrada del invitado. Probar con dos pestañas |
| 3:00 – 4:00 | Lobby y avisos de desconexión, build y publicación en GitHub Pages, partida de prueba con un amigo |

Si el tramo del online se complica, el juego local ya es jugable al terminar la primera hora.
Ese es el seguro.

---

## 10. Decisions taken during development

Recorded in English (project language from this point on).

- **Language:** all game UI text, code and new docs are in English.
- **Tuning:** every gameplay number (weapon damage, explosion radius, knockback, ammo, speeds,
  timers…) lives in `src/config.js`. Weapons are data entries there.
- **Extra modules** beyond section 5: `sim.js` (setupBattle/startBattle, `applyIntent`, `step`),
  `fx.js` (particles, floating text, shake), `audio.js` (synth sounds), `util.js`.
- **Effects as events:** the simulation never draws or plays sounds. It queues cosmetic events
  (`emit`) that the frame loop plays locally and the host forwards to the guest in snapshots.
- **"Random" map option kept:** the style is picked from the seeded PRNG, so it's still the same
  map on both screens.
- **Weapon spread** (pistol, shotgun) still uses `Math.random`. That's fine because only the
  host simulates.
- **`init` message:** `{ type:'init', seed, style, names, hp }`. No `size`, since teams are always 6.
- **Snapshot** carries more than section 6 lists: `booms` (explosion flashes), `teams`
  (ammo, stats, rotation pointer), `fx` (cosmetic events) and drawing fields per unit and
  projectile. Banner text and timer travel inside `g`.
- **Extra messages:** `wait` (host went back to room settings), `full` (room already has two
  players), `ping` (heartbeat each second; 8 s of silence = connection lost).
- **Background tabs:** a worker timer keeps the host simulating while its tab is hidden.- **Graphics pass** (requested by the user, overriding the "no final art" line in section 7): procedural
  only, no image assets. Per-map terrain palettes and textures, scenery backgrounds built from the
  seed, animated water, detailed soldiers and weapons, glowing explosions, smoke, debris and muzzle
  flashes. Still purely cosmetic: `render.js` and `fx.js` never change game state.
