# Secuencia de prompts para Claude Code

Orden de trabajo para montar Territory War en local. Un prompt por paso, de uno en uno.
**Commit después de cada paso que funcione.** Así siempre puedes volver atrás cuando algo se rompa.

## Antes de empezar

```bash
mkdir territory-war && cd territory-war
git init
# copia aquí territory-war-base.html y GAME_DESIGN.md
git add -A && git commit -m "Prototipo base y especificación"
claude
```

---

## Paso 0 — Contexto permanente

> Lee `GAME_DESIGN.md` y `territory-war-base.html` completos antes de escribir nada.
>
> Crea un `CLAUDE.md` en la raíz con un resumen corto del proyecto: qué es el juego, que el
> archivo base es un prototipo funcional que se refactoriza y no se reescribe, las reglas
> del apartado 3 de la spec, la estructura de módulos del apartado 5, y la regla de que
> `input.js` no toca el estado y `render.js` no lo modifica.
>
> No escribas código todavía. Solo el `CLAUDE.md`.

**Verifica:** que el `CLAUDE.md` recoge las reglas bien y no se ha inventado ninguna.

---

## Paso 1 — Proyecto y módulos

> Monta el proyecto con Vite (plantilla vanilla, JavaScript, sin TypeScript) y parte
> `territory-war-base.html` en los módulos de `src/` que describe el apartado 5 de `GAME_DESIGN.md`.
>
> Reglas del refactor:
> - **Conserva la lógica tal cual.** Esto es mover código, no reescribirlo. Las físicas, las
>   armas y la generación de terreno funcionan y no se tocan en este paso.
> - El CSS pasa a `src/style.css`. El HTML del menú y el HUD se queda en `index.html`.
> - Exporta e importa con módulos ES. Nada de variables globales entre módulos salvo el
>   estado compartido en `state.js`.
> - Mantén el hook de pruebas `window.__tw` y amplíalo con lo que haga falta para testear.
>
> Al terminar, arranca `npm run dev` y comprueba que no hay errores de consola.

**Verifica tú mismo:** abre el navegador, juega un turno de cada equipo, dispara con pistola
y con bazuca, comprueba que el terreno se destruye.

```bash
git add -A && git commit -m "Proyecto Vite y división en módulos"
```

---

## Paso 2 — Ajustes de reglas

> Aplica los cambios 1 a 4 de la tabla del apartado 4 de `GAME_DESIGN.md`:
>
> 1. **Quita el viento por completo.** Fuera `G.wind`, la tirada en `startTurn`, los términos
>    de viento en `stepRocket` y `stepThrown`, y el indicador del HUD con su CSS.
> 2. **Quita el daño por caída.** Las caídas no restan vida. Salir del mapa sigue matando.
> 3. **Temporizador a 60 segundos.**
> 4. **Fija 6 soldados por equipo.** Quita el selector de tamaño del menú; deja los de nombre
>    de equipo, vida y mapa.
>
> Revisa que no queda ninguna referencia huérfana al viento ni a `FALLV`.

```bash
git add -A && git commit -m "Reglas: sin viento, sin daño por caída, 60 s, 6 soldados"
```

---

## Paso 3 — Terreno con semilla

> Crea `src/rng.js` con un PRNG mulberry32 que acepte una semilla numérica.
>
> Cambia `genTerrain` y todo lo que coloque soldados o genere relieve para que use ese PRNG
> en vez de `Math.random`. La función debe recibir la semilla como parámetro.
>
> Importante: solo la generación del mapa y el reparto inicial de soldados usan el PRNG con
> semilla. Los efectos visuales (partículas, chispas) pueden seguir con `Math.random`, porque
> no afectan a la simulación.
>
> Añade a `window.__tw` una forma de generar un mapa con una semilla dada y devolver un hash
> de la máscara de terreno.
>
> Comprueba desde Node o desde la consola que la misma semilla con el mismo estilo produce
> exactamente el mismo terreno dos veces seguidas, y que dos semillas distintas dan mapas
> distintos.

**Este paso es la base del online.** Si el terreno no es reproducible, los dos jugadores verán
mapas diferentes.

```bash
git add -A && git commit -m "Generación de terreno reproducible con semilla"
```

---

## Paso 4 — Frontera entrada / simulación / render

> Limpia la separación que describe el apartado 5 de `GAME_DESIGN.md`.
>
> - `input.js` traduce teclado, ratón y táctil a un objeto de intención plano y **no toca el
>   estado del juego**:
>   `{ left, right, up, down, jump, fireDown, fireUp, cancel, skip, weapon, aimX, aimY }`
> - La simulación expone una función `applyIntent(intent)` que es el **único** camino por el
>   que una acción del jugador entra en el juego. Da igual si la intención viene del teclado
>   local o de la red.
> - `render.js` solo lee el estado. Si alguna función de dibujo lo modifica, sácalo de ahí.
> - Añade `src/state.js` con `serializeSnapshot()` y `applySnapshot(snap)` según el formato
>   del apartado 6. De momento sin red: solo las funciones y sus tests.
>
> Verifica que el juego local sigue funcionando igual que antes del refactor.

```bash
git add -A && git commit -m "Frontera limpia entrada/simulación/render"
```

---

## Paso 5 — Tests de reglas

> Añade Vitest y escribe `test/rules.test.js` cubriendo:
>
> - Los turnos alternan rojo → azul → rojo
> - Dentro de un equipo los soldados rotan en orden y se vuelve a empezar
> - Un soldado muerto se salta y juega el siguiente vivo del mismo equipo
> - Al agotarse el temporizador se pierde el turno sin disparar
> - La partida termina cuando un equipo pierde sus 6 soldados
> - El fuego amigo resta vida a soldados del mismo equipo
> - Caer desde muy alto no resta vida
> - Salir del mapa mata al soldado
> - La misma semilla y el mismo estilo producen el mismo terreno
> - `applySnapshot(serializeSnapshot())` deja el estado equivalente
>
> Usa el hook `window.__tw` o importa los módulos directamente. No hace falta DOM real:
> crea los stubs mínimos que necesites.

```bash
npm test
git add -A && git commit -m "Tests de reglas con Vitest"
```

---

## Paso 6 — Multijugador: anfitrión e invitado

> Implementa `src/net.js` con PeerJS según el apartado 6 de `GAME_DESIGN.md`.
>
> - Instala `peerjs` desde npm.
> - **Crear sala:** genera un código de 6 caracteres en mayúsculas sin vocales (para que no
>   salgan palabras raras) y crea un `Peer` con id `tw-<código>`. Muestra el código en pantalla
>   con un botón de copiar.
> - **Unirse:** campo para el código y conexión a `tw-<código>`.
> - **Autoridad del anfitrión:** el anfitrión simula todo y manda snapshots a 30 Hz. El invitado
>   no simula: manda su intención a 30 Hz y dibuja lo que recibe. El anfitrión es el equipo rojo
>   y el invitado el azul.
> - El anfitrión valida que la intención recibida solo se aplique si es el turno del invitado.
> - El terreno se sincroniza con la semilla en el mensaje `init` y luego solo con los cráteres
>   nuevos en cada snapshot. **Nunca mandes la máscara del terreno.**
> - El invitado interpola las posiciones entre snapshots para que no se vea a saltos.
> - El modo local a dos en el mismo dispositivo tiene que seguir funcionando sin tocar nada.
>
> Mantén la capa de red lo más fina posible: `net.js` solo debe llamar a `applyIntent` y a
> `applySnapshot`, nunca manipular el estado por su cuenta.

**Verifica:** abre dos pestañas, crea sala en una y únete desde la otra. Comprueba que las dos
ven el mismo mapa, que los cráteres coinciden y que la partida termina igual en ambas.

```bash
git add -A && git commit -m "Multijugador online con PeerJS"
```

---

## Paso 7 — Lobby y desconexiones

> Pule el flujo de entrada:
>
> - Pantalla inicial con tres opciones: **Local a dos**, **Crear sala online**, **Unirse a sala**.
> - En la sala, el anfitrión elige mapa y nombres mientras el invitado ve "Esperando al
>   anfitrión". El invitado no puede cambiar la configuración.
> - Indicador de conexión: conectando, conectado, desconectado.
> - Si se corta la conexión, aviso claro de que la partida se ha interrumpido y botón para
>   volver al menú. Sin reconexión.
> - Avisos de error legibles si el código no existe o la sala ya está ocupada.

```bash
git add -A && git commit -m "Lobby y manejo de desconexiones"
```

---

## Paso 8 — Publicación

> Prepara el despliegue en GitHub Pages:
>
> - `vite.config.js` con el `base` correcto para el repositorio.
> - Workflow de GitHub Actions que haga `npm ci`, `npm test`, `npm run build` y publique `dist/`.
> - `README.md` con cómo arrancar en local, cómo jugar, los controles y el enlace de la versión
>   publicada.
>
> Comprueba que `npm run build` genera un `dist/` que funciona servido estáticamente.

```bash
git add -A && git commit -m "Despliegue en GitHub Pages"
git push
```

Después, partida de prueba real con un amigo. Es donde van a salir los fallos que no se ven
con dos pestañas en el mismo ordenador: latencia de verdad, NAT, y el equilibrio de las armas.

---

## Si algo se tuerce

- **Error en el navegador:** pásale a Claude Code el mensaje completo de la consola, no un resumen.
- **Un cambio rompe el juego:** `git diff` para ver qué tocó, o `git checkout .` y repites el
  prompt siendo más concreto.
- **Se desvía del alcance:** recuérdale el apartado 7 de la spec. Tiende a añadir CPU, menús
  y sistemas que no has pedido.
- **Se pierde entre sesiones:** que relea `CLAUDE.md` y `GAME_DESIGN.md`.
- **Los dos jugadores ven mapas distintos:** es el PRNG. Revisa que no queda ningún
  `Math.random` en la generación del terreno ni en el reparto de soldados.
