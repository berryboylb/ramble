# Ramble: architecture and plan

Ramble is a web platform where learners build electronic circuits from 3D
components, run them in a simulator, and learn how each part works. Users can
also create their own components or remix existing ones.

Status: **phases 1 and 2 built** (2026-11-02). Phases 3 and 4 are plans.

## How to run

| Command           | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `npm run dev`     | Dev server with live part updates (section 5.4).             |
| `npm run build`   | Typecheck, production build to `dist/`, then the size check. |
| `npm run preview` | Serves `dist/` locally.                                      |
| `npm test`        | All unit tests (Vitest).                                     |
| `npm run lint`    | ESLint.                                                      |
| `npm run format`  | Prettier. `npm run format:check` only checks.                |

## 1. Goals

- First load is about 2 KB and the page is usable at once.
- Every component has a clean 3D model that renders in the browser.
- Users place parts on a virtual breadboard, wire them, and see the circuit work.
- Each part teaches: what it does, its formula, and what damages it.
- Users can create custom components or remix existing ones.
- The page stays responsive while 3D renders and the circuit simulates.

## 2. Key decisions

| Area            | Choice                                                   | Reason                                                                                    |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3D rendering    | three.js, loaded after first paint                       | Mature WebGL library. It is the largest chunk, so it never blocks the first paint.        |
| 3D models       | Procedural geometry built from parameters                | No model files to download. One "axial" builder draws every resistor, diode and inductor. |
| Component data  | One JSON file per part, outside the JavaScript bundle    | The bundle does not grow when the library grows. Parts load only when used.               |
| Simulation      | Own Modified Nodal Analysis (MNA) solver in a Web Worker | Small, and it never blocks the UI thread.                                                 |
| UI              | Plain TypeScript and DOM, no UI framework                | A framework alone is larger than the 2 KB entry budget.                                   |
| State           | Own small registry with change events                    | About 100 lines. No state library is needed.                                              |
| Camera controls | Own 360° orbit camera with focus on a part (section 7)   | Built for our needs. three.js `OrbitControls` adds 5.4 KB and locks at the poles.         |
| Part markings   | Text drawn at runtime on a 2D canvas, used as a texture  | Readable close up. No font file to download.                                              |
| Caching         | HTTP cache headers only, no service worker               | Predictable updates. A new deploy reaches users on the next load.                         |
| Build tooling   | Vite, TypeScript, Prettier, ESLint, Vitest               | Standard and fast. None of these ship to users.                                           |
| Storage (v1)    | IndexedDB in the browser, JSON export and import         | No server is needed to start.                                                             |

MNA is the method that SPICE-type simulators use. It writes Kirchhoff's current
law for every node as one matrix equation and solves it at each time step.

The only runtime dependency is `three`.

## 3. Loading strategy

### 3.1 What "2 KB" means

The 3D renderer cannot fit in 2 KB. The smallest three.js build for our scene is
135 KB gzipped (section 4.1). So the plan splits the app into tiers. The first
tier is under 2 KB and makes the page usable before any 3D code arrives.

| Tier | Contents                                                                        | Loads when                              | Budget (gzip)       |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------- | ------------------- |
| 0    | HTML, inline critical CSS, bootstrap script                                     | First request                           | 2 KB total          |
| 1    | Catalog index for 1 category: names, categories, schematic symbols (inline SVG) | Right after tier 0                      | 4 KB per category   |
| 2    | three.js core and renderer, own camera controls, scene setup                    | Starts right after first paint          | 150 KB              |
| 3    | Shape builders, 1 chunk per shape kind (`axial`, `radial`, `coil`, ...)         | First time a part of that kind is shown | 2.5 KB each         |
| 4    | Part definitions, 1 JSON file per part                                          | When the user opens or places the part  | 1.5 KB each         |
| 5    | Simulator worker, then 1 chunk per electrical model                             | When the user presses Run               | 10 KB, 2.5 KB/model |
| 6    | Part editor (remix, new part, import, export, share); later the oscilloscope    | When the user opens that tool           | 15 KB each          |

What the user gets at each step:

1. **Tier 0 and 1.** The page shell, the component library list with schematic
   symbols, search, and the learn text. The user can browse and read at once.
2. **Tier 2.** The 3D workbench appears. Until then, the workbench area shows a
   light placeholder. The download starts by itself after first paint. It does
   not wait for a click.
3. **Tiers 3 to 6.** Each feature loads the first time the user needs it.

### 3.2 Repeat visits and caching

The platform does not use a service worker. A service worker can keep serving
old files after a deploy, and that makes updates hard to predict. The plan uses
normal HTTP cache headers only:

| Files                                                       | `Cache-Control`                       | Effect                                                                 |
| ----------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `index.html`, `catalog/index.json`                          | `no-cache`                            | The browser checks with the server on every load. A 304 reply is tiny. |
| Hashed JS chunks, category files, part files (`*.<hash>.*`) | `public, max-age=31536000, immutable` | Loaded from disk on repeat visits. A change gives a new file name.     |

- A deploy changes the hashes, and `index.html` and `catalog/index.json` point
  to the new names. So users get the new version on their next load. There is
  no stale-cache state to clear.
- On a repeat visit, the 3D chunk comes from the browser's HTTP cache, so the
  workbench appears fast.
- The headers are set on the host. `public/_headers` holds them for hosts that
  read that file. The host is not chosen yet.
- Offline use is not in phase 1.

### 3.3 Responsiveness

- **Render on demand.** The renderer draws a frame only when something changes:
  a camera move, an edit, or a simulation update. The GPU is idle at other times.
- **Simulator in a Web Worker** from phase 1. Solving runs off the UI thread.
  The worker posts results at most once per frame.
- **Geometry and material caches.** Parts with the same dimensions share 1
  geometry. All copper leads share 1 material.
- **Instancing** for repeated objects, such as breadboard holes. Instancing
  draws many copies of one mesh in 1 GPU draw call.
- **Simple lighting.** No shadows. The pixel ratio is capped at 2.

### 3.4 Budget enforcement

- `tools/check-size.js` runs after `vite build`. It gzips every output file with
  Node's `zlib` and compares it to `budgets.json`.
- The build fails if any tier goes over its budget.
- Every output file must match a rule. A new kind of file without a budget also
  fails the build.

### 3.5 Shell and app entries

Vite 8 wraps every dynamic `import()` in a preload helper of about 0.6 KB
gzipped. No option turns this off in a browser build. The helper alone would
break the 2 KB budget. So the build has 2 entries:

- `index.html` with `src/boot.ts` (tier 0): the page shell.
- `src/app.ts` (tier 2): the 3D workbench. `tools/vite-plugin-shell.ts` writes
  its hashed file name into `<main data-app="…">`. The boot script loads it from
  that URL, so Vite does not wrap the import.

The 2 entries share no code. They talk through DOM events. `ShellEvents` in
`src/core/types.ts` defines them:

| Event            | Direction   | Detail                                       |
| ---------------- | ----------- | -------------------------------------------- |
| `ramble:ready`   | app → shell | The app has started.                         |
| `ramble:catalog` | shell → app | The catalog entries (id, name, symbol, URL). |
| `ramble:pick`    | shell → app | The id of the part the user chose to place.  |
| `ramble:learn`   | app → shell | Learn content for the learn panel.           |
| `ramble:reload`  | shell → app | A part file changed (dev server only).       |

If the user picks a part before the app has started, the shell keeps the pick
and sends it after `ramble:ready`.

## 4. Measured sizes

### 4.1 Test build (2026-11-02)

Vite 8.3.4, three 0.186.1. The test entry adds a listener and loads the 3D
module with a dynamic `import()`. The 3D module imports only what the workbench
needs: `WebGLRenderer`, `Scene`, `PerspectiveCamera`, `Group`, `Mesh`,
`CylinderGeometry`, `BoxGeometry`, `TubeGeometry`, `CatmullRomCurve3`,
`MeshStandardMaterial`, `HemisphereLight`, `DirectionalLight`, `Raycaster`.

| Output                               | Minified  | Gzip      |
| ------------------------------------ | --------- | --------- |
| `index.html`                         | 0.14 KB   | 0.13 KB   |
| Entry script (with preload polyfill) | 2.35 KB   | 1.14 KB   |
| 3D chunk (three.js, tree-shaken)     | 542.91 KB | 135.00 KB |
| 3D chunk with `OrbitControls` added  | 565.89 KB | 140.43 KB |

Conclusions:

- A 2 KB tier 0 is possible. The test entry is 1.14 KB with the preload
  polyfill, which the real build turns off.
- three.js is about 135 KB gzipped even after tree-shaking. Most of it is the
  WebGL renderer and its shader code. It must load after first paint.
- `OrbitControls` costs 5.4 KB, and it does not do all we need (section 7). An
  own camera control is the better choice.

### 4.2 Phase 1 build (2026-11-02)

Output of `npm run build`. Sizes are gzip, from `tools/check-size.js`.

| Tier | Output                                   | Gzip                         | Budget |
| ---- | ---------------------------------------- | ---------------------------- | ------ |
| 0    | `index.html` + boot script               | 1.12 + 0.85 KB = **1.97 KB** | 2 KB   |
| 1    | `catalog/index.json`, each category file | 0.15 to 0.43 KB              | 4 KB   |
| 2    | 3D app with three.js                     | 146.81 KB                    | 150 KB |
| 3    | Each shape builder (12 files)            | 0.29 to 0.79 KB              | 2.5 KB |
| 4    | Each part file (16 files)                | 0.28 to 0.61 KB              | 1.5 KB |
| 5    | Simulator worker                         | 1.99 KB                      | 10 KB  |
| 5    | Each simulation model (8 files)          | 0.20 to 0.41 KB              | 2.5 KB |

### 4.3 Phase 2 build (2026-11-02)

| Tier | Output                     | Gzip                         | Budget | Change from phase 1 |
| ---- | -------------------------- | ---------------------------- | ------ | ------------------- |
| 0    | `index.html` + boot script | 1.11 + 0.85 KB = **1.97 KB** | 2 KB   | none                |
| 2    | 3D app with three.js       | 149.35 KB                    | 150 KB | +2.54 KB            |
| 5    | Simulator worker           | 2.01 KB                      | 10 KB  | +0.02 KB            |
| 6    | Part editor                | 5.83 KB                      | 15 KB  | new                 |

- Tier 2 grew by the parts of phase 2 that the app needs at once: storage, "My
  parts", the symbol table, board save and restore, and the new toolbar
  actions. Code that only the editor uses (the remix diff, the share-link codec,
  the defaults, the editor styles) is in the tier 6 chunk.
- Tier 2 has 0.65 KB left in its budget. three.js is about 135 KB of the
  149.35 KB. The next tier 2 feature must first make room, for example by moving
  rarely used app code to a lazy chunk.

- The camera control is inside the tier 2 chunk. Its size is not measured on
  its own.
- Headless Chromium on the dev server (2026-11-02): the library list showed
  after about 200 ms, and the 3D view was ready after about 1.4 s. These are
  local numbers with no network delay. They are not a field measurement.

## 5. Component catalog and live updates

### 5.1 Why not `import.meta.glob`

An eager `import.meta.glob` puts every part into the JavaScript bundle. The
bundle then grows with each new part, and a new part needs a rebuild. So the
plan does not use it for parts.

### 5.2 Catalog layout

Parts are JSON files outside the bundle, in `catalog/parts/` at the project
root:

```
catalog/
  parts/
    resistor-1k.json
    led-red-5mm.json
    ...
```

They are not in `public/`, because Vite copies `public/` to `dist/` as it is.
That would ship a second, unhashed copy of every part.

The catalog plugin (section 5.4) generates the index files at build time:

```
dist/catalog/
  index.json                   categories and the URL of each category file
  c/passive.<hash>.json        tier 1: id, name, symbol SVG and part file URL for each part
  c/semiconductor.<hash>.json
  parts/resistor-1k.<hash>.json  the part, with `extends` already resolved
```

- Category files are small, so the library list loads fast.
- Each part file loads only when the user opens or places that part.
- `index.json` is revalidated on every load. All other files have hashed names
  and are cached as immutable (section 3.2). So a new or changed part reaches
  users on the next load.

### 5.3 The registry

`src/core/registry.ts` holds the loaded part definitions in memory:

- `setEntries(entries)` stores the URL of each part from the catalog.
- `load(id)` fetches a part file once and caches it.
- `reload(id)` fetches a part file again.
- `upsert(input)` resolves `extends` (remix), validates the result, stores it,
  and tells every listener the part id. Parts that extend the changed part are
  updated too.
- `resolve(input)` resolves `extends` and loads the base parts, but does not
  validate or store. The editor uses it for drafts.
- `remove(id)` removes a part and tells every listener. The caller must check
  first that nothing uses it.
- `list()`, `baseOf(id)`, `dependants(id)` and `isCatalogPart(id)` answer
  questions for the editor and "My parts".
- `on(listener)` subscribes to changes (`changed` or `removed`). It returns a
  function that unsubscribes.

The 3D scene and the UI subscribe to these events. When a definition changes,
the scene rebuilds only the instances of that part. The rest of the scene stays
as it is, and the simulator recompiles the netlist.

All update sources go through `upsert`. So there is one path for validation and
one path for redraw.

### 5.4 Source 1: developers, during development

`tools/vite-plugin-catalog.ts` is a small Vite plugin of our own (no library):

- **Dev server.** It serves the catalog from memory. URLs carry the content
  hash as `?v=<hash>`. It uses Vite's file watcher on `catalog/parts/`. When a
  file is added, changed or removed, it rebuilds the catalog and sends a custom
  HMR event (`catalog:changed`) with the part id. An invalid part shows in
  Vite's error overlay.
- **Browser, dev only.** A handler on `import.meta.hot` in `boot.ts` gets the
  event. It reloads the library list and sends `ramble:reload` to the app. The
  app calls `registry.reload`, and the workbench rebuilds only the instances of
  that part. The circuit on the board stays. Vite removes `import.meta.hot`
  code from production builds, so this costs 0 bytes for users.
- **Build.** It validates every part, writes the hashed files and the index
  files, and fails the build if a part is invalid.

The dev server and production use the same fetch path. Only the trigger for a
refetch is different.

### 5.5 Source 2: users, in the browser

The part editor (`src/editor/`, tier 6) opens in 4 ways:

| Start       | Where                                                | Result                                         |
| ----------- | ---------------------------------------------------- | ---------------------------------------------- |
| Remix part  | Inspector, for a built-in part on the board          | A copy with `extends` set to the built-in part |
| Edit part   | Inspector, for a custom part on the board            | The saved part                                 |
| New part    | Toolbar                                              | A box with 2 pins that acts as a resistor      |
| Import part | Toolbar (a `.json` file), or a share link in the URL | The part from the file or the link             |

- **Form and JSON.** The form edits a full draft: general fields, the 3D shape,
  the electrical model, ratings, markings and learn text. The JSON box shows
  what Save stores. "Apply JSON" reads an edited JSON back into the form.
- **Live preview.** A small 3D view of the part, with its own 360° camera and
  pin labels (for example `1 a`, `2 b`). It updates about 120 ms after each
  edit. It draws only a valid draft.
- **Validation.** The editor uses the shared `validate()` plus 2 rules for user
  parts: the id must start with `my-`, and the id must be free. Save is off
  while there are problems. Built-in ids must not start with `my-`; the catalog
  plugin checks this. So user parts and built-in parts cannot clash.
- **Save.** It calls `registry.upsert`, so placed copies of the part on the
  board update at once. A remix stores only what differs from its base
  (`src/editor/remix.ts`). A change of shape kind or model type stores the full
  part, because a merge would mix the fields of 2 kinds.
- **Custom shape builder.** For the `custom` kind, the form lists the solids
  (box, cylinder, sphere) with size, position, rotation, colour and metal, and
  the pins with their positions. Each pin shows the terminal it connects to.
- **Storage.** Saved parts go to IndexedDB (`src/core/storage.ts`). At startup
  the app loads them into the registry and shows them under "My parts" in the
  library. A part cannot be deleted while it is on the board or while another
  part extends it.
- **Download JSON and share links.** Both give a part that works in another
  browser. A remix of a built-in part stays a remix. A remix of a custom part is
  saved in full, because the other browser does not have its base. A share link
  holds the part compressed in the URL hash (`#part=…`), with the browser's own
  `CompressionStream`. A 4.7 kΩ resistor remix gives a link of about 200
  characters.

### 5.6 The saved board

The board saves itself to IndexedDB about 400 ms after each change: parts,
positions, rotations, changed values and wires. A reload brings it back. A part
that no longer exists is skipped, and the hint names it. "Clear board" starts a
new board.

### 5.7 Source 3: the team, in production

To add or fix a built-in part, the team adds or edits a file in
`catalog/parts/` and publishes the catalog. The catalog can deploy on its
own, without an application release. In phase 4, the catalog moves behind an
API. The community gallery uses the same format.

### 5.8 When code is needed

Most new parts need data only: a new value, size, colour, or a remix.

- A **new shape family** (for example a relay or a 7-segment display) needs a
  new shape builder in `src/render/shapes/`. That builder is its own chunk. Until
  it exists, a user can draw the part with the `custom` shape: a list of boxes,
  cylinders and spheres plus pin positions.
- A **new electrical behaviour** (for example a transistor) needs a new model in
  `src/sim/models/`. That model is its own chunk too.

## 6. Component definition

Each part is 1 JSON object:

```json
{
  "id": "resistor-1k",
  "name": "Resistor 1 kΩ, 1/4 W",
  "category": "passive",
  "version": 1,
  "symbol": "resistor",
  "shape": {
    "kind": "axial",
    "bodyLength": 6.3,
    "bodyRadius": 1.2,
    "pitch": 10.16,
    "color": "#d9c39a",
    "profile": "bone",
    "bands": "resistor"
  },
  "model": { "type": "resistor", "resistance": 1000 },
  "ratings": { "maxPower": 0.25 },
  "learn": {
    "summary": "A resistor limits the current in a circuit.",
    "formula": "V = I × R   P = I² × R",
    "tips": ["This part is rated 0.25 W. More power makes it overheat."]
  }
}
```

A remix holds only what is different. This is the complete file for the
built-in 220 Ω resistor:

```json
{
  "id": "resistor-220r",
  "extends": "resistor-1k",
  "name": "Resistor 220 Ω, 1/4 W",
  "model": { "type": "resistor", "resistance": 220 }
}
```

| Field      | Purpose                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| `symbol`   | The schematic symbol for the library list (tier 1). It shows before 3D loads.                |
| `shape`    | A named shape builder and its parameters, or `custom` with primitives and pin positions.     |
| `model`    | The electrical behaviour for the simulator.                                                  |
| `ratings`  | Limits. The simulator warns when a part goes past them.                                      |
| `markings` | Text printed on the body, for example `1N4007` or `100µF 25V`. Section 7.3.                  |
| `learn`    | Teaching content shown when the part is selected.                                            |
| `extends`  | Optional. The id of a base part. The registry deep-merges this definition over the base one. |

Units are SI for electrical values (ohm, farad, henry, volt) and millimetres for
geometry.

### Shape builders (phase 1)

`axial`, `radial`, `disc`, `coil`, `led`, `transformer`, `battery` (9 V box),
`cell` (AA style), `switch`, `dip`, `to92`, `custom`.

The AC source is a `custom` shape. It shows that a new part can be made from
basic solids with no new code.

Each builder is a separate chunk. It takes its parameters and returns a three.js
group plus the pin positions. The order of the pins matches the terminals of the
electrical model.

### Validation

`src/core/validate.ts` checks every definition before it enters the registry:
required fields, known shape kind and model type, finite positive numbers, pin
count equal to model terminal count, and no `extends` cycles. The same code runs
in the catalog plugin at build time, in the registry, and in the inspector when
a user changes a value. In phase 2, the remix editor uses it too. An invalid
definition is rejected with a list of errors.

## 7. Camera and viewing

Users must be able to move all the way around a single part or a full circuit,
and get close enough to read the text on a part.

### 7.1 Camera control (`src/render/controls.ts`)

- **Full 360° orbit** in all directions, also over the top and under the board.
  The rotation uses quaternions, so the camera does not lock or flip at the
  poles. A quaternion is a 4-number way to store a rotation without that
  problem.
- **Zoom to cursor.** The camera moves toward the point under the pointer. The
  near limit is about 5 mm, which is close enough to read part markings.
- **Pan** moves the orbit centre across the view.
- **Smooth motion.** Movement has damping (a short slow-down after the user
  lets go). The renderer draws frames only while the camera still moves, then
  stops again.
- **Two views:**
  - **Circuit view** orbits the centre of the board, or of the selected group
    of parts.
  - **Part view** opens on a double-click on a part. The camera moves smoothly to
    fit that part, and the part becomes the orbit centre. Press `Esc` or the
    "Back to circuit" button to return.
- **Preset views:** top, front, side and isometric, from buttons or keys `1` to
  `4`.
- **Input:**
  - Mouse: left drag to orbit, right drag to pan, wheel to zoom.
  - Touch: 1 finger to orbit, 2 fingers to pinch-zoom and pan.
  - Keyboard: arrow keys to orbit, `+` and `-` to zoom, `F` to focus the
    selection. This also helps users who cannot use a mouse.
- Budget: 3 KB gzipped, in tier 2.

### 7.2 The underside

The board is drawn on both sides. Under the board, the user sees the pins that
go through it. This shows how a real board is soldered.

### 7.3 Text on parts (markings)

- Each part can list `markings`: a text, the face it is on, and a height in mm.
  For example `{ "text": "NE555", "face": "top", "height": 1.2 }`.
- At runtime, the shape builder draws the text on a small 2D canvas with a
  system font. It uses the canvas as a texture on that face. No font file is
  downloaded.
- The texture is drawn at a resolution that stays sharp at the 5 mm zoom limit.
  Mipmaps and anisotropic filtering keep it readable at an angle. Mipmaps are
  smaller copies of a texture that the GPU uses when the text is far away.
- Textures are cached by text, so 10 resistors with the same marking share 1
  texture.
- Resistors have no text. Their value shows as colour bands, which the builder
  calculates from the resistance.

### 7.4 Labels in the view

- Pin names (for example `anode`, `+`, `p1`) and live values (for example
  `4.98 V, 12.1 mA`) show as small HTML labels placed over the 3D view.
- HTML text stays sharp at every zoom level and costs no GPU texture memory.
- Labels show on hover, on the selected part, or for all parts with a toggle.
- Hover over a pin to see its name and its voltage to ground, for example
  `s1 · 1.02 V` on a transformer secondary.

### 7.5 Pins

- Pin markers draw on top of part bodies. Many pins are under the body (LED,
  DIP, TO-92, transformer). The user must still see and click them.
- A click selects a pin first when a pin is on the click line.
- Click a pin, then a second pin, to add a wire. `Esc` cancels. Click a wire and
  press `Delete` to remove it.

## 8. Phase 1 component library

- **Passive:** resistor, ceramic capacitor, electrolytic capacitor, inductor (3D
  coil), transformer (EI core).
- **Semiconductors:** 1N4148 and 1N4007 diodes, red and green LEDs.
- **Sources and controls:** 9 V battery, AA cell, AC signal source, slide switch.
- **Visual only:** NE555 timer (DIP-8) and 2N3904 transistor (TO-92). These get
  simulation models in phase 3.

## 9. Simulator

- Runs in a Web Worker (tier 5). The worker loads model chunks only for the part
  types in the circuit.
- A time-step solver that starts from power off. Capacitors charge and inductors
  ramp, as on a real bench.
- Models: resistor, capacitor, inductor, diode and LED (non-linear, solved with
  Newton iteration), switch, battery with internal resistance, AC source,
  transformer (coupled windings).
- Every node has a very small conductance to ground (gmin). This keeps the
  matrix solvable when part of a circuit is not connected.
- Outputs: voltage and current for each part, and warnings for ratings and
  polarity.
- Visual feedback: LEDs glow in proportion to current. The oscilloscope (tier 6)
  shows the voltage and current of the selected part.

## 10. Folder structure

```
index.html                tier 0 shell, inline critical CSS
src/
  boot.ts                 tier 0: library list, search, learn panel, loads the app
  app.ts                  tier 2 entry: creates the view, workbench, toolbar, simulator client
  core/
    types.ts              part, catalog, circuit and shell-event types
    models.ts             terminal names per model
    validate.ts           part validation (shared by build, registry, inspector and editor)
    resolve.ts            `extends` merge
    registry.ts           loaded parts and change events
    netlist.ts            joins wired pins into nodes
    units.ts              SI formatting and parsing (4.7k, 100n)
    symbols.ts            schematic symbols (catalog build, "My parts", editor)
    storage.ts            IndexedDB for custom parts and the saved board
    share.ts              share-link encoding (used by the editor)
  render/
    scene.ts              renderer, lights, render on demand
    controls.ts           360° orbit, zoom to cursor, part focus, presets
    board.ts              perforated board, holes as 1 instanced mesh
    parts.ts              shared builder helpers: leads, legs, markings
    markings.ts           canvas text textures
    labels.ts             HTML labels over the 3D view
    pins.ts               pin markers that draw on top of bodies
    cache.ts              shared geometry and material caches
    shapes/               tier 3: 1 builder per shape kind, loaded on demand
  sim/
    client.ts             main-thread side; starts the worker on Run
    worker.ts             tier 5: simulator worker
    engine.ts             time steps and Newton iteration
    mna.ts                linear solver (Gaussian elimination, partial pivoting)
    stamp.ts              matrix stamp helpers and element interface
    warnings.ts           rating and polarity warnings
    protocol.ts           worker messages
    models/               1 file per electrical model, loaded on demand
  workbench/workbench.ts  place, move, rotate, wire, select, part view, labels, save and restore
  editor/                 tier 6: part editor
    editor.ts             form, JSON, live preview, save, download, share
    remix.ts              stores a remix as its changes only
    defaults.ts           start values for each shape kind and model type
    editor.css            editor styles
  ui/
    inspector.ts          values, actions and live readout of the selected part
    fields.ts             field labels and units (inspector and editor)
    myparts.ts            "My parts" in the library list
    learn.ts              learn panel (tier 0)
    app.css               tier 2 styles
catalog/parts/            1 JSON file per built-in part (16 files)
public/_headers           HTTP cache headers for the host
tools/
  vite-plugin-catalog.ts  catalog build, dev server and live updates
  vite-plugin-shell.ts    writes the app URL into index.html
  check-size.js           size check against budgets.json
budgets.json              gzip budget per tier
tests/                    simulator, netlist, registry, catalog, camera, units, remix and share tests
docs/                     this file
```

## 11. Phases

| Phase       | Result                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Core     | Done. Tiered loading and size budgets, catalog plugin, 3D workbench, place and wire, simulator worker, learn |
| 2. Create   | Done. Part editor, custom shape builder, JSON import and export, share by link, saved parts and board        |
| 3. Depth    | Transistor and 555 models, oscilloscope and multimeter, guided lessons                                       |
| 4. Platform | Accounts, backend to save projects, catalog API, community gallery, teacher assignments                      |

## 12. Tests

There are 37 tests in 8 files. All pass.

- Simulator: voltage divider, RC charge to 63 % at t = RC, red LED at about
  2 V through 330 Ω, reversed diode blocks, inductor current settles at V / R,
  switch toggle keeps the state, 10:1 transformer gives about 1.2 V from 12 V,
  floating part stays solvable, power-rating warning.
- Netlist: wired pins join, the battery negative pin is ground, parts with no
  model keep their pins.
- Registry: fetch once, `extends` merge, cycle rejected, invalid part rejected
  with the problem list, pin-count check, change events reach parts that
  extend the changed part.
- Catalog: all built-in parts are valid, every part is listed with a symbol,
  hashed file names, remixes resolved, bad file name reported.
- Camera: no jump or flip over the poles, level horizon after yaw, drag
  direction is kept when upside down.
- Units: SI format and parse, values below 1 pico are not shown as 0.
- Remix: only changed fields are stored, a remix resolves back to the full
  part, a new shape kind stores the full part.
- Share links: round trip, URL-safe characters, a bad hash is rejected.
- Registry (phase 2): `remove`, `dependants`, `baseOf`, `isCatalogPart`, and
  `resolve` that does not store. Catalog: a built-in id with the `my-` prefix
  is rejected.
- Size: `check-size.js` runs in `npm run build`.

Browser checks (headless Chromium, by hand, not in CI): phase 1 place, wire
and run; phase 2 remix and save, place from "My parts", new part, delete
refused while in use, reload restores parts and board, share link opens in a
fresh profile.

Not set up yet: browser tests in CI, Lighthouse on a throttled mobile profile,
and unit tests for `storage.ts` (they need an IndexedDB test double). The
project has no CI yet.

## 13. Tooling

- **Prettier** formats all files. Config: `.prettierrc` (single quotes, print
  width 100).
- **ESLint** with `@eslint/js` and `typescript-eslint` recommended rules.
  Config: `eslint.config.js`.
- **TypeScript** in strict mode. Relative imports use the `.ts` extension, as
  Vite's native config loader needs.
- **Vitest** for unit tests in `tests/`.

## 14. Open decisions

Phase 1 uses the recommendation for each decision.

| Decision  | Options                                         | Phase 1 choice                                      |
| --------- | ----------------------------------------------- | --------------------------------------------------- |
| Simulator | Own MNA solver, or ngspice in WebAssembly       | Own solver. ngspice can come later as an option.    |
| Backend   | Browser only in phase 1, or accounts from start | Browser only.                                       |
| Realism   | Clean and simple, or near photo-real            | Clean and simple. It is lighter and easier to read. |
| Host      | Not chosen                                      | `public/_headers` works on hosts that read it.      |

### Known limits

- Custom parts and the board are saved in this browser only. Another device does
  not see them. Accounts come in phase 4.
- There is 1 saved board. Named projects are not in phase 2.
- The editor shows only the fields that the draft has. To add an optional field
  that is not there (for example a stripe on an axial body), edit the JSON.
- A change to parts or wires restarts the simulation from power off. A change
  to a value (for example a switch toggle) keeps the state.
- The time step is fixed at 10 µs. Very fast circuits (above about 10 kHz) are
  not accurate.
- The NE555 and 2N3904 are visual only. Their models come in phase 3.

## 15. References

- three.js forum, efficient rendering of complex geometry:
  https://discourse.threejs.org/t/what-is-the-most-efficient-way-to-render-complex-geometry/25326
- Geometry instancing and merging in three.js:
  https://dev.to/translight3d/one-click-fix-for-threejs-3d-scene-lag-geometry-instancing-and-merging-in-translight-3d-253d
- CircuitJS1 (Falstad), browser circuit simulator: https://lushprojects.com/circuitjs/
- CircuitC, MNA with LU decomposition: https://github.com/gmfCoding/circuitc
- EEsim, ngspice in WebAssembly: https://open.ed.ac.uk/?p=7391
- Vite plugin API (`configureServer`, custom HMR events):
  https://vite.dev/guide/api-plugin
