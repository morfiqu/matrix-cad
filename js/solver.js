/**
 * Pure Simulation Engine for Matrix CAD
 * Calculates electrical graph reachability, Kirchhoff ring balances, 
 * parallel contactor branch power splitting, and pistol power accumulations.
 */

function calculateSimulation(fields) {
    const activePaths = new Set();
    const contactorPowers = {};
    const pistolPowers = {};
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
                const invPower = comp.power !== undefined ? comp.power : 60;
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
                    if (startC > 0) globalQueue.push({ fieldId: field.id, type: 'row', r: startR, c: startC - 1, prevC: startC, path: [], transitionCtcs: [] });
                    if (startC < field.cols - 1) globalQueue.push({ fieldId: field.id, type: 'row', r: startR, c: startC + 1, prevC: startC, path: [], transitionCtcs: [] });
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
                        const direction = current.c > current.prevC ? 'right' : 'left';
                        flowDirections[`${current.fieldId}-wire-row-p-seg-${current.r}-${minC}`] = direction;
                        flowDirections[`${current.fieldId}-wire-row-n-seg-${current.r}-${minC}`] = direction;
                    } else if (current.type === 'col' && current.prevR !== undefined) {
                        const minR = Math.min(current.prevR, current.r);
                        activePaths.add(`${current.fieldId}-wire-col-p-seg-${current.c}-${minR}`);
                        activePaths.add(`${current.fieldId}-wire-col-n-seg-${current.c}-${minR}`);
                        const direction = current.r > current.prevR ? 'down' : 'up';
                        flowDirections[`${current.fieldId}-wire-col-p-seg-${current.c}-${minR}`] = direction;
                        flowDirections[`${current.fieldId}-wire-col-n-seg-${current.c}-${minR}`] = direction;
                    }
                    
                    const cKey = `${current.r}-${current.c}`;
                    const ctc = f.contactors[cKey];
                    const cellComp = f.components[cKey];
                    let currentPath = current.path ? [...current.path] : [];
                    
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
                            pistolPowers[uid] = (pistolPowers[uid] || 0) + invPower;
                            reachedPistols.add(`${current.fieldId}-${cKey}`);
                            invReachesPistol.add(`${field.id}-${key}`);
                            pathContactorsForInv.push({
                                breakers: currentPath,
                                transitions: current.transitionCtcs || []
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
                                            if (oC > 0) globalQueue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC - 1, prevC: oC, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
                                            if (oC < otherField.cols - 1) globalQueue.push({ fieldId: otherField.id, type: 'row', r: oR, c: oC + 1, prevC: oC, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
                                        }
                                        if (oHasCol && oC > 0 && oC < otherField.cols - 1) {
                                            if (oR > 0) globalQueue.push({ fieldId: otherField.id, type: 'col', r: oR - 1, c: oC, prevR: oR, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
                                            if (oR < otherField.rows - 1) globalQueue.push({ fieldId: otherField.id, type: 'col', r: oR + 1, c: oC, prevR: oR, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
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
                            globalQueue.push({ fieldId: current.fieldId, type: 'col', r: current.r, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: nextTransitionCtcs });
                        }
                        
                        if (current.r > 0 && current.r < f.rows - 1) {
                            if (current.c > 0) {
                                const nextC = current.c - 1;
                                const isBlocked = (ctc && ctc.type === 'horizontal' && !ctc.closed);
                                if (!isBlocked) {
                                    globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, prevC: current.c, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
                                }
                            }
                            if (current.c < f.cols - 1) {
                                const nextC = current.c + 1;
                                const isBlocked = (ctc && ctc.type === 'horizontal' && !ctc.closed);
                                if (!isBlocked) {
                                    globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: nextC, prevC: current.c, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
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
                            globalQueue.push({ fieldId: current.fieldId, type: 'row', r: current.r, c: current.c, prevC: current.c, path: currentPath, transitionCtcs: nextTransitionCtcs });
                        }
                        
                        if (current.c > 0 && current.c < f.cols - 1) {
                            if (current.r > 0) {
                                const nextR = current.r - 1;
                                const isBlocked = (ctc && ctc.type === 'vertical' && !ctc.closed);
                                if (!isBlocked) {
                                    globalQueue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
                                }
                            }
                            if (current.r < f.rows - 1) {
                                const nextR = current.r + 1;
                                const isBlocked = (ctc && ctc.type === 'vertical' && !ctc.closed);
                                if (!isBlocked) {
                                    globalQueue.push({ fieldId: current.fieldId, type: 'col', r: nextR, c: current.c, prevR: current.r, path: currentPath, transitionCtcs: current.transitionCtcs || [] });
                                }
                            }
                        }
                    }
                }

                if (reachedPistols.size > 0) {
                    pathContactorsForInv.forEach(pathData => {
                        pathData.breakers.forEach(ctcKey => {
                            contactorPowers[ctcKey] = (contactorPowers[ctcKey] || 0) + invPower;
                        });
                        pathData.transitions.forEach(ctcKey => {
                            contactorPowers[ctcKey] = (contactorPowers[ctcKey] || 0) + invPower;
                        });
                    });
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
                    const invPower = comp.power !== undefined ? comp.power : 60;
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
                            invP = ic.power !== undefined ? ic.power : 60;
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
                    const branchP = ringTotal / 2;
                    
                    let cumP = 0;
                    ringBreakers.forEach((bKey, idx) => {
                        if (idx === 0 || idx === N - 1) {
                            contactorPowers[bKey] = branchP;
                        } else {
                            cumP += ringInverters[idx].power;
                            contactorPowers[bKey] = Math.abs(cumP - branchP);
                        }
                    });

                    const loadFId = ringInverters[0].fId;
                    const loadR = ringInverters[0].r;
                    const loadF = fields.find(x => x.id === loadFId);
                    if (loadF) {
                        for (let c = 1; c < loadF.cols - 1; c++) {
                            const ctc = loadF.contactors[`${loadR}-${c}`];
                            if (ctc && (!ctc.type || ctc.type === 'standard') && ctc.closed) {
                                const ctcKey = `${loadFId}-ctc-${loadR}-${c}`;
                                contactorPowers[ctcKey] = ringInverters[0].power + ringTotal;
                            }
                        }
                    }
                }
            }
        }
    });

    return {
        activePaths,
        contactorPowers,
        pistolPowers,
        errorMessages,
        flowDirections
    };
}
