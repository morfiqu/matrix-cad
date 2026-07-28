/**
 * UI & State Manager for Matrix CAD
 * Handles undo/redo stack, sidebar stats, modal dialogs, rename wildcard logic, and file import/export.
 */

const MAX_HISTORY = 50;

function createInitialState() {
    return {
        fields: [
            {
                id: 1,
                rows: 8,
                cols: 12,
                components: {},
                contactors: {}
            }
        ],
        currentFieldIndex: 0,
        activeTool: 'select',
        isSimulationMode: false,
        showPowerFlow: false,
        selectedKeys: new Set(),
        historyStack: [],
        redoStack: [],
        lastEditedInverterPower: 60,
        clipboard: null,
        isPasteMode: false,
        pasteAnchorRow: 0,
        pasteAnchorCol: 0,
        pasteFieldId: null
    };
}

function saveHistoryState(state) {
    const stateStr = JSON.stringify(state.fields);
    if (state.historyStack.length > 0 && state.historyStack[state.historyStack.length - 1] === stateStr) {
        return;
    }
    state.historyStack.push(stateStr);
    if (state.historyStack.length > MAX_HISTORY) {
        state.historyStack.shift();
    }
    state.redoStack = [];
}

function undo(state, updateCanvasCallback) {
    if (state.isSimulationMode) return;
    if (state.historyStack.length <= 1) return;
    
    const currentState = state.historyStack.pop();
    state.redoStack.push(currentState);
    
    const prevStateStr = state.historyStack[state.historyStack.length - 1];
    state.fields = JSON.parse(prevStateStr);
    
    state.selectedKeys.clear();
    updateCanvasCallback();
}

function redo(state, updateCanvasCallback) {
    if (state.isSimulationMode) return;
    if (state.redoStack.length === 0) return;
    
    const nextStateStr = state.redoStack.pop();
    state.historyStack.push(nextStateStr);
    state.fields = JSON.parse(nextStateStr);
    
    state.selectedKeys.clear();
    updateCanvasCallback();
}

function saveToFile(fields) {
    let totalPower = 0;
    let countInverters = 0;
    let countPistols = 0;
    let countContactors = 0;
    let countBreakers = 0;
    
    fields.forEach(field => {
        for (let key in field.components) {
            const comp = field.components[key];
            if (comp.type === 'inverter') {
                totalPower += (comp.power || 60);
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
    
    const totalContactorsReal = (countContactors + countBreakers) * 2;
    const filename = `matrix_${totalPower}kW_${countInverters}inv_${countPistols}pst_${totalContactorsReal}ctc.txt`;
    
    const data = { fields: fields };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadFromFile(event, state, updateCanvasCallback) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const loadedFields = Array.isArray(data) ? data : (data.fields || null);
            if (loadedFields && loadedFields.length > 0) {
                state.fields = loadedFields;
                if (state.selectedKeys) state.selectedKeys.clear();
                state.historyStack = [];
                state.redoStack = [];
                saveHistoryState(state);
                updateCanvasCallback();
            } else {
                alert("Ошибка: Неверный формат файла схемы!");
            }
        } catch (err) {
            alert("Ошибка при чтении файла! Проверьте формат содержимого.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function migrateComponentsOnResize(field, oldRows, oldCols, newRows, newCols) {
    let migratedComponents = {};
    let migratedContactors = {};

    for (let key in field.components) {
        const parts = key.split('-');
        let r = parseInt(parts[0]);
        let c = parseInt(parts[1]);
        const comp = field.components[key];

        if (r === oldRows - 1) {
            r = newRows - 1;
        }
        if (c === oldCols - 1) {
            c = newCols - 1;
        }

        if (r < newRows && c < newCols) {
            migratedComponents[`${r}-${c}`] = comp;
        }
    }

    for (let key in field.contactors) {
        const parts = key.split('-');
        let r = parseInt(parts[0]);
        let c = parseInt(parts[1]);

        if (r < newRows - 1 && c < newCols - 1) {
            migratedContactors[`${r}-${c}`] = field.contactors[key];
        }
    }

    field.components = migratedComponents;
    field.contactors = migratedContactors;
}
