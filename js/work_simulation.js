/**
 * Work Cycle Simulation Panel and Cars Configuration
 */

(function() {
    // Initial default cars config
    window.workSimCars = [
        { brand: 'Tesla Model Y', capacity: 75, voltage: 400, current: 150 },
        { brand: 'Nissan Leaf', capacity: 40, voltage: 350, current: 100 },
        { brand: 'Zeekr 001', capacity: 100, voltage: 800, current: 250 }
    ];

    let isDragging = false;
    let startX, startY;
    let panelStartLeft, panelStartTop;
    let currentDock = 'floating'; // 'floating', 'left', 'right', 'bottom'

    // Create and inject the Panel HTML on load
    function injectPanel() {
        if (document.getElementById('work-sim-panel')) return;

        // Container panel
        const panel = document.createElement('div');
        panel.id = 'work-sim-panel';
        panel.className = 'work-sim-panel floating';
        panel.style.display = 'none';

        // Set initial positions for floating state
        panel.style.left = 'calc(50% - 180px)';
        panel.style.top = '100px';
        panel.style.width = '360px';
        panel.style.height = '400px';

        panel.innerHTML = `
            <div class="work-sim-header" id="work-sim-handle">
                <span class="work-sim-title">⚡ Симуляция работы</span>
                <div class="work-sim-actions">
                    <button class="work-sim-btn-icon" onclick="toggleWorkSimulationPanel()">✕</button>
                </div>
            </div>
            <div class="work-sim-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 700; font-size: 12px; color: var(--text-main);">🚗 Автопарк симуляции</span>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-sm" onclick="exportCarsConfig()" style="font-size: 10px; padding: 3px 6px; height: auto; width: auto; min-width: 0;">⬇️ Экспорт</button>
                        <button class="btn btn-sm" onclick="triggerCarsImport()" style="font-size: 10px; padding: 3px 6px; height: auto; width: auto; min-width: 0;">⬆️ Импорт</button>
                        <input type="file" id="cars-import-input" style="display: none;" accept=".json" onchange="importCarsConfig(event)">
                    </div>
                </div>
                <div class="work-sim-table-wrap">
                    <table class="work-sim-table">
                        <thead>
                            <tr>
                                <th>Марка</th>
                                <th style="width: 55px; text-align: center;">C, кВтч</th>
                                <th style="width: 50px; text-align: center;">U, В</th>
                                <th style="width: 50px; text-align: center;">I, А</th>
                                <th style="width: 30px;"></th>
                            </tr>
                        </thead>
                        <tbody id="work-sim-cars-tbody">
                            <!-- Rows loaded dynamically -->
                        </tbody>
                    </table>
                </div>
                <button class="btn" style="margin-top: 10px; width: 100%; border-radius: 6px; background: rgba(0, 255, 170, 0.08); color: var(--primary); border: 1px dashed var(--primary);" onclick="addCarRow()">➕ Добавить автомобиль</button>
            </div>
        `;

        const container = document.getElementById('app-layout') || document.body;
        container.appendChild(panel);
        
        initDragging();
        renderCarsTable();
    }

    function initDragging() {
        const handle = document.getElementById('work-sim-handle');
        const panel = document.getElementById('work-sim-panel');
        if (!handle || !panel) return;
        
        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left click only
            if (e.target.closest('.work-sim-actions') || e.target.closest('button')) return;
            
            e.preventDefault();
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            panelStartLeft = panel.offsetLeft;
            panelStartTop = panel.offsetTop;
            
            if (currentDock !== 'floating') {
                currentDock = 'floating';
                panel.className = 'work-sim-panel floating';
                
                panel.style.width = '360px';
                panel.style.height = '400px';
                
                const layout = document.getElementById('app-layout');
                const layoutRect = layout ? layout.getBoundingClientRect() : { left: 0, top: 0 };
                
                panelStartLeft = e.clientX - layoutRect.left - 180;
                panelStartTop = e.clientY - layoutRect.top - 20;
                
                panel.style.left = panelStartLeft + 'px';
                panel.style.top = panelStartTop + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
            
            document.addEventListener('mousemove', dragMove);
            document.addEventListener('mouseup', dragEnd);
        });
    }

    function dragMove(e) {
        if (!isDragging) return;
        const panel = document.getElementById('work-sim-panel');
        const layout = document.getElementById('app-layout');
        if (!panel || !layout) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newLeft = panelStartLeft + dx;
        let newTop = panelStartTop + dy;
        
        const maxLeft = layout.clientWidth - panel.offsetWidth;
        const maxTop = layout.clientHeight - panel.offsetHeight;
        if (newLeft < 0) newLeft = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > maxTop) newTop = maxTop;
        
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        
        const layoutRect = layout.getBoundingClientRect();
        const layoutX = e.clientX - layoutRect.left;
        const layoutY = e.clientY - layoutRect.top;
        
        const snapZone = 80;
        if (layoutX < snapZone) {
            showSnapPreview('left');
        } else if (layoutX > layoutRect.width - snapZone) {
            showSnapPreview('right');
        } else if (layoutY > layoutRect.height - snapZone) {
            showSnapPreview('bottom');
        } else {
            hideSnapPreview();
        }
    }

    function dragEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragEnd);
        
        const panel = document.getElementById('work-sim-panel');
        const layout = document.getElementById('app-layout');
        if (!panel || !layout) return;
        
        hideSnapPreview();
        
        const layoutRect = layout.getBoundingClientRect();
        const layoutX = e.clientX - layoutRect.left;
        const layoutY = e.clientY - layoutRect.top;
        
        const snapZone = 80;
        if (layoutX < snapZone) {
            dockPanel('left');
        } else if (layoutX > layoutRect.width - snapZone) {
            dockPanel('right');
        } else if (layoutY > layoutRect.height - snapZone) {
            dockPanel('bottom');
        } else {
            currentDock = 'floating';
            panel.className = 'work-sim-panel floating';
        }
    }

    function showSnapPreview(side) {
        const layout = document.getElementById('app-layout');
        if (!layout) return;
        
        let preview = document.getElementById('work-sim-snap-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'work-sim-snap-preview';
            preview.style.position = 'absolute';
            preview.style.background = 'rgba(0, 255, 170, 0.08)';
            preview.style.border = '2px dashed var(--primary)';
            preview.style.zIndex = '9998';
            preview.style.pointerEvents = 'none';
            preview.style.transition = 'all 0.15s ease';
            layout.appendChild(preview);
        }
        
        preview.style.display = 'block';
        if (side === 'left') {
            preview.style.left = '0';
            preview.style.top = '0';
            preview.style.bottom = '0';
            preview.style.right = 'auto';
            preview.style.width = '350px';
            preview.style.height = '100%';
        } else if (side === 'right') {
            preview.style.right = '0';
            preview.style.left = 'auto';
            preview.style.top = '0';
            preview.style.bottom = '0';
            preview.style.width = '350px';
            preview.style.height = '100%';
        } else if (side === 'bottom') {
            preview.style.left = '0';
            preview.style.right = '0';
            preview.style.bottom = '0';
            preview.style.top = 'auto';
            preview.style.width = '100%';
            preview.style.height = '250px';
        }
    }

    // Snapping logic cleanup
    function hideSnapPreview() {
        const preview = document.getElementById('work-sim-snap-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

    function dockPanel(side) {
        const panel = document.getElementById('work-sim-panel');
        if (!panel) return;
        
        currentDock = side;
        panel.className = 'work-sim-panel ' + side;
        
        // Reset sizes
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.width = '';
        panel.style.height = '';
        
        if (side === 'floating') {
            panel.style.left = 'calc(50% - 180px)';
            panel.style.top = '100px';
            panel.style.width = '360px';
            panel.style.height = '400px';
        }
    }

    // Render Table Rows
    function renderCarsTable() {
        const tbody = document.getElementById('work-sim-cars-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        window.workSimCars.forEach((car, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="text" class="work-sim-input" value="${car.brand}" style="width: 100%;" onchange="updateCarField(${index}, 'brand', this.value)">
                </td>
                <td style="text-align: center;">
                    <input type="number" class="work-sim-input" value="${car.capacity}" style="width: 100%; text-align: center;" min="1" step="1" onchange="updateCarField(${index}, 'capacity', parseFloat(this.value) || 0)">
                </td>
                <td style="text-align: center;">
                    <input type="number" class="work-sim-input" value="${car.voltage}" style="width: 100%; text-align: center;" min="1" step="10" onchange="updateCarField(${index}, 'voltage', parseFloat(this.value) || 0)">
                </td>
                <td style="text-align: center;">
                    <input type="number" class="work-sim-input" value="${car.current}" style="width: 100%; text-align: center;" min="1" step="5" onchange="updateCarField(${index}, 'current', parseFloat(this.value) || 0)">
                </td>
                <td style="text-align: center;">
                    <button class="btn-remove-row" onclick="removeCarRow(${index})" title="Удалить автомобиль">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // API methods attached to window
    window.toggleWorkSimulationPanel = function() {
        const panel = document.getElementById('work-sim-panel');
        if (!panel) return;
        
        if (panel.style.display === 'none') {
            panel.style.display = 'flex';
            renderCarsTable();
        } else {
            panel.style.display = 'none';
            hideSnapPreview();
        }
    };

    window.updateCarField = function(index, field, value) {
        if (window.workSimCars[index]) {
            window.workSimCars[index][field] = value;
        }
    };

    window.addCarRow = function() {
        window.workSimCars.push({ brand: 'Новый электромобиль', capacity: 60, voltage: 400, current: 150 });
        renderCarsTable();
    };

    window.removeCarRow = function(index) {
        window.workSimCars.splice(index, 1);
        renderCarsTable();
    };

    window.exportCarsConfig = function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.workSimCars, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "cars_configuration.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    window.triggerCarsImport = function() {
        const input = document.getElementById('cars-import-input');
        if (input) input.click();
    };

    window.importCarsConfig = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (Array.isArray(parsed)) {
                    const valid = parsed.every(item => 
                        typeof item.brand === 'string' &&
                        typeof item.capacity === 'number' &&
                        typeof item.voltage === 'number' &&
                        typeof item.current === 'number'
                    );
                    if (valid) {
                        window.workSimCars = parsed;
                        renderCarsTable();
                    } else {
                        alert('Неверный формат файла конфигурации автомобилей!');
                    }
                } else {
                    alert('Файл должен содержать массив автомобилей!');
                }
            } catch (err) {
                alert('Ошибка при чтении JSON файла!');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    // Auto-inject on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPanel);
    } else {
        injectPanel();
    }
})();
