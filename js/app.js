const appState = createInitialState();
window.appState = appState;

let isDraggingGroup = false;
let draggedFieldId = null;
let dragStartCell = null;
let initialComponents = null;
let initialContactors = null;
let initialSelectedKeys = null;
let lastValidComponents = null;
let lastValidContactors = null;
let lastValidSelectedKeys = null;
let lastCompClickTime = 0;
let lastCompClickKey = null;

function updateCanvas() {
    const fieldsList = document.getElementById('fields-list');
    if (!fieldsList) return;
    
    fieldsList.innerHTML = '';
    
    let simulationData = { activePaths: new Set(), contactorPowers: {}, pistolPowers: {}, errorMessages: [] };
    
    if (appState.isSimulationMode) {
        simulationData = calculateSimulation(appState.fields);
    }
    
    appState.fields.forEach((field, index) => {
        const fieldRowContainer = document.createElement('div');
        fieldRowContainer.className = 'field-row-container';
        fieldRowContainer.id = `field-container-${field.id}`;
        
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'field-scroll-wrapper';
        scrollWrapper.style.flex = '1';
        scrollWrapper.style.minWidth = '0';
        scrollWrapper.style.overflowX = 'auto';
        fieldRowContainer.appendChild(scrollWrapper);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = `cad-svg-${field.id}`;
        svg.className = 'cad-svg';
        scrollWrapper.appendChild(svg);

        if (!appState.isSimulationMode && index > 0) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn danger';
            delBtn.style.width = '44px';
            delBtn.style.height = '44px';
            delBtn.style.padding = '0';
            delBtn.style.fontSize = '18px';
            delBtn.style.flexShrink = '0';
            delBtn.innerHTML = '🗑️';
            delBtn.onclick = () => deleteField(field.id);
            fieldRowContainer.appendChild(delBtn);
        }
        
        fieldsList.appendChild(fieldRowContainer);
        
        const renderState = {
            activePaths: simulationData.activePaths,
            contactorPowers: simulationData.contactorPowers,
            pistolPowers: simulationData.pistolPowers,
            isSimulationMode: appState.isSimulationMode,
            showPowerFlow: appState.showPowerFlow,
            selectedKeys: appState.selectedKeys,
            activeTool: appState.activeTool,
            onUpdateCanvas: updateCanvas,
            onSaveHistoryState: () => saveHistoryState(appState),
            onCellClick: (e, fId, r, c) => handleCellClick(fId, r, c),
            onAdjustSize: (fId, type, delta) => adjustSize(fId, type, delta),
            onInsertCol: (f, c) => insertColAtIndex(f, c),
            onDeleteCol: (f, c) => deleteColAtIndex(f, c),
            onInsertRow: (f, r) => insertRowAtIndex(f, r),
            onDeleteRow: (f, r) => deleteRowAtIndex(f, r),
            onCompMouseDown: (e, fId, r, c, type, key) => handleCompMouseDown(e, fId, r, c, type, key),
            onCompDblClick: (e, fId, r, c, type, key) => handleCompDblClick(e, fId, r, c, type, key),
            onCompContextMenu: (e, fId, r, c, type, key) => handleCompContextMenu(e, fId, r, c, type, key),
            onCtcMouseDown: (e, fId, r, c, type, key, ctc) => handleCtcMouseDown(e, fId, r, c, type, key, ctc),
            onCtcContextMenu: (e, fId, r, c, type, key) => handleCtcContextMenu(e, fId, r, c, type, key)
        };
        
        renderField(field, svg, simulationData, renderState);
    });
    
    updateSidebarStats(simulationData);
}

function setTool(tool) {
    if (appState.isSimulationMode) return;
    const isAlreadyActive = (appState.activeTool === tool);
    const nextTool = isAlreadyActive ? 'select' : tool;
    
    appState.activeTool = nextTool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    
    if (nextTool !== 'select') {
        document.getElementById(`tool-${nextTool}`)?.classList.add('active');
    }
}

function handleCellClick(fieldId, r, c) {
    if (appState.isSimulationMode) return;
    const field = appState.fields.find(f => f.id === fieldId);
    if (!field) return;
    const key = `${r}-${c}`;
    
    if (appState.activeTool === 'select') {
        appState.selectedKeys.clear();
        updateCanvas();
        return;
    }
    
    if (field.components[key] || field.contactors[key]) return;
    
    if (appState.activeTool === 'inverter') {
        if (c === 0 && r > 0 && r < field.rows - 1) {
            const defaultNum = getLowestAvailableIndexGlobal('inverter');
            field.components[key] = { type: 'inverter', name: `Inv ${defaultNum}`, power: appState.lastEditedInverterPower, pos: 'left' };
        } else {
            alert("Инвертор можно размещать только на левом поле (столбец 0)!");
            return;
        }
    } else if (appState.activeTool === 'pistol') {
        if (r === field.rows - 1 && c > 0 && c < field.cols - 1) {
            const defaultNum = getLowestAvailableIndexGlobal('pistol');
            field.components[key] = { type: 'pistol', name: `P ${defaultNum}`, pos: 'bottom' };
        } else {
            alert("Зарядный пистолет можно размещать только на нижнем поле (строка R)!");
            return;
        }
    } else if (appState.activeTool === 'cable') {
        let pos = 'middle';
        if (c === 0) pos = 'left';
        else if (c === field.cols - 1) pos = 'right';
        else if (r === 0) pos = 'top';
        else if (r === field.rows - 1) pos = 'bottom';
        const defaultNum = getLowestAvailableIndexGlobal('cable');
        field.components[key] = { type: 'cable', name: `C${defaultNum}`, pos: pos };
    } else if (appState.activeTool === 'contactor') {
        if (r > 0 && r < field.rows - 1 && c > 0 && c < field.cols - 1) {
            field.contactors[key] = { type: 'standard', closed: false };
        }
    } else if (appState.activeTool === 'breaker') {
        if (r > 0 && r < field.rows - 1 && c > 0 && c < field.cols - 1) {
            field.contactors[key] = { type: 'horizontal', closed: false };
        }
    }
    
    saveHistoryState(appState);
    updateCanvas();
}

function handleCompMouseDown(e, fId, r, c, type, key) {
    if (appState.isSimulationMode) return;
    if (e.button !== 0) return;
    if (appState.activeTool === 'select') {
        const now = Date.now();
        if (lastCompClickKey === key && (now - lastCompClickTime) < 350) {
            e.stopPropagation();
            lastCompClickTime = 0;
            lastCompClickKey = null;
            if (!appState.selectedKeys.has(key)) {
                appState.selectedKeys.clear();
                appState.selectedKeys.add(key);
                updateCanvas();
            }
            openPropertiesForSelected();
            return;
        }
        lastCompClickTime = now;
        lastCompClickKey = key;
        startGroupDrag(e, fId, r, c, 'comp');
    }
}

function handleCompDblClick(e, fId, r, c, type, key) {
    e.stopPropagation();
    if (appState.isSimulationMode) return;
    if (appState.activeTool === 'select') {
        if (!appState.selectedKeys.has(key)) {
            appState.selectedKeys.clear();
            appState.selectedKeys.add(key);
            updateCanvas();
        }
        openPropertiesForSelected();
    }
}

function handleCompContextMenu(e, fId, r, c, type, key) {
    e.preventDefault();
    e.stopPropagation();
    if (appState.isSimulationMode) return;
    if (appState.activeTool === 'select') {
        if (!appState.selectedKeys.has(key)) {
            if (e.ctrlKey || e.metaKey) {
                appState.selectedKeys.add(key);
            } else {
                appState.selectedKeys.clear();
                appState.selectedKeys.add(key);
            }
            updateCanvas();
        }
        const menu = document.getElementById('custom-context-menu');
        if (menu) {
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
            menu.style.display = 'block';
            
            let compsCount = 0;
            appState.selectedKeys.forEach(k => {
                if (k.includes('-comp-')) compsCount++;
            });
            const renumberBtn = document.getElementById('ctx-renumber-btn');
            if (renumberBtn) {
                renumberBtn.style.display = compsCount > 1 ? 'block' : 'none';
            }
        }
    }
}

function handleCtcMouseDown(e, fId, r, c, type, key, ctc) {
    e.stopPropagation();
    if (appState.isSimulationMode) {
        ctc.closed = !ctc.closed;
        updateCanvas();
    } else {
        if (appState.activeTool === 'select') {
            startGroupDrag(e, fId, r, c, 'ctc');
        }
    }
}

function handleCtcContextMenu(e, fId, r, c, type, key) {
    e.preventDefault();
    e.stopPropagation();
    if (appState.isSimulationMode) return;
    if (appState.activeTool === 'select') {
        if (!appState.selectedKeys.has(key)) {
            if (e.ctrlKey || e.metaKey) {
                appState.selectedKeys.add(key);
            } else {
                appState.selectedKeys.clear();
                appState.selectedKeys.add(key);
            }
            updateCanvas();
        }
        const menu = document.getElementById('custom-context-menu');
        if (menu) {
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
            menu.style.display = 'block';
            const renumberBtn = document.getElementById('ctx-renumber-btn');
            if (renumberBtn) renumberBtn.style.display = 'none';
        }
    }
}

function startGroupDrag(e, fieldId, startR, startC, startType) {
    if (appState.isSimulationMode || appState.activeTool !== 'select') return;
    e.stopPropagation();
    
    const field = appState.fields.find(f => f.id === fieldId);
    if (!field) return;
    
    const clickedKey = `${startR}-${startC}`;
    const clickedSelectionKey = `${fieldId}-${startType}-${clickedKey}`;
    let shouldDeselectOnMouseUp = false;
    
    const svgEl = document.getElementById(`cad-svg-${fieldId}`);
    if (!svgEl) return;

    if (!appState.selectedKeys.has(clickedSelectionKey)) {
        if (!e.ctrlKey && !e.metaKey) {
            appState.selectedKeys.clear();
        }
        appState.selectedKeys.add(clickedSelectionKey);
        updateCanvas();
    } else {
        if (e.ctrlKey || e.metaKey) {
            shouldDeselectOnMouseUp = true;
        }
    }
    
    isDraggingGroup = true;
    draggedFieldId = fieldId;
    dragStartCell = { r: startR, c: startC, type: startType };
    initialComponents = JSON.parse(JSON.stringify(field.components));
    initialContactors = JSON.parse(JSON.stringify(field.contactors));
    initialSelectedKeys = new Set(appState.selectedKeys);
    
    lastValidComponents = JSON.parse(JSON.stringify(field.components));
    lastValidContactors = JSON.parse(JSON.stringify(field.contactors));
    lastValidSelectedKeys = new Set(appState.selectedKeys);
    
    const draggedItems = [];
    initialSelectedKeys.forEach(sKey => {
        const parts = sKey.split('-');
        const fId = parseInt(parts[0]);
        if (fId === fieldId) {
            const type = parts[1];
            const r = parseInt(parts[2]);
            const c = parseInt(parts[3]);
            draggedItems.push({ sKey, type, r, c });
        }
    });
    
    let lastRow = startR;
    let lastCol = startC;
    
    const onMouseMove = (ev) => {
        if (!isDraggingGroup) return;
        
        const svgEl = document.getElementById(`cad-svg-${fieldId}`);
        if (!svgEl) return;
        
        const rect = svgEl.getBoundingClientRect();
        const mouseX = ev.clientX - rect.left;
        const mouseY = ev.clientY - rect.top;
        
        const currentCol = Math.round((mouseX - marginX) / cellWidth);
        const currentRow = Math.round((mouseY - marginY) / cellHeight);
        
        if (currentCol === lastCol && currentRow === lastRow) return;
        lastCol = currentCol;
        lastRow = currentRow;
        
        const deltaR = currentRow - dragStartCell.r;
        const deltaC = currentCol - dragStartCell.c;
        
        if (deltaR === 0 && deltaC === 0) {
            field.components = JSON.parse(JSON.stringify(initialComponents));
            field.contactors = JSON.parse(JSON.stringify(initialContactors));
            appState.selectedKeys = new Set(initialSelectedKeys);
            updateCanvas();
            
            lastValidComponents = JSON.parse(JSON.stringify(initialComponents));
            lastValidContactors = JSON.parse(JSON.stringify(initialContactors));
            lastValidSelectedKeys = new Set(initialSelectedKeys);
            return;
        }
        
        let isValidMove = true;
        const newComponents = {};
        const newContactors = {};
        const newSelectedKeys = new Set();
        
        const draggedCompKeys = new Set();
        const draggedCtcKeys = new Set();
        draggedItems.forEach(item => {
            if (item.type === 'comp') draggedCompKeys.add(`${item.r}-${item.c}`);
            if (item.type === 'ctc') draggedCtcKeys.add(`${item.r}-${item.c}`);
        });
        
        for (let k in initialComponents) {
            if (!draggedCompKeys.has(k)) newComponents[k] = initialComponents[k];
        }
        for (let k in initialContactors) {
            if (!draggedCtcKeys.has(k)) newContactors[k] = initialContactors[k];
        }
        
        const targetKeysUsed = new Set();
        for (let i = 0; i < draggedItems.length; i++) {
            const item = draggedItems[i];
            const targetR = item.r + deltaR;
            const targetC = item.c + deltaC;
            const targetKey = `${targetR}-${targetC}`;
            
            if (targetR < 0 || targetR >= field.rows || targetC < 0 || targetC >= field.cols) {
                isValidMove = false;
                break;
            }
            
            const isCorner = (targetC === 0 && targetR === 0) || 
                             (targetC === field.cols - 1 && targetR === 0) || 
                             (targetC === 0 && targetR === field.rows - 1) || 
                             (targetC === field.cols - 1 && targetR === field.rows - 1);
            if (isCorner) {
                isValidMove = false;
                break;
            }
            
            if (item.type === 'comp') {
                if (newComponents[targetKey] || newContactors[targetKey] || targetKeysUsed.has(targetKey)) {
                    isValidMove = false;
                    break;
                }
                targetKeysUsed.add(targetKey);
                
                const compData = initialComponents[`${item.r}-${item.c}`];
                let newPos = compData.pos;
                if (compData.type === 'cable') {
                    if (targetC === 0) newPos = 'left';
                    else if (targetC === field.cols - 1) newPos = 'right';
                    else if (targetR === 0) newPos = 'top';
                    else if (targetR === field.rows - 1) newPos = 'bottom';
                    else newPos = 'middle';
                }
                
                newComponents[targetKey] = { ...compData, pos: newPos };
                newSelectedKeys.add(`${fieldId}-comp-${targetKey}`);
            } else if (item.type === 'ctc') {
                if (newComponents[targetKey] || newContactors[targetKey] || targetKeysUsed.has(targetKey)) {
                    isValidMove = false;
                    break;
                }
                targetKeysUsed.add(targetKey);
                
                const ctcData = initialContactors[`${item.r}-${item.c}`];
                newContactors[targetKey] = ctcData;
                newSelectedKeys.add(`${fieldId}-ctc-${targetKey}`);
            }
        }
        
        if (isValidMove) {
            for (let i = 0; i < draggedItems.length; i++) {
                const item = draggedItems[i];
                const targetR = item.r + deltaR;
                const targetC = item.c + deltaC;
                
                if (item.type === 'comp') {
                    const compData = newComponents[`${targetR}-${targetC}`];
                    if (compData.type === 'inverter') {
                        if (targetC !== 0 || targetR <= 0 || targetR >= field.rows - 1) {
                            isValidMove = false;
                            break;
                        }
                    } else if (compData.type === 'pistol') {
                        if (targetR !== field.rows - 1 || targetC <= 0 || targetC >= field.cols - 1) {
                            isValidMove = false;
                            break;
                        }
                    }
                } else if (item.type === 'ctc') {
                    if (targetR <= 0 || targetR >= field.rows - 1 || targetC <= 0 || targetC >= field.cols - 1) {
                        isValidMove = false;
                        break;
                    }
                }
            }
            
            if (isValidMove) {
                field.components = newComponents;
                field.contactors = newContactors;
                appState.selectedKeys = newSelectedKeys;
                updateCanvas();
                
                lastValidComponents = JSON.parse(JSON.stringify(newComponents));
                lastValidContactors = JSON.parse(JSON.stringify(newContactors));
                lastValidSelectedKeys = new Set(newSelectedKeys);
            }
        }
    };
    
    const onMouseUp = () => {
        isDraggingGroup = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        let hasMoved = false;
        if (JSON.stringify(initialComponents) !== JSON.stringify(lastValidComponents) ||
            JSON.stringify(initialContactors) !== JSON.stringify(lastValidContactors)) {
            hasMoved = true;
        }
        
        if (hasMoved) {
            field.components = lastValidComponents;
            field.contactors = lastValidContactors;
            appState.selectedKeys = lastValidSelectedKeys;
            saveHistoryState(appState);
        } else {
            field.components = initialComponents;
            field.contactors = initialContactors;
            appState.selectedKeys = initialSelectedKeys;
            
            if (shouldDeselectOnMouseUp) {
                appState.selectedKeys.delete(clickedSelectionKey);
            }
        }
        
        updateCanvas();
        
        initialComponents = null;
        initialContactors = null;
        initialSelectedKeys = null;
        lastValidComponents = null;
        lastValidContactors = null;
        lastValidSelectedKeys = null;
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function adjustSize(fieldId, type, delta) {
    if (appState.isSimulationMode) return;
    const field = appState.fields.find(f => f.id === fieldId);
    if (!field) return;
    
    const oldRows = field.rows;
    const oldCols = field.cols;
    
    let newRows = oldRows;
    let newCols = oldCols;
    
    if (type === 'rows') newRows = Math.max(4, Math.min(24, oldRows + delta));
    else newCols = Math.max(4, Math.min(32, oldCols + delta));
    
    if (newRows === oldRows && newCols === oldCols) return;
    
    field.rows = newRows;
    field.cols = newCols;
    
    migrateComponentsOnResize(field, oldRows, oldCols, newRows, newCols);
    saveHistoryState(appState);
    updateCanvas();
}

function insertColAtIndex(field, c) {
    if (appState.isSimulationMode) return;
    if (field.cols >= 32) {
        alert("Максимальное количество столбцов - 32!");
        return;
    }
    const newComponents = {};
    for (let key in field.components) {
        const parts = key.split('-');
        const r = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (col <= c) {
            newComponents[key] = field.components[key];
        } else {
            newComponents[`${r}-${col + 1}`] = field.components[key];
        }
    }
    field.components = newComponents;
    
    const newContactors = {};
    for (let key in field.contactors) {
        const parts = key.split('-');
        const r = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (col <= c) {
            newContactors[key] = field.contactors[key];
        } else {
            newContactors[`${r}-${col + 1}`] = field.contactors[key];
        }
    }
    field.contactors = newContactors;
    field.cols++;
    saveHistoryState(appState);
    updateCanvas();
}

function deleteColAtIndex(field, c) {
    if (appState.isSimulationMode) return;
    if (field.cols <= 4) {
        alert("Минимальное количество столбцов - 4!");
        return;
    }
    let isColEmpty = true;
    for (let r = 0; r < field.rows; r++) {
        if (field.components[`${r}-${c}`] || field.contactors[`${r}-${c}`]) {
            isColEmpty = false;
            break;
        }
    }
    if (!isColEmpty) {
        alert("Нельзя удалить непустой столбец!");
        return;
    }
    const newComponents = {};
    for (let key in field.components) {
        const parts = key.split('-');
        const r = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (col < c) {
            newComponents[key] = field.components[key];
        } else if (col > c) {
            newComponents[`${r}-${col - 1}`] = field.components[key];
        }
    }
    field.components = newComponents;
    
    const newContactors = {};
    for (let key in field.contactors) {
        const parts = key.split('-');
        const r = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (col < c) {
            newContactors[key] = field.contactors[key];
        } else if (col > c) {
            newContactors[`${r}-${col - 1}`] = field.contactors[key];
        }
    }
    field.contactors = newContactors;
    field.cols--;
    saveHistoryState(appState);
    updateCanvas();
}

function insertRowAtIndex(field, r) {
    if (appState.isSimulationMode) return;
    if (field.rows >= 24) {
        alert("Максимальное количество строк - 24!");
        return;
    }
    const newComponents = {};
    for (let key in field.components) {
        const parts = key.split('-');
        const row = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (row <= r) {
            newComponents[key] = field.components[key];
        } else {
            newComponents[`${row + 1}-${col}`] = field.components[key];
        }
    }
    field.components = newComponents;
    
    const newContactors = {};
    for (let key in field.contactors) {
        const parts = key.split('-');
        const row = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (row <= r) {
            newContactors[key] = field.components[key];
        } else {
            newContactors[`${row + 1}-${col}`] = field.contactors[key];
        }
    }
    field.contactors = newContactors;
    field.rows++;
    saveHistoryState(appState);
    updateCanvas();
}

function deleteRowAtIndex(field, r) {
    if (appState.isSimulationMode) return;
    if (field.rows <= 4) {
        alert("Минимальное количество строк - 4!");
        return;
    }
    let isRowEmpty = true;
    for (let c = 0; c < field.cols; c++) {
        if (field.components[`${r}-${c}`] || field.contactors[`${r}-${c}`]) {
            isRowEmpty = false;
            break;
        }
    }
    if (!isRowEmpty) {
        alert("Нельзя удалить непустую строку!");
        return;
    }
    const newComponents = {};
    for (let key in field.components) {
        const parts = key.split('-');
        const row = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (row < r) {
            newComponents[key] = field.components[key];
        } else if (row > r) {
            newComponents[`${row - 1}-${col}`] = field.components[key];
        }
    }
    field.components = newComponents;
    
    const newContactors = {};
    for (let key in field.contactors) {
        const parts = key.split('-');
        const row = parseInt(parts[0]);
        const col = parseInt(parts[1]);
        if (row < r) {
            newContactors[key] = field.contactors[key];
        } else if (row > r) {
            newContactors[`${row - 1}-${col}`] = field.contactors[key];
        }
    }
    field.contactors = newContactors;
    field.rows--;
    saveHistoryState(appState);
    updateCanvas();
}

function deleteSelected() {
    if (appState.isSimulationMode) return;
    if (appState.selectedKeys.size === 0) return;
    
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        const fId = parseInt(parts[0]);
        const type = parts[1];
        const r = parseInt(parts[2]);
        const c = parseInt(parts[3]);
        const key = `${r}-${c}`;
        
        const field = appState.fields.find(f => f.id === fId);
        if (field) {
            if (type === 'comp') delete field.components[key];
            else if (type === 'ctc') delete field.contactors[key];
        }
    });
    
    appState.selectedKeys.clear();
    saveHistoryState(appState);
    updateCanvas();
}

function getLowestAvailableIndexGlobal(type) {
    let k = 1;
    while (true) {
        let nameToCheck = type === 'inverter' ? `Inv ${k}` : (type === 'pistol' ? `P ${k}` : `C${k}`);
        let found = false;
        for (let f of appState.fields) {
            for (let key in f.components) {
                if (f.components[key].name.toLowerCase() === nameToCheck.toLowerCase()) {
                    found = true;
                    break;
                }
            }
        }
        if (!found) return k;
        k++;
    }
}

function updateSidebarStats(simulationData) {
    let totalInverterPower = 0;
    let countInverters = 0;
    let countPistols = 0;
    let countContactors = 0;
    let countBreakers = 0;
    
    appState.fields.forEach(field => {
        for (let key in field.components) {
            const comp = field.components[key];
            if (comp.type === 'inverter') {
                totalInverterPower += (comp.power || 60);
                countInverters++;
            } else if (comp.type === 'pistol') {
                countPistols++;
            }
        }
        for (let key in field.contactors) {
            const ctc = field.contactors[key];
            if (!ctc.type || ctc.type === 'standard') countContactors++;
            else countBreakers++;
        }
    });
    
    const powerValEl = document.getElementById('stat-active-power');
    if (powerValEl) {
        powerValEl.innerText = `${totalInverterPower} кВт`;
    }
    
    const compCountEl = document.getElementById('stat-components-count');
    if (compCountEl) {
        const totalReal = (countContactors + countBreakers) * 2;
        compCountEl.innerHTML = `
            Всего контакторов: <strong>${totalReal} шт</strong> (коммут: ${countContactors*2}, раздел: ${countBreakers*2})<br>
            Инверторы: ${countInverters} шт | Пистолеты: ${countPistols} шт
        `;
    }
}

let currentSelectedCompsForRename = [];

function openPropertiesForSelected() {
    const menu = document.getElementById('custom-context-menu');
    if (menu) menu.style.display = 'none';
    
    currentSelectedCompsForRename = [];
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        if (parts[1] === 'comp') {
            const fId = parseInt(parts[0]);
            const r = parseInt(parts[2]);
            const c = parseInt(parts[3]);
            const field = appState.fields.find(f => f.id === fId);
            if (field) {
                const comp = field.components[`${r}-${c}`];
                if (comp) {
                    currentSelectedCompsForRename.push({ fId, r, c, comp, globalKey: `${fId}-${r}-${c}` });
                }
            }
        }
    });
    
    if (currentSelectedCompsForRename.length === 0) return;
    
    const grouped = {};
    currentSelectedCompsForRename.forEach(item => {
        const t = item.comp.type;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(item);
    });
    
    const container = document.getElementById('rename-dialog-sections-container');
    if (!container) return;
    container.innerHTML = "";
    
    for (let type in grouped) {
        container.innerHTML += generatePropertySection(type, grouped[type]);
    }
    
    const dialog = document.getElementById('rename-dialog');
    if (dialog) dialog.style.display = 'flex';
    
    const firstInput = container.querySelector('.section-name-input');
    if (firstInput) {
        firstInput.focus();
        firstInput.select();
    }
    
    container.querySelectorAll('.section-name-input').forEach(inp => {
        inp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                saveComponentRename();
            }
        };
    });
}

function computeWildcardDisplay(suffixes) {
    if (suffixes.length === 0) return "...";
    if (suffixes.length === 1) return suffixes[0];
    
    function tokenize(s) {
        const tokens = [];
        let i = 0;
        while (i < s.length) {
            if (/\d/.test(s[i])) {
                let num = '';
                while (i < s.length && /\d/.test(s[i])) { num += s[i]; i++; }
                tokens.push(num);
            } else {
                tokens.push(s[i]);
                i++;
            }
        }
        return tokens;
    }
    
    const tokenized = suffixes.map(tokenize);
    const maxLen = Math.max(...tokenized.map(t => t.length));
    
    let result = '';
    let lastWasWild = false;
    for (let i = 0; i < maxLen; i++) {
        const tokensAtI = tokenized.map(t => t[i]);
        const hasUndef = tokensAtI.some(t => t === undefined);
        const allSame = !hasUndef && tokensAtI.every(t => t === tokensAtI[0]);
        if (allSame) {
            result += tokensAtI[0];
            lastWasWild = false;
        } else {
            if (!lastWasWild) result += '*';
            lastWasWild = true;
        }
    }
    
    return result || '...';
}

function generatePropertySection(type, compsOfType) {
    const suffixes = compsOfType.map(c => {
        if (type === 'inverter') return c.comp.name.replace(/^Inv\s+/, '');
        if (type === 'pistol') return c.comp.name.replace(/^P\s+/, '');
        if (type === 'cable') return c.comp.name.replace(/^C/, '');
        return "";
    });
    const uniqueSuffixes = [...new Set(suffixes)];
    const displaySuffix = uniqueSuffixes.length === 1 ? uniqueSuffixes[0] : computeWildcardDisplay(suffixes);
    
    let title = "";
    let prefix = "";
    if (type === 'inverter') { title = "Инверторы"; prefix = "Inv "; }
    else if (type === 'pistol') { title = "Пистолеты"; prefix = "P "; }
    else if (type === 'cable') { title = "Кабели"; prefix = "C"; }
    
    let html = `<div class="property-section" data-type="${type}" style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: rgba(255,255,255,0.02); margin-top: 8px;">`;
    html += `<div style="font-weight: bold; font-size: 13px; color: var(--primary); margin-bottom: 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px;">${title} (${compsOfType.length} шт.)</div>`;
    html += `
        <div style="margin-bottom: 8px;">
            <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Номер / Название:</label>
            <div style="display: flex; align-items: center; gap: 4px;">
                <span style="font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: bold; color: var(--text-muted);">${prefix}</span>
                <input type="text" class="dialog-input section-name-input" data-original="${displaySuffix}" value="${displaySuffix}" placeholder="Введите номер...">
            </div>
        </div>
    `;
    
    if (type === 'inverter') {
        const powers = compsOfType.map(c => c.comp.power);
        const uniquePowers = [...new Set(powers)];
        const displayPower = uniquePowers.length === 1 ? uniquePowers[0] : "mixed";
        
        html += `
            <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Мощность инвертора (кВт):</label>
                <select class="dialog-input section-power-select" data-original="${displayPower}">
                    <option value="mixed" ${displayPower === 'mixed' ? 'selected' : ''}>...</option>
                    <option value="10" ${displayPower === 10 ? 'selected' : ''}>10 кВт</option>
                    <option value="20" ${displayPower === 20 ? 'selected' : ''}>20 кВт</option>
                    <option value="30" ${displayPower === 30 ? 'selected' : ''}>30 кВт</option>
                    <option value="40" ${displayPower === 40 ? 'selected' : ''}>40 кВт</option>
                    <option value="50" ${displayPower === 50 ? 'selected' : ''}>50 кВт</option>
                    <option value="60" ${displayPower === 60 ? 'selected' : ''}>60 кВт</option>
                    <option value="70" ${displayPower === 70 ? 'selected' : ''}>70 кВт</option>
                    <option value="100" ${displayPower === 100 ? 'selected' : ''}>100 кВт</option>
                </select>
            </div>
        `;
    }
    
    html += `</div>`;
    return html;
}

function closeRenameDialog() {
    const dialog = document.getElementById('rename-dialog');
    if (dialog) dialog.style.display = 'none';
    currentSelectedCompsForRename = [];
}

function saveComponentRename() {
    const container = document.getElementById('rename-dialog-sections-container');
    if (!container) return;
    const sections = container.querySelectorAll('.property-section');
    
    const updates = [];
    const selectedGlobalKeys = new Set(currentSelectedCompsForRename.map(x => x.globalKey));
    
    const isNameDuplicateExcludingSelection = (name, type) => {
        if (type === 'cable') return false;
        for (let f of appState.fields) {
            for (let key in f.components) {
                const globalKey = `${f.id}-${key}`;
                if (selectedGlobalKeys.has(globalKey)) continue;
                
                const otherComp = f.components[key];
                if (otherComp.type === type && otherComp.name.toLowerCase() === name.toLowerCase()) {
                    return true;
                }
            }
        }
        return false;
    };

    for (let section of sections) {
        const type = section.getAttribute('data-type');
        const nameInput = section.querySelector('.section-name-input');
        const origNameSuffix = nameInput.getAttribute('data-original');
        const newNameSuffix = nameInput.value.trim();
        
        let powerVal = null;
        let origPowerVal = null;
        if (type === 'inverter') {
            const powerSelect = section.querySelector('.section-power-select');
            origPowerVal = powerSelect.getAttribute('data-original');
            powerVal = powerSelect.value;
        }
        
        if (!newNameSuffix) {
            alert("Имя / номер не может быть пустым!");
            return;
        }
        
        const sectionComps = currentSelectedCompsForRename.filter(x => x.comp.type === type);
        
        let prefix = "";
        if (type === 'inverter') prefix = "Inv ";
        else if (type === 'pistol') prefix = "P ";
        else if (type === 'cable') prefix = "C";
        
        const nameChanged = (newNameSuffix !== "..." && newNameSuffix !== origNameSuffix);
        const powerChanged = (powerVal && powerVal !== "mixed" && powerVal !== origPowerVal);
        
        if (nameChanged) {
            if (newNameSuffix.includes('*')) {
                for (let item of sectionComps) {
                    let origSuffix = item.comp.name;
                    if (origSuffix.startsWith(prefix)) {
                        origSuffix = origSuffix.slice(prefix.length);
                    }
                    const newSuffix = applyWildcardTemplate(origSuffix, origNameSuffix, newNameSuffix);
                    const fullNewName = prefix + newSuffix;
                    if (type !== 'cable' && isNameDuplicateExcludingSelection(fullNewName, type)) {
                        alert(`Ошибка: Компонент с именем "${fullNewName}" уже существует на схеме!`);
                        return;
                    }
                    const itemUpdates = { name: fullNewName };
                    if (powerChanged) itemUpdates.power = parseInt(powerVal);
                    updates.push({ item, itemUpdates });
                }
            } else if (type === 'cable') {
                const fullNewName = prefix + newNameSuffix;
                for (let item of sectionComps) {
                    const itemUpdates = { name: fullNewName };
                    updates.push({ item, itemUpdates });
                }
            } else if (sectionComps.length === 1) {
                const fullNewName = prefix + newNameSuffix;
                if (isNameDuplicateExcludingSelection(fullNewName, type)) {
                    alert(`Ошибка: Компонент с именем "${fullNewName}" уже существует на схеме!`);
                    return;
                }
                
                const item = sectionComps[0];
                const itemUpdates = { name: fullNewName };
                if (powerChanged) itemUpdates.power = parseInt(powerVal);
                updates.push({ item, itemUpdates });
            } else {
                let base = "";
                let numVal = 1;
                const match = newNameSuffix.match(/^(.*?)(\d+)$/);
                if (match) {
                    base = match[1];
                    numVal = parseInt(match[2]);
                } else {
                    base = newNameSuffix;
                    numVal = 1;
                }
                
                for (let item of sectionComps) {
                    let finalName = "";
                    let checkNum = numVal;
                    while (true) {
                        const suffix = base + checkNum;
                        const fullNewName = prefix + suffix;
                        const alreadyQueued = updates.some(u => u.itemUpdates.name && u.itemUpdates.name.toLowerCase() === fullNewName.toLowerCase());
                        if (!alreadyQueued && !isNameDuplicateExcludingSelection(fullNewName, type)) {
                            finalName = fullNewName;
                            numVal = checkNum + 1;
                            break;
                        }
                        checkNum++;
                    }
                    const itemUpdates = { name: finalName };
                    if (powerChanged) itemUpdates.power = parseInt(powerVal);
                    updates.push({ item, itemUpdates });
                }
            }
        } else if (powerChanged) {
            sectionComps.forEach(item => {
                updates.push({ item, itemUpdates: { power: parseInt(powerVal) } });
            });
        }
    }
    
    if (updates.length > 0) {
        updates.forEach(({ item, itemUpdates }) => {
            for (let prop in itemUpdates) {
                item.comp[prop] = itemUpdates[prop];
                if (prop === 'power' && item.comp.type === 'inverter') {
                    appState.lastEditedInverterPower = itemUpdates.power;
                }
            }
        });
        saveHistoryState(appState);
    }
    
    closeRenameDialog();
    updateCanvas();
}

function applyWildcardTemplate(origSuffix, templatePattern, newPattern) {
    if (!templatePattern || !templatePattern.includes('*')) {
        return newPattern.replace(/\*/g, origSuffix);
    }
    const regexStr = '^' + templatePattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '(.*?)') + '$';
    const regex = new RegExp(regexStr);
    const match = origSuffix.match(regex);
    
    if (match) {
        const captured = match.slice(1);
        let groupIdx = 0;
        let result = '';
        for (let i = 0; i < newPattern.length; i++) {
            if (newPattern[i] === '*') {
                if (groupIdx < captured.length) {
                    result += captured[groupIdx++];
                } else {
                    result += captured[captured.length - 1] || '';
                }
            } else {
                result += newPattern[i];
            }
        }
        return result;
    }
    return newPattern.replace(/\*/g, origSuffix);
}

function deleteSelectedFromContextMenu() {
    const menu = document.getElementById('custom-context-menu');
    if (menu) menu.style.display = 'none';
    deleteSelected();
}

let selectedCompsForRenumber = [];

function openRenumberDialog() {
    const menu = document.getElementById('custom-context-menu');
    if (menu) menu.style.display = 'none';
    
    selectedCompsForRenumber = [];
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        if (parts[1] === 'comp') {
            const fId = parseInt(parts[0]);
            const r = parseInt(parts[2]);
            const c = parseInt(parts[3]);
            const field = appState.fields.find(f => f.id === fId);
            if (field) {
                const comp = field.components[`${r}-${c}`];
                if (comp) selectedCompsForRenumber.push({ fId, r, c, comp });
            }
        }
    });
    
    if (selectedCompsForRenumber.length === 0) {
        alert("Нет выделенных компонентов для перенумерации!");
        return;
    }
    
    const dialog = document.getElementById('renumber-dialog');
    if (dialog) dialog.style.display = 'flex';
}

function closeRenumberDialog() {
    const dialog = document.getElementById('renumber-dialog');
    if (dialog) dialog.style.display = 'none';
    selectedCompsForRenumber = [];
}

function applyRenumbering() {
    const startRaw = document.getElementById('renumber-start').value.trim();
    if (!startRaw) {
        alert("Введите начальное значение нумерации!");
        return;
    }
    const startMatch = startRaw.match(/^([a-zA-Z]*)(-?\d+)$/);
    if (!startMatch) {
        alert("Введите корректное значение: число (1) или буква+число (a1, b5)");
        return;
    }
    const letterPart = startMatch[1];
    let numPart = parseInt(startMatch[2]);
    if (numPart < 1) {
        alert("Номер должен быть не менее 1!");
        return;
    }
    
    const direction = document.getElementById('renumber-direction').value;
    const grouped = {};
    selectedCompsForRenumber.forEach(item => {
        const t = item.comp.type;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(item);
    });
    
    let changed = false;
    for (let type in grouped) {
        const list = grouped[type];
        list.sort((a, b) => {
            const rA = a.r, cA = a.c;
            const rB = b.r, cB = b.c;
            switch (direction) {
                case 'L_R_T_B': return (rA - rB) || (cA - cB);
                case 'R_L_T_B': return (rA - rB) || (cB - cA);
                case 'L_R_B_T': return (rB - rA) || (cA - cB);
                case 'R_L_B_T': return (rB - rA) || (cB - cA);
                case 'T_B_L_R': return (cA - cB) || (rA - rB);
                case 'T_B_R_L': return (cB - cA) || (rA - rB);
                case 'B_T_L_R': return (cA - cB) || (rB - rA);
                case 'B_T_R_L': return (cB - cA) || (rB - rA);
            }
            return 0;
        });
        
        let typePrefix = "";
        if (type === 'inverter') typePrefix = "Inv ";
        else if (type === 'pistol') typePrefix = "P ";
        else if (type === 'cable') typePrefix = "C";
        
        list.forEach((item, index) => {
            const newName = typePrefix + letterPart + (numPart + index);
            if (item.comp.name !== newName) {
                item.comp.name = newName;
                changed = true;
            }
        });
    }
    
    if (changed) {
        saveHistoryState(appState);
    }
    closeRenumberDialog();
    updateCanvas();
}

// Global Event Listeners & Shortcuts
document.addEventListener('click', (e) => {
    const menu = document.getElementById('custom-context-menu');
    if (menu && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const renameDlg = document.getElementById('rename-dialog');
        const renumberDlg = document.getElementById('renumber-dialog');
        
        if (renameDlg && renameDlg.style.display !== 'none') {
            closeRenameDialog();
            return;
        }
        if (renumberDlg && renumberDlg.style.display !== 'none') {
            closeRenumberDialog();
            return;
        }
        const menu = document.getElementById('custom-context-menu');
        if (menu && menu.style.display === 'block') {
            menu.style.display = 'none';
            return;
        }
        if (appState.activeTool !== 'select') {
            setTool('select');
            return;
        }
        if (appState.selectedKeys.size > 0) {
            appState.selectedKeys.clear();
            updateCanvas();
            return;
        }
        return;
    }

    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
    }
    
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        undo(appState, updateCanvas);
    } else if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
        e.preventDefault();
        redo(appState, updateCanvas);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
    }
});

window.updateCanvas = updateCanvas;
window.setMode = function(isSim) {
    appState.isSimulationMode = isSim;
    document.getElementById('btn-mode-design')?.classList.toggle('active', !isSim);
    document.getElementById('btn-mode-sim')?.classList.toggle('active', isSim);
    
    const toolbar = document.getElementById('sidebar-toolbar');
    const outputs = document.getElementById('sidebar-pistol-outputs');
    if (toolbar && outputs) {
        toolbar.style.display = isSim ? 'none' : 'block';
        outputs.style.display = isSim ? 'block' : 'none';
    }
    
    updateCanvas();
};

window.setMenuPos = function(pos) {
    const layout = document.getElementById('app-layout');
    if (layout) {
        layout.className = 'app-layout layout-' + pos;
    }
};

window.setTool = setTool;

window.addNewField = function() {
    if (appState.isSimulationMode) return;
    appState.fields.push({ id: Date.now(), rows: 8, cols: 12, components: {}, contactors: {} });
    saveHistoryState(appState);
    updateCanvas();
};

window.deleteField = function(id) {
    if (appState.isSimulationMode) return;
    if (appState.fields.length <= 1) {
        alert("Нельзя удалить последнее оставшееся поле!");
        return;
    }
    appState.fields = appState.fields.filter(f => f.id !== id);
    saveHistoryState(appState);
    updateCanvas();
};

window.clearWorkspaceGlobal = function() {
    if (appState.isSimulationMode) return;
    if (confirm("Вы действительно хотите полностью очистить схему и удалить все дополнительные листы?")) {
        appState.fields = [appState.fields[0]];
        appState.fields[0].components = {};
        appState.fields[0].contactors = {};
        saveHistoryState(appState);
        updateCanvas();
    }
};

window.togglePowerFlow = function(checked) {
    appState.showPowerFlow = checked;
    if (appState.isSimulationMode) {
        updateCanvas();
    }
};

window.openPropertiesForSelected = openPropertiesForSelected;
window.closeRenameDialog = closeRenameDialog;
window.saveComponentRename = saveComponentRename;
window.openRenumberDialog = openRenumberDialog;
window.closeRenumberDialog = closeRenumberDialog;
window.applyRenumbering = applyRenumbering;
window.deleteSelectedFromContextMenu = deleteSelectedFromContextMenu;

window.saveToFile = () => saveToFile(appState.fields);
window.triggerFileLoad = () => document.getElementById('schema-file-input')?.click();
window.loadFromFile = (e) => loadFromFile(e, appState, updateCanvas);
window.toggleTheme = () => document.body.classList.toggle('theme-light');
window.undo = () => undo(appState, updateCanvas);
window.redo = () => redo(appState, updateCanvas);

window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
});

document.addEventListener('DOMContentLoaded', () => {
    saveHistoryState(appState);
    updateCanvas();
});
