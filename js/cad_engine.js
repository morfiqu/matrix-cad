/**
 * SVG CAD Rendering Engine for Matrix CAD
 * Handles rendering grid cells, rulers, wiring, contactors, breakers, inverters, cables, and pistols.
 */

const cellWidth = 60;
const cellHeight = 50;
const marginX = 150;
const marginY = 90;

function renderField(field, svg, simulationData, state) {
    const { activePaths, contactorPowers, pistolPowers, isSimulationMode, showPowerFlow, selectedKeys } = state;
    
    svg.innerHTML = '';
    
    const svgWidth = marginX * 2 + field.cols * cellWidth;
    const svgHeight = marginY * 2 + field.rows * cellHeight;
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight);
    
    drawGridCells(field, svg, state);
    drawRulers(field, svg, state);
    
    if (!isSimulationMode) {
        drawCenteredResizeButtons(field, svg, state);
    }
    
    drawWiring(field, svg, activePaths, state);
    drawPlacedComponents(field, svg, simulationData, state);
    drawGridPointsAndContactors(field, svg, simulationData, state);
    
    bindSVGDragSelection(field, svg, state);
}

function bindSVGDragSelection(field, svg, state) {
    const { isSimulationMode, activeTool, selectedKeys, onUpdateCanvas, onSaveHistoryState } = state;
    let dragStart = null;
    let selectionBox = null;
    
    if (svg._dragSelectionHandler) {
        svg.removeEventListener('mousedown', svg._dragSelectionHandler);
    }
    
    const handleMouseDown = (e) => {
        if (isSimulationMode) return;
        
        const isContactorCtrlDrag = (activeTool === 'contactor' && (e.ctrlKey || e.metaKey));
        if (activeTool !== 'select' && !isContactorCtrlDrag) return;
        
        const validTargets = ['grid-cell-rect', 'cad-svg', 'grid-point'];
        const targetClass = e.target.getAttribute('class') || '';
        const isTargetValid = validTargets.some(cls => targetClass.includes(cls)) || e.target.tagName === 'svg' || e.target.tagName === 'SVG';
        
        if (!isTargetValid) return;
        
        window.getSelection()?.removeAllRanges();
        
        const rect = svg.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        
        dragStart = { x: startX, y: startY };
        
        if (!isContactorCtrlDrag && !e.ctrlKey && !e.metaKey) {
            selectedKeys.clear();
            if (onUpdateCanvas) onUpdateCanvas();
        }
        
        let previewGroup = null;
        if (isContactorCtrlDrag) {
            previewGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            previewGroup.setAttribute("class", "contactor-previews");
            svg.appendChild(previewGroup);
        }
        
        selectionBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        if (isContactorCtrlDrag) {
            selectionBox.setAttribute("class", "selection-box contactor-drag");
            selectionBox.setAttribute("fill", "rgba(180, 0, 255, 0.12)");
            selectionBox.setAttribute("stroke", "#b400ff");
            selectionBox.setAttribute("stroke-width", "1.5");
            selectionBox.setAttribute("stroke-dasharray", "4 3");
        } else {
            selectionBox.setAttribute("class", "selection-box window");
        }
        selectionBox.setAttribute("x", startX);
        selectionBox.setAttribute("y", startY);
        selectionBox.setAttribute("width", 0);
        selectionBox.setAttribute("height", 0);
        svg.appendChild(selectionBox);
        
        const onMouseMove = (ev) => {
            if (!dragStart || !selectionBox) return;
            const rBound = svg.getBoundingClientRect();
            const currentX = ev.clientX - rBound.left;
            const currentY = ev.clientY - rBound.top;
            
            const x = Math.min(dragStart.x, currentX);
            const y = Math.min(dragStart.y, currentY);
            const width = Math.abs(dragStart.x - currentX);
            const height = Math.abs(dragStart.y - currentY);
            
            selectionBox.setAttribute("x", x);
            selectionBox.setAttribute("y", y);
            selectionBox.setAttribute("width", width);
            selectionBox.setAttribute("height", height);
            
            if (isContactorCtrlDrag) {
                previewGroup.innerHTML = "";
                const x2 = x + width;
                const y2 = y + height;
                
                for (let r = 1; r < field.rows - 1; r++) {
                    const cy = marginY + r * cellHeight;
                    
                    let hasRowWire = false;
                    for (let colCheck = 0; colCheck < field.cols; colCheck++) {
                        const comp = field.components[`${r}-${colCheck}`];
                        if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                            hasRowWire = true;
                            break;
                        }
                    }
                    
                    for (let c = 1; c < field.cols - 1; c++) {
                        const cx = marginX + c * cellWidth;
                        const inside = (cx >= x && cx <= x2 && cy >= y && cy <= y2);
                        if (!inside) continue;
                        
                        let hasColWire = false;
                        for (let rowCheck = 0; rowCheck < field.rows; rowCheck++) {
                            const comp = field.components[`${rowCheck}-${c}`];
                            if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                                hasColWire = true;
                                break;
                            }
                        }
                        
                        const key = `${r}-${c}`;
                        if (hasRowWire && hasColWire && !field.components[key] && !field.contactors[key]) {
                            const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                            circ.setAttribute("cx", cx);
                            circ.setAttribute("cy", cy);
                            circ.setAttribute("r", 7);
                            circ.setAttribute("fill", "rgba(0, 240, 255, 0.4)");
                            circ.setAttribute("stroke", "var(--primary)");
                            circ.setAttribute("stroke-width", "1.5");
                            circ.setAttribute("stroke-dasharray", "2 1");
                            previewGroup.appendChild(circ);
                        }
                    }
                }
            } else {
                if (currentX >= dragStart.x) {
                    selectionBox.setAttribute("class", "selection-box window");
                } else {
                    selectionBox.setAttribute("class", "selection-box crossing");
                }
            }
        };
        
        const onMouseUp = (ev) => {
            if (!dragStart || !selectionBox) return;
            
            const rBound = svg.getBoundingClientRect();
            const currentX = ev.clientX - rBound.left;
            const currentY = ev.clientY - rBound.top;
            
            const x1 = Math.min(dragStart.x, currentX);
            const y1 = Math.min(dragStart.y, currentY);
            const w = Math.abs(dragStart.x - currentX);
            const h = Math.abs(dragStart.y - currentY);
            const x2 = x1 + w;
            const y2 = y1 + h;
            
            if (isContactorCtrlDrag) {
                let contactorsPlaced = false;
                if (w > 3 || h > 3) {
                    for (let r = 1; r < field.rows - 1; r++) {
                        const cy = marginY + r * cellHeight;
                        
                        let hasRowWire = false;
                        for (let colCheck = 0; colCheck < field.cols; colCheck++) {
                            const comp = field.components[`${r}-${colCheck}`];
                            if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                                hasRowWire = true;
                                break;
                            }
                        }
                        
                        for (let c = 1; c < field.cols - 1; c++) {
                            const cx = marginX + c * cellWidth;
                            const inside = (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2);
                            if (!inside) continue;
                            
                            let hasColWire = false;
                            for (let rowCheck = 0; rowCheck < field.rows; rowCheck++) {
                                const comp = field.components[`${rowCheck}-${c}`];
                                if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                                    hasColWire = true;
                                    break;
                                }
                            }
                            
                            const key = `${r}-${c}`;
                            if (hasRowWire && hasColWire && !field.components[key] && !field.contactors[key]) {
                                field.contactors[key] = { type: 'standard', closed: false };
                                contactorsPlaced = true;
                            }
                        }
                    }
                }
                
                if (previewGroup && previewGroup.parentNode) {
                    previewGroup.parentNode.removeChild(previewGroup);
                }
                
                if (contactorsPlaced && onSaveHistoryState) {
                    onSaveHistoryState();
                }
            } else {
                const isWindow = (currentX >= dragStart.x);
                
                if (w > 3 || h > 3) {
                    for (let key in field.components) {
                        const parts = key.split('-');
                        const r = parseInt(parts[0]);
                        const c = parseInt(parts[1]);
                        const cx = marginX + c * cellWidth;
                        const cy = marginY + r * cellHeight;
                        
                        const compX1 = cx - 24;
                        const compX2 = cx + 24;
                        const compY1 = cy - 12;
                        const compY2 = cy + 12;
                        
                        let match = false;
                        if (isWindow) {
                            match = (compX1 >= x1 && compX2 <= x2 && compY1 >= y1 && compY2 <= y2);
                        } else {
                            match = (compX2 >= x1 && compX1 <= x2 && compY2 >= y1 && compY1 <= y2);
                        }
                        
                        if (match) {
                            selectedKeys.add(`${field.id}-comp-${key}`);
                        }
                    }
                    
                    for (let key in field.contactors) {
                        const parts = key.split('-');
                        const r = parseInt(parts[0]);
                        const c = parseInt(parts[1]);
                        const cx = marginX + c * cellWidth;
                        const cy = marginY + r * cellHeight;
                        const ctc = field.contactors[key];
                        
                        let ctcX1 = cx - 8;
                        let ctcX2 = cx + 8;
                        let ctcY1 = cy - 8;
                        let ctcY2 = cy + 8;
                        
                        if (ctc && (ctc.type === 'horizontal' || ctc.type === 'vertical')) {
                            if (ctc.type === 'horizontal') {
                                ctcX1 = cx - 12; ctcX2 = cx + 12;
                                ctcY1 = cy - 5; ctcY2 = cy + 5;
                            } else {
                                ctcX1 = cx - 5; ctcX2 = cx + 5;
                                ctcY1 = cy - 12; ctcY2 = cy + 12;
                            }
                        }
                        
                        let match = false;
                        if (isWindow) {
                            match = (ctcX1 >= x1 && ctcX2 <= x2 && ctcY1 >= y1 && ctcY2 <= y2);
                        } else {
                            match = (ctcX2 >= x1 && ctcX1 <= x2 && ctcY2 >= y1 && ctcY1 <= y2);
                        }
                        
                        if (match) {
                            selectedKeys.add(`${field.id}-ctc-${key}`);
                        }
                    }
                }
            }
            
            if (selectionBox && selectionBox.parentNode) {
                selectionBox.parentNode.removeChild(selectionBox);
            }
            dragStart = null;
            selectionBox = null;
            
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            if (onUpdateCanvas) onUpdateCanvas();
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
    
    svg._dragSelectionHandler = handleMouseDown;
    svg.addEventListener('mousedown', handleMouseDown);
}

function drawGridCells(field, svg, state) {
    const { isSimulationMode, activeTool, onCellMouseDown, onCellHover } = state;
    
    for (let r = 0; r < field.rows; r++) {
        const y = marginY + r * cellHeight;
        for (let c = 0; c < field.cols; c++) {
            const x = marginX + c * cellWidth;
            
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x - cellWidth/2);
            rect.setAttribute("y", y - cellHeight/2);
            rect.setAttribute("width", cellWidth);
            rect.setAttribute("height", cellHeight);
            rect.setAttribute("class", "grid-cell-rect");
            
            if (c === 0) {
                rect.setAttribute("fill", "var(--zone-left)");
            } else if (c === field.cols - 1) {
                rect.setAttribute("fill", "var(--zone-right)");
            } else if (r === 0) {
                rect.setAttribute("fill", "var(--zone-top)");
            } else if (r === field.rows - 1) {
                rect.setAttribute("fill", "var(--zone-bottom)");
            } else {
                rect.setAttribute("fill", "var(--zone-grid)");
            }
            
            rect.onmousedown = (e) => {
                if (isSimulationMode) return;
                const isContactorCtrlDrag = (activeTool === 'contactor' && (e.ctrlKey || e.metaKey));
                if (activeTool === 'select' || isContactorCtrlDrag) {
                    return;
                }
                if (onCellMouseDown) onCellMouseDown(e, field.id, r, c);
            };

            rect.onmouseenter = (e) => {
                if (onCellHover) onCellHover(e, field.id, r, c);
            };

            svg.appendChild(rect);
        }
    }
}

function drawRulers(field, svg, state) {
    const { isSimulationMode, onDeleteCol, onDeleteRow, onInsertCol, onInsertRow } = state;
    
    for (let c = 0; c < field.cols; c++) {
        const x = marginX + c * cellWidth;
        
        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", x);
        tick.setAttribute("y1", marginY - cellHeight/2 - 15);
        tick.setAttribute("x2", x);
        tick.setAttribute("y2", marginY - cellHeight/2);
        tick.setAttribute("stroke", "var(--border)");
        svg.appendChild(tick);

        const labelText = c === 0 ? "Слева" : (c === field.cols - 1 ? "Справа" : `${c}`);
        
        const grp = document.createElementNS("http://www.w3.org/2000/svg", "g");
        grp.setAttribute("class", "ruler-label-group");
        
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x);
        text.setAttribute("y", marginY - cellHeight/2 - 20);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "ruler-text");
        text.textContent = labelText;
        grp.appendChild(text);
        
        if (!isSimulationMode && c > 0 && c < field.cols - 1) {
            let isColEmpty = true;
            for (let r = 0; r < field.rows; r++) {
                if (field.components[`${r}-${c}`] || field.contactors[`${r}-${c}`]) {
                    isColEmpty = false;
                    break;
                }
            }
            if (isColEmpty) {
                const btn = document.createElementNS("http://www.w3.org/2000/svg", "g");
                btn.setAttribute("class", "hover-minus-btn");
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (onDeleteCol) onDeleteCol(field, c);
                };
                
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", x);
                circle.setAttribute("cy", marginY - cellHeight/2 - 35);
                circle.setAttribute("r", 7);
                circle.setAttribute("fill", "#ff4a6b");
                btn.appendChild(circle);
                
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", x - 3.5);
                line.setAttribute("y1", marginY - cellHeight/2 - 35);
                line.setAttribute("x2", x + 3.5);
                line.setAttribute("y2", marginY - cellHeight/2 - 35);
                line.setAttribute("stroke", "#ffffff");
                line.setAttribute("stroke-width", "1.8");
                btn.appendChild(line);
                
                grp.appendChild(btn);
            }
        }
        
        svg.appendChild(grp);
        
        if (!isSimulationMode && c < field.cols - 1) {
            const xPlus = x + cellWidth / 2;
            const yPlus = marginY - cellHeight / 2 - 20;
            
            const plusGrp = document.createElementNS("http://www.w3.org/2000/svg", "g");
            plusGrp.setAttribute("class", "ruler-plus-group");
            plusGrp.onclick = (e) => {
                e.stopPropagation();
                if (onInsertCol) onInsertCol(field, c);
            };
            
            const hoverRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            hoverRect.setAttribute("x", xPlus - 12);
            hoverRect.setAttribute("y", yPlus - 15);
            hoverRect.setAttribute("width", 24);
            hoverRect.setAttribute("height", 30);
            hoverRect.setAttribute("fill", "transparent");
            plusGrp.appendChild(hoverRect);
            
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", xPlus);
            circle.setAttribute("cy", yPlus);
            circle.setAttribute("r", 7);
            circle.setAttribute("fill", "var(--primary)");
            plusGrp.appendChild(circle);
            
            const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
            lineH.setAttribute("x1", xPlus - 4);
            lineH.setAttribute("y1", yPlus);
            lineH.setAttribute("x2", xPlus + 4);
            lineH.setAttribute("y2", yPlus);
            lineH.setAttribute("stroke", "#000000");
            lineH.setAttribute("stroke-width", "1.8");
            plusGrp.appendChild(lineH);
            
            const lineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
            lineV.setAttribute("x1", xPlus);
            lineV.setAttribute("y1", yPlus - 4);
            lineV.setAttribute("x2", xPlus);
            lineV.setAttribute("y2", yPlus + 4);
            lineV.setAttribute("stroke", "#000000");
            lineV.setAttribute("stroke-width", "1.8");
            plusGrp.appendChild(lineV);
            
            svg.appendChild(plusGrp);
        }
    }

    for (let r = 0; r < field.rows; r++) {
        const y = marginY + r * cellHeight;
        
        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", marginX - cellWidth/2 - 15);
        tick.setAttribute("y1", y);
        tick.setAttribute("x2", marginX - cellWidth/2);
        tick.setAttribute("y2", y);
        tick.setAttribute("stroke", "var(--border)");
        svg.appendChild(tick);

        const labelText = r === 0 ? "Вверх" : (r === field.rows - 1 ? "Вниз" : `${r}`);
        
        const grp = document.createElementNS("http://www.w3.org/2000/svg", "g");
        grp.setAttribute("class", "ruler-label-group");
        
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", marginX - cellWidth/2 - 20);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("class", "ruler-text");
        text.textContent = labelText;
        grp.appendChild(text);
        
        if (!isSimulationMode && r > 0 && r < field.rows - 1) {
            let isRowEmpty = true;
            for (let c = 0; c < field.cols; c++) {
                if (field.components[`${r}-${c}`] || field.contactors[`${r}-${c}`]) {
                    isRowEmpty = false;
                    break;
                }
            }
            if (isRowEmpty) {
                const btn = document.createElementNS("http://www.w3.org/2000/svg", "g");
                btn.setAttribute("class", "hover-minus-btn");
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (onDeleteRow) onDeleteRow(field, r);
                };
                
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", marginX - cellWidth/2 - 38);
                circle.setAttribute("cy", y);
                circle.setAttribute("r", 7);
                circle.setAttribute("fill", "#ff4a6b");
                btn.appendChild(circle);
                
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", marginX - cellWidth/2 - 41.5);
                line.setAttribute("y1", y);
                line.setAttribute("x2", marginX - cellWidth/2 - 34.5);
                line.setAttribute("y2", y);
                line.setAttribute("stroke", "#ffffff");
                line.setAttribute("stroke-width", "1.8");
                btn.appendChild(line);
                
                grp.appendChild(btn);
            }
        }
        
        svg.appendChild(grp);
        
        if (!isSimulationMode && r < field.rows - 1) {
            const xPlus = marginX - cellWidth / 2 - 20;
            const yPlus = y + cellHeight / 2;
            
            const plusGrp = document.createElementNS("http://www.w3.org/2000/svg", "g");
            plusGrp.setAttribute("class", "ruler-plus-group");
            plusGrp.onclick = (e) => {
                e.stopPropagation();
                if (onInsertRow) onInsertRow(field, r);
            };
            
            const hoverRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            hoverRect.setAttribute("x", xPlus - 15);
            hoverRect.setAttribute("y", yPlus - 12);
            hoverRect.setAttribute("width", 30);
            hoverRect.setAttribute("height", 24);
            hoverRect.setAttribute("fill", "transparent");
            plusGrp.appendChild(hoverRect);
            
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", xPlus);
            circle.setAttribute("cy", yPlus);
            circle.setAttribute("r", 7);
            circle.setAttribute("fill", "var(--primary)");
            plusGrp.appendChild(circle);
            
            const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
            lineH.setAttribute("x1", xPlus - 4);
            lineH.setAttribute("y1", yPlus);
            lineH.setAttribute("x2", xPlus + 4);
            lineH.setAttribute("y2", yPlus);
            lineH.setAttribute("stroke", "#000000");
            lineH.setAttribute("stroke-width", "1.8");
            plusGrp.appendChild(lineH);
            
            const lineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
            lineV.setAttribute("x1", xPlus);
            lineV.setAttribute("y1", yPlus - 4);
            lineV.setAttribute("x2", xPlus);
            lineV.setAttribute("y2", yPlus + 4);
            lineV.setAttribute("stroke", "#000000");
            lineV.setAttribute("stroke-width", "1.8");
            plusGrp.appendChild(lineV);
            
            svg.appendChild(plusGrp);
        }
    }
}

function drawCenteredResizeButtons(field, svg, state) {
    const { onAdjustSize, onManualSize } = state;
    
    const topCenterX = marginX + cellWidth;
    const topY = marginY - cellHeight / 2 - 45;
    const colDisplayVal = field.cols - 2;

    createSvgRulerButton(svg, topCenterX - 38, topY, 20, 20, "-", () => onAdjustSize && onAdjustSize(field.id, 'cols', -1));
    createSvgValueBox(svg, topCenterX - 18, topY, 36, 20, colDisplayVal, `val-cols-${field.id}`, () => onManualSize && onManualSize(field.id, 'cols', `val-cols-${field.id}`));
    createSvgRulerButton(svg, topCenterX + 18, topY, 20, 20, "+", () => onAdjustSize && onAdjustSize(field.id, 'cols', 1));

    const leftX = 30;
    const leftCenterY = marginY + cellHeight;
    const rowDisplayVal = field.rows - 2;

    createSvgRulerButton(svg, leftX, leftCenterY - 38, 20, 20, "-", () => onAdjustSize && onAdjustSize(field.id, 'rows', -1));
    createSvgValueBox(svg, leftX, leftCenterY - 18, 20, 36, rowDisplayVal, `val-rows-${field.id}`, () => onManualSize && onManualSize(field.id, 'rows', `val-rows-${field.id}`));
    createSvgRulerButton(svg, leftX, leftCenterY + 18, 20, 20, "+", () => onAdjustSize && onAdjustSize(field.id, 'rows', 1));
}

function createSvgRulerButton(parent, x, y, w, h, symbol, action) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", 4);
    rect.setAttribute("class", "svg-ruler-btn");
    rect.onclick = (e) => {
        e.stopPropagation();
        action();
    };
    parent.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x + w/2);
    text.setAttribute("y", y + h/2 + 4.5);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "svg-ruler-btn-text");
    text.textContent = symbol;
    parent.appendChild(text);
}

function createSvgValueBox(parent, x, y, w, h, val, rectId, action) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", 4);
    rect.setAttribute("id", rectId);
    rect.setAttribute("class", "svg-ruler-val-rect");
    rect.onclick = (e) => {
        e.stopPropagation();
        action();
    };
    parent.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x + w/2);
    text.setAttribute("y", y + h/2 + 4);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "svg-ruler-val-text");
    text.textContent = val;
    parent.appendChild(text);
}

function drawWiring(field, svg, activePaths, state) {
    for (let r = 1; r < field.rows - 1; r++) {
        const y = marginY + r * cellHeight;
        let hasRowWire = false;
        for (let colCheck = 0; colCheck < field.cols; colCheck++) {
            const comp = field.components[`${r}-${colCheck}`];
            if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                hasRowWire = true;
                break;
            }
        }
        
        if (hasRowWire) {
            const yPos = y - 4;
            const yNeg = y + 4;
            
            for (let c = 0; c < field.cols - 1; c++) {
                const x1 = marginX + c * cellWidth - 0.5;
                const x2 = marginX + (c + 1) * cellWidth + 0.5;
                
                const wirePId = `${field.id}-wire-row-p-seg-${r}-${c}`;
                const wireNId = `${field.id}-wire-row-n-seg-${r}-${c}`;
                const isActiveP = activePaths && activePaths.has(wirePId);
                const isActiveN = activePaths && activePaths.has(wireNId);

                const lineP = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineP.setAttribute("x1", x1);
                lineP.setAttribute("y1", yPos);
                lineP.setAttribute("x2", x2);
                lineP.setAttribute("y2", yPos);
                lineP.setAttribute("class", `wire-p ${isActiveP ? 'active' : ''}`);
                lineP.setAttribute("id", wirePId);
                if (isActiveP) lineP.setAttribute("stroke", "#ff7788");
                svg.appendChild(lineP);

                const lineN = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineN.setAttribute("x1", x1);
                lineN.setAttribute("y1", yNeg);
                lineN.setAttribute("x2", x2);
                lineN.setAttribute("y2", yNeg);
                lineN.setAttribute("class", `wire-n ${isActiveN ? 'active' : ''}`);
                lineN.setAttribute("id", wireNId);
                if (isActiveN) lineN.setAttribute("stroke", "#ffffff");
                svg.appendChild(lineN);

                const lineNInner = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineNInner.setAttribute("x1", x1);
                lineNInner.setAttribute("y1", yNeg);
                lineNInner.setAttribute("x2", x2);
                lineNInner.setAttribute("y2", yNeg);
                lineNInner.setAttribute("class", "wire-n-inner");
                svg.appendChild(lineNInner);
            }
        }
    }

    for (let c = 1; c < field.cols - 1; c++) {
        const x = marginX + c * cellWidth;
        let hasColWire = false;
        for (let rowCheck = 0; rowCheck < field.rows; rowCheck++) {
            const comp = field.components[`${rowCheck}-${c}`];
            if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                hasColWire = true;
                break;
            }
        }

        if (hasColWire) {
            const xPos = x - 4;
            const xNeg = x + 4;

            for (let r = 0; r < field.rows - 1; r++) {
                const y1 = marginY + r * cellHeight - 0.5;
                const y2 = marginY + (r + 1) * cellHeight + 0.5;
                
                const wirePId = `${field.id}-wire-col-p-seg-${c}-${r}`;
                const wireNId = `${field.id}-wire-col-n-seg-${c}-${r}`;
                const isActiveP = activePaths && activePaths.has(wirePId);
                const isActiveN = activePaths && activePaths.has(wireNId);

                const lineP = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineP.setAttribute("x1", xPos);
                lineP.setAttribute("y1", y1);
                lineP.setAttribute("x2", xPos);
                lineP.setAttribute("y2", y2);
                lineP.setAttribute("class", `wire-p ${isActiveP ? 'active' : ''}`);
                lineP.setAttribute("id", wirePId);
                if (isActiveP) lineP.setAttribute("stroke", "#ff7788");
                svg.appendChild(lineP);

                const lineN = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineN.setAttribute("x1", xNeg);
                lineN.setAttribute("y1", y1);
                lineN.setAttribute("x2", xNeg);
                lineN.setAttribute("y2", y2);
                lineN.setAttribute("class", `wire-n ${isActiveN ? 'active' : ''}`);
                lineN.setAttribute("id", wireNId);
                if (isActiveN) lineN.setAttribute("stroke", "#ffffff");
                svg.appendChild(lineN);

                const lineNInner = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineNInner.setAttribute("x1", xNeg);
                lineNInner.setAttribute("y1", y1);
                lineNInner.setAttribute("x2", xNeg);
                lineNInner.setAttribute("y2", y2);
                lineNInner.setAttribute("class", "wire-n-inner");
                svg.appendChild(lineNInner);
            }
        }
    }
}

function drawPlacedComponents(field, svg, simulationData, state) {
    const { activePaths, pistolPowers } = simulationData;
    const { isSimulationMode, selectedKeys, onCompMouseDown, onCompDblClick, onCompContextMenu } = state;
    
    for (let key in field.components) {
        const parts = key.split('-');
        const r = parseInt(parts[0]);
        const c = parseInt(parts[1]);
        
        const x = marginX + c * cellWidth;
        const y = marginY + r * cellHeight;
        const comp = field.components[key];
        
        const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        box.setAttribute("x", x - 24);
        box.setAttribute("y", y - 12);
        box.setAttribute("width", 48);
        box.setAttribute("height", 24);
        box.setAttribute("rx", 4);
        
        const selectionKey = `${field.id}-comp-${key}`;
        const isSel = selectedKeys && selectedKeys.has(selectionKey);

        let baseClass = "";
        if (comp.type === 'inverter') {
            baseClass = `inv-box ${activePaths && activePaths.has(`${field.id}-inv-${r}`) ? 'active' : ''}`;
        } else if (comp.type === 'cable') {
            baseClass = `cable-box ${activePaths && (activePaths.has(`${field.id}-cable-in-${key}`) || activePaths.has(`${field.id}-cable-out-${key}`)) ? 'active' : ''}`;
        } else if (comp.type === 'pistol') {
            baseClass = `pst-box ${activePaths && activePaths.has(`${field.id}-pst-${c}`) ? 'active' : ''}`;
        }
        
        if (isSel) {
            baseClass += " selected";
        }
        box.setAttribute("class", baseClass);
        
        box.onmousedown = (e) => {
            if (onCompMouseDown) onCompMouseDown(e, field.id, r, c, 'comp', selectionKey);
        };

        box.ondblclick = (e) => {
            if (onCompDblClick) onCompDblClick(e, field.id, r, c, 'comp', selectionKey);
        };

        box.oncontextmenu = (e) => {
            if (onCompContextMenu) onCompContextMenu(e, field.id, r, c, 'comp', selectionKey);
        };
        
        svg.appendChild(box);

        const txtColor = comp.type === 'cable' ? "#ffffff" : "#000000";
        
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", x);
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("fill", txtColor);
        txt.setAttribute("font-size", "10px");
        txt.setAttribute("font-weight", "bold");
        txt.setAttribute("pointer-events", "none");
        
        const isSimPistol = isSimulationMode && comp.type === 'pistol';
        if (isSimPistol) {
            txt.setAttribute("y", y - 1);
        } else {
            txt.setAttribute("y", y + 4);
        }
        
        const displayName = comp.type === 'inverter' && comp.power ? `${comp.name} (${comp.power})` : comp.name;
        txt.textContent = displayName;
        svg.appendChild(txt);

        if (isSimPistol) {
            const pUid = `${field.id}-${key}`;
            const pPower = pistolPowers[pUid] || 0;
            
            const pTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
            pTxt.setAttribute("id", `pistol-power-text-${pUid}`);
            pTxt.setAttribute("x", x);
            pTxt.setAttribute("y", y + 9);
            pTxt.setAttribute("text-anchor", "middle");
            pTxt.setAttribute("fill", "#000000");
            pTxt.setAttribute("font-size", "8px");
            pTxt.setAttribute("font-weight", "bold");
            pTxt.setAttribute("pointer-events", "none");
            pTxt.textContent = `${pPower} кВт`;
            svg.appendChild(pTxt);
        }
    }
}

function drawGridPointsAndContactors(field, svg, simulationData, state) {
    const { contactorPowers } = simulationData;
    const { isSimulationMode, showPowerFlow, selectedKeys, onCtcMouseDown, onCtcContextMenu } = state;
    
    for (let r = 1; r < field.rows - 1; r++) {
        const y = marginY + r * cellHeight;
        let hasRowWire = false;
        for (let colCheck = 0; colCheck < field.cols; colCheck++) {
            const comp = field.components[`${r}-${colCheck}`];
            if (comp && (comp.type === 'inverter' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                hasRowWire = true;
                break;
            }
        }
        
        for (let c = 1; c < field.cols - 1; c++) {
            const x = marginX + c * cellWidth;
            let hasColWire = false;
            for (let rowCheck = 0; rowCheck < field.rows; rowCheck++) {
                const comp = field.components[`${rowCheck}-${c}`];
                if (comp && (comp.type === 'pistol' || (comp.type === 'cable' && comp.pos !== 'middle'))) {
                    hasColWire = true;
                    break;
                }
            }
            
            const key = `${r}-${c}`;
            
            if (hasRowWire && hasColWire) {
                const ctc = field.contactors[key];
                
                if (ctc && (!ctc.type || ctc.type === 'standard')) {
                    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    circle.setAttribute("cx", x);
                    circle.setAttribute("cy", y);
                    circle.setAttribute("r", 8);
                    const ctcSelectionKey = `${field.id}-ctc-${key}`;
                    const isCtcSel = selectedKeys && selectedKeys.has(ctcSelectionKey);
                    circle.setAttribute("class", `ctc-circle ${isCtcSel ? 'selected' : ''}`);
                    
                    const isClosed = ctc.closed;
                    circle.setAttribute("fill", isClosed ? "var(--primary)" : "#1e293b");
                    if (isClosed) {
                        circle.setAttribute("filter", "drop-shadow(0 0 6px var(--primary))");
                    }
                    
                    circle.onmousedown = (e) => {
                        if (onCtcMouseDown) onCtcMouseDown(e, field.id, r, c, 'ctc', ctcSelectionKey, ctc);
                    };

                    circle.oncontextmenu = (e) => {
                        if (onCtcContextMenu) onCtcContextMenu(e, field.id, r, c, 'ctc', ctcSelectionKey);
                    };

                    svg.appendChild(circle);

                    if (isSimulationMode && showPowerFlow && ctc.closed) {
                        const ctcKey = `${field.id}-ctc-${key}`;
                        const pwr = contactorPowers[ctcKey] || 0;
                        const pTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        pTxt.setAttribute("x", x);
                        pTxt.setAttribute("y", y - 11);
                        pTxt.setAttribute("text-anchor", "middle");
                        pTxt.setAttribute("fill", "#00ffcc");
                        pTxt.setAttribute("font-size", "10px");
                        pTxt.setAttribute("font-weight", "bold");
                        pTxt.setAttribute("style", "text-shadow: 0 0 3px #000, 0 0 5px #000; pointer-events: none;");
                        pTxt.textContent = `${Math.round(pwr * 10) / 10} кВт`;
                        svg.appendChild(pTxt);
                    }
                }
            } else if (hasRowWire || hasColWire) {
                const ctc = field.contactors[key];
                
                if (ctc && (ctc.type === 'horizontal' || ctc.type === 'vertical')) {
                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    
                    if (ctc.type === 'horizontal') {
                        rect.setAttribute("x", x - 12);
                        rect.setAttribute("y", y - 5);
                        rect.setAttribute("width", 24);
                        rect.setAttribute("height", 10);
                    } else {
                        rect.setAttribute("x", x - 5);
                        rect.setAttribute("y", y - 12);
                        rect.setAttribute("width", 10);
                        rect.setAttribute("height", 24);
                    }
                    
                    const breakerSelectionKey = `${field.id}-ctc-${key}`;
                    const isBreakerSel = selectedKeys && selectedKeys.has(breakerSelectionKey);
                    rect.setAttribute("class", isBreakerSel ? "selected" : "");
                    
                    rect.setAttribute("rx", 2);
                    rect.setAttribute("stroke", "#000");
                    rect.setAttribute("stroke-width", "1");
                    rect.setAttribute("fill", ctc.closed ? "var(--primary)" : "#ff4a6b");
                    rect.setAttribute("cursor", "pointer");
                    
                    rect.onmousedown = (e) => {
                        if (onCtcMouseDown) onCtcMouseDown(e, field.id, r, c, 'ctc', breakerSelectionKey, ctc);
                    };

                    rect.oncontextmenu = (e) => {
                        if (onCtcContextMenu) onCtcContextMenu(e, field.id, r, c, 'ctc', breakerSelectionKey);
                    };

                    svg.appendChild(rect);

                    if (isSimulationMode && showPowerFlow && ctc.closed) {
                        const ctcKey = `${field.id}-ctc-${key}`;
                        const pwr = contactorPowers[ctcKey] || 0;
                        const pTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        if (ctc.type === 'horizontal') {
                            pTxt.setAttribute("x", x);
                            pTxt.setAttribute("y", y - 9);
                            pTxt.setAttribute("text-anchor", "middle");
                        } else {
                            pTxt.setAttribute("x", x + 11);
                            pTxt.setAttribute("y", y + 4);
                            pTxt.setAttribute("text-anchor", "start");
                        }
                        pTxt.setAttribute("fill", "#00ffcc");
                        pTxt.setAttribute("font-size", "10px");
                        pTxt.setAttribute("font-weight", "bold");
                        pTxt.setAttribute("style", "text-shadow: 0 0 3px #000, 0 0 5px #000; pointer-events: none;");
                        pTxt.textContent = `${Math.round(pwr * 10) / 10} кВт`;
                        svg.appendChild(pTxt);
                    }
                }
            }
        }
    }
}
