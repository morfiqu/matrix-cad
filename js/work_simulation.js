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

    // Simulation Time and Speed State
    window.workSimState = {
        totalSeconds: 0,
        isPlaying: false,
        speedIndex: 0,
        speeds: [1, 10, 100, 1000]
    };

    let simTickerInterval = null;

    let currentDocks = {
        'work-sim-panel': 'floating',
        'work-sim-dash-panel': 'floating'
    };

    // Create and inject both Panels on load
    function injectPanels() {
        if (document.getElementById('work-sim-panel')) return;

        const container = document.getElementById('app-layout') || document.body;

        // Panel 1: Cars Fleet Table
        const panel = document.createElement('div');
        panel.id = 'work-sim-panel';
        panel.className = 'work-sim-panel floating';
        panel.style.display = 'none';
        panel.style.left = 'calc(50% - 370px)';
        panel.style.top = '100px';
        panel.style.width = '360px';
        panel.style.height = '400px';

        panel.innerHTML = `
            <div class="work-sim-header" id="work-sim-handle">
                <span class="work-sim-title">🚗 Автопарк симуляции</span>
                <div class="work-sim-actions">
                    <button class="work-sim-btn-icon" onclick="toggleWorkSimulationPanel()">✕</button>
                </div>
            </div>
            <div class="work-sim-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 700; font-size: 12px; color: var(--text-muted);">СПИСОК МОДЕЛЕЙ</span>
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
        container.appendChild(panel);

        // Panel 2: Simulation Dashboard / Clock controls
        const dash = document.createElement('div');
        dash.id = 'work-sim-dash-panel';
        dash.className = 'work-sim-panel floating';
        dash.style.display = 'none';
        dash.style.left = 'calc(50% + 10px)';
        dash.style.top = '100px';
        dash.style.width = '320px';
        dash.style.height = '180px';

        dash.innerHTML = `
            <div class="work-sim-header" id="work-sim-dash-handle">
                <span class="work-sim-title">⏱️ Панель управления</span>
                <div class="work-sim-actions">
                    <button class="work-sim-btn-icon" onclick="toggleWorkSimulationPanel()">✕</button>
                </div>
            </div>
            <div class="work-sim-content" style="align-items: center; justify-content: center; gap: 14px;">
                <div style="text-align: center;">
                    <div class="work-sim-speed-badge" id="work-sim-speed-val">x1</div>
                    <div class="work-sim-time-display" id="work-sim-time-val">День 0 • 00:00:00</div>
                </div>
                <div class="work-sim-controls-bar">
                    <button class="btn-ctrl" onclick="changeSimSpeed(-1)" title="Медленнее (уменьшить множитель в 10 раз)">⏪</button>
                    <button class="btn-ctrl btn-play" id="work-sim-play-btn" onclick="toggleSimPlay()">▶️ Пуск</button>
                    <button class="btn-ctrl" onclick="changeSimSpeed(1)" title="Быстрее (ускорить в 10 раз)">⏩</button>
                </div>
            </div>
        `;
        container.appendChild(dash);
        
        initDragging('work-sim-panel', 'work-sim-handle');
        initDragging('work-sim-dash-panel', 'work-sim-dash-handle');
        
        renderCarsTable();
        updateSimUI();
    }

    // Generic dragging & snapping module relative to #app-layout
    function initDragging(panelId, handleId) {
        const handle = document.getElementById(handleId);
        const panel = document.getElementById(panelId);
        if (!handle || !panel) return;
        
        let isDragging = false;
        let startX, startY;
        let panelStartLeft, panelStartTop;
        
        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left click only
            if (e.target.closest('.work-sim-actions') || e.target.closest('button')) return;
            
            e.preventDefault();
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            panelStartLeft = panel.offsetLeft;
            panelStartTop = panel.offsetTop;
            
            const currentDock = currentDocks[panelId] || 'floating';
            if (currentDock !== 'floating') {
                currentDocks[panelId] = 'floating';
                panel.className = 'work-sim-panel floating';
                
                if (panelId === 'work-sim-panel') {
                    panel.style.width = '360px';
                    panel.style.height = '400px';
                } else {
                    panel.style.width = '320px';
                    panel.style.height = '180px';
                }
                
                const layout = document.getElementById('app-layout');
                const layoutRect = layout ? layout.getBoundingClientRect() : { left: 0, top: 0 };
                
                if (panelId === 'work-sim-panel') {
                    panelStartLeft = e.clientX - layoutRect.left - 180;
                } else {
                    panelStartLeft = e.clientX - layoutRect.left - 160;
                }
                panelStartTop = e.clientY - layoutRect.top - 20;
                
                panel.style.left = panelStartLeft + 'px';
                panel.style.top = panelStartTop + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
            
            const onMouseMove = (ev) => {
                if (!isDragging) return;
                const layout = document.getElementById('app-layout');
                if (!layout) return;
                
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                
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
                const layoutX = ev.clientX - layoutRect.left;
                const layoutY = ev.clientY - layoutRect.top;
                
                const snapZone = 80;
                if (layoutX < snapZone) {
                    showSnapPreview('left', panelId);
                } else if (layoutX > layoutRect.width - snapZone) {
                    showSnapPreview('right', panelId);
                } else if (layoutY > layoutRect.height - snapZone) {
                    showSnapPreview('bottom', panelId);
                } else {
                    hideSnapPreview();
                }
            };
            
            const onMouseUp = (ev) => {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                
                hideSnapPreview();
                
                const layout = document.getElementById('app-layout');
                if (!layout) return;
                
                const layoutRect = layout.getBoundingClientRect();
                const layoutX = ev.clientX - layoutRect.left;
                const layoutY = ev.clientY - layoutRect.top;
                
                const snapZone = 80;
                if (layoutX < snapZone) {
                    dockPanel('left', panelId);
                } else if (layoutX > layoutRect.width - snapZone) {
                    dockPanel('right', panelId);
                } else if (layoutY > layoutRect.height - snapZone) {
                    dockPanel('bottom', panelId);
                } else {
                    currentDocks[panelId] = 'floating';
                    panel.className = 'work-sim-panel floating';
                }
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    function showSnapPreview(side, panelId) {
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
        
        const width = (panelId === 'work-sim-panel') ? '360px' : '320px';
        const bottomHeight = (panelId === 'work-sim-panel') ? '250px' : '180px';
        
        preview.style.display = 'block';
        if (side === 'left') {
            preview.style.left = '0';
            preview.style.top = '0';
            preview.style.bottom = '0';
            preview.style.right = 'auto';
            preview.style.width = width;
            preview.style.height = '100%';
        } else if (side === 'right') {
            preview.style.right = '0';
            preview.style.left = 'auto';
            preview.style.top = '0';
            preview.style.bottom = '0';
            preview.style.width = width;
            preview.style.height = '100%';
        } else if (side === 'bottom') {
            preview.style.left = '0';
            preview.style.right = '0';
            preview.style.bottom = '0';
            preview.style.top = 'auto';
            preview.style.width = '100%';
            preview.style.height = bottomHeight;
        }
    }

    function hideSnapPreview() {
        const preview = document.getElementById('work-sim-snap-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

    function dockPanel(side, panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        currentDocks[panelId] = side;
        panel.className = 'work-sim-panel ' + side;
        
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.width = '';
        panel.style.height = '';
        
        if (side === 'floating') {
            if (panelId === 'work-sim-panel') {
                panel.style.left = 'calc(50% - 370px)';
                panel.style.top = '100px';
                panel.style.width = '360px';
                panel.style.height = '400px';
            } else {
                panel.style.left = 'calc(50% + 10px)';
                panel.style.top = '100px';
                panel.style.width = '320px';
                panel.style.height = '180px';
            }
        } else if (side === 'bottom') {
            if (panelId === 'work-sim-panel') {
                panel.style.height = '250px';
            } else {
                panel.style.height = '180px';
            }
        } else {
            if (panelId === 'work-sim-panel') {
                panel.style.width = '360px';
            } else {
                panel.style.width = '320px';
            }
        }
    }

    // Render Table Rows (Cars list)
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

    // Format Simulation Time (Day X • HH:MM:SS)
    function formatSimTime(totalSeconds) {
        const d = Math.floor(totalSeconds / (24 * 3600));
        const h = Math.floor((totalSeconds % (24 * 3600)) / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);
        
        const pad = (num) => String(num).padStart(2, '0');
        return `День ${d} • ${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    // Ticker Management
    function startSimTicker() {
        if (simTickerInterval) clearInterval(simTickerInterval);
        
        simTickerInterval = setInterval(() => {
            if (window.workSimState.isPlaying) {
                const multiplier = window.workSimState.speeds[window.workSimState.speedIndex];
                // 100ms interval -> 0.1 real seconds passed
                window.workSimState.totalSeconds += 0.1 * multiplier;
                updateSimUI();
            }
        }, 100);
    }

    function stopSimTicker() {
        if (simTickerInterval) {
            clearInterval(simTickerInterval);
            simTickerInterval = null;
        }
    }

    function updateSimUI() {
        const timeVal = document.getElementById('work-sim-time-val');
        if (timeVal) {
            timeVal.textContent = formatSimTime(window.workSimState.totalSeconds);
        }
        
        const speedVal = document.getElementById('work-sim-speed-val');
        if (speedVal) {
            speedVal.textContent = 'x' + window.workSimState.speeds[window.workSimState.speedIndex];
        }

        const playBtn = document.getElementById('work-sim-play-btn');
        if (playBtn) {
            if (window.workSimState.isPlaying) {
                playBtn.innerHTML = '⏸️ Пауза';
                playBtn.classList.add('playing');
            } else {
                playBtn.innerHTML = '▶️ Пуск';
                playBtn.classList.remove('playing');
            }
        }
    }

    // Window global APIs
    window.toggleWorkSimulationPanel = function() {
        const panel = document.getElementById('work-sim-panel');
        const dash = document.getElementById('work-sim-dash-panel');
        if (!panel || !dash) return;
        
        if (panel.style.display === 'none') {
            panel.style.display = 'flex';
            dash.style.display = 'flex';
            renderCarsTable();
            updateSimUI();
            startSimTicker();
        } else {
            panel.style.display = 'none';
            dash.style.display = 'none';
            hideSnapPreview();
            stopSimTicker();
        }
    };

    window.toggleSimPlay = function() {
        window.workSimState.isPlaying = !window.workSimState.isPlaying;
        updateSimUI();
    };

    window.changeSimSpeed = function(direction) {
        let newIndex = window.workSimState.speedIndex + direction;
        if (newIndex >= 0 && newIndex < window.workSimState.speeds.length) {
            window.workSimState.speedIndex = newIndex;
            updateSimUI();
        }
    };

    window.cleanupWorkSimulation = function() {
        window.workSimState.isPlaying = false;
        window.workSimState.totalSeconds = 0;
        window.workSimState.speedIndex = 0;
        stopSimTicker();
        
        const panel = document.getElementById('work-sim-panel');
        const dash = document.getElementById('work-sim-dash-panel');
        if (panel) panel.style.display = 'none';
        if (dash) dash.style.display = 'none';
        hideSnapPreview();
        updateSimUI();
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
        document.addEventListener('DOMContentLoaded', injectPanels);
    } else {
        injectPanels();
    }
})();
