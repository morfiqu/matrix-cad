/**
 * Work Cycle Simulation Panel and Cars Configuration
 */

(function() {
    // Initial default cars config
    window.workSimCars = [
        { brand: 'Tesla Model Y LR', capacity: 75, voltage: 400, current: 250, share: 10, socMin: 8, socMax: 25 },
        { brand: 'Tesla Model 3 Perf', capacity: 79, voltage: 400, current: 250, share: 8, socMin: 10, socMax: 30 },
        { brand: 'Porsche Taycan Plus', capacity: 93.4, voltage: 800, current: 330, share: 3, socMin: 5, socMax: 20 },
        { brand: 'Hyundai Ioniq 5', capacity: 77.4, voltage: 800, current: 290, share: 6, socMin: 8, socMax: 25 },
        { brand: 'Kia EV6 LR', capacity: 77.4, voltage: 800, current: 290, share: 5, socMin: 8, socMax: 25 },
        { brand: 'Nissan Leaf e+', capacity: 62, voltage: 350, current: 150, share: 8, socMin: 10, socMax: 35 },
        { brand: 'Audi e-tron 55', capacity: 95, voltage: 400, current: 375, share: 5, socMin: 10, socMax: 30 },
        { brand: 'BMW i4 M50', capacity: 83.9, voltage: 400, current: 500, share: 5, socMin: 10, socMax: 30 },
        { brand: 'Zeekr 001', capacity: 100, voltage: 800, current: 400, share: 4, socMin: 5, socMax: 20 },
        { brand: 'BYD Han EV', capacity: 85.4, voltage: 570, current: 210, share: 5, socMin: 10, socMax: 35 },
        { brand: 'Volkswagen ID.4 Pro', capacity: 77, voltage: 400, current: 310, share: 7, socMin: 10, socMax: 30 },
        { brand: 'Volkswagen ID.3 Pro', capacity: 58, voltage: 400, current: 250, share: 6, socMin: 10, socMax: 35 },
        { brand: 'Chevrolet Bolt EV', capacity: 65, voltage: 350, current: 150, share: 5, socMin: 10, socMax: 30 },
        { brand: 'Renault Zoe E-Tech', capacity: 52, voltage: 400, current: 125, share: 5, socMin: 12, socMax: 40 },
        { brand: 'Mercedes-Benz EQS 450', capacity: 107.8, voltage: 400, current: 500, share: 3, socMin: 8, socMax: 25 },
        { brand: 'Peugeot e-208', capacity: 50, voltage: 400, current: 250, share: 4, socMin: 10, socMax: 35 },
        { brand: 'Polestar 2 LR', capacity: 78, voltage: 400, current: 375, share: 4, socMin: 8, socMax: 30 },
        { brand: 'Ford Mustang Mach-E', capacity: 88, voltage: 400, current: 375, share: 4, socMin: 10, socMax: 30 },
        { brand: 'Tesla Model S Plaid', capacity: 100, voltage: 400, current: 250, share: 2, socMin: 5, socMax: 20 },
        { brand: 'Audi e-tron GT', capacity: 93.4, voltage: 800, current: 330, share: 1, socMin: 5, socMax: 20 }
    ];

    // Simulation Time and Speed State
    window.workSimState = {
        totalSeconds: 0,
        isPlaying: false,
        speedIndex: 0,
        speeds: [1, 10, 100, 1000],
        trafficHours: 0,
        trafficMinutes: 5,
        trafficSeconds: 0,
        trafficProbability: 80,
        isActiveSimRun: false
    };

    // Tracks current active simulation sessions on pistols
    window.workSimActiveConnections = {};

    let simTickerInterval = null;
    let lastTrafficCheckTime = 0;
    
    // Saves user's original manual autoConnect states
    let preSimAutoConnectStates = {};
    let preSimAutoConnectOrder = [];

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
        panel.style.left = 'calc(50% - 410px)';
        panel.style.top = '100px';
        panel.style.width = '400px';
        panel.style.height = '420px';

        panel.innerHTML = `
            <div class="work-sim-header" id="work-sim-handle">
                <span class="work-sim-title">🚗 Автопарк симуляции</span>
                <div class="work-sim-actions">
                    <button class="work-sim-btn-icon" onclick="toggleWorkSimulationPanel()">✕</button>
                </div>
            </div>
            <div class="work-sim-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 700; font-size: 11px; color: var(--text-muted);">СПИСОК МОДЕЛЕЙ И ДОЛИ ТРАФИКА</span>
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
                                <th style="width: 48px; text-align: center;">C, кВтч</th>
                                <th style="width: 42px; text-align: center;">U, В</th>
                                <th style="width: 42px; text-align: center;">I, А</th>
                                <th style="width: 42px; text-align: center;">Доля, %</th>
                                <th style="width: 90px; text-align: center;">SoC, % (мин-макс)</th>
                                <th style="width: 25px;"></th>
                            </tr>
                        </thead>
                        <tbody id="work-sim-cars-tbody">
                            <!-- Rows loaded dynamically -->
                        </tbody>
                    </table>
                </div>
                
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button class="btn" style="flex: 1; border-radius: 6px; font-size: 11px;" onclick="addCarRow()">➕ Добавить авто</button>
                    <button class="btn" style="flex: 1.2; border-radius: 6px; font-size: 11px; background: rgba(0, 240, 255, 0.08); color: var(--secondary); border: 1px dashed var(--secondary);" onclick="autoBalanceCarShares()">⚖️ Авторасстановка</button>
                    <button class="btn" style="flex: 1.2; border-radius: 6px; font-size: 11px; background: rgba(0, 255, 170, 0.08); color: var(--primary); border: 1px dashed var(--primary);" onclick="randomizeCarShares()">🎲 Рандом долей</button>
                </div>
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
        dash.style.width = '380px';
        dash.style.height = '420px';

        dash.innerHTML = `
            <div class="work-sim-header" id="work-sim-dash-handle">
                <span class="work-sim-title">⏱️ Панель управления</span>
                <div class="work-sim-actions">
                    <button class="work-sim-btn-icon" onclick="toggleWorkSimulationPanel()">✕</button>
                </div>
            </div>
            <div class="work-sim-content" style="gap: 10px;">
                <!-- Section 1: Timer and Speed (Top) -->
                <div style="width: 100%; display: flex; flex-direction: column; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 10px; flex-shrink: 0;">
                    <div class="work-sim-speed-badge" id="work-sim-speed-val">x1</div>
                    <div class="work-sim-time-display" id="work-sim-time-val">День 0 • 00:00:00</div>
                    <div class="work-sim-controls-bar" style="margin-top: 8px;">
                        <button class="btn-ctrl" onclick="changeSimSpeed(-1)" title="Медленнее (уменьшить множитель в 10 раз)">⏪</button>
                        <button class="btn-ctrl btn-play" id="work-sim-play-btn" onclick="toggleSimPlay()">▶️ Пуск</button>
                        <button class="btn-ctrl" onclick="changeSimSpeed(1)" title="Быстрее (ускорить в 10 раз)">⏩</button>
                    </div>
                </div>

                <!-- Section 2: Traffic Settings -->
                <div style="width: 100%; border-bottom: 1px solid var(--border); padding-bottom: 10px; flex-shrink: 0;">
                    <div style="font-weight: 700; font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">🚗 Параметры трафика</div>
                    <div style="display: flex; gap: 10px; align-items: center; font-size: 11px;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span>Интервал:</span>
                            <input type="number" class="work-sim-input-compact" id="traffic-h" value="${window.workSimState.trafficHours}" min="0" max="23" onchange="updateTrafficParam('trafficHours', parseInt(this.value)||0)"><span>ч</span>
                            <input type="number" class="work-sim-input-compact" id="traffic-m" value="${window.workSimState.trafficMinutes}" min="0" max="59" onchange="updateTrafficParam('trafficMinutes', parseInt(this.value)||0)"><span>м</span>
                            <input type="number" class="work-sim-input-compact" id="traffic-s" value="${window.workSimState.trafficSeconds}" min="0" max="59" onchange="updateTrafficParam('trafficSeconds', parseInt(this.value)||0)"><span>с</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; margin-left: auto;">
                            <span>Вероятность:</span>
                            <input type="number" class="work-sim-input-compact" id="traffic-prob" value="${window.workSimState.trafficProbability}" min="1" max="100" style="width: 40px;" onchange="updateTrafficParam('trafficProbability', parseInt(this.value)||100)"><span>%</span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Table of Station Pistols -->
                <div style="width: 100%; flex-grow: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                    <div style="font-weight: 700; font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">🔌 Статус пистолетов станции</div>
                    <div class="work-sim-table-wrap" style="flex-grow: 1; min-height: 0; overflow-y: auto;">
                        <table class="work-sim-table">
                            <thead>
                                <tr>
                                    <th>Пистолет</th>
                                    <th>Статус</th>
                                    <th>Автомобиль</th>
                                    <th style="width: 55px; text-align: center;">Р, кВт</th>
                                    <th style="width: 55px; text-align: center;">SoC</th>
                                </tr>
                            </thead>
                            <tbody id="work-sim-pistols-tbody">
                                <!-- Loaded dynamically -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(dash);
        
        initDragging('work-sim-panel', 'work-sim-handle');
        initDragging('work-sim-dash-panel', 'work-sim-dash-handle');
        
        initResizing('work-sim-panel');
        initResizing('work-sim-dash-panel');
        
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
                    panel.style.width = '400px';
                    panel.style.height = '420px';
                } else {
                    panel.style.width = '380px';
                    panel.style.height = '420px';
                }
                
                const layout = document.getElementById('app-layout');
                const layoutRect = layout ? layout.getBoundingClientRect() : { left: 0, top: 0 };
                
                if (panelId === 'work-sim-panel') {
                    panelStartLeft = e.clientX - layoutRect.left - 200;
                } else {
                    panelStartLeft = e.clientX - layoutRect.left - 190;
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

    // Generic resizing module for simulation panels
    function initResizing(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        const resizer = document.createElement('div');
        resizer.className = 'work-sim-resizer';
        panel.appendChild(resizer);
        
        resizer.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            
            const startWidth = panel.offsetWidth;
            const startHeight = panel.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            
            const currentDock = currentDocks[panelId] || 'floating';
            if (currentDock !== 'floating') {
                dockPanel('floating', panelId);
                const layout = document.getElementById('app-layout');
                const layoutRect = layout ? layout.getBoundingClientRect() : { left: 0, top: 0 };
                panel.style.left = (e.clientX - layoutRect.left - startWidth + 10) + 'px';
                panel.style.top = (e.clientY - layoutRect.top - startHeight + 10) + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
            
            const onMouseMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                
                let newWidth = startWidth + dx;
                let newHeight = startHeight + dy;
                
                const minWidth = 280;
                const minHeight = 200;
                
                if (newWidth < minWidth) newWidth = minWidth;
                if (newHeight < minHeight) newHeight = minHeight;
                
                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
            };
            
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
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
        
        const width = (panelId === 'work-sim-panel') ? '400px' : '380px';
        const bottomHeight = (panelId === 'work-sim-panel') ? '250px' : '200px';
        
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
                panel.style.left = 'calc(50% - 410px)';
                panel.style.top = '100px';
                panel.style.width = '400px';
                panel.style.height = '420px';
            } else {
                panel.style.left = 'calc(50% + 10px)';
                panel.style.top = '100px';
                panel.style.width = '380px';
                panel.style.height = '420px';
            }
        } else if (side === 'bottom') {
            if (panelId === 'work-sim-panel') {
                panel.style.height = '250px';
            } else {
                panel.style.height = '200px';
            }
        } else {
            if (panelId === 'work-sim-panel') {
                panel.style.width = '400px';
            } else {
                panel.style.width = '380px';
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
                    <input type="number" class="work-sim-input" value="${car.share || 0}" style="width: 100%; text-align: center;" min="0" max="100" onchange="updateCarField(${index}, 'share', parseInt(this.value)||0); checkTotalShare();">
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 4px; align-items: center; justify-content: center;">
                        <input type="number" class="work-sim-input" value="${car.socMin !== undefined ? car.socMin : 10}" style="width: 32px; text-align: center; padding: 4px 2px;" min="0" max="100" onchange="updateCarField(${index}, 'socMin', parseInt(this.value)||0)">
                        <span style="color: var(--text-muted); font-size: 10px;">-</span>
                        <input type="number" class="work-sim-input" value="${car.socMax !== undefined ? car.socMax : 50}" style="width: 32px; text-align: center; padding: 4px 2px;" min="0" max="100" onchange="updateCarField(${index}, 'socMax', parseInt(this.value)||0)">
                    </div>
                </td>
                <td style="text-align: center;">
                    <button class="btn-remove-row" onclick="removeCarRow(${index})" title="Удалить модель">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add summary row at the bottom
        const totalShare = getCarSharesSum();
        const sumColor = totalShare === 100 ? '#00ff88' : '#ff4a6b';
        const sumText = `${totalShare}%`;

        const summaryTr = document.createElement('tr');
        summaryTr.style.background = 'rgba(255, 255, 255, 0.02)';
        summaryTr.style.fontWeight = 'bold';
        summaryTr.style.borderTop = '1px solid var(--border)';
        summaryTr.innerHTML = `
            <td colspan="4" style="text-align: left; padding: 8px 6px; color: var(--text-muted);">Итого доля:</td>
            <td style="text-align: center; color: ${sumColor};" id="work-sim-total-share-cell">${sumText}</td>
            <td colspan="2"></td>
        `;
        tbody.appendChild(summaryTr);
    }

    function getCarSharesSum() {
        return window.workSimCars.reduce((sum, car) => sum + (car.share || 0), 0);
    }

    window.checkTotalShare = function() {
        const totalShare = getCarSharesSum();
        const cell = document.getElementById('work-sim-total-share-cell');
        if (cell) {
            cell.textContent = `${totalShare}%`;
            cell.style.color = totalShare === 100 ? '#00ff88' : '#ff4a6b';
        }
    };

    window.autoBalanceCarShares = function() {
        const N = window.workSimCars.length;
        if (N === 0) return;
        let base = Math.floor(100 / N);
        let diff = 100 - (base * N);
        window.workSimCars.forEach((car, idx) => {
            car.share = base + (idx < diff ? 1 : 0);
        });
        renderCarsTable();
    };

    window.randomizeCarShares = function() {
        const N = window.workSimCars.length;
        if (N === 0) return;
        if (N === 1) {
            window.workSimCars[0].share = 100;
            renderCarsTable();
            return;
        }
        let raw = [];
        let sum = 0;
        for (let i = 0; i < N; i++) {
            let r = Math.floor(Math.random() * 90) + 10;
            raw.push(r);
            sum += r;
        }
        let shares = raw.map(v => Math.round((v / sum) * 100));
        let currentSum = shares.reduce((a, b) => a + b, 0);
        let diff = 100 - currentSum;
        shares[shares.length - 1] += diff; // Adjust last row to sum to exactly 100
        
        window.workSimCars.forEach((car, idx) => {
            car.share = shares[idx];
        });
        renderCarsTable();
    };

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
                const dt = 0.1 * multiplier;
                window.workSimState.totalSeconds += dt;
                
                // 1. Process active charging for all connected cars
                processActiveCharging(dt);
                
                // 2. Accumulate Inverter Operating Hours based on delivered power
                processInverterHours(dt);
                
                // 3. Active Traffic Spawner check
                checkTrafficSpawn();
                
                updateSimUI();
            }
        }, 100);
    }

    // Physical battery charging calculations based on delivered power
    function processActiveCharging(dtSeconds) {
        const dtHours = dtSeconds / 3600;
        const simData = window.lastSimulationData || { pistolPowers: {} };
        let stateChanged = false;
        const departedUids = [];
        
        for (let uid in window.workSimActiveConnections) {
            const conn = window.workSimActiveConnections[uid];
            const power = simData.pistolPowers[uid] || 0; // actual power flow in kW
            
            // energy = power * time (kWh)
            const energyDelivered = power * dtHours; 
            const capacity = conn.car.capacity || 60; // capacity in kWh
            
            const dSoc = (energyDelivered / capacity) * 100;
            conn.currentSoC = Math.min(100, conn.currentSoC + dSoc);
            
            // If the car reaches 100% SoC, it completes charging and leaves the pistol
            if (conn.currentSoC >= 100) {
                console.log(`[Work Sim] Car at ${uid} is fully charged and leaves the station.`);
                departedUids.push(uid);
                delete window.workSimActiveConnections[uid];
                
                // Disconnect pistol from auto-routing
                if (window.appState && window.appState.pistolDemands[uid]) {
                    window.appState.pistolDemands[uid].autoConnect = false;
                    window.appState.autoConnectOrder = window.appState.autoConnectOrder.filter(x => x !== uid);
                }
                
                stateChanged = true;
            }
        }
        
        // Trigger routing event: car departed → free its inverters and notify orange pistols
        if (stateChanged) {
            departedUids.forEach(uid => {
                if (window.onCarDeparture) {
                    window.onCarDeparture(uid);
                }
            });
            if (window.updateCanvas) window.updateCanvas();
        }
    }

    // Accumulate inverter operating hours if power > 0.01 kW
    function processInverterHours(dtSeconds) {
        const dtHours = dtSeconds / 3600;
        const simData = window.lastSimulationData || { inverterRealPowers: {} };
        
        if (window.appState && window.appState.fields) {
            if (!window.appState.inverterSettings) {
                window.appState.inverterSettings = {};
            }
            
            window.appState.fields.forEach(field => {
                for (let k in field.components) {
                    const comp = field.components[k];
                    if (comp.type === 'inverter') {
                        const uid = `${field.id}-${k}`;
                        const pReal = (simData.inverterRealPowers && simData.inverterRealPowers[uid]) || 0;
                        
                        if (pReal > 0.01) {
                            if (!window.appState.inverterSettings[uid]) {
                                window.appState.inverterSettings[uid] = { voltage: 500, hours: 0 };
                            }
                            const currentHours = window.appState.inverterSettings[uid].hours || 0;
                            window.appState.inverterSettings[uid].hours = currentHours + dtHours;
                        }
                    }
                }
            });
        }
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

        renderPistolsTable();
    }

    // Render Table of Station Pistols
    window.renderPistolsTable = function() {
        const tbody = document.getElementById('work-sim-pistols-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const pistols = [];
        if (window.appState && window.appState.fields) {
            window.appState.fields.forEach(field => {
                for (let k in field.components) {
                    const comp = field.components[k];
                    if (comp.type === 'pistol') {
                        pistols.push({
                            uid: `${field.id}-${k}`,
                            name: comp.name || `Пистолет ${field.id}-${k}`
                        });
                    }
                }
            });
        }
        
        if (pistols.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px; font-size: 11px;">Нет подключенных пистолетов</td></tr>`;
            return;
        }
        
        const simData = window.lastSimulationData || { pistolPowers: {} };
        
        pistols.forEach(p => {
            const activeSession = window.workSimActiveConnections[p.uid];
            const power = simData.pistolPowers[p.uid] || 0;
            
            let statusColor = '#8a99ad';
            let statusText = '• Свободен';
            let carModel = '—';
            let powerCell = `<span style="color: var(--text-muted);">0 кВт</span>`;
            let socCell = `<span style="color: var(--text-muted);">—</span>`;
            
            if (activeSession) {
                carModel = activeSession.car.brand;
                powerCell = `<span style="font-weight: 700; color: var(--text-main);">${Math.round(power)} кВт</span>`;
                socCell = `<span style="color: var(--primary); font-weight: bold;">${activeSession.currentSoC.toFixed(1)}%</span>`;
                
                const parts = p.uid.split('-');
                const fId = parseInt(parts[0]);
                const key = `${parts[1]}-${parts[2]}`;
                
                let demandNum = 0;
                if (window.appState && window.appState.pistolDemands && window.appState.pistolDemands[p.uid]) {
                    const settings = window.appState.pistolDemands[p.uid];
                    const u = settings.voltage || 0;
                    const i = settings.current || 0;
                    demandNum = (u * i) / 1000;
                }
                
                let hasPistolError = false;
                if (simData.errorMessages && window.appState && window.appState.fields) {
                    const field = window.appState.fields.find(f => f.id === fId);
                    const comp = field ? field.components[key] : null;
                    const compName = comp ? comp.name : p.name;
                    const pNameUpper = compName.trim().toUpperCase();
                    hasPistolError = simData.errorMessages.some(err => err.trim().toUpperCase().includes(pNameUpper));
                }
                
                if (hasPistolError) {
                    statusColor = '#ff4a6b';
                    statusText = '⚠️ Конфликт';
                } else if (power >= demandNum - 0.01 && demandNum > 0) {
                    statusColor = '#00ffaa';
                    statusText = '⚡ Зарядка';
                } else if (power > 0.01) {
                    statusColor = '#ffd166'; // Yellow
                    statusText = '⚡ Частично';
                } else {
                    statusColor = '#ff6b00'; // Orange
                    statusText = '⏳ Ожидание';
                }
            } else {
                statusColor = '#00ffaa';
            }
            
            const statusCell = `<span style="color: ${statusColor}; font-weight: bold; text-shadow: 0 0 6px ${statusColor}33;">${statusText}</span>`;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500; color: var(--text-main); font-size: 10px;">${p.name}</td>
                <td style="font-size: 10px;">${statusCell}</td>
                <td style="font-size: 10px; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${carModel}</td>
                <td style="text-align: center; font-size: 10px;">${powerCell}</td>
                <td style="text-align: center; font-size: 10px;">${socCell}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    window.updateTrafficParam = function(param, val) {
        if (window.workSimState[param] !== undefined) {
            window.workSimState[param] = val;
        }
    };

    // Traffic spawn logic
    function checkTrafficSpawn() {
        const intervalSeconds = window.workSimState.trafficHours * 3600 +
                                window.workSimState.trafficMinutes * 60 +
                                window.workSimState.trafficSeconds;
        
        if (intervalSeconds <= 0) return;
        
        let limit = 1000; // safety brake to prevent infinite loops under extreme settings
        while (window.workSimState.totalSeconds - lastTrafficCheckTime >= intervalSeconds && limit > 0) {
            lastTrafficCheckTime += intervalSeconds;
            limit--;
            
            const prob = window.workSimState.trafficProbability;
            const rolled = Math.random() * 100;
            if (rolled <= prob) {
                spawnCarConnection();
            }
        }
    }

    function selectRandomCarByShare() {
        const N = window.workSimCars.length;
        if (N === 0) return null;
        
        const totalShare = getCarSharesSum();
        if (totalShare <= 0) {
            return window.workSimCars[Math.floor(Math.random() * N)];
        }
        
        let rand = Math.random() * totalShare;
        let cumulative = 0;
        for (let i = 0; i < N; i++) {
            cumulative += window.workSimCars[i].share || 0;
            if (rand <= cumulative) {
                return window.workSimCars[i];
            }
        }
        return window.workSimCars[N - 1];
    }

    function spawnCarConnection() {
        const emptyPistolUids = [];
        if (window.appState && window.appState.fields) {
            window.appState.fields.forEach(field => {
                for (let k in field.components) {
                    const comp = field.components[k];
                    if (comp.type === 'pistol') {
                        const uid = `${field.id}-${k}`;
                        if (!window.workSimActiveConnections[uid]) {
                            emptyPistolUids.push(uid);
                        }
                    }
                }
            });
        }
        
        if (emptyPistolUids.length === 0) return; // No empty slots
        
        const car = selectRandomCarByShare();
        if (!car) return;
        
        const randomPistolUid = emptyPistolUids[Math.floor(Math.random() * emptyPistolUids.length)];
        
        const socMin = car.socMin !== undefined ? car.socMin : 10;
        const socMax = car.socMax !== undefined ? car.socMax : 50;
        const initialSoc = Math.floor(Math.random() * (socMax - socMin + 1)) + socMin;
        
        window.workSimActiveConnections[randomPistolUid] = {
            car: JSON.parse(JSON.stringify(car)),
            currentSoC: initialSoc,
            connectedAt: window.workSimState.totalSeconds
        };
        
        // Auto-enable routing for this pistol
        if (window.appState && window.appState.pistolDemands[randomPistolUid]) {
            window.appState.pistolDemands[randomPistolUid].autoConnect = true;
            if (!window.appState.autoConnectOrder.includes(randomPistolUid)) {
                window.appState.autoConnectOrder.push(randomPistolUid);
            }
        }
        
        console.log(`[Work Sim] Connected ${car.brand} to ${randomPistolUid} at ${initialSoc}% SoC`);
        
        // Fire event: new car arrived — finds its route (with possible energy arbitration)
        if (window.onCarArrival) {
            window.onCarArrival(randomPistolUid);
        } else if (window.updateCanvas) {
            window.updateCanvas();
        }
    }

    // Window global APIs
    window.toggleWorkSimulationPanel = function() {
        const panel = document.getElementById('work-sim-panel');
        const dash = document.getElementById('work-sim-dash-panel');
        const btn = document.getElementById('btn-work-sim');
        const layout = document.getElementById('app-layout');
        if (!panel || !dash) return;
        
        const isOpening = (panel.style.display === 'none');
        window.workSimState.isActiveSimRun = isOpening;
        
        if (isOpening) {
            panel.style.display = 'flex';
            dash.style.display = 'flex';
            if (btn) btn.classList.add('active');
            if (layout) layout.classList.add('work-sim-active');
            
            // Save user's original autoConnect configurations
            preSimAutoConnectStates = {};
            if (window.appState && window.appState.pistolDemands) {
                for (let k in window.appState.pistolDemands) {
                    preSimAutoConnectStates[k] = window.appState.pistolDemands[k].autoConnect;
                    window.appState.pistolDemands[k].autoConnect = false;
                }
            }
            preSimAutoConnectOrder = [...(window.appState.autoConnectOrder || [])];
            window.appState.autoConnectOrder = [];
            
            renderCarsTable();
            updateSimUI();
            startSimTicker();
        } else {
            panel.style.display = 'none';
            dash.style.display = 'none';
            if (btn) btn.classList.remove('active');
            if (layout) layout.classList.remove('work-sim-active');
            hideSnapPreview();
            stopSimTicker();
        }

        if (window.updateCanvas) window.updateCanvas();
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
        window.workSimState.isActiveSimRun = false;
        window.workSimState.isPlaying = false;
        window.workSimState.totalSeconds = 0;
        window.workSimState.speedIndex = 0;
        window.workSimActiveConnections = {};
        lastTrafficCheckTime = 0;
        stopSimTicker();
        
        // Restore user's original autoConnect configurations
        if (window.appState && window.appState.pistolDemands) {
            for (let k in window.appState.pistolDemands) {
                if (preSimAutoConnectStates[k] !== undefined) {
                    window.appState.pistolDemands[k].autoConnect = preSimAutoConnectStates[k];
                }
            }
        }
        if (window.appState) {
            window.appState.autoConnectOrder = preSimAutoConnectOrder || [];
        }
        
        const panel = document.getElementById('work-sim-panel');
        const dash = document.getElementById('work-sim-dash-panel');
        const btn = document.getElementById('btn-work-sim');
        const layout = document.getElementById('app-layout');
        if (panel) panel.style.display = 'none';
        if (dash) dash.style.display = 'none';
        if (btn) btn.classList.remove('active');
        if (layout) layout.classList.remove('work-sim-active');
        hideSnapPreview();
        updateSimUI();
    };

    window.updateCarField = function(index, field, value) {
        if (window.workSimCars[index]) {
            window.workSimCars[index][field] = value;
        }
    };

    window.addCarRow = function() {
        window.workSimCars.push({ brand: 'Новая модель', capacity: 60, voltage: 400, current: 150, share: 0, socMin: 10, socMax: 50 });
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
                        window.workSimCars = parsed.map(c => ({
                            ...c,
                            share: c.share !== undefined ? c.share : 0,
                            socMin: c.socMin !== undefined ? c.socMin : 10,
                            socMax: c.socMax !== undefined ? c.socMax : 50
                        }));
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
