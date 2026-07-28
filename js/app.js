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

let isDrawingComponents = false;
let activeFieldId = null;

// Copy / Paste Clipboard State
let clipboard = null;
let isPasteMode = false;
let pasteFieldId = null;

window.addEventListener('mouseup', () => {
    isDrawingComponents = false;
    activeFieldId = null;
});

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
            onCellMouseDown: (e, fId, r, c) => handleCellMouseDown(e, fId, r, c),
            onCellHover: (e, fId, r, c) => handleCellHover(e, fId, r, c),
            onAdjustSize: (fId, type, delta) => adjustSize(fId, type, delta),
            onManualSize: (fId, type, rectId) => setManualSizeInline(fId, type, rectId),
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
    
    if (appState.isSimulationMode) {
        renderPistolSummaries(simulationData);
        const errorPanel = document.getElementById('simulation-errors');
        const errorContent = document.getElementById('error-list-content');
        if (errorPanel && errorContent) {
            if (simulationData.errorMessages && simulationData.errorMessages.length > 0) {
                errorContent.innerHTML = simulationData.errorMessages.map(msg => `<div>• ${msg}</div>`).join('');
                errorPanel.style.display = 'block';
            } else {
                errorPanel.style.display = 'none';
            }
        }
    } else {
        updateActivePowerDesignMode();
        const errorPanel = document.getElementById('simulation-errors');
        if (errorPanel) errorPanel.style.display = 'none';
    }
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

function handleCellMouseDown(e, fieldId, r, c) {
    if (isPasteMode) {
        e.stopPropagation();
        const field = appState.fields.find(f => f.id === fieldId);
        if (field) commitPaste(field, r, c);
        return;
    }
    if (e.shiftKey && appState.activeTool !== 'select') {
        isDrawingComponents = true;
        activeFieldId = fieldId;
    }
    handleCellClick(fieldId, r, c);
}

function handleCellHover(e, fieldId, r, c) {
    if (isPasteMode) {
        const field = appState.fields.find(f => f.id === fieldId);
        const svg = document.getElementById(`cad-svg-${fieldId}`);
        if (field && svg) {
            updatePastePreview(field, svg, r, c);
        }
        return;
    }
    if (isDrawingComponents && appState.activeTool !== 'select' && activeFieldId === fieldId) {
        handleCellClick(fieldId, r, c);
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
    
    const draggedCompKeys = new Set(draggedItems.filter(i => i.type === 'comp').map(i => `${i.r}-${i.c}`));
    const draggedCtcKeys = new Set(draggedItems.filter(i => i.type === 'ctc').map(i => `${i.r}-${i.c}`));

    const onMouseMove = (moveEvent) => {
        if (!isDraggingGroup) return;
        
        const rect = svgEl.getBoundingClientRect();
        const mouseX = moveEvent.clientX - rect.left;
        const mouseY = moveEvent.clientY - rect.top;
        
        const currentC = Math.round((mouseX - 150) / 60);
        const currentR = Math.round((mouseY - 90) / 50);
        
        const deltaR = currentR - startR;
        const deltaC = currentC - startC;
        
        if (deltaR === 0 && deltaC === 0) return;
        
        let isValidMove = true;
        const newComponents = {};
        const newContactors = {};
        const newSelectedKeys = new Set();
        
        for (let k in initialComponents) {
            if (!draggedCompKeys.has(k)) {
                newComponents[k] = initialComponents[k];
            }
        }
        for (let k in initialContactors) {
            if (!draggedCtcKeys.has(k)) {
                newContactors[k] = initialContactors[k];
            }
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

    let targetRows = oldRows;
    let targetCols = oldCols;

    if (type === 'rows') {
        targetRows = Math.max(4, Math.min(24, oldRows + delta));
    } else {
        targetCols = Math.max(4, Math.min(32, oldCols + delta));
    }

    if (delta < 0) {
        if (type === 'rows' && !isSizeReductionSafe(field, 'rows', targetRows, oldRows)) {
            alert(`Нельзя уменьшить высоту! На удаляемой строке (${oldRows - 3}) находятся установленные элементы.`);
            return;
        }
        if (type === 'cols' && !isSizeReductionSafe(field, 'cols', targetCols, oldCols)) {
            alert(`Нельзя уменьшить ширину! На удаляемом столбце (${oldCols - 3}) находятся установленные элементы.`);
            return;
        }
    }

    field.rows = targetRows;
    field.cols = targetCols;

    migrateComponentsOnResize(field, oldRows, oldCols, field.rows, field.cols);
    saveHistoryState(appState);
    updateCanvas();
}

function isSizeReductionSafe(field, type, newSize, oldSize) {
    if (newSize >= oldSize) return true;
    if (type === 'rows') {
        for (let r = newSize - 1; r <= oldSize - 2; r++) {
            for (let c = 0; c < oldSize; c++) {
                if (field.components[`${r}-${c}`]) return false;
                if (field.contactors[`${r}-${c}`]) return false;
            }
        }
    } else {
        for (let c = newSize - 1; c <= oldSize - 2; c++) {
            for (let r = 0; r < oldSize; r++) {
                if (field.components[`${r}-${c}`]) return false;
                if (field.contactors[`${r}-${c}`]) return false;
            }
        }
    }
    return true;
}

function setManualSizeInline(fieldId, type, rectId) {
    if (appState.isSimulationMode) return;
    const field = appState.fields.find(f => f.id === fieldId);
    if (!field) return;
    
    const input = document.getElementById('inline-size-input');
    const rectElement = document.getElementById(rectId);
    const workspaceCanvas = document.getElementById('workspace-canvas');
    if (!input || !rectElement || !workspaceCanvas) return;
    
    const rectBound = rectElement.getBoundingClientRect();
    const containerBound = workspaceCanvas.getBoundingClientRect();
    
    input.style.left = `${rectBound.left - containerBound.left + workspaceCanvas.scrollLeft}px`;
    input.style.top = `${rectBound.top - containerBound.top + workspaceCanvas.scrollTop}px`;
    input.style.width = `${rectBound.width}px`;
    input.style.height = `${rectBound.height}px`;
    input.style.display = 'block';
    
    const currentVal = type === 'rows' ? (field.rows - 2) : (field.cols - 2);
    input.value = currentVal;
    input.focus();
    input.select();
    
    const saveInlineValue = () => {
        const val = parseInt(input.value);
        if (!isNaN(val) && val >= 2 && val <= 30) {
            const oldRows = field.rows;
            const oldCols = field.cols;
            
            const targetRows = type === 'rows' ? (val + 2) : oldRows;
            const targetCols = type === 'cols' ? (val + 2) : oldCols;

            if (type === 'rows' && targetRows < oldRows) {
                if (!isSizeReductionSafe(field, 'rows', targetRows, oldRows)) {
                    alert(`Нельзя уменьшить высоту! На удаляемых строках находятся установленные элементы.`);
                    input.style.display = 'none';
                    return;
                }
            }
            if (type === 'cols' && targetCols < oldCols) {
                if (!isSizeReductionSafe(field, 'cols', targetCols, oldCols)) {
                    alert(`Нельзя уменьшить ширину! На удаляемых столбцах находятся установленные элементы.`);
                    input.style.display = 'none';
                    return;
                }
            }

            field.rows = targetRows;
            field.cols = targetCols;

            migrateComponentsOnResize(field, oldRows, oldCols, field.rows, field.cols);
            saveHistoryState(appState);
            updateCanvas();
        }
        input.style.display = 'none';
    };
    
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            saveInlineValue();
        } else if (e.key === 'Escape') {
            input.style.display = 'none';
        }
    };
    
    input.onblur = saveInlineValue;
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
            newContactors[key] = field.contactors[key];
        } else {
            newContactors[`${row + 1}-${col}`] = field.contactors[key];
        }
    }
    field.contactors = newContactors;
    field.rows++;
    saveHistoryState(appState);
    updateCanvas();
}

function fillAllContactorsGlobal() {
    if (appState.isSimulationMode) return;
    let totalAdded = 0;
    
    appState.fields.forEach(field => {
        for (let r = 1; r < field.rows - 1; r++) {
            let hasRowWire = false;
            for (let colCheck = 0; colCheck < field.cols; colCheck++) {
                const comp = field.components[`${r}-${colCheck}`];
                if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                    hasRowWire = true;
                    break;
                }
            }
            
            for (let c = 1; c < field.cols - 1; c++) {
                let hasColWire = false;
                for (let rowCheck = 0; rowCheck < field.rows; rowCheck++) {
                    const comp = field.components[`${rowCheck}-${c}`];
                    if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                        hasColWire = true;
                        break;
                    }
                }
                
                if (hasRowWire && hasColWire) {
                    const key = `${r}-${c}`;
                    if (!field.contactors[key] && !field.components[key]) {
                        field.contactors[key] = { type: 'standard', closed: false };
                        totalAdded++;
                    }
                }
            }
        }
    });
    
    if (totalAdded > 0) {
        saveHistoryState(appState);
        updateCanvas();
    } else {
        alert("Нет подходящих пересечений активных шин для установки контакторов!");
    }
}

// Copy & Paste Clipboard Implementation
function copySelected() {
    if (appState.isSimulationMode || appState.selectedKeys.size === 0) return;
    const items = [];
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        const fId = parseInt(parts[0]);
        const type = parts[1];
        const r = parseInt(parts[2]);
        const c = parseInt(parts[3]);
        const field = appState.fields.find(f => f.id === fId);
        if (!field) return;
        if (type === 'comp' && field.components[`${r}-${c}`]) {
            items.push({ type: 'comp', r, c, data: JSON.parse(JSON.stringify(field.components[`${r}-${c}`])) });
        } else if (type === 'ctc' && field.contactors[`${r}-${c}`]) {
            items.push({ type: 'ctc', r, c, data: JSON.parse(JSON.stringify(field.contactors[`${r}-${c}`])) });
        }
    });
    if (items.length === 0) return;
    const minR = Math.min(...items.map(i => i.r));
    const minC = Math.min(...items.map(i => i.c));
    const fieldId = parseInt([...appState.selectedKeys][0].split('-')[0]);
    clipboard = {
        fieldId,
        items: items.map(i => ({ type: i.type, relR: i.r - minR, relC: i.c - minC, data: i.data }))
    };
}

function pasteClipboard() {
    if (appState.isSimulationMode || !clipboard) return;
    isPasteMode = true;
    pasteFieldId = clipboard.fieldId;
    document.body.style.cursor = 'crosshair';
}

function cancelPasteMode() {
    if (!isPasteMode) return;
    isPasteMode = false;
    document.body.style.cursor = '';
    appState.fields.forEach(f => {
        const svg = document.getElementById(`cad-svg-${f.id}`);
        if (svg) {
            const prev = svg.querySelector('.paste-preview-layer');
            if (prev) prev.remove();
        }
    });
}

function isPastePositionValid(field, anchorR, anchorC) {
    if (!clipboard) return false;
    for (let item of clipboard.items) {
        const tr = anchorR + item.relR;
        const tc = anchorC + item.relC;
        if (tr < 0 || tr >= field.rows || tc < 0 || tc >= field.cols) return false;
        const isCorner = (tc === 0 && tr === 0) || (tc === field.cols - 1 && tr === 0) ||
                         (tc === 0 && tr === field.rows - 1) || (tc === field.cols - 1 && tr === field.rows - 1);
        if (isCorner) return false;
        const key = `${tr}-${tc}`;
        if (field.components[key] || field.contactors[key]) return false;
        if (item.type === 'comp') {
            if (item.data.type === 'inverter' && (tc !== 0 || tr <= 0 || tr >= field.rows - 1)) return false;
            if (item.data.type === 'pistol' && (tr !== field.rows - 1 || tc <= 0 || tc >= field.cols - 1)) return false;
        }
        if (item.type === 'ctc') {
            if (tr <= 0 || tr >= field.rows - 1 || tc <= 0 || tc >= field.cols - 1) return false;
            if (!item.data.type || item.data.type === 'standard') {
                let hasRowWire = false;
                for (let cc = 0; cc < field.cols; cc++) {
                    const comp = field.components[`${tr}-${cc}`];
                    if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                        hasRowWire = true; break;
                    }
                }
                if (!hasRowWire) return false;
                let hasColWire = false;
                for (let rr = 0; rr < field.rows; rr++) {
                    const comp = field.components[`${rr}-${tc}`];
                    if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                        hasColWire = true; break;
                    }
                }
                if (!hasColWire) return false;
            }
            if (item.data.type === 'horizontal' || item.data.type === 'vertical') {
                let hasRowWire = false;
                for (let cc = 0; cc < field.cols; cc++) {
                    const comp = field.components[`${tr}-${cc}`];
                    if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                        hasRowWire = true; break;
                    }
                }
                let hasColWire = false;
                for (let rr = 0; rr < field.rows; rr++) {
                    const comp = field.components[`${rr}-${tc}`];
                    if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                        hasColWire = true; break;
                    }
                }
                if (!hasRowWire && !hasColWire) return false;
            }
        }
    }
    return true;
}

function updatePastePreview(field, svg, anchorR, anchorC) {
    if (!clipboard) return;
    let layer = svg.querySelector('.paste-preview-layer');
    if (!layer) {
        layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.setAttribute('class', 'paste-preview-layer');
        svg.appendChild(layer);
    }
    layer.innerHTML = '';
    
    const valid = isPastePositionValid(field, anchorR, anchorC);
    const color = valid ? 'rgba(0,220,130,0.55)' : 'rgba(255,60,60,0.55)';
    const stroke = valid ? '#00dc82' : '#ff3c3c';
    
    for (let item of clipboard.items) {
        const tr = anchorR + item.relR;
        const tc = anchorC + item.relC;
        const x = 150 + tc * 60 - 60/2 + 4;
        const y = 90 + tr * 50 - 50/2 + 4;
        const w = 60 - 8;
        const h = 50 - 8;
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x); rect.setAttribute('y', y);
        rect.setAttribute('width', w); rect.setAttribute('height', h);
        rect.setAttribute('rx', 4);
        rect.setAttribute('fill', color);
        rect.setAttribute('stroke', stroke);
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('pointer-events', 'none');
        layer.appendChild(rect);
        
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', 150 + tc * 60);
        label.setAttribute('y', 90 + tr * 50 + 5);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', valid ? '#fff' : '#fcc');
        label.setAttribute('pointer-events', 'none');
        label.textContent = item.data.name || (item.type === 'ctc' ? 'К' : '?');
        layer.appendChild(label);
    }
}

function commitPaste(field, anchorR, anchorC) {
    if (!clipboard || !isPastePositionValid(field, anchorR, anchorC)) return;
    appState.selectedKeys.clear();
    for (let item of clipboard.items) {
        const tr = anchorR + item.relR;
        const tc = anchorC + item.relC;
        const key = `${tr}-${tc}`;
        const newData = JSON.parse(JSON.stringify(item.data));
        if (item.type === 'comp' && newData.type === 'cable') {
            if (tc === 0) newData.pos = 'left';
            else if (tc === field.cols - 1) newData.pos = 'right';
            else if (tr === 0) newData.pos = 'top';
            else if (tr === field.rows - 1) newData.pos = 'bottom';
            else newData.pos = 'middle';
        }
        if (item.type === 'comp') {
            field.components[key] = newData;
            appState.selectedKeys.add(`${field.id}-comp-${key}`);
        } else {
            field.contactors[key] = newData;
            appState.selectedKeys.add(`${field.id}-ctc-${key}`);
        }
    }
    cancelPasteMode();
    saveHistoryState(appState);
    updateCanvas();
}

function getLowestAvailableIndexGlobal(type) {
    const usedIndices = new Set();
    const prefix = type === 'inverter' ? "Inv " : (type === 'pistol' ? "P " : "C");
    
    appState.fields.forEach(field => {
        for (let key in field.components) {
            const comp = field.components[key];
            if (comp.type === type && comp.name.startsWith(prefix)) {
                const suffix = comp.name.slice(prefix.length).trim();
                const num = parseInt(suffix);
                if (!isNaN(num)) {
                    usedIndices.add(num);
                }
            }
        }
    });
    
    let candidate = 1;
    while (usedIndices.has(candidate)) {
        candidate++;
    }
    return candidate;
}

function isNameDuplicateGlobal(newName, currentGlobalKey, type) {
    for (let f of appState.fields) {
        for (let key in f.components) {
            const globalKey = `${f.id}-${key}`;
            if (globalKey === currentGlobalKey) continue;
            
            const comp = f.components[key];
            if (comp.type === type && comp.name.toLowerCase() === newName.toLowerCase()) {
                return true;
            }
        }
    }
    return false;
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

let currentSelectedCompsForRename = [];

function openPropertiesForSelected() {
    const menu = document.getElementById('custom-context-menu');
    if (menu) menu.style.display = 'none';
    
    currentSelectedCompsForRename = [];
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        const fId = parseInt(parts[0]);
        const type = parts[1];
        const r = parseInt(parts[2]);
        const c = parseInt(parts[3]);
        const field = appState.fields.find(f => f.id === fId);
        if (field && type === 'comp' && field.components[`${r}-${c}`]) {
            currentSelectedCompsForRename.push({
                globalKey: selKey,
                fieldId: fId,
                r, c,
                comp: field.components[`${r}-${c}`]
            });
        }
    });
    
    if (currentSelectedCompsForRename.length === 0) return;
    
    const container = document.getElementById('rename-dialog-sections-container');
    if (!container) return;
    container.innerHTML = '';
    
    const grouped = {};
    currentSelectedCompsForRename.forEach(item => {
        const t = item.comp.type;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(item);
    });
    
    ['inverter', 'pistol', 'cable'].forEach(t => {
        if (grouped[t] && grouped[t].length > 0) {
            container.innerHTML += generatePropertySection(t, grouped[t]);
        }
    });
    
    document.getElementById('rename-dialog').style.display = 'flex';
    
    container.querySelectorAll('.section-name-input').forEach(inp => {
        inp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                saveComponentRename();
            }
        };
    });
}

function closeRenameDialog() {
    document.getElementById('rename-dialog').style.display = 'none';
    currentSelectedCompsForRename = [];
}

function saveComponentRename() {
    const container = document.getElementById('rename-dialog-sections-container');
    if (!container) return;
    const sections = container.querySelectorAll('.property-section');
    
    const updates = [];
    const selectedGlobalKeys = new Set(currentSelectedCompsForRename.map(x => x.globalKey));
    
    for (let sec of sections) {
        const type = sec.getAttribute('data-type');
        const nameInput = sec.querySelector('.section-name-input');
        const powerSelect = sec.querySelector('.section-power-select');
        
        const origTemplate = nameInput.getAttribute('data-original');
        const newPattern = nameInput.value.trim();
        
        let prefix = type === 'inverter' ? "Inv " : (type === 'pistol' ? "P " : "C");
        
        const compsOfType = currentSelectedCompsForRename.filter(x => x.comp.type === type);
        
        for (let item of compsOfType) {
            const origName = item.comp.name;
            let origSuffix = "";
            if (type === 'inverter') origSuffix = origName.replace(/^Inv\s+/, '');
            else if (type === 'pistol') origSuffix = origName.replace(/^P\s+/, '');
            else if (type === 'cable') origSuffix = origName.replace(/^C/, '');
            
            const newSuffix = applyWildcardTemplate(origSuffix, origTemplate, newPattern);
            const finalName = prefix + newSuffix;
            
            if (isNameDuplicateGlobal(finalName, item.globalKey, type)) {
                alert(`Имя "${finalName}" уже используется для другого элемента типа ${type}!`);
                return;
            }
            
            let newPower = item.comp.power;
            if (type === 'inverter' && powerSelect) {
                const val = powerSelect.value;
                if (val !== 'mixed') {
                    newPower = parseInt(val);
                    appState.lastEditedInverterPower = newPower;
                }
            }
            
            updates.push({ item, finalName, newPower });
        }
    }
    
    let changed = false;
    updates.forEach(u => {
        if (u.item.comp.name !== u.finalName || u.item.comp.power !== u.newPower) {
            u.item.comp.name = u.finalName;
            if (u.item.comp.type === 'inverter') {
                u.item.comp.power = u.newPower;
            }
            changed = true;
        }
    });
    
    if (changed) {
        saveHistoryState(appState);
    }
    closeRenameDialog();
    updateCanvas();
}

function deleteSelected() {
    if (appState.isSimulationMode || appState.selectedKeys.size === 0) return;
    
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        const fId = parseInt(parts[0]);
        const type = parts[1];
        const r = parseInt(parts[2]);
        const c = parseInt(parts[3]);
        const field = appState.fields.find(f => f.id === fId);
        if (field) {
            const key = `${r}-${c}`;
            if (type === 'comp') delete field.components[key];
            if (type === 'ctc') delete field.contactors[key];
        }
    });
    
    appState.selectedKeys.clear();
    saveHistoryState(appState);
    updateCanvas();
}

function deleteSelectedFromContextMenu() {
    deleteSelected();
}

let selectedCompsForRenumber = [];

function openRenumberDialog() {
    const menu = document.getElementById('custom-context-menu');
    if (menu) menu.style.display = 'none';
    
    selectedCompsForRenumber = [];
    appState.selectedKeys.forEach(selKey => {
        const parts = selKey.split('-');
        const fId = parseInt(parts[0]);
        const type = parts[1];
        const r = parseInt(parts[2]);
        const c = parseInt(parts[3]);
        const field = appState.fields.find(f => f.id === fId);
        if (field && type === 'comp' && field.components[`${r}-${c}`]) {
            selectedCompsForRenumber.push({
                fieldId: fId,
                r, c,
                comp: field.components[`${r}-${c}`]
            });
        }
    });
    
    if (selectedCompsForRenumber.length < 2) {
        alert("Для массовой перенумерации нужно выделить минимум 2 элемента!");
        return;
    }
    
    document.getElementById('renumber-start').value = "1";
    document.getElementById('renumber-dialog').style.display = 'flex';
}

function closeRenumberDialog() {
    document.getElementById('renumber-dialog').style.display = 'none';
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

function renderPistolSummaries(simulationData) {
    const { pistolPowers, errorMessages } = simulationData;
    const list = document.getElementById('routing-summary');
    if (!list) return;
    list.innerHTML = '';
    
    let count = 0;
    let totalPower = 0;
    let countContactors = 0;
    let countInverters = 0;
    let countPistols = 0;
    let countBreakers = 0;

    appState.fields.forEach(field => {
        for (let key in field.components) {
            const comp = field.components[key];
            if (comp.type === 'pistol') {
                const uid = `${field.id}-${key}`;
                const power = pistolPowers[uid] || 0;
                totalPower += power;
                
                const item = document.createElement('div');
                item.className = 'routing-item';
                item.innerHTML = `
                    <div>
                        <strong>Пистолет ${comp.name}</strong>
                        <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">
                            Поле: ${appState.fields.indexOf(field)+1} | ${power > 0 ? `Активно` : 'Не подключен'}
                        </div>
                    </div>
                    <span class="power">${power} кВт</span>
                `;
                list.appendChild(item);
                count++;
                countPistols++;
            } else if (comp.type === 'inverter') {
                countInverters++;
            }
        }
        
        for (let key in field.contactors) {
            const ctc = field.contactors[key];
            if (!ctc.type || ctc.type === 'standard') {
                countContactors++;
            } else if (ctc.type === 'horizontal' || ctc.type === 'vertical') {
                countBreakers++;
            }
        }
    });

    const titleLabel = document.getElementById('power-section-title');
    if (titleLabel) {
        titleLabel.innerText = "Активная мощность";
    }

    const powerLabel = document.getElementById('stat-active-power');
    if (powerLabel) {
        if (errorMessages && errorMessages.length > 0) {
            powerLabel.innerText = 'error';
            powerLabel.style.color = '#ff4a6b';
        } else {
            powerLabel.innerText = `${totalPower} кВт`;
            powerLabel.style.color = 'var(--primary)';
        }
    }

    const countContactorsReal = countContactors * 2;
    const countBreakersReal = countBreakers * 2;
    const totalContactorsReal = countContactorsReal + countBreakersReal;
    const countEl = document.getElementById('stat-components-count');
    if (countEl) {
        countEl.innerHTML = `
            Всего контакторов: <strong>${totalContactorsReal} шт</strong> (коммут: ${countContactorsReal}, раздел: ${countBreakersReal})<br>
            Инверторы: ${countInverters} шт | Пистолеты: ${countPistols} шт
        `;
    }

    if (count === 0) {
        list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px;">Нет пистолетов на схеме. Разместите их на нижнем поле.</div>';
    }
}

function updateActivePowerDesignMode() {
    let totalInverterPower = 0;
    let countContactors = 0;
    let countInverters = 0;
    let countPistols = 0;
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
            if (!ctc.type || ctc.type === 'standard') {
                countContactors++;
            } else if (ctc.type === 'horizontal' || ctc.type === 'vertical') {
                countBreakers++;
            }
        }
    });
    
    const titleLabel = document.getElementById('power-section-title');
    if (titleLabel) {
        titleLabel.innerText = "Максимальная мощность";
    }
    
    const powerValEl = document.getElementById('stat-active-power');
    if (powerValEl) {
        powerValEl.innerText = `${totalInverterPower} кВт`;
        powerValEl.style.color = 'var(--primary)';
    }
    
    const countContactorsReal = countContactors * 2;
    const countBreakersReal = countBreakers * 2;
    const totalContactorsReal = countContactorsReal + countBreakersReal;
    const compCountEl = document.getElementById('stat-components-count');
    if (compCountEl) {
        compCountEl.innerHTML = `
            Всего контакторов: <strong>${totalContactorsReal} шт</strong> (коммут: ${countContactorsReal}, раздел: ${countBreakersReal})<br>
            Инверторы: ${countInverters} шт | Пистолеты: ${countPistols} шт
        `;
    }
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
        if (isPasteMode) {
            cancelPasteMode();
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
    
    const keyLower = e.key ? e.key.toLowerCase() : '';
    const code = e.code || '';

    if ((e.ctrlKey || e.metaKey) && (code === 'KeyZ' || keyLower === 'z' || keyLower === 'я')) {
        e.preventDefault();
        undo(appState, updateCanvas);
    } else if ((e.ctrlKey || e.metaKey) && (code === 'KeyY' || keyLower === 'y' || keyLower === 'н' || (e.shiftKey && (code === 'KeyZ' || keyLower === 'z' || keyLower === 'я')))) {
        e.preventDefault();
        redo(appState, updateCanvas);
    } else if ((e.ctrlKey || e.metaKey) && (code === 'KeyC' || keyLower === 'c' || keyLower === 'с')) {
        e.preventDefault();
        copySelected();
    } else if ((e.ctrlKey || e.metaKey) && (code === 'KeyV' || keyLower === 'v' || keyLower === 'м')) {
        e.preventDefault();
        pasteClipboard();
    } else if ((e.ctrlKey || e.metaKey) && (code === 'KeyA' || keyLower === 'a' || keyLower === 'ф')) {
        e.preventDefault();
        appState.selectedKeys.clear();
        appState.fields.forEach(f => {
            for (let k in f.components) appState.selectedKeys.add(`${f.id}-comp-${k}`);
            for (let k in f.contactors) appState.selectedKeys.add(`${f.id}-ctc-${k}`);
        });
        updateCanvas();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isPasteMode) {
            e.preventDefault();
            deleteSelected();
        }
    }
});

window.updateCanvas = updateCanvas;
window.setMode = function(isSim) {
    appState.isSimulationMode = isSim;
    document.getElementById('mode-btn-design')?.classList.toggle('active', !isSim);
    document.getElementById('mode-btn-sim')?.classList.toggle('active', isSim);
    
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

window.fillAllContactorsGlobal = fillAllContactorsGlobal;
window.copySelected = copySelected;
window.pasteClipboard = pasteClipboard;
window.cancelPasteMode = cancelPasteMode;

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
