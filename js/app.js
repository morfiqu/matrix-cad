import { calculateSimulation } from './solver.js';
import { renderField } from './cad_engine.js';
import { createInitialState, saveHistoryState, undo, redo, saveToFile, loadFromFile } from './ui.js';

const appState = (typeof window !== 'undefined' && window.createInitialState) ? window.createInitialState() : createInitialState();
if (typeof window !== 'undefined') {
    window.appState = appState;
}

export function updateCanvas() {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;
    
    workspace.innerHTML = '';
    
    let simulationData = { activePaths: new Set(), contactorPowers: {}, pistolPowers: {}, errorMessages: [] };
    
    const calcFn = (typeof window !== 'undefined' && window.calculateSimulation) ? window.calculateSimulation : calculateSimulation;
    const drawFn = (typeof window !== 'undefined' && window.renderField) ? window.renderField : renderField;

    if (appState.isSimulationMode) {
        simulationData = calcFn(appState.fields);
    }
    
    appState.fields.forEach((field, index) => {
        const fieldRowContainer = document.createElement('div');
        fieldRowContainer.className = 'field-row-container';
        fieldRowContainer.id = `field-container-${field.id}`;
        
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = `cad-svg-${field.id}`;
        svg.className = 'cad-svg';
        
        fieldRowContainer.appendChild(svg);
        workspace.appendChild(fieldRowContainer);
        
        const renderState = {
            activePaths: simulationData.activePaths,
            contactorPowers: simulationData.contactorPowers,
            pistolPowers: simulationData.pistolPowers,
            isSimulationMode: appState.isSimulationMode,
            showPowerFlow: appState.showPowerFlow,
            selectedKeys: appState.selectedKeys,
            activeTool: appState.activeTool,
            isPasteMode: appState.isPasteMode,
            pasteAnchorRow: appState.pasteAnchorRow,
            pasteAnchorCol: appState.pasteAnchorCol,
            onCellClick: (e, fId, r, c) => handleCellClick(fId, r, c),
            onAdjustSize: (fId, type, delta) => adjustSize(fId, type, delta),
            onInsertCol: (f, c) => insertColAtIndex(f, c),
            onDeleteCol: (f, c) => deleteColAtIndex(f, c),
            onInsertRow: (f, r) => insertRowAtIndex(f, r),
            onDeleteRow: (f, r) => deleteRowAtIndex(f, r),
            onCompMouseDown: (e, fId, r, c, type, key) => handleCompMouseDown(e, fId, r, c, type, key),
            onCtcMouseDown: (e, fId, r, c, type, key, ctc) => handleCtcMouseDown(e, fId, r, c, type, key, ctc)
        };
        
        drawFn(field, svg, simulationData, renderState);
    });
    
    updateSidebarStats(simulationData);
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
    if (appState.activeTool === 'select') {
        if (e.ctrlKey || e.metaKey) {
            if (appState.selectedKeys.has(key)) appState.selectedKeys.delete(key);
            else appState.selectedKeys.add(key);
        } else {
            if (!appState.selectedKeys.has(key)) {
                appState.selectedKeys.clear();
                appState.selectedKeys.add(key);
            }
        }
        updateCanvas();
    }
}

function handleCtcMouseDown(e, fId, r, c, type, key, ctc) {
    e.stopPropagation();
    if (appState.isSimulationMode) {
        ctc.closed = !ctc.closed;
        updateCanvas();
    } else {
        if (appState.activeTool === 'select') {
            if (e.ctrlKey || e.metaKey) {
                if (appState.selectedKeys.has(key)) appState.selectedKeys.delete(key);
                else appState.selectedKeys.add(key);
            } else {
                if (!appState.selectedKeys.has(key)) {
                    appState.selectedKeys.clear();
                    appState.selectedKeys.add(key);
                }
            }
            updateCanvas();
        }
    }
}

function adjustSize(fieldId, type, delta) {
    if (appState.isSimulationMode) return;
    const field = appState.fields.find(f => f.id === fieldId);
    if (!field) return;
    if (type === 'rows') field.rows = Math.max(4, Math.min(24, field.rows + delta));
    else field.cols = Math.max(4, Math.min(32, field.cols + delta));
    saveHistoryState(appState);
    updateCanvas();
}

function insertColAtIndex(field, c) {
    if (appState.isSimulationMode) return;
    field.cols++;
    saveHistoryState(appState);
    updateCanvas();
}

function deleteColAtIndex(field, c) {
    if (appState.isSimulationMode) return;
    if (field.cols <= 4) return;
    field.cols--;
    saveHistoryState(appState);
    updateCanvas();
}

function insertRowAtIndex(field, r) {
    if (appState.isSimulationMode) return;
    field.rows++;
    saveHistoryState(appState);
    updateCanvas();
}

function deleteRowAtIndex(field, r) {
    if (appState.isSimulationMode) return;
    if (field.rows <= 4) return;
    field.rows--;
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

if (typeof window !== 'undefined') {
    window.updateCanvas = updateCanvas;
    window.setMode = function(isSim) {
        appState.isSimulationMode = isSim;
        document.getElementById('btn-mode-design')?.classList.toggle('active', !isSim);
        document.getElementById('btn-mode-sim')?.classList.toggle('active', isSim);
        updateCanvas();
    };

    window.setTool = function(tool) {
        if (appState.isSimulationMode) return;
        appState.activeTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tool-${tool}`)?.classList.add('active');
    };

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

    window.saveToFile = () => saveToFile(appState.fields);
    window.triggerFileLoad = () => document.getElementById('schema-file-input')?.click();
    window.loadFromFile = (e) => loadFromFile(e, appState, updateCanvas);
    window.toggleTheme = () => document.body.classList.toggle('theme-light');
    window.undo = () => undo(appState, updateCanvas);
    window.redo = () => redo(appState, updateCanvas);
}

document.addEventListener('DOMContentLoaded', () => {
    saveHistoryState(appState);
    updateCanvas();
});
