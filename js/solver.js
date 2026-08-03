/**
 * Pure Simulation Engine for Matrix CAD
 * Calculates electrical graph reachability, Kirchhoff ring balances, 
 * parallel contactor branch power splitting, and pistol power accumulations.
 */

/**
 * Helper to get the actual inverter power dynamically based on user manual V/I inputs.
 */
function getInverterPower(comp, fieldId, key) {
    const defaultMaxPower = comp.power !== undefined ? comp.power : 60;
    const uid = `${fieldId}-${key}`;
    if (window.appState && window.appState.inverterSettings && window.appState.inverterSettings[uid]) {
        const s = window.appState.inverterSettings[uid];
        const v = s.voltage !== undefined ? s.voltage : 500;
        const i = s.current !== undefined ? s.current : (defaultMaxPower * 1000 / 500);
        return (v * i) / 1000;
    }
    return defaultMaxPower;
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
    if (window.appState && window.appState.pistolDemands && window.appState.pistolDemands[uid]) {
        const s = window.appState.pistolDemands[uid];
        const v = s.voltage !== undefined ? s.voltage : 500;
        const i = s.current !== undefined ? s.current : 20;
        return (v * i) / 1000;
    }
    return 10; // default 10 kW
}

function calculateSimulation(fields) {
    const activePaths = new Set();
    const contactorPowers = {};
    const contactorCurrents = {};
    const pistolPowers = {};
    const inverterToPaths = {};
    const errorMessages = [];
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
                
                activePaths.add(`${field.id}-inv-${startR}`);
                
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
                        const segId = `${field.id}-wire-row-p-seg-${startR}-${minC}`;
                        globalQueue.push({ fieldId: field.id, type: 'row', r: startR, c: startC - 1, prevC: startC, path: [], transitionCtcs: [], segments: [{ id: segId, dir: 'left' }] });
                    }
                    if (startC < field.cols - 1) {
                        const minC = startC;
                        const segId = `${field.id}-wire-row-p-seg-${startR}-${minC}`;
                        globalQueue.push({ fieldId: field.id, type: 'row', r: startR, c: startC + 1, prevC: startC, path: [], transitionCtcs: [], segments: [{ id: segId, dir: 'right' }] });
                    }
                }
                
                while (globalQueue.length > 0) {
                    const current = globalQueue.shift();
                    const nodeKey = `${current.fieldId}-${current.type}-${current.r}-${current.c}`;
                    if (visitedNodes.has(nodeKey)) continue;
                    visitedNodes.add(nodeKey);
                    
                    const f = fields.find(x => x.id === current.fieldId);
                    if (!f) continue;
                    
                    if (current.type === 'row' && current.prevC !== undefined) {
                        const minC = Math.min(current.prevC, current.c);
                        activePaths.add(`${current.fieldId}-wire-row-p-seg-${current.r}-${minC}`);
                        activePaths.add(`${current.fieldId}-wire-row-n-seg-${current.r}-${minC}`);
                    } else if (current.type === 'col' && current.prevR !== undefined) {
                        const minR = Math.min(current.prevR, current.r);
                        activePaths.add(`${current.fieldId}-wire-col-p-seg-${current.c}-${minR}`);
                        activePaths.add(`${current.fieldId}-wire-col-n-seg-${current.c}-${minR}`);
                    }
                    
                    const cKey = `${current.r}-${current.c}`;
                    const ctc = f.contactors[cKey];
                    const cellComp = f.components[cKey];
                    let currentPath = current.path ? [...current.path] : [];
                    let currentSegments = current.segments || [];
                    
                    if (ctc && ctc.closed && (ctc.type === 'horizontal' || ctc.type === 'vertical')) {
                        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;
                        if (!currentPath.includes(ctcGlobalKey)) {
                            currentPath.push(ctcGlobalKey);
                        }
                    }
                    
                    if (cellComp) {
                        if (cellComp.type === 'pistol') {
                            activePaths.add(`${current.fieldId}-pst-${current.c}`);
                            const uid = `${current.fieldId}-${cKey}`;
                            reachedPistols.add(uid);
                            invReachesPistol.add(`${field.id}-${key}`);
                            pathContactorsForInv.push({
                                pistolUid: uid,
                                breakers: currentPath,
                                transitions: current.transitionCtcs || [],
                                segments: currentSegments
                            });
                        } else if (cellComp.type === 'cable') {
                            activePaths.add(`${current.fieldId}-cable-out-${cKey}`);
                            activePaths.add(`${current.fieldId}-cable-in-${cKey}`);
                            
                            const netName = cellComp.name.toLowerCase();
                            invReachedCables.add(`${field.id}-${key}->${netName}`);
                            
                            fields.forEach(otherField => {
                                for (let otherKey in otherField.components) {
                                    const otherComp = otherField.components[otherKey];
                                    if (otherComp.type === 'cable' && otherComp.name.toLowerCase() === netName) {
                                        const otherParts = otherKey.split('-');
                                        const oR = parseInt(otherParts[0]);
                                        const oC = parseInt(otherParts[1]);
                                        
                                        activePaths.add(`${otherField.id}-cable-in-${otherKey}`);
                                        activePaths.add(`${otherField.id}-cable-out-${otherKey}`);
                                        
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
                                                const nextSegs = [...currentSegments, { id: segId, dir: 'left' }];
                                                globalQueue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC - 1, prevC: oC, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
                                            }
                                            if (oC < otherField.cols - 1) {
                                                const segId = `${otherField.id}-wire-row-p-seg-${oR}-${oC}`;
                                                const nextSegs = [...currentSegments, { id: segId, dir: 'right' }];
                                                globalQueue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC + 1, prevC: oC, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
                                            }
                                        }
                                        if (oHasCol && oC > 0 && oC < otherField.cols - 1) {
                                            if (oR > 0) {
                                                const segId = `${otherField.id}-wire-col-p-seg-${oC}-${oR - 1}`;
                                                const nextSegs = [...currentSegments, { id: segId, dir: 'up' }];
                                                globalQueue.push({ fieldId: otherField.id, type: 'col', r: oR - 1, c: oC, prevR: oR, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
                                            }
                                            if (oR < otherField.rows - 1) {
                                                const segId = `${otherField.id}-wire-col-p-seg-${oC}-${oR}`;
                                                const nextSegs = [...currentSegments, { id: segId, dir: 'down' }];
                                                globalQueue.push({ fieldId: otherField.id, type: 'col', r: oR + 1, c: oC, prevR: oR, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
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
                            globalQueue.push({ fieldId: current.fieldId, type: 'col', r: current.r, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: nextTransitionCtcs, segments: currentSegments });
                        }
                        
                        if (current.r > 0 && current.r < f.rows - 1) {
                            if (current.c > 0) {
                                const nextC = current.c - 1;
                                const isBlocked = (ctc && ctc.type === 'horizontal' && !ctc.closed);
                                if (!isBlocked) {
                                    const segId = `${current.fieldId}-wire-row-p-seg-${current.r}-${nextC}`;
                                    const nextSegs = [...currentSegments, { id: segId, dir: 'left' }];
                                    globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, prevC: current.c, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
                                }
                            }
                            if (current.c < f.cols - 1) {
                                const nextC = current.c + 1;
                                const isBlocked = (ctc && ctc.type === 'horizontal' && !ctc.closed);
                                if (!isBlocked) {
                                    const segId = `${current.fieldId}-wire-row-p-seg-${current.r}-${current.c}`;
                                    const nextSegs = [...currentSegments, { id: segId, dir: 'right' }];
                                    globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, prevC: current.c, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
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
                            globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: current.c, prevC: current.c, path: currentPath, transitionCtcs: nextTransitionCtcs, segments: currentSegments });
                        }
                        
                        if (current.c > 0 && current.c < f.cols - 1) {
                            if (current.r > 0) {
                                const nextR = current.r - 1;
                                const isBlocked = (ctc && ctc.type === 'vertical' && !ctc.closed);
                                if (!isBlocked) {
                                    const segId = `${current.fieldId}-wire-col-p-seg-${current.c}-${nextR}`;
                                    const nextSegs = [...currentSegments, { id: segId, dir: 'up' }];
                                    globalQueue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
                                }
                            }
                            if (current.r < f.rows - 1) {
                                const nextR = current.r + 1;
                                const isBlocked = (ctc && ctc.type === 'vertical' && !ctc.closed);
                                if (!isBlocked) {
                                    const segId = `${current.fieldId}-wire-col-p-seg-${current.c}-${current.r}`;
                                    const nextSegs = [...currentSegments, { id: segId, dir: 'down' }];
                                    globalQueue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: current.transitionCtcs || [], segments: nextSegs });
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

    // Calculate nominal load drawn from each inverter
    const inverterNominalLoads = {};
    for (let invUid in inverterToPaths) {
        inverterNominalLoads[invUid] = 0;
    }

    for (let pistolUid in pistolToInverters) {
        const parts = pistolUid.split('-');
        const pDemand = getPistolDemand(parts[0], `${parts[1]}-${parts[2]}`);
        const invs = pistolToInverters[pistolUid];
        const N = invs.length;
        if (N > 0) {
            const share = pDemand / N;
            invs.forEach(invUid => {
                inverterNominalLoads[invUid] = (inverterNominalLoads[invUid] || 0) + share;
            });
        }
    }

    // Calculate inverter real powers and scaling factor
    const inverterRealPowers = {};
    const inverterScales = {};
    fields.forEach(f => {
        for (let k in f.components) {
            const comp = f.components[k];
            if (comp.type === 'inverter') {
                const invUid = `${f.id}-${k}`;
                const pConfig = getInverterPower(comp, f.id, k);
                const lNom = inverterNominalLoads[invUid] || 0;
                
                let scale = 1;
                if (lNom > 0) {
                    scale = Math.min(1, pConfig / lNom);
                }
                inverterScales[invUid] = scale;
                inverterRealPowers[invUid] = lNom * scale;
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

    const S_ij = {};
    for (let pistolUid in pistolToInverters) {
        const parts = pistolUid.split('-');
        const pDemand = getPistolDemand(parts[0], `${parts[1]}-${parts[2]}`);
        const invs = pistolToInverters[pistolUid];
        const N = invs.length;
        
        let pActual = 0;
        if (N > 0) {
            invs.forEach(invUid => {
                const scale = inverterScales[invUid] || 1;
                const share = (pDemand / N) * scale;
                S_ij[`${invUid}->${pistolUid}`] = share;
                pActual += share;
            });
        }
        pistolPowers[pistolUid] = pActual;
    }

    // Now, accumulate contactor powers and currents from BFS paths
    for (let invUid in inverterToPaths) {
        const parts = invUid.split('-');
        const fId = parseInt(parts[0]);
        const r = parseInt(parts[1].split('-')[0]); // inverter row
        const invVolt = getInverterVoltage(fields, fId, r);

        inverterToPaths[invUid].forEach(pathData => {
            const pUid = pathData.pistolUid;
            const actualPowerFlow = S_ij[`${invUid}->${pUid}`] || 0;
            const actualCurrentFlow = invVolt > 0 ? (actualPowerFlow * 1000) / invVolt : 0;

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
                    flowDirections[seg.id] = seg.dir;
                });
            }
        });
    }

    // Process Ring Solvers with actual loads
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
            const ringVolt = getInverterVoltage(fields, ringInverters[0].fId, ringInverters[0].r);
            
            let cumP = 0;
            ringBreakers.forEach((bKey, idx) => {
                if (idx === 0 || idx === N - 1) {
                    contactorPowers[bKey] = branchP;
                } else {
                    cumP += ringInverters[idx].power * scale;
                    contactorPowers[bKey] = Math.abs(cumP - branchP);
                }
                contactorCurrents[bKey] = ringVolt > 0 ? (contactorPowers[bKey] * 1000) / ringVolt : 0;
            });

            const loadF = fields.find(x => x.id === loadFId);
            if (loadF) {
                for (let c = 1; c < loadF.cols - 1; c++) {
                    const ctc = loadF.contactors[`${loadR}-${c}`];
                    if (ctc && (!ctc.type || ctc.type === 'standard') && ctc.closed) {
                        const ctcKey = `${loadFId}-ctc-${loadR}-${c}`;
                        contactorPowers[ctcKey] = ringActualLoad;
                        const ringVolt = getInverterVoltage(fields, loadFId, loadR);
                        contactorCurrents[ctcKey] = ringVolt > 0 ? (contactorPowers[ctcKey] * 1000) / ringVolt : 0;
                    }
                }
            }
        });
        window.ringSolversList = [];
    }

    return {
        activePaths,
        contactorPowers,
        contactorCurrents,
        pistolPowers,
        errorMessages,
        flowDirections,
        invReachesPistol,
        inverterRealPowers
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
 * @param {number} numInverters - How many inverters we need
 * @returns {{ pathSegments: Set<string>, usedInverters: Array, reachable: boolean }}
 */
function findOptimalPath(fields, pistolUid, numInverters, claimedInverters = null) {
    const parts = pistolUid.split('-');
    const pistolFieldId = parseInt(parts[0]);
    const pistolR = parseInt(parts[1]);
    const pistolC = parseInt(parts[2]);

    const pistolField = fields.find(f => f.id === pistolFieldId);
    if (!pistolField) return { pathSegments: new Set(), usedInverters: [], usedContactors: [], reachable: false };

    const foundInverters = []; // { uid, name, power, segments, breakers, transitions, hops }
    const visitedNodes = new Set();
    const queue = [];

    // Seed BFS: start in col mode moving upward from the pistol cell
    if (pistolC > 0 && pistolC < pistolField.cols - 1) {
        // Move up from pistol row
        if (pistolR > 1) {
            const nextR = pistolR - 1;
            const segId = `${pistolFieldId}-wire-col-p-seg-${pistolC}-${nextR}`;
            queue.push({ fieldId: pistolFieldId, type: 'col', r: nextR, c: pistolC, segments: [segId], breakers: [], transitions: [] });
        }
        // Move down from pistol row (edge case topologies)
        if (pistolR < pistolField.rows - 2) {
            const nextR = pistolR + 1;
            const segId = `${pistolFieldId}-wire-col-p-seg-${pistolC}-${pistolR}`;
            queue.push({ fieldId: pistolFieldId, type: 'col', r: nextR, c: pistolC, segments: [segId], breakers: [], transitions: [] });
        }
    }

    while (queue.length > 0) {
        const current = queue.shift();
        const nodeKey = `${current.fieldId}-${current.type}-${current.r}-${current.c}`;
        if (visitedNodes.has(nodeKey)) continue;
        visitedNodes.add(nodeKey);

        const f = fields.find(x => x.id === current.fieldId);
        if (!f) continue;

        const cKey = `${current.r}-${current.c}`;
        const ctc = f.contactors[cKey];
        const cellComp = f.components[cKey];
        
        let currentBreakers = current.breakers ? [...current.breakers] : [];
        let currentTransitions = current.transitions ? [...current.transitions] : [];
        const ctcGlobalKey = `${current.fieldId}-ctc-${cKey}`;

        if (ctc && (ctc.type === 'horizontal' || ctc.type === 'vertical')) {
            if (!currentBreakers.includes(ctcGlobalKey)) {
                currentBreakers.push(ctcGlobalKey);
            }
        } else if (ctc && (!ctc.type || ctc.type === 'standard')) {
            if (!currentTransitions.includes(ctcGlobalKey)) {
                currentTransitions.push(ctcGlobalKey);
            }
        }

        // 1. Found an inverter — record it
        if (cellComp && cellComp.type === 'inverter') {
            const invUid = `${current.fieldId}-${cKey}`;
            if (claimedInverters && claimedInverters.has(invUid)) {
                continue; // Exclude claimed inverters
            }
            foundInverters.push({
                uid: invUid,
                name: cellComp.name,
                power: getInverterPower(cellComp, current.fieldId, cKey),
                segments: current.segments,
                breakers: currentBreakers,
                transitions: currentTransitions,
                hops: current.segments.length
            });
            continue; // Do not propagate beyond the inverter
        }

        // 2. Found a cable — jump to connected sheets
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
                                queue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC - 1, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                            }
                            if (oC < otherField.cols - 1) {
                                const segId = `${otherField.id}-wire-row-p-seg-${oR}-${oC}`;
                                queue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC + 1, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                            }
                        }
                        if (oHasCol && oC > 0 && oC < otherField.cols - 1) {
                            if (oR > 0) {
                                const segId = `${otherField.id}-wire-col-p-seg-${oC}-${oR - 1}`;
                                queue.push({ fieldId: otherField.id, type: 'col', r: oR - 1, c: oC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                            }
                            if (oR < otherField.rows - 1) {
                                const segId = `${otherField.id}-wire-col-p-seg-${oC}-${oR}`;
                                queue.push({ fieldId: otherField.id, type: 'col', r: oR + 1, c: oC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                            }
                        }
                    }
                }
            });
        }

        // 3. Normal grid wire propagation
        if (current.type === 'col') {
            // Standard contactor at this cell → can switch to row traversal (ignore ctc.closed!)
            if (ctc && (!ctc.type || ctc.type === 'standard')) {
                const rowKey = `${current.fieldId}-row-${current.r}-${current.c}`;
                if (!visitedNodes.has(rowKey)) {
                    queue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: current.c, segments: current.segments, breakers: currentBreakers, transitions: currentTransitions });
                }
            }

            // Continue up/down along col wire (ignore vertical breaker closed/open state)
            if (current.c > 0 && current.c < f.cols - 1) {
                // Up
                if (current.r > 1) {
                    const nextR = current.r - 1;
                    const segId = `${current.fieldId}-wire-col-p-seg-${current.c}-${nextR}`;
                    queue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                }
                // Down
                if (current.r < f.rows - 2) {
                    const nextR = current.r + 1;
                    const segId = `${current.fieldId}-wire-col-p-seg-${current.c}-${current.r}`;
                    queue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                }
            }

        } else if (current.type === 'row') {
            // Standard contactor → switch to col traversal (ignore ctc.closed!)
            if (ctc && (!ctc.type || ctc.type === 'standard')) {
                const colKey = `${current.fieldId}-col-${current.r}-${current.c}`;
                if (!visitedNodes.has(colKey)) {
                    queue.push({ fieldId: current.fieldId, type: 'col', r: current.r, c: current.c, segments: current.segments, breakers: currentBreakers, transitions: currentTransitions });
                }
            }

            // Continue left/right along row wire (ignore horizontal breaker closed/open state)
            if (current.r > 0 && current.r < f.rows - 1) {
                // Left
                if (current.c > 0) {
                    const nextC = current.c - 1;
                    const segId = `${current.fieldId}-wire-row-p-seg-${current.r}-${nextC}`;
                    queue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                }
                // Right
                if (current.c < f.cols - 1) {
                    const nextC = current.c + 1;
                    const segId = `${current.fieldId}-wire-row-p-seg-${current.r}-${current.c}`;
                    queue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, segments: [...current.segments, segId], breakers: currentBreakers, transitions: currentTransitions });
                }
            }
        }
    }

    if (foundInverters.length === 0) {
        return { pathSegments: new Set(), usedInverters: [], usedContactors: [], reachable: false };
    }

    // Sort by path length (fewest hops = closest inverter)
    foundInverters.sort((a, b) => a.hops - b.hops);

    // Take the closest numInverters
    const selected = foundInverters.slice(0, numInverters);

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

    return {
        pathSegments,
        usedInverters: selected.map(inv => ({ uid: inv.uid, name: inv.name, power: inv.power })),
        usedContactors,
        reachable: selected.length >= numInverters
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


