/**
 * UI & State Manager for Matrix CAD
 * Handles undo/redo stack, sidebar stats, modal dialogs, rename wildcard logic, and file import/export.
 */

export const MAX_HISTORY = 50;

export function createInitialState() {
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
        showPowerFlow: true,
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

export function saveHistoryState(state) {
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

export function undo(state, updateCanvasCallback) {
    if (state.isSimulationMode) return;
    if (state.historyStack.length <= 1) return;
    
    const currentState = state.historyStack.pop();
    state.redoStack.push(currentState);
    
    const prevStateStr = state.historyStack[state.historyStack.length - 1];
    state.fields = JSON.parse(prevStateStr);
    
    state.selectedKeys.clear();
    updateCanvasCallback();
}

export function redo(state, updateCanvasCallback) {
    if (state.isSimulationMode) return;
    if (state.redoStack.length === 0) return;
    
    const nextStateStr = state.redoStack.pop();
    state.historyStack.push(nextStateStr);
    state.fields = JSON.parse(nextStateStr);
    
    state.selectedKeys.clear();
    updateCanvasCallback();
}

export function saveToFile(fields) {
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

export function loadFromFile(event, state, updateCanvasCallback) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.fields) {
                state.fields = data.fields;
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
