# WORKSPACE_CONTEXT: Matrix CAD Project Summary

This document serves as the complete, authoritative reference of the Matrix CAD codebase, architecture, and core algorithms. Pass this document (via `@WORKSPACE_CONTEXT.md` or copy-paste) to any new chat session to instantly align the AI with the project state.

---

## 1. Project Overview & Concept
* **Stack**: Vanilla HTML5, CSS3, and JavaScript (ES6, client-side only, no framework).
* **Domain**: An interactive, multi-sheet CAD editor and simulator for electrical power routing.
* **Core Components**:
  * **Inverters** (left side): Power sources with nominal capacities (typically 60kW on Sheets 1 & 2, 40kW on Sheet 3).
  * **Pistols** (bottom side): Power consumers with adjustable voltage ($U$: 200–1000V) and current ($I$: unlimited).
  * **Cables**: Terminals with matching names allowing electrical connections to jump between sheets.
  * **Contactors**: Standard switches located at grid coordinate intersections (used to change direction between row and column traversal).
  * **Breakers**: Inline horizontal or vertical breakers that partition rows and columns respectively.

---

## 2. Core Routing Engine (`js/solver.js`)

### A. Pathfinder Cost Weights (`findOptimalPath`)
The pathfinding algorithm uses a custom BFS queue prioritizing path cost.
* **Layout Independence**: Length in wire grid cells (hops) and sheet-to-sheet cable jumps have **`0` cost penalty**.
* **Contactor-Only Cost**: Cost is determined strictly by the number of switches closed:
  * Turning direction at a **standard contactor** adds **`+100`** cost.
  * Traversing a **breaker** (horizontal/vertical) adds **`+100`** cost.
* This ensures the algorithm always prefers paths with fewer physical switching elements, regardless of how long the wire is drawn on screen or which sheet the inverter sits on.

### B. Cumulative Power Targeting
* The pathfinder receives a required **`targetPower`** in kW (not a raw inverter count).
* It crawls reachable inverters, sorting them by cost, and aggregates their nominal capacities until `targetPower` is satisfied. It selects exactly the optimal subset of inverters.

### C. Electrical Isolation (`claimedBuses`)
* Active paths claim their traversed horizontal and vertical buses (identified as `"{fieldId}-row-{r}"` or `"{fieldId}-col-${c}"`).
* To prevent short-circuits and duplicate connection errors, subsequent pathfinder runs for other pistols treat these claimed buses as blocked.
* **Self-Reusability**: During multi-stage search (affinity + extra), the target pistol's own affinity buses are **not** blocked for its extra stage, allowing the additional paths to reuse its own starting row and column wires.

---

## 3. Pistol Scheduling & Stability (`js/app.js`)

### A. Routing Affinity (`appState.pistolToInverterAffinity`)
* Remembers previously connected inverter UIDs for each pistol.
* When recalculating paths, the algorithm always attempts to use the affinity inverters first, preventing paths from flickering or jumping when neighboring pistols are turned on or off.

### B. Incremental Routing & Partial Fallback
* If a pistol's power demand increases:
  1. The algorithm first locks in the existing affinity paths (`K` inverters).
  2. It searches for additional paths to satisfy the remaining power (`demand - affinityPower`).
  3. If the additional power cannot be found, it **keeps the existing affinity paths active** (does not drop the connection) and reports a partial connection warning in the sidebar:
     `Не удалось подключить всю мощность для {Pistol} (Лист N)! Подключено {X} из {Y} кВт.`

### C. Last Action Priority (`lastModifiedPistolUid`)
* Whenever a user changes a pistol's demand or toggles its "Авто" checkbox, `appState.lastModifiedPistolUid` is set to that pistol's UID.
* In `applyAutoConnections`, the last-modified pistol is sorted to the **very end of the queue**.
* This prioritizes all other already-running stable lines first, ensuring the newly modified request only takes leftover resources and never displaces active connections.

---

## 4. Simulation Rules & UI Settings

* **Nominal Inverter Capacity (`getInverterPower`)**:
  * Returns the fixed nominal capacity of the component (`comp.power || 60`) rather than the dynamic simulated load, breaking circular feedback loops in path calculations.
* **Inverter Parameters**:
  * Displays $U = 0\text{ V}$ and $I = 0\text{ A}$ by default. When connected, parameters adapt to the connected pistol's voltage and the calculated current flow. Manual input fields are disabled and displayed as text.
* **Cable Terminals Duplicate Names**:
  * `cable` type components bypass the global unique name validation in `isNameDuplicateGlobal` to allow connecting sheets.
* **Sidebar Layout**:
  * **📋 Заявка мощности пистолетов** table is positioned above the **🔋 Параметры инверторов** table.
* **Visual Glow**:
  * Grid lines, contactors, and inverters only glow when they carry active current flow (`actualPowerFlow > 0`).
* **Sidebar Labels**:
  * Active and Maximum power indicators are rounded to one decimal place (`Math.round(val * 10) / 10`).
