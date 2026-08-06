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

## 2. Core Routing Engine (`js/solver.js` & `js/app.js`)

### A. Pathfinder Cost Weights (`findOptimalPath` in [`js/solver.js`](file:///S:/matrix_cad/js/solver.js))
The pathfinding algorithm uses a custom BFS queue prioritizing path cost.
* **Layout Independence**: Length in wire grid cells (hops) and sheet-to-sheet cable jumps have **`0` cost penalty**.
* **Contactor-Only Cost**: Cost is determined strictly by the number of switches closed:
  * Turning direction at a **standard contactor** adds **`+100`** cost.
  * Traversing a **breaker** (horizontal/vertical) adds **`+100`** cost.
* This ensures the algorithm always prefers paths with fewer physical switching elements, regardless of how long the wire is drawn on screen or which sheet the inverter sits on.

### B. Cumulative Power Targeting
* The pathfinder receives a required **`targetPower`** in kW (not a raw inverter count).
* It crawls reachable inverters, sorting them by cost, and aggregates their nominal capacities until `targetPower` is satisfied. It selects exactly the optimal subset of inverters.

### C. Transit Column Protection (`claimedBuses`)
* Active paths claim their traversed horizontal and vertical buses (identified as `"{fieldId}-row-{r}"` or `"{fieldId}-col-${c}"`).
* **Pistol Column Isolation**: To prevent transit-based short circuits (where a route uses a different pistol's column bus for transit, thereby energizing that pistol), the column buses of **all other pistols on the grid** are automatically claimed and blocked for any other route.
* **Cable Expansion**: Traversed sheet-to-sheet cables recursively expand their claims across all sheets, preventing separate routes from merging on the same cable net.
* **Self-Reusability**: During multi-stage search (affinity + extra), the target pistol's own affinity buses are **not** blocked for its extra stage, allowing the additional paths to reuse its own starting row and column wires.

---

## 3. Pistol Scheduling & Queue Management (`js/app.js`)

### A. Routing Affinity (`appState.pistolToInverterAffinity`)
* Remembers previously connected inverter UIDs for each pistol.
* When recalculating paths, the algorithm always attempts to use the affinity inverters first, preventing paths from flickering or jumping when neighboring pistols are turned on or off.

### B. Incremental Routing & Partial Fallback
* If a pistol's power demand increases:
  1. The algorithm first locks in the existing affinity paths (`K` inverters).
  2. It searches for additional paths to satisfy the remaining power (`demand - affinityPower`).
  3. If the additional power cannot be found, it **keeps the existing affinity paths active** (does not drop the connection) and reports a partial connection warning in the sidebar.

### C. Queue Activation Fix (`_getOrangePistols` in [`js/app.js`](file:///S:/matrix_cad/js/app.js))
* When a car fails to route on arrival, its route is removed from `appState.activeAutoRoutes`.
* To ensure unrouted (red/orange) cars are not ignored, `_getOrangePistols()` scans all pistols on the board. Any pistol with `autoConnect === true` but without a full route is correctly identified.
* These unrouted pistols are placed in a queue sorted by SoC and automatically re-routed whenever resources are freed (e.g. on `onCarDeparture`).

### D. Last Action Priority (`lastModifiedPistolUid`)
* Whenever a user changes a pistol's demand or toggles its "Авто" checkbox, `appState.lastModifiedPistolUid` is set to that pistol's UID.
* In `applyAutoConnections`, the last-modified pistol is sorted to the **very end of the queue**.
* This prioritizes all other already-running stable lines first, ensuring the newly modified request only takes leftover resources and never displaces active connections.

---

## 4. Simulation Rules & UI Settings

* **Nominal Inverter Capacity (`getInverterPower`)**:
  * Returns the fixed nominal capacity of the component (`comp.power || 60`) rather than the dynamic simulated load, breaking circular feedback loops in path calculations.
* **Inverter Parameters**:
  * Displays $U = 0\text{ V}$ and $I = 0\text{ A}$ by default. When connected, parameters adapt to the connected pistol's voltage and the calculated current flow. Manual input fields are disabled.
* **Cable Terminals Duplicate Names**:
  * `cable` type components bypass the global unique name validation in `isNameDuplicateGlobal` to allow connecting sheets.
* **Traffic Spawner Catch-up Loop**:
  * Under high speed multipliers (e.g. x1000), a sequential `while` loop catches up `lastTrafficCheckTime` with the current `totalSeconds`, rolling spawn probability for every virtual second elapsed.
* **Four-State Color Synchronization**:
  * Dot colors in the sidebar table and labels in the Control Panel are synchronized:
    * **Green (`#00ffaa`)**: Charging at full capacity. Text: `⚡ Зарядка`.
    * **Yellow (`#ffd166`)**: Charging at partial capacity. Text: `⚡ Зарядка`.
    * **Reddish Orange (`#ff6b00`)**: Standing in queue / waiting. Text: `⏳ Ожидание`.
    * **Red (`#ff4a6b`)**: Involved in an active electrical conflict (e.g. short circuit). Text: `⚠️ Конфликт`.
