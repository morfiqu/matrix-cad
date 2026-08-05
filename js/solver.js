/**
 * Pure Simulation Engine for Matrix CAD
 * Calculates electrical graph reachability, Kirchhoff ring balances, 
 * parallel contactor branch power splitting, and pistol power accumulations.
 */

/**
 * Helper to get the nominal inverter power capacity.
 */
function getInverterPower(comp, fieldId, key) {
    return comp.power !== undefined ? comp.power : 60;
}

function getInverterVoltage(fields, fId, r) {
    const field = fields.find(f => f.id === fId);
    if (field) {
        const comp = field.components[`${r}-0`];
        if (comp && comp.type === 'inverter') {
            const uid = `${fId}-${r}-0`;
            if (window.appState && window.appState.inverterSettings && window.appState.inverterSettings[uid]) {
                return window.appState.inverterSettings[uid].voltage !== undefined ? window.appState.inverterSettings[uid].voltage : 500;
            }
        }
    }
    return 500;
}

function getPistolDemand(fieldId, key) {
    const uid = `${fieldId}-${key}`;
    if (window.workSimState && window.workSimState.isActiveSimRun) {
        if (window.workSimActiveConnections && window.workSimActiveConnections[uid]) {
            const conn = window.workSimActiveConnections[uid];
            if (conn.limit !== undefined) return conn.limit;
            return (conn.car.voltage * conn.car.current) / 1000;
        }
        return 0; // No demand if empty
    }
    if (window.appState && window.appState.pistolDemands && window.appState.pistolDemands[uid]) {
        const s = window.appState.pistolDemands[uid];
        if (s.limit !== undefined) {
            return s.limit;
        }
        const v = s.voltage !== undefined ? s.voltage : 500;
        const i = s.current !== undefined ? s.current : 20;
        return (v * i) / 1000;
    }
    return 10; // default 10 kW
}

function getPistolVoltage(fieldId, key) {
    const uid = `${fieldId}-${key}`;
    if (window.workSimState && window.workSimState.isActiveSimRun) {
        if (window.workSimActiveConnections && window.workSimActiveConnections[uid]) {
            return window.workSimActiveConnections[uid].car.voltage;
        }
        return 500;
    }
    if (window.appState && window.appState.pistolDemands && window.appState.pistolDemands[uid]) {
        const s = window.appState.pistolDemands[uid];
        return s.voltage !== undefined ? s.voltage : 500;
    }
    return 500;
}

function calculateSimulation(fields) {
    const activePaths = new Set();
    const contactorPowers = {};
    const contactorCurrents = {};
    const pistolPowers = {};
    const inverterToPaths = {};
    const errorMessages = [];
    const warningMessages = [];
    const invReachesPistol = new Set();
    const invReachedCables = new Set();
    const flowDirections = {};
    
    // Check for duplicate inverter/pistol IDs
    const nameCounts = { inverter: {}, pistol: {} };
    fields.forEach(f => {
        for (let k in f.components) {
            const comp = f.components[k];
            if (comp.type === 'inverter' || comp.type === 'pistol') {
                const nameLower = comp.name.trim().toLowerCase();
                nameCounts[comp.type][nameLower] = (nameCounts[comp.type][nameLower] || 0) + 1;
            }
        }
    });
    
    for (let type in nameCounts) {
        for (let name in nameCounts[type]) {
            if (nameCounts[type][name] > 1) {
                const typeText = type === 'inverter' ? "инверторов" : "пистолетов";
                errorMessages.push(`Найдено несколько ${typeText} с одинаковым ID: "${name.toUpperCase()}"`);
            }
        }
    }

    // Check for duplicate contactor names globally
    const duplicateCtcNames = getContactorNameDuplicates(fields);
    if (duplicateCtcNames.size > 0) {
        duplicateCtcNames.forEach(name => {
            errorMessages.push(`Найдено несколько контакторов с одинаковым именем: "${name.toUpperCase()}"`);
        });
    }

    // Reset stats
    for (let f of fields) {
        for (let c in f.components) {
            if (f.components[c].type === 'pistol') {
                const uid = `${f.id}-${c}`;
                pistolPowers[uid] = 0;
            }
        }
    }

    // 1. Run global propagation BFS per inverter
    fields.forEach(field => {
        for (let key in field.components) {
            const comp = field.components[key];
            if (comp.type === 'inverter') {
                const invPower = getInverterPower(comp, field.id, key);
                const reachedPistols = new Set();
                const pathContactorsForInv = [];
                
                const visitedNodes = new Set();
                const globalQueue = [];
                
                const startParts = key.split('-');
                const startR = parseInt(startParts[0]);
                const startC = parseInt(startParts[1]);
                
                let hasRowWire = false;
                for (let colCheck = 0; colCheck < field.cols; colCheck++) {
                    const cComp = field.components[`${startR}-${colCheck}`];
                    if (cComp && (cComp.type === 'inverter' || (cComp.type === 'cable' && cComp.pos !== 'middle' && cComp.pos !== 'right'))) {
                        hasRowWire = true;
                        break;
                    }
                }
                if (hasRowWire) {
                    if (startC > 0) {
                        const minC = startC - 1;
                        const segIdP = `${field.id}-wire-row-p-seg-${startR}-${minC}`;
                        const segIdN = `${field.id}-wire-row-n-seg-${startR}-${minC}`;
                        globalQueue.push({ 
                            fieldId: field.id, 
                            type: 'row', 
                            r: startR, 
                            c: startC - 1, 
                            prevC: startC, 
                            path: [], 
                            transitionCtcs: [], 
                            segments: [{ id: segIdP, dir: 'left' }],
                            pathElements: [`${field.id}-inv-${startR}`, segIdP, segIdN]
                        });
                    }
                    if (startC < field.cols - 1) {
                        const minC = startC;
                        const segIdP = `${field.id}-wire-row-p-seg-${startR}-${minC}`;
                        const segIdN = `${field.id}-wire-row-n-seg-${startR}-${minC}`;
                        globalQueue.push({ 
                            fieldId: field.id, 
                            type: 'row', 
                            r: startR, 
                            c: startC + 1, 
                            prevC: startC, 
                            path: [], 
                            transitionCtcs: [], 
                            segments: [{ id: segIdP, dir: 'right' }],
                            pathElements: [`${field.id}-inv-${startR}`, segIdP, segIdN]
                        });
                    }
                }
                
                while (globalQueue.length > 0) {
                    const current = globalQueue.shift();
                    const nodeKey = `${current.fieldId}-${current.type}-${current.r}-${current.c}`;
                    if (visitedNodes.has(nodeKey)) continue;
                    visitedNodes.add(nodeKey);
                    
                    const f = fields.find(x => x.id === current.fieldId);
                    if (!f) continue;
                    
                    const cKey = `${current.r}-${current.c}`;
                    const ctc = f.contactors[cKey];
                    const cellComp = f.components[cKey];
                    
                    let currentPath = current.path ? [...current.path] : [];
                    let currentSegments = current.segments || [];
                    let currentElements = current.pathElements ? [...current.pathElements] : [];
                    
                    if (ctc && ctc.closed && (ctc.type === 'horizontal' || ctc.type === 'vertical')) {
                        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                        if (!currentPath.includes(ctcGlobalKey)) {
                            currentPath.push(ctcGlobalKey);
                        }
                        if (!currentElements.includes(ctcGlobalKey)) {
                            currentElements.push(ctcGlobalKey);
                        }
                    }
                    
                    if (cellComp) {
                        if (cellComp.type === 'pistol') {
                            const uid = `${current.fieldId}-${cKey}`;
                            reachedPistols.add(uid);
                            invReachesPistol.add(`${field.id}-${key}`);
                            
                            const pstKey = `${current.fieldId}-pst-${current.c}`;
                            if (!currentElements.includes(pstKey)) {
                                currentElements.push(pstKey);
                            }
                            
                            pathContactorsForInv.push({
                                pistolUid: uid,
                                breakers: currentPath,
                                transitions: current.transitionCtcs || [],
                                segments: currentSegments,
                                pathElements: currentElements
                            });
                        } else if (cellComp.type === 'cable') {
                            const netName = cellComp.name.toLowerCase();
                            invReachedCables.add(`${field.id}-${key}->${netName}`);
                            
                            const cableIn = `${current.fieldId}-cable-in-${cKey}`;
                            const cableOut = `${current.fieldId}-cable-out-${cKey}`;
                            if (!currentElements.includes(cableIn)) currentElements.push(cableIn);
                            if (!currentElements.includes(cableOut)) currentElements.push(cableOut);
                            
                            fields.forEach(otherField => {
                                for (let otherKey in otherField.components) {
                                    const otherComp = otherField.components[otherKey];
                                    if (otherComp.type === 'cable' && otherComp.name.toLowerCase() === netName) {
                                        const otherParts = otherKey.split('-');
                                        const oR = parseInt(otherParts[0]);
                                        const oC = parseInt(otherParts[1]);
                                        
                                        const oCableIn = `${otherField.id}-cable-in-${otherKey}`;
                                        const oCableOut = `${otherField.id}-cable-out-${otherKey}`;
                                        
                                        let oHasRow = false;
                                        if (otherComp.pos === 'middle' || otherComp.pos === 'left' || otherComp.pos === 'right') {
                                            for (let colCheck = 0; colCheck < otherField.cols; colCheck++) {
                                                const cc = otherField.components[`${oR}-${colCheck}`];
                                                if (cc && (cc.type === 'inverter' || (cc.type === 'cable' && cc.pos !== 'middle' && cc.pos !== 'right'))) {
                                                    oHasRow = true;
                                                    break;
                                                }
                                            }
                                        }
                                        let oHasCol = false;
                                        if (otherComp.pos === 'middle' || otherComp.pos === 'top' || otherComp.pos === 'bottom') {
                                            for (let rowCheck = 0; rowCheck < otherField.rows; rowCheck++) {
                                                const rc = otherField.components[`${rowCheck}-${oC}`];
                                                if (rc && (rc.type === 'pistol' || (rc.type === 'cable' && rc.pos !== 'middle' && rc.pos !== 'right'))) {
                                                    oHasCol = true;
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        if (oHasRow && oR > 0 && oR < otherField.rows - 1) {
                                            if (oC > 0) {
                                                const segIdP = `${otherField.id}-wire-row-p-seg-${oR}-${oC - 1}`;
                                                const segIdN = `${otherField.id}-wire-row-n-seg-${oR}-${oC - 1}`;
                                                const nextSegs = [...currentSegments, { id: segIdP, dir: 'left' }];
                                                const nextElements = [...currentElements, oCableIn, oCableOut, segIdP, segIdN];
                                                globalQueue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC - 1, prevC: oC, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                            }
                                            if (oC < otherField.cols - 1) {
                                                const segIdP = `${otherField.id}-wire-row-p-seg-${oR}-${oC}`;
                                                const segIdN = `${otherField.id}-wire-row-n-seg-${oR}-${oC}`;
                                                const nextSegs = [...currentSegments, { id: segIdP, dir: 'right' }];
                                                const nextElements = [...currentElements, oCableIn, oCableOut, segIdP, segIdN];
                                                globalQueue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC + 1, prevC: oC, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                            }
                                        }
                                        if (oHasCol && oC > 0 && oC < otherField.cols - 1) {
                                            if (oR > 0) {
                                                const segIdP = `${otherField.id}-wire-col-p-seg-${oC}-${oR - 1}`;
                                                const segIdN = `${otherField.id}-wire-col-n-seg-${oC}-${oR - 1}`;
                                                const nextSegs = [...currentSegments, { id: segIdP, dir: 'up' }];
                                                const nextElements = [...currentElements, oCableIn, oCableOut, segIdP, segIdN];
                                                globalQueue.push({ fieldId: otherField.id, type: 'col', r: oR - 1, c: oC, prevR: oR, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                            }
                                            if (oR < otherField.rows - 1) {
                                                const segIdP = `${otherField.id}-wire-col-p-seg-${oC}-${oR}`;
                                                const segIdN = `${otherField.id}-wire-col-n-seg-${oC}-${oR}`;
                                                const nextSegs = [...currentSegments, { id: segIdP, dir: 'down' }];
                                                const nextElements = [...currentElements, oCableIn, oCableOut, segIdP, segIdN];
                                                globalQueue.push({ fieldId: otherField.id, type: 'col', r: oR + 1, c: oC, prevR: oR, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                    
                    if (current.type === 'row') {
                        if (ctc && (!ctc.type || ctc.type === 'standard') && ctc.closed) {
                            const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                            const nextTransitionCtcs = current.transitionCtcs ? [...current.transitionCtcs] : [];
                            if (!nextTransitionCtcs.includes(ctcGlobalKey)) {
                                nextTransitionCtcs.push(ctcGlobalKey);
                            }
                            const nextElements = [...currentElements];
                            if (!nextElements.includes(ctcGlobalKey)) {
                                nextElements.push(ctcGlobalKey);
                            }
                            globalQueue.push({ fieldId: current.fieldId, type: 'col', r: current.r, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: nextTransitionCtcs, segments: currentSegments, pathElements: nextElements });
                        }
                        
                        if (current.r > 0 && current.r < f.rows - 1) {
                            if (current.c > 0) {
                                const nextC = current.c - 1;
                                const isBlocked = (ctc && ctc.type === 'horizontal' && !ctc.closed);
                                if (!isBlocked) {
                                    const segIdP = `${current.fieldId}-wire-row-p-seg-${current.r}-${nextC}`;
                                    const segIdN = `${current.fieldId}-wire-row-n-seg-${current.r}-${nextC}`;
                                    const nextSegs = [...currentSegments, { id: segIdP, dir: 'left' }];
                                    
                                    const nextElements = [...currentElements, segIdP, segIdN];
                                    if (ctc && ctc.type === 'horizontal') {
                                        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                                        if (!nextElements.includes(ctcGlobalKey)) nextElements.push(ctcGlobalKey);
                                    }
                                    
                                    globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, prevC: current.c, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                }
                            }
                            if (current.c < f.cols - 1) {
                                const nextC = current.c + 1;
                                const isBlocked = (ctc && ctc.type === 'horizontal' && !ctc.closed);
                                if (!isBlocked) {
                                    const segIdP = `${current.fieldId}-wire-row-p-seg-${current.r}-${current.c}`;
                                    const segIdN = `${current.fieldId}-wire-row-n-seg-${current.r}-${current.c}`;
                                    const nextSegs = [...currentSegments, { id: segIdP, dir: 'right' }];
                                    
                                    const nextElements = [...currentElements, segIdP, segIdN];
                                    if (ctc && ctc.type === 'horizontal') {
                                        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                                        if (!nextElements.includes(ctcGlobalKey)) nextElements.push(ctcGlobalKey);
                                    }
                                    
                                    globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, prevC: current.c, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                }
                            }
                        }
                    } else if (current.type === 'col') {
                        if (ctc && (!ctc.type || ctc.type === 'standard') && ctc.closed) {
                            const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                            const nextTransitionCtcs = current.transitionCtcs ? [...current.transitionCtcs] : [];
                            if (!nextTransitionCtcs.includes(ctcGlobalKey)) {
                                nextTransitionCtcs.push(ctcGlobalKey);
                            }
                            const nextElements = [...currentElements];
                            if (!nextElements.includes(ctcGlobalKey)) {
                                nextElements.push(ctcGlobalKey);
                            }
                            globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: current.c, prevC: current.c, path: currentPath, transitionCtcs: nextTransitionCtcs, segments: currentSegments, pathElements: nextElements });
                        }
                        
                        if (current.c > 0 && current.c < f.cols - 1) {
                            if (current.r > 0) {
                                const nextR = current.r - 1;
                                const isBlocked = (ctc && ctc.type === 'vertical' && !ctc.closed);
                                if (!isBlocked) {
                                    const segIdP = `${current.fieldId}-wire-col-p-seg-${current.c}-${nextR}`;
                                    const segIdN = `${current.fieldId}-wire-col-n-seg-${current.c}-${nextR}`;
                                    const nextSegs = [...currentSegments, { id: segIdP, dir: 'up' }];
                                    
                                    const nextElements = [...currentElements, segIdP, segIdN];
                                    if (ctc && ctc.type === 'vertical') {
                                        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                                        if (!nextElements.includes(ctcGlobalKey)) nextElements.push(ctcGlobalKey);
                                    }
                                    
                                    globalQueue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                }
                            }
                            if (current.r < f.rows - 1) {
                                const nextR = current.r + 1;
                                const isBlocked = (ctc && ctc.type === 'vertical' && !ctc.closed);
                                if (!isBlocked) {
                                    const segIdP = `${current.fieldId}-wire-col-p-seg-${current.c}-${current.r}`;
                                    const segIdN = `${current.fieldId}-wire-col-n-seg-${current.c}-${current.r}`;
                                    const nextSegs = [...currentSegments, { id: segIdP, dir: 'down' }];
                                    
                                    const nextElements = [...currentElements, segIdP, segIdN];
                                    if (ctc && ctc.type === 'vertical') {
                                        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                                        if (!nextElements.includes(ctcGlobalKey)) nextElements.push(ctcGlobalKey);
                                    }
                                    
                                    globalQueue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs, pathElements: nextElements });
                                }
                            }
                        }
                    }
                }
                
                if (reachedPistols.size > 0) {
                    const invGlobalKey = `${field.id}-${key}`;
                    inverterToPaths[invGlobalKey] = pathContactorsForInv;
                }
                
                if (reachedPistols.size > 1) {
                    const names = Array.from(reachedPistols).map(uid => {
                        const parts = uid.split('-');
                        const fId = parseInt(parts[0]);
                        const r = parts[1];
                        const c = parts[2];
                        const f = fields.find(x => x.id === fId);
                        return f ? `${f.components[`${r}-${c}`].name} (Лист ${fields.indexOf(f)+1})` : '';
                    });
                    errorMessages.push(`Инвертор ${comp.name} (Лист ${fields.indexOf(field)+1}) подключен к нескольким пистолетам: ${names.join(', ')}`);
                }
            }
        }
    });

    // Calculate total power generated into each cable net
    const cableNetPowers = {};
    fields.forEach(f => {
        for (let key in f.components) {
            const comp = f.components[key];
            if (comp.type === 'inverter') {
                const invUid = `${f.id}-${key}`;
                if (invReachesPistol.has(invUid)) {
                    const invPower = getInverterPower(comp, f.id, key);
                    const r = parseInt(key.split('-')[0]);
                    for (let c = 0; c < f.cols; c++) {
                        const cc = f.components[`${r}-${c}`];
                        if (cc && cc.type === 'cable') {
                            const netName = cc.name.toLowerCase();
                            cableNetPowers[netName] = (cableNetPowers[netName] || 0) + invPower;
                        }
                    }
                }
            }
        }
    });



    // 3. Multi-Sheet & Multi-Field Universal Ring Power Solver
    const processedInvKeys = new Set();
    
    fields.forEach(startField => {
        for (let key in startField.components) {
            const startComp = startField.components[key];
            if (startComp.type === 'inverter') {
                const invGlobalKey = `${startField.id}-${key}`;
                if (processedInvKeys.has(invGlobalKey)) continue;
                
                const startR = parseInt(key.split('-')[0]);
                
                const ringInverters = [];
                const ringBreakers = [];
                let currField = startField;
                let currR = startR;
                let isClosedRing = false;
                
                for (let step = 0; step < 50; step++) {
                    let invP = 60;
                    for (let cCheck = 0; cCheck < currField.cols; cCheck++) {
                        const ic = currField.components[`${currR}-${cCheck}`];
                        if (ic && ic.type === 'inverter') {
                            invP = getInverterPower(ic, currField.id, `${currR}-${cCheck}`);
                            processedInvKeys.add(`${currField.id}-${currR}-${cCheck}`);
                            break;
                        }
                    }
                    
                    ringInverters.push({ fId: currField.id, r: currR, power: invP });
                    
                    let closedBKey = null;
                    for (let cCheck = 1; cCheck < currField.cols - 1; cCheck++) {
                        const ctc = currField.contactors[`${currR}-${cCheck}`];
                        if (ctc && ctc.type === 'horizontal' && ctc.closed) {
                            closedBKey = `${currField.id}-ctc-${currR}-${cCheck}`;
                            break;
                        }
                    }
                    
                    if (!closedBKey) break;
                    ringBreakers.push(closedBKey);
                    
                    const rightCable = currField.components[`${currR}-${currField.cols - 1}`];
                    if (!rightCable || rightCable.type !== 'cable') break;
                    
                    const netName = rightCable.name.toLowerCase();
                    
                    let nextField = null;
                    let nextR = null;
                    
                    fields.forEach(otherField => {
                        for (let oKey in otherField.components) {
                            const oComp = otherField.components[oKey];
                            if (oComp.type === 'cable' && oComp.name.toLowerCase() === netName) {
                                const oParts = oKey.split('-');
                                const oR = parseInt(oParts[0]);
                                const oC = parseInt(oParts[1]);
                                if (oC === 0 || oC === 1) {
                                    nextField = otherField;
                                    nextR = oR;
                                }
                            }
                        }
                    });
                    
                    if (!nextField || nextR === null) break;
                    
                    if (nextField.id === startField.id && nextR === startR) {
                        isClosedRing = true;
                        break;
                    }
                    
                    currField = nextField;
                    currR = nextR;
                }
                
                if (isClosedRing && ringInverters.length >= 2) {
                    const N = ringInverters.length;
                    let ringTotal = 0;
                    for (let i = 1; i < N; i++) {
                        ringTotal += ringInverters[i].power;
                    }
                    
                    if (!window.ringSolversList) window.ringSolversList = [];
                    window.ringSolversList.push({
                        ringInverters,
                        ringBreakers,
                        ringTotal,
                        loadFId: ringInverters[0].fId,
                        loadR: ringInverters[0].r
                    });
                }
            }
        }
    });

    // ── Load-based actual power and current flow calculation ──
    const pistolToInverters = {};
    for (let invUid in inverterToPaths) {
        inverterToPaths[invUid].forEach(pathData => {
            const pUid = pathData.pistolUid;
            if (!pistolToInverters[pUid]) pistolToInverters[pUid] = [];
            if (!pistolToInverters[pUid].includes(invUid)) {
                pistolToInverters[pUid].push(invUid);
            }
        });
    }

    // Calculate actual power flows using capacity-proportional water filling
    const S_ij = {};
    const remainingCapacity = {};
    fields.forEach(f => {
        for (let k in f.components) {
            const comp = f.components[k];
            if (comp.type === 'inverter') {
                const invUid = `${f.id}-${k}`;
                remainingCapacity[invUid] = getInverterPower(comp, f.id, k);
            }
        }
    });

    const remainingDemand = {};
    for (let pistolUid in pistolToInverters) {
        const parts = pistolUid.split('-');
        remainingDemand[pistolUid] = getPistolDemand(parts[0], `${parts[1]}-${parts[2]}`);
        
        // Pre-initialize S_ij to 0
        pistolToInverters[pistolUid].forEach(invUid => {
            S_ij[`${invUid}->${pistolUid}`] = 0;
        });
    }

    // Run 10 iterations of capacity-proportional water filling
    for (let iter = 0; iter < 10; iter++) {
        for (let pistolUid in pistolToInverters) {
            const connectedInvs = pistolToInverters[pistolUid];
            const demandToDistribute = remainingDemand[pistolUid];
            if (demandToDistribute <= 0.01) continue;

            let sumRemaining = 0;
            connectedInvs.forEach(invUid => {
                sumRemaining += remainingCapacity[invUid];
            });

            if (sumRemaining > 0) {
                connectedInvs.forEach(invUid => {
                    const cap = remainingCapacity[invUid];
                    if (cap <= 0) return;
                    
                    const share = demandToDistribute * (cap / sumRemaining);
                    const allocated = Math.min(cap, share);
                    
                    S_ij[`${invUid}->${pistolUid}`] += allocated;
                    remainingCapacity[invUid] -= allocated;
                    remainingDemand[pistolUid] -= allocated;
                });
            }
        }
    }

    // Calculate inverter real powers
    const inverterRealPowers = {};
    fields.forEach(f => {
        for (let k in f.components) {
            const comp = f.components[k];
            if (comp.type === 'inverter') {
                const invUid = `${f.id}-${k}`;
                const cap = getInverterPower(comp, f.id, k);
                inverterRealPowers[invUid] = cap - (remainingCapacity[invUid] || 0);
            }
        }
    });

    // Calculate actual power received by each pistol
    fields.forEach(f => {
        for (let k in f.components) {
            if (f.components[k].type === 'pistol') {
                pistolPowers[`${f.id}-${k}`] = 0;
            }
        }
    });

    for (let pistolUid in pistolToInverters) {
        const parts = pistolUid.split('-');
        const demandTotal = getPistolDemand(parts[0], `${parts[1]}-${parts[2]}`);
        const pActual = demandTotal - remainingDemand[pistolUid];
        pistolPowers[pistolUid] = pActual;

        // Generate warning messages if any pistol doesn't receive its full requested power
        if (demandTotal > 0 && pActual < demandTotal - 0.01) {
            const fId = parseInt(parts[0]);
            const key = `${parts[1]}-${parts[2]}`;
            const field = fields.find(f => f.id === fId);
            const comp = field ? field.components[key] : null;
            const pName = comp ? comp.name : `Пистолет ${key}`;
            const sheetNum = fields.indexOf(field) + 1;
            const warningMsg = `Не удалось подключить всю мощность для ${pName} (Лист ${sheetNum})! Подключено ${Math.round(pActual * 10) / 10} из ${Math.round(demandTotal * 10) / 10} кВт.`;
            if (!warningMessages.includes(warningMsg)) {
                warningMessages.push(warningMsg);
            }
        }
    }

    // Now, accumulate contactor powers and currents from BFS paths
    for (let invUid in inverterToPaths) {
        // Find connected pistol's voltage for this inverter dynamically
        let invVolt = 0;
        for (let pistolUid in pistolToInverters) {
            if (pistolToInverters[pistolUid].includes(invUid)) {
                const parts = pistolUid.split('-');
                invVolt = getPistolVoltage(parts[0], `${parts[1]}-${parts[2]}`);
                break;
            }
        }

        inverterToPaths[invUid].forEach(pathData => {
            const pUid = pathData.pistolUid;
            const actualPowerFlow = S_ij[`${invUid}->${pUid}`] || 0;
            const actualCurrentFlow = invVolt > 0 ? (actualPowerFlow * 1000) / invVolt : 0;

            // If there is actual power flow (non-zero), add path elements to activePaths
            if (actualPowerFlow > 0) {
                if (pathData.pathElements) {
                    pathData.pathElements.forEach(el => {
                        activePaths.add(el);
                    });
                }
            }

            pathData.breakers.forEach(ctcKey => {
                contactorPowers[ctcKey] = (contactorPowers[ctcKey] || 0) + actualPowerFlow;
                contactorCurrents[ctcKey] = (contactorCurrents[ctcKey] || 0) + actualCurrentFlow;
            });
            pathData.transitions.forEach(ctcKey => {
                contactorPowers[ctcKey] = (contactorPowers[ctcKey] || 0) + actualPowerFlow;
                contactorCurrents[ctcKey] = (contactorCurrents[ctcKey] || 0) + actualCurrentFlow;
            });
            if (pathData.segments) {
                pathData.segments.forEach(seg => {
                    if (actualPowerFlow > 0) {
                        flowDirections[seg.id] = seg.dir;
                    }
                });
            }
        });
    }

    // Process Ring Solvers with actual loads and dynamic voltage
    if (window.ringSolversList) {
        window.ringSolversList.forEach(ring => {
            const { ringInverters, ringBreakers, ringTotal, loadFId, loadR } = ring;
            const N = ringInverters.length;
            
            let ringActualLoad = 0;
            ringInverters.forEach(ri => {
                const riUid = `${ri.fId}-${ri.r}-0`;
                ringActualLoad += inverterRealPowers[riUid] || 0;
            });

            const scale = ringTotal > 0 ? (ringActualLoad / ringTotal) : 0;
            const branchP = (ringTotal / 2) * scale;
            
            // Find ring voltage dynamically from connected pistols
            let ringVolt = 0;
            for (let i = 0; i < N; i++) {
                const riUid = `${ringInverters[i].fId}-${ringInverters[i].r}-0`;
                for (let pistolUid in pistolToInverters) {
                    if (pistolToInverters[pistolUid].includes(riUid)) {
                        const parts = pistolUid.split('-');
                        ringVolt = getPistolVoltage(parts[0], `${parts[1]}-${parts[2]}`);
                        break;
                    }
                }
                if (ringVolt > 0) break;
            }
            
            let cumP = 0;
            ringBreakers.forEach((bKey, idx) => {
                if (idx === 0 || idx === N - 1) {
                    contactorPowers[bKey] = branchP;
                } else {
                    cumP += ringInverters[idx].power * scale;
                    contactorPowers[bKey] = Math.abs(cumP - branchP);
                }
                contactorCurrents[bKey] = ringVolt > 0 ? (contactorPowers[bKey] * 1000) / ringVolt : 0;
                
                if (ringActualLoad > 0) {
                    activePaths.add(bKey);
                }
            });

            const loadF = fields.find(x => x.id === loadFId);
            if (loadF) {
                for (let c = 1; c < loadF.cols - 1; c++) {
                    const ctc = loadF.contactors[`${loadR}-${c}`];
                    if (ctc && (!ctc.type || ctc.type === 'standard') && ctc.closed) {
                        const ctcKey = `${loadFId}-ctc-${loadR}-${c}`;
                        contactorPowers[ctcKey] = ringActualLoad;
                        contactorCurrents[ctcKey] = ringVolt > 0 ? (contactorPowers[ctcKey] * 1000) / ringVolt : 0;
                        
                        if (ringActualLoad > 0) {
                            activePaths.add(ctcKey);
                        }
                    }
                }
            }
        });
        window.ringSolversList = [];
    }

    // Compile dynamic real voltages and currents for inverters to report to table
    const inverterRealVoltages = {};
    const inverterRealCurrents = {};
    fields.forEach(f => {
        for (let k in f.components) {
            const comp = f.components[k];
            if (comp.type === 'inverter') {
                const invUid = `${f.id}-${k}`;
                
                let invVolt = 0;
                for (let pistolUid in pistolToInverters) {
                    if (pistolToInverters[pistolUid].includes(invUid)) {
                        const parts = pistolUid.split('-');
                        invVolt = getPistolVoltage(parts[0], `${parts[1]}-${parts[2]}`);
                        break;
                    }
                }
                
                const realP = inverterRealPowers[invUid] || 0;
                const realI = invVolt > 0 ? (realP * 1000) / invVolt : 0;
                
                inverterRealVoltages[invUid] = invVolt;
                inverterRealCurrents[invUid] = realI;
            }
        }
    });

    if (window.appState && window.appState.routingWarnings) {
        window.appState.routingWarnings.forEach(wrn => {
            if (!warningMessages.includes(wrn)) {
                warningMessages.push(wrn);
            }
        });
    }

    if (window.appState && window.appState.routingErrors) {
        window.appState.routingErrors.forEach(err => {
            if (!errorMessages.includes(err)) {
                errorMessages.push(err);
            }
        });
    }

    return {
        activePaths,
        contactorPowers,
        contactorCurrents,
        pistolPowers,
        errorMessages,
        warningMessages,
        flowDirections,
        invReachesPistol,
        inverterRealPowers,
        inverterRealVoltages,
        inverterRealCurrents,
        inverterToPaths
    };
}

/**
 * Find optimal path from required inverters to a specific pistol.
 * Treats ALL contactors (standard, horizontal breakers, vertical breakers) as closed (traversable)
 * to model the path configuration *regardless* of current simulation state.
 * Supports cross-field cable jumps.
 *
 * @param {Array} fields - All field objects
 * @param {string} pistolUid - Pistol unique ID: "{fieldId}-{r}-{c}"
 */
function findOptimalPath(fields, pistolUid, targetPower, claimedInverters = null, allowedInverters = null, claimedBuses = null) {
    const parts = pistolUid.split('-');
    const pistolFieldId = parseInt(parts[0]);
    const pistolR = parseInt(parts[1]);
    const pistolC = parseInt(parts[2]);

    const pistolField = fields.find(f => f.id === pistolFieldId);
    if (!pistolField) return { pathSegments: new Set(), usedInverters: [], usedContactors: [], usedBuses: new Set(), reachable: false };

    const foundInverters = []; // { uid, name, power, segments, breakers, transitions, cost }
    const visitedNodes = new Set();
    const queue = [];

    // Seed BFS: start in col mode moving upward from the pistol cell
    if (pistolC > 0 && pistolC < pistolField.cols - 1) {
        // Move up from pistol row
        if (pistolR > 1) {
            const nextR = pistolR - 1;
            const segId = `${pistolFieldId}-wire-col-p-seg-${pistolC}-${nextR}`;
            queue.push({ fieldId: pistolFieldId, type: 'col', r: nextR, c: pistolC, segments: [segId], breakers: [], transitions: [], cost: 0 });
        }
        // Move down from pistol row (edge case topologies)
        if (pistolR < pistolField.rows - 2) {
            const nextR = pistolR + 1;
            const segId = `${pistolFieldId}-wire-col-p-seg-${pistolC}-${pistolR}`;
            queue.push({ fieldId: pistolFieldId, type: 'col', r: nextR, c: pistolC, segments: [segId], breakers: [], transitions: [], cost: 0 });
        }
    }

    while (queue.length > 0) {
        const current = queue.shift();
        const nodeKey = `${current.fieldId}-${current.type}-${current.r}-${current.c}`;
        if (visitedNodes.has(nodeKey)) continue;

        // Exclude nodes on claimed/occupied buses (except for the target pistol's own starting column)
        if (claimedBuses) {
            const isTargetPistolCol = (current.fieldId === pistolFieldId && current.c === pistolC && current.type === 'col');
            if (!isTargetPistolCol) {
                if (current.type === 'row' && claimedBuses.has(`${current.fieldId}-row-${current.r}`)) {
                    continue;
                }
                if (current.type === 'col' && claimedBuses.has(`${current.fieldId}-col-${current.c}`)) {
                    continue;
                }
            }
        }

        visitedNodes.add(nodeKey);

        const f = fields.find(x => x.id === current.fieldId);
        if (!f) continue;

        const cKey = `${current.r}-${current.c}`;
        const ctc = f.contactors[cKey];
        const cellComp = f.components[cKey];
        
        let currentBreakers = current.breakers ? [...current.breakers] : [];
        let currentTransitions = current.transitions ? [...current.transitions] : [];
        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;

        // Record breakers only if we traverse them on their respective line type
        if (current.type === 'row') {
            if (ctc && ctc.type === 'horizontal') {
                if (!currentBreakers.includes(ctcGlobalKey)) {
                    currentBreakers.push(ctcGlobalKey);
                }
            }
        } else if (current.type === 'col') {
            if (ctc && ctc.type === 'vertical') {
                if (!currentBreakers.includes(ctcGlobalKey)) {
                    currentBreakers.push(ctcGlobalKey);
                }
            }
        }

        // 1. Found an inverter — record it
        if (cellComp && cellComp.type === 'inverter') {
            const invUid = `${current.fieldId}-${cKey}`;
            if (claimedInverters && claimedInverters.has(invUid)) {
                continue; // Exclude claimed inverters
            }
            if (allowedInverters && !allowedInverters.has(invUid)) {
                continue; // Exclude inverters not in allowed/affinity list
            }
            foundInverters.push({
                uid: invUid,
                name: cellComp.name,
                power: getInverterPower(cellComp, current.fieldId, cKey),
                segments: current.segments,
                breakers: currentBreakers,
                transitions: currentTransitions,
                cost: current.cost
            });
            continue; // Do not propagate beyond the inverter
        }

        // 2. Found a cable — jump to connected sheets (apply jump penalty: 0)
        if (cellComp && cellComp.type === 'cable') {
            const netName = cellComp.name.toLowerCase();
            fields.forEach(otherField => {
                for (let otherKey in otherField.components) {
                    const otherComp = otherField.components[otherKey];
                    if (otherComp.type === 'cable' && otherComp.name.toLowerCase() === netName) {
                        const otherParts = otherKey.split('-');
                        const oR = parseInt(otherParts[0]);
                        const oC = parseInt(otherParts[1]);

                        let oHasRow = false;
                        if (otherComp.pos === 'middle' || otherComp.pos === 'left' || otherComp.pos === 'right') {
                            for (let colCheck = 0; colCheck < otherField.cols; colCheck++) {
                                const cc = otherField.components[`${oR}-${colCheck}`];
                                if (cc && (cc.type === 'inverter' || (cc.type === 'cable' && cc.pos !== 'middle' && cc.pos !== 'right'))) {
                                    oHasRow = true;
                                    break;
                                }
                            }
                        }
                        let oHasCol = false;
                        if (otherComp.pos === 'middle' || otherComp.pos === 'top' || otherComp.pos === 'bottom') {
                            for (let rowCheck = 0; rowCheck < otherField.rows; rowCheck++) {
                                const rc = otherField.components[`${rowCheck}-${oC}`];
                                if (rc && (rc.type === 'pistol' || (rc.type === 'cable' && rc.pos !== 'middle' && rc.pos !== 'right'))) {
                                    oHasCol = true;
                                    break;
                                }
                            }
                        }

                        if (oHasRow && oR > 0 && oR < otherField.rows - 1) {
                            if (oC > 0) {
                                const segId = `${otherField.id}-wire-row-p-seg-${oR}-${oC - 1}`;
                                queue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC - 1, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost });
                            }
                            if (oC < otherField.cols - 1) {
                                const segId = `${otherField.id}-wire-row-p-seg-${oR}-${oC}`;
                                queue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC + 1, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost });
                            }
                        }
                        if (oHasCol && oC > 0 && oC < otherField.cols - 1) {
                            if (oR > 0) {
                                const segId = `${otherField.id}-wire-col-p-seg-${oC}-${oR - 1}`;
                                queue.push({ fieldId: otherField.id, type: 'col', r: oR - 1, c: oC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost });
                            }
                            if (oR < otherField.rows - 1) {
                                const segId = `${otherField.id}-wire-col-p-seg-${oC}-${oR}`;
                                queue.push({ fieldId: otherField.id, type: 'col', r: oR + 1, c: oC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost });
                            }
                        }
                    }
                }
            });
        }

        // 3. Normal grid wire propagation
        if (current.type === 'col') {
            // Standard contactor at this cell → switch to row traversal (traverse standard contactor!)
            if (ctc && (!ctc.type || ctc.type === 'standard')) {
                const rowKey = `${current.fieldId}-row-${current.r}-${current.c}`;
                if (!visitedNodes.has(rowKey)) {
                    const nextTransitions = [...currentTransitions];
                    if (!nextTransitions.includes(ctcGlobalKey)) {
                        nextTransitions.push(ctcGlobalKey);
                    }
                    queue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: current.c, segments: current.segments, breakers: currentBreakers, transitions: nextTransitions, cost: current.cost + 100 });
                }
            }

            // Continue up/down along col wire (apply breaker penalty if traversing a breaker: +100)
            if (current.c > 0 && current.c < f.cols - 1) {
                const breakerPenalty = (ctc && ctc.type === 'vertical') ? 100 : 0;
                // Up
                if (current.r > 1) {
                    const nextR = current.r - 1;
                    const segId = `${current.fieldId}-wire-col-p-seg-${current.c}-${nextR}`;
                    queue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost + breakerPenalty });
                }
                // Down
                if (current.r < f.rows - 2) {
                    const nextR = current.r + 1;
                    const segId = `${current.fieldId}-wire-col-p-seg-${current.c}-${current.r}`;
                    queue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost + breakerPenalty });
                }
            }

        } else if (current.type === 'row') {
            // Standard contactor → switch to col traversal (traverse standard contactor!)
            if (ctc && (!ctc.type || ctc.type === 'standard')) {
                const colKey = `${current.fieldId}-col-${current.r}-${current.c}`;
                if (!visitedNodes.has(colKey)) {
                    const nextTransitions = [...currentTransitions];
                    if (!nextTransitions.includes(ctcGlobalKey)) {
                        nextTransitions.push(ctcGlobalKey);
                    }
                    queue.push({ fieldId: current.fieldId, type: 'col', r: current.r, c: current.c, segments: current.segments, breakers: currentBreakers, transitions: nextTransitions, cost: current.cost + 100 });
                }
            }

            // Continue left/right along row wire (apply breaker penalty if traversing a breaker: +100)
            if (current.r > 0 && current.r < f.rows - 1) {
                const breakerPenalty = (ctc && ctc.type === 'horizontal') ? 100 : 0;
                // Left
                if (current.c > 0) {
                    const nextC = current.c - 1;
                    const segId = `${current.fieldId}-wire-row-p-seg-${current.r}-${nextC}`;
                    queue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost + breakerPenalty });
                }
                // Right
                if (current.c < f.cols - 1) {
                    const nextC = current.c + 1;
                    const segId = `${current.fieldId}-wire-row-p-seg-${current.r}-${current.c}`;
                    queue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions, cost: current.cost + breakerPenalty });
                }
            }
        }
    }

    if (foundInverters.length === 0) {
        return { pathSegments: new Set(), usedInverters: [], usedContactors: [], usedBuses: new Set(), reachable: false };
    }

    // Sort by path cost (fewest cost = closest preferred inverter)
    foundInverters.sort((a, b) => a.cost - b.cost);

    // Select closest inverters whose cumulative power satisfies targetPower
    const selected = [];
    let currentPower = 0;
    for (let idx = 0; idx < foundInverters.length; idx++) {
        const inv = foundInverters[idx];
        selected.push(inv);
        currentPower += inv.power;
        if (currentPower >= targetPower) {
            break;
        }
    }

    // Union all segment IDs and contactors from selected paths
    const pathSegments = new Set();
    const usedContactors = [];
    selected.forEach(inv => {
        inv.segments.forEach(segId => pathSegments.add(segId));
        inv.breakers.forEach(cKey => {
            if (!usedContactors.includes(cKey)) usedContactors.push(cKey);
        });
        inv.transitions.forEach(cKey => {
            if (!usedContactors.includes(cKey)) usedContactors.push(cKey);
        });
    });

    const usedBuses = new Set();
    // Add pistol col
    usedBuses.add(`${pistolFieldId}-col-${pistolC}`);
    
    // Add inverter rows
    selected.forEach(inv => {
        const invParts = inv.uid.split('-');
        usedBuses.add(`${invParts[0]}-row-${invParts[1]}`);
    });
    
    // Add segments
    pathSegments.forEach(segId => {
        const parts = segId.split('-');
        const fId = parts[0];
        if (segId.includes('-row-')) {
            const r = parts[parts.length - 2];
            usedBuses.add(`${fId}-row-${r}`);
        } else if (segId.includes('-col-')) {
            const c = parts[parts.length - 2];
            usedBuses.add(`${fId}-col-${c}`);
        }
    });

    return {
        pathSegments,
        usedInverters: selected.map(inv => ({ uid: inv.uid, name: inv.name, power: inv.power })),
        usedContactors,
        usedBuses,
        reachable: currentPower >= targetPower
    };
}

/**
 * Find globally duplicated contactor names across all fields/sheets.
 * Returns a Set of lowercase duplicate name strings.
 */
function getContactorNameDuplicates(fields) {
    const nameCounts = {};
    const duplicateNames = new Set();
    
    fields.forEach(f => {
        for (let k in f.contactors) {
            const ctc = f.contactors[k];
            if (ctc.nameP) {
                const nP = ctc.nameP.trim().toLowerCase();
                nameCounts[nP] = (nameCounts[nP] || 0) + 1;
            }
            if (ctc.nameN) {
                const nN = ctc.nameN.trim().toLowerCase();
                nameCounts[nN] = (nameCounts[nN] || 0) + 1;
            }
        }
    });
    
    for (let name in nameCounts) {
        if (nameCounts[name] > 1) {
            duplicateNames.add(name);
        }
    }
    
    return duplicateNames;
}


