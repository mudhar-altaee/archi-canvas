/**
 * Node System Base and Subclasses (Minimal Rounded Squares)
 * Implements draggable nodes resembling screenshots with custom color/image blocks and handles.
 */
export class Node {
    constructor(id, title, x, y, canvas, app) {
        this.id = id;
        this.title = title;
        this.x = x;
        this.y = y;
        this.canvas = canvas;
        this.app = app;
        
        this.width = 220;
        this.height = 220;
        
        this.inputs = [];  // Array of { name: string, type: string, style: object }
        this.outputs = []; // Array of { name: string, type: string, style: object }
        
        this.dom = null;
        this.selected = false;
        
        // Dragging state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        
        // Resizing state
        this.isResizing = false;
    }
    
    /**
     * Set up sockets for inputs/outputs with visual styling offsets
     */
    setupSockets(inputs = [], outputs = []) {
        this.inputs = inputs;
        this.outputs = outputs;
    }
    
    /**
     * Builds and inserts the Node into the DOM
     */
    /**
     * Builds and inserts the Node into the DOM
     */
    createDOM() {
        const nodeEl = document.createElement('div');
        nodeEl.className = `node ${this.type ? this.type + '-node' : ''}`;
        nodeEl.id = `node-${this.id}`;
        nodeEl.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
        nodeEl.style.width = `${this.width}px`;
        nodeEl.style.height = `${this.height}px`;
        
        // Selection box overlay (outlines, corner dots, drag handle)
        const selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        
        let handleHTML = '';
        if (this.type === 'image') {
            handleHTML = `
                <div class="drag-handle collapsed" data-handle="main">
                    <span class="handle-dot"></span>
                    <span class="handle-dot"></span>
                    <span class="handle-dot"></span>
                    
                    <div class="handle-btn-wrapper menu-wrapper">
                        <div class="handle-btn btn-toggle" title="Close Menu">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                        </div>
                        <div class="handle-btn btn-upload" title="Upload Image">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <div class="handle-btn btn-selection-mode" title="Image Selection Tool">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
                        </div>
                        <div class="handle-btn btn-duplicate" title="Duplicate Node">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </div>
                        <div class="handle-btn btn-delete" title="Delete Node">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </div>
                    </div>
                    
                    <div class="handle-btn-wrapper selection-wrapper">
                        <div class="handle-btn btn-confirm-selection" title="Apply Selection" style="color: #10b981;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div class="handle-btn btn-sel-brush active" title="Brush Selection">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                        </div>
                        <div class="handle-btn btn-sel-pencil" title="Magnetic Snapping Lasso">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </div>
                        <div class="handle-btn btn-sel-lasso" title="Polygonal Lasso Tool">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 19.5 12 22 2 19.5 2 8.5"/></svg>
                        </div>
                        <div style="width: 16px; height: 1px; background: rgba(0, 136, 204, 0.2); margin: 2px 0;"></div>
                        
                        <div class="handle-btn btn-sel-mode-add active" title="Add to Selection (+)" style="font-weight: bold;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <div class="handle-btn btn-sel-mode-sub" title="Subtract from Selection (-)" style="font-weight: bold;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        
                        <div style="width: 16px; height: 1px; background: rgba(0, 136, 204, 0.2); margin: 2px 0;"></div>

                        <div class="handle-btn btn-sel-clear" title="Clear Selection">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </div>
                    </div>
                </div>
            `;
        } else if (this.type === 'color') {
            handleHTML = `
                <div class="drag-handle collapsed" data-handle="main">
                    <span class="handle-dot"></span>
                    <span class="handle-dot"></span>
                    <span class="handle-dot"></span>
                    
                    <div class="handle-btn-wrapper menu-wrapper">
                        <div class="handle-btn btn-toggle" title="Close Menu">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                        </div>
                        <div class="handle-btn btn-color-picker" title="Change Color">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z"/></svg>
                        </div>
                        <div class="handle-btn btn-duplicate" title="Duplicate Node">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </div>
                        <div class="handle-btn btn-delete" title="Delete Node">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </div>
                    </div>
                </div>
            `;
        }
        
        if (this.type === 'recolor' || this.type === 'material') {
            selectionBox.innerHTML = `
                ${handleHTML}
            `;
        } else {
            selectionBox.innerHTML = `
                <div class="corner-dot top-left" data-corner="tl"></div>
                <div class="corner-dot top-right" data-corner="tr"></div>
                <div class="corner-dot bottom-left" data-corner="bl"></div>
                <div class="corner-dot bottom-right" data-corner="br"></div>
                ${handleHTML}
            `;
        }
        nodeEl.appendChild(selectionBox);
        
        // Sockets (Ports)
        const portsEl = document.createElement('div');
        portsEl.className = 'node-ports';
        
        // Render inputs (absolute positioned if any)
        this.inputs.forEach(port => {
            const socket = document.createElement('div');
            socket.className = 'socket';
            socket.dataset.direction = 'input';
            socket.dataset.name = port.name;
            socket.dataset.type = port.type;
            socket.dataset.nodeId = this.id;
            
            // Apply positioning styles (e.g. { top: '35%', left: '-7px' })
            if (port.style) {
                Object.keys(port.style).forEach(key => {
                    socket.style[key] = port.style[key];
                });
            }
            portsEl.appendChild(socket);
        });
        
        // Render outputs
        this.outputs.forEach(port => {
            const socket = document.createElement('div');
            socket.className = 'socket';
            socket.dataset.direction = 'output';
            socket.dataset.name = port.name;
            socket.dataset.type = port.type;
            socket.dataset.nodeId = this.id;
            
            // Apply positioning styles (e.g. { top: '35%', right: '-7px' })
            if (port.style) {
                Object.keys(port.style).forEach(key => {
                    socket.style[key] = port.style[key];
                });
            }
            portsEl.appendChild(socket);
        });
        
        nodeEl.appendChild(portsEl);
        
        // Body (custom contents in subclass)
        const bodyEl = document.createElement('div');
        bodyEl.className = 'node-body';
        this.renderBody(bodyEl);
        nodeEl.appendChild(bodyEl);
        
        this.dom = nodeEl;
        
        // Listeners for dragging (drag from anywhere on the node)
        nodeEl.addEventListener('mousedown', (e) => this.onDragStart(e));
        
        // Listeners for resizing (drag corner dots)
        const cornerDots = selectionBox.querySelectorAll('.corner-dot');
        cornerDots.forEach(dot => {
            dot.addEventListener('mousedown', (e) => this.onResizeStart(e, dot.dataset.corner));
        });
        
        // Drag handle interactions
        const handleEl = selectionBox.querySelector('.drag-handle');
        if (handleEl) {
            handleEl.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent starting a drag on the node body
            });
            
            handleEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (handleEl.classList.contains('collapsed')) {
                    this.app.selectNode(this.id);
                    this.app.updatePropertiesPanel();
                    
                    handleEl.classList.remove('collapsed');
                    handleEl.classList.add('expanded-menu');
                }
            });
            
            const btnToggle = handleEl.querySelector('.btn-toggle');
            if (btnToggle) {
                btnToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!handleEl.classList.contains('collapsed')) {
                        handleEl.classList.remove('expanded-menu', 'expanded-selection');
                        handleEl.classList.add('collapsed');
                        if (typeof this.deactivateSelectionMode === 'function') {
                            this.deactivateSelectionMode();
                        }
                    }
                });
            }
            
            const btnDelete = handleEl.querySelector('.btn-delete');
            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.removeNode(this.id);
                });
            }
            
            const btnDuplicate = handleEl.querySelector('.btn-duplicate');
            if (btnDuplicate) {
                btnDuplicate.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.app && typeof this.app.duplicateNode === 'function') {
                        this.app.duplicateNode(this.id);
                    }
                });
            }
            
            const btnColorPicker = handleEl.querySelector('.btn-color-picker');
            if (btnColorPicker) {
                btnColorPicker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Select node if not selected, and refresh Properties panel
                    if (!this.app.selectedNodeIds.has(this.id)) {
                        this.app.selectNode(this.id);
                    }
                    this.app.updatePropertiesPanel();
                    
                    // Toggle isColorPanelOpen now safely
                    this.isColorPanelOpen = !this.isColorPanelOpen;
                    
                    // Trigger floating color picker popup next to node
                    if (typeof this.toggleFloatingColorPicker === 'function') {
                        this.toggleFloatingColorPicker();
                    }
                });
            }
            
            const btnUpload = handleEl.querySelector('.btn-upload');
            if (btnUpload) {
                btnUpload.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.fileInput) this.fileInput.click();
                });
            }
            
            const btnSelectionMode = handleEl.querySelector('.btn-selection-mode');
            if (btnSelectionMode) {
                btnSelectionMode.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleEl.classList.remove('expanded-menu');
                    handleEl.classList.add('expanded-selection');
                    if (typeof this.activateSelectionMode === 'function') {
                        this.activateSelectionMode();
                    }
                });
            }
            
            const btnConfirmSelection = handleEl.querySelector('.btn-confirm-selection');
            if (btnConfirmSelection) {
                btnConfirmSelection.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleEl.classList.remove('expanded-selection');
                    handleEl.classList.add('collapsed');
                    if (typeof this.deactivateSelectionMode === 'function') {
                        this.deactivateSelectionMode(true);
                    }
                });
            }
            
            const btnSelBrush = handleEl.querySelector('.btn-sel-brush');
            const btnSelPencil = handleEl.querySelector('.btn-sel-pencil');
            const btnSelLasso = handleEl.querySelector('.btn-sel-lasso');
            const btnSelModeAdd = handleEl.querySelector('.btn-sel-mode-add');
            const btnSelModeSub = handleEl.querySelector('.btn-sel-mode-sub');
            const btnSelClear = handleEl.querySelector('.btn-sel-clear');
            
            const btnSelPerspective = handleEl.querySelector('.btn-sel-perspective');
            const perspectiveActions = handleEl.querySelector('.perspective-actions-group');
            const btnAddPlane = handleEl.querySelector('.btn-add-plane');
            const btnDelPlane = handleEl.querySelector('.btn-del-plane');
            
            if (btnSelBrush && btnSelPencil && btnSelLasso) {
                btnSelBrush.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btnSelBrush.classList.add('active');
                    btnSelPencil.classList.remove('active');
                    btnSelLasso.classList.remove('active');
                    if (btnSelPerspective) btnSelPerspective.classList.remove('active');
                    if (perspectiveActions) perspectiveActions.style.display = 'none';
                    this.currentTool = 'brush';
                    this.lassoPoints = [];
                    this.isLassoActive = false;
                    if (typeof this.drawSelectionCanvas === 'function') this.drawSelectionCanvas();
                });
                
                btnSelPencil.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btnSelPencil.classList.add('active');
                    btnSelBrush.classList.remove('active');
                    btnSelLasso.classList.remove('active');
                    if (btnSelPerspective) btnSelPerspective.classList.remove('active');
                    if (perspectiveActions) perspectiveActions.style.display = 'none';
                    this.currentTool = 'pencil';
                    this.lassoPoints = [];
                    this.isLassoActive = false;
                    if (typeof this.drawSelectionCanvas === 'function') this.drawSelectionCanvas();
                });

                btnSelLasso.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btnSelLasso.classList.add('active');
                    btnSelBrush.classList.remove('active');
                    btnSelPencil.classList.remove('active');
                    if (btnSelPerspective) btnSelPerspective.classList.remove('active');
                    if (perspectiveActions) perspectiveActions.style.display = 'none';
                    this.currentTool = 'lasso';
                    this.lassoPoints = [];
                    this.isLassoActive = false;
                    if (typeof this.drawSelectionCanvas === 'function') this.drawSelectionCanvas();
                });
                
                if (btnSelPerspective) {
                    btnSelPerspective.addEventListener('click', (e) => {
                        e.stopPropagation();
                        btnSelPerspective.classList.add('active');
                        btnSelBrush.classList.remove('active');
                        btnSelPencil.classList.remove('active');
                        btnSelLasso.classList.remove('active');
                        if (perspectiveActions) perspectiveActions.style.display = 'flex';
                        this.currentTool = 'perspective';
                        this.lassoPoints = [];
                        this.isLassoActive = false;
                        if (typeof this.drawSelectionCanvas === 'function') this.drawSelectionCanvas();
                    });
                }
            }
            
            if (btnAddPlane && btnDelPlane) {
                btnAddPlane.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!this.perspectivePlanes) this.perspectivePlanes = [];
                    
                    const activePlane = this.perspectivePlanes.find(p => p.id === this.activePlaneId);
                    const newPoints = activePlane
                        ? activePlane.points.map(pt => ({ x: Math.min(this.width - 15, pt.x + 25), y: Math.min(this.height - 15, pt.y + 25) }))
                        : [
                            { x: this.width * 0.3, y: this.height * 0.3 },
                            { x: this.width * 0.7, y: this.height * 0.3 },
                            { x: this.width * 0.7, y: this.height * 0.7 },
                            { x: this.width * 0.3, y: this.height * 0.7 }
                          ];
                    const newId = Date.now();
                    this.perspectivePlanes.push({ id: newId, points: newPoints });
                    this.activePlaneId = newId;
                    if (typeof this.drawSelectionCanvas === 'function') this.drawSelectionCanvas();
                    this.app.saveProject(this.app.activeProjectName);
                });
                
                btnDelPlane.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!this.perspectivePlanes || this.perspectivePlanes.length <= 1) {
                        alert("At least one perspective surface must exist.");
                        return;
                    }
                    this.perspectivePlanes = this.perspectivePlanes.filter(p => p.id !== this.activePlaneId);
                    this.activePlaneId = this.perspectivePlanes[0].id;
                    if (typeof this.drawSelectionCanvas === 'function') this.drawSelectionCanvas();
                    this.app.saveProject(this.app.activeProjectName);
                });
            }
            
            if (btnSelModeAdd && btnSelModeSub) {
                btnSelModeAdd.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btnSelModeAdd.classList.add('active');
                    btnSelModeSub.classList.remove('active');
                    this.selectionMode = 'add';
                });
                
                btnSelModeSub.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btnSelModeSub.classList.add('active');
                    btnSelModeAdd.classList.remove('active');
                    this.selectionMode = 'sub';
                });
            }
            
            if (btnSelClear) {
                btnSelClear.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof this.clearSelectionMask === 'function') {
                        this.clearSelectionMask();
                    }
                });
            }
        }
        
        return nodeEl;
    }
    
    /**
     * Handles dragging logic with distance threshold to distinguish between drags and clicks
     */
    onDragStart(e) {
        if (e.target.classList.contains('socket')) return;
        
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        
        let hasMoved = false;
        
        // Select node only if it is not already part of the current selection
        if (!this.app.selectedNodeIds.has(this.id)) {
            this.app.selectNode(this.id, e.ctrlKey || e.metaKey || e.shiftKey);
        }
        
        const onMouseMove = (moveEv) => {
            if (!this.isDragging) return;
            
            const zoom = this.canvas.getZoom();
            const dx = (moveEv.clientX - this.dragStartX) / zoom;
            const dy = (moveEv.clientY - this.dragStartY) / zoom;
            
            if (Math.abs(moveEv.clientX - e.clientX) > 3 || Math.abs(moveEv.clientY - e.clientY) > 3) {
                hasMoved = true;
            }
            
            if (hasMoved) {
                this.dragStartX = moveEv.clientX;
                this.dragStartY = moveEv.clientY;
                
                if (this.app.selectedNodeIds.size > 1 && this.app.selectedNodeIds.has(this.id)) {
                    // Drag all selected nodes together without snapping
                    this.app.selectedNodeIds.forEach(nodeId => {
                        const node = this.app.nodes.get(nodeId);
                        if (node) {
                            node.x += dx;
                            node.y += dy;
                            node.dom.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
                            this.app.connections.updateWiresForNode(node.id);
                        }
                    });
                } else {
                    // Single node dragging with snap
                    this.x += dx;
                    this.y += dy;
                    
                    const snapDistance = 10;
                    let displayX = this.x;
                    let displayY = this.y;
                    
                    this.app.nodes.forEach(otherNode => {
                        if (otherNode.id === this.id) return;
                        
                        // Align left, right, or centers of X
                        if (Math.abs(this.x - otherNode.x) < snapDistance) {
                            displayX = otherNode.x;
                        } else if (Math.abs((this.x + this.width) - (otherNode.x + otherNode.width)) < snapDistance) {
                            displayX = otherNode.x + otherNode.width - this.width;
                        } else if (Math.abs((this.x + this.width/2) - (otherNode.x + otherNode.width/2)) < snapDistance) {
                            displayX = otherNode.x + otherNode.width/2 - this.width/2;
                        }
                        
                        // Align top, bottom, or centers of Y
                        if (Math.abs(this.y - otherNode.y) < snapDistance) {
                            displayY = otherNode.y;
                        } else if (Math.abs((this.y + this.height) - (otherNode.y + otherNode.height)) < snapDistance) {
                            displayY = otherNode.y + otherNode.height - this.height;
                        } else if (Math.abs((this.y + this.height/2) - (otherNode.y + otherNode.height/2)) < snapDistance) {
                            displayY = otherNode.y + otherNode.height/2 - this.height/2;
                        }
                    });
                    
                    this.dom.style.transform = `translate3d(${displayX}px, ${displayY}px, 0)`;
                    
                    this.lastDisplayX = displayX;
                    this.lastDisplayY = displayY;
                    
                    this.app.connections.updateWiresForNode(this.id);
                }
                
                if (this.app && typeof this.app.updatePropertiesPanel === 'function') {
                    this.app.updatePropertiesPanel();
                }
            }
        };
        
        const onMouseUp = (upEv) => {
            this.isDragging = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            
            if (!hasMoved) {
                const isMultiSelect = upEv.ctrlKey || upEv.metaKey || upEv.shiftKey;
                if (isMultiSelect) {
                    if (this.app.selectedNodeIds.has(this.id)) {
                        this.app.selectedNodeIds.delete(this.id);
                        this.setSelected(false);
                    } else {
                        this.app.selectNode(this.id, true);
                    }
                } else {
                    this.app.selectNode(this.id, false);
                }
                this.onNodeClick(e);
            } else {
                if (this.app.selectedNodeIds.size > 1 && this.app.selectedNodeIds.has(this.id)) {
                    this.app.selectedNodeIds.forEach(nodeId => {
                        const node = this.app.nodes.get(nodeId);
                        if (node) {
                            this.app.connections.updateWiresForNode(node.id);
                        }
                    });
                } else {
                    if (this.lastDisplayX !== undefined) {
                        this.x = this.lastDisplayX;
                        this.y = this.lastDisplayY;
                        delete this.lastDisplayX;
                        delete this.lastDisplayY;
                        this.dom.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
                        this.app.connections.updateWiresForNode(this.id);
                    }
                }
                this.app.saveProject(this.app.activeProjectName);
            }
        };
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        
        e.stopPropagation();
    }
    
    /**
     * Resizes the node dimensions using corner dots
     */
    onResizeStart(e, corner) {
        e.stopPropagation();
        e.preventDefault();
        
        this.isResizing = true;
        
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        
        const startX = this.x;
        const startY = this.y;
        const startW = this.width;
        const startH = this.height;
        
        const minSize = 100; // minimum scale limit
        
        const onMouseMove = (moveEv) => {
            if (!this.isResizing) return;
            
            const zoom = this.canvas.getZoom();
            const dx = (moveEv.clientX - startMouseX) / zoom;
            const dy = (moveEv.clientY - startMouseY) / zoom;
            
            let newX = this.x;
            let newY = this.y;
            let newW = this.width;
            let newH = this.height;
            
            const aspect = this.aspectRatio || (startW / startH) || 1.0;
            let scale = 1;
            if (corner === 'br') {
                scale = Math.max(minSize / startW, (startW + dx) / startW);
            } else if (corner === 'tl') {
                scale = Math.max(minSize / startW, (startW - dx) / startW);
            } else if (corner === 'tr') {
                scale = Math.max(minSize / startW, (startW + dx) / startW);
            } else if (corner === 'bl') {
                scale = Math.max(minSize / startW, (startW - dx) / startW);
            }
            
            const targetW = startW * scale;
            const targetH = startH * scale;
            
            let displayW = targetW;
            let displayH = targetH;
            
            // Snapping Size matching other nodes' width or height visually (Soft snap)
            const snapDistance = 10;
            this.app.nodes.forEach(otherNode => {
                if (otherNode.id === this.id) return;
                
                // Snap Width
                if (Math.abs(targetW - otherNode.width) < snapDistance) {
                    displayW = otherNode.width;
                    displayH = Math.round(displayW / aspect);
                }
                // Snap Height
                if (Math.abs(targetH - otherNode.height) < snapDistance) {
                    displayH = otherNode.height;
                    displayW = Math.round(displayH * aspect);
                }
            });
            
            // Adjust positions based on corner dragging
            let displayX = startX;
            let displayY = startY;
            if (corner === 'tl') {
                displayX = startX + (startW - displayW);
                displayY = startY + (startH - displayH);
            } else if (corner === 'tr') {
                displayY = startY + (startH - displayH);
            } else if (corner === 'bl') {
                displayX = startX + (startW - displayW);
            }
            
            // Apply displays visually to DOM
            this.dom.style.transform = `translate3d(${displayX}px, ${displayY}px, 0)`;
            this.dom.style.width = `${displayW}px`;
            this.dom.style.height = `${displayH}px`;
            
            // Update node variables in real-time to reflect immediately on the properties panel
            this.x = displayX;
            this.y = displayY;
            this.width = displayW;
            this.height = displayH;
            
            // Save display measurements for mouseup finalization
            this.lastDisplayX = displayX;
            this.lastDisplayY = displayY;
            this.lastDisplayW = displayW;
            this.lastDisplayH = displayH;
            
            // Realtime wire connection updates
            this.app.connections.updateWiresForNode(this.id);
            
            // Update properties sidebar
            if (this.app && typeof this.app.updatePropertiesPanel === 'function') {
                this.app.updatePropertiesPanel();
            }
        };
        
        const onMouseUp = () => {
            this.isResizing = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            
            // Finalize coordinates & dimensions to visually snapped values on release
            if (this.lastDisplayW !== undefined) {
                this.x = this.lastDisplayX;
                this.y = this.lastDisplayY;
                this.width = this.lastDisplayW;
                this.height = this.lastDisplayH;
                
                delete this.lastDisplayX;
                delete this.lastDisplayY;
                delete this.lastDisplayW;
                delete this.lastDisplayH;
                
                this.dom.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
                this.dom.style.width = `${this.width}px`;
                this.dom.style.height = `${this.height}px`;
                this.app.connections.updateWiresForNode(this.id);
            }
        };
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }
    
    setSelected(isSelected) {
        this.selected = isSelected;
        if (this.dom) {
            if (isSelected) {
                this.dom.classList.add('selected');
            } else {
                this.dom.classList.remove('selected');
                // Collapse the drag handle menu back to collapsed state when node is deselected
                const handleEl = this.dom.querySelector('.drag-handle');
                if (handleEl) {
                    handleEl.classList.remove('expanded-menu');
                    handleEl.classList.remove('expanded-selection');
                    handleEl.classList.add('collapsed');
                }
                // Reset color panel state if it exists, and close floating picker
                if (this.type === 'color') {
                    this.isColorPanelOpen = false;
                    const picker = this.dom.querySelector('.floating-color-picker');
                    if (picker) picker.remove();
                    if (this.onWindowClick) {
                        window.removeEventListener('mousedown', this.onWindowClick);
                    }
                }
            }
        }
    }
    
    /**
     * Gets absolute canvas coordinates for a specific socket
     */
    getSocketCoords(socketName, isInput) {
        const dir = isInput ? 'input' : 'output';
        const ports = isInput ? this.inputs : this.outputs;
        const port = ports.find(p => p.name === socketName);
        
        if (!port || !port.style) {
            // Fallback: mid-height on left/right edges
            const x = isInput ? this.x : this.x + this.width;
            const y = this.y + this.height / 2;
            return { x, y };
        }
        
        let x = this.x;
        if (port.style.right !== undefined) {
            // Right-aligned socket: center is at node edge (right: -7px places left at node_width - 7px, center at node_width)
            const rightVal = parseFloat(port.style.right);
            x = this.x + this.width + (rightVal + 7);
        } else if (port.style.left !== undefined) {
            // Left-aligned socket: center is at node edge (left: -7px places right at 7px, center at 0)
            const leftVal = parseFloat(port.style.left);
            x = this.x + (leftVal + 7);
        }
        
        let y = this.y + this.height / 2; // Default vertical center
        if (port.style.top !== undefined) {
            if (port.style.top.endsWith('%')) {
                const percent = parseFloat(port.style.top) / 100;
                y = this.y + this.height * percent;
            } else {
                y = this.y + parseFloat(port.style.top);
            }
        }
        
        return { x, y };
    }
    
    // Abstract definitions to override in subclasses
    renderBody(container) {}
    onNodeClick(e) {}
    getValue() { return null; }
    update() {
        this.app.evaluateFlow(this.id);
        this.app.saveProject(this.app.activeProjectName);
    }
}

/**
 * COLOR NODE
 * Rounded solid color block. Sockets: two output ports on the right.
 */
export class ColorNode extends Node {
    constructor(id, x, y, canvas, app) {
        super(id, 'Color Node', x, y, canvas, app);
        this.type = 'color';
        this.colorValue = '#ff0000'; // Default red as shown in screenshot
        this.isColorPanelOpen = false; // Hidden by default
        this.currentFormat = 'HEX'; // Default color format is HEX
        
        // Two outputs: output1 at 35% height, output2 at 65% height
        this.setupSockets([], [
            { name: 'color1', type: 'color', style: { top: '35%', right: '-7px' } },
            { name: 'color2', type: 'color', style: { top: '65%', right: '-7px' } }
        ]);
    }
    
    renderBody(container) {
        // Rounded Solid Color block
        this.colorBlock = document.createElement('div');
        this.colorBlock.className = 'node-color-block';
        this.colorBlock.style.backgroundColor = this.colorValue;
        
        // Hidden input
        this.colorInput = document.createElement('input');
        this.colorInput.type = 'color';
        this.colorInput.value = this.colorValue;
        this.colorInput.style.display = 'none';
        
        this.colorInput.addEventListener('input', (e) => {
            this.colorValue = e.target.value;
            this.colorBlock.style.backgroundColor = this.colorValue;
            this.update();
        });
        
        container.appendChild(this.colorBlock);
        container.appendChild(this.colorInput);
    }
    
    onNodeClick(e) {
        // Selecting is handled globally, click does not open color picker
    }
    
    getFormattedColorValue(hex) {
        let r = 255, g = 0, b = 0;
        const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (match) {
            r = parseInt(match[1], 16);
            g = parseInt(match[2], 16);
            b = parseInt(match[3], 16);
        }
        
        switch (this.currentFormat) {
            case 'HEX':
                return hex.toUpperCase();
            case 'RGB':
                return `${r}, ${g}, ${b}`;
            case 'CMYK': {
                let rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
                let k = 1 - Math.max(rNorm, gNorm, bNorm);
                let c = k === 1 ? 0 : (1 - rNorm - k) / (1 - k);
                let m = k === 1 ? 0 : (1 - gNorm - k) / (1 - k);
                let y = k === 1 ? 0 : (1 - bNorm - k) / (1 - k);
                return `${Math.round(c * 100)}%, ${Math.round(m * 100)}%, ${Math.round(y * 100)}%, ${Math.round(k * 100)}%`;
            }
            case 'HSB': {
                return `${this.currentH}°, ${this.currentS}%, ${this.currentV}%`;
            }
            case 'LAB': {
                let rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
                rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92;
                gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92;
                bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92;
                let x = (rNorm * 0.4124 + gNorm * 0.3576 + bNorm * 0.1805) * 100;
                let y = (rNorm * 0.2126 + gNorm * 0.7152 + bNorm * 0.0722) * 100;
                let z = (rNorm * 0.0193 + gNorm * 0.1192 + bNorm * 0.9505) * 100;
                let xRef = 95.047, yRef = 100.0, zRef = 108.883;
                x /= xRef; y /= yRef; z /= zRef;
                x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + (16 / 116);
                y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + (16 / 116);
                z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + (16 / 116);
                let l = (116 * y) - 16;
                let aVal = 500 * (x - y);
                let bVal = 200 * (y - z);
                return `${Math.round(l)}, ${Math.round(aVal)}, ${Math.round(bVal)}`;
            }
        }
        return hex;
    }

    parseColorFromInput(text) {
        text = text.trim();
        const rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        
        switch (this.currentFormat) {
            case 'HEX': {
                if (/^#?[0-9A-F]{6}$/i.test(text)) {
                    return text.startsWith('#') ? text : '#' + text;
                }
                break;
            }
            case 'RGB': {
                const parts = text.match(/-?\d+/g);
                if (parts && parts.length >= 3) {
                    const r = Math.max(0, Math.min(255, parseInt(parts[0])));
                    const g = Math.max(0, Math.min(255, parseInt(parts[1])));
                    const b = Math.max(0, Math.min(255, parseInt(parts[2])));
                    return rgbToHex(r, g, b);
                }
                break;
            }
            case 'CMYK': {
                const parts = text.match(/\d+/g);
                if (parts && parts.length >= 4) {
                    const c = Math.max(0, Math.min(100, parseInt(parts[0])));
                    const m = Math.max(0, Math.min(100, parseInt(parts[1])));
                    const y = Math.max(0, Math.min(100, parseInt(parts[2])));
                    const k = Math.max(0, Math.min(100, parseInt(parts[3])));
                    const r = Math.round(255 * (1 - c / 100) * (1 - k / 100));
                    const g = Math.round(255 * (1 - m / 100) * (1 - k / 100));
                    const b = Math.round(255 * (1 - y / 100) * (1 - k / 100));
                    return rgbToHex(r, g, b);
                }
                break;
            }
            case 'HSB': {
                const parts = text.match(/\d+/g);
                if (parts && parts.length >= 3) {
                    const h = Math.max(0, Math.min(360, parseInt(parts[0])));
                    const s = Math.max(0, Math.min(100, parseInt(parts[1])));
                    const b = Math.max(0, Math.min(100, parseInt(parts[2])));
                    const sNorm = s / 100, bNorm = b / 100;
                    let c = bNorm * sNorm;
                    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
                    let m = bNorm - c;
                    let rVal = 0, gVal = 0, bVal = 0;
                    if (h >= 0 && h < 60) { rVal = c; gVal = x; }
                    else if (h >= 60 && h < 120) { rVal = x; gVal = c; }
                    else if (h >= 120 && h < 180) { gVal = c; bVal = x; }
                    else if (h >= 180 && h < 240) { gVal = x; bVal = c; }
                    else if (h >= 240 && h < 300) { rVal = x; gVal = c; }
                    else if (h >= 300 && h < 360) { rVal = c; gVal = x; }
                    const rRGB = Math.round((rVal + m) * 255);
                    const gRGB = Math.round((gVal + m) * 255);
                    const bRGB = Math.round((bVal + m) * 255);
                    return rgbToHex(rRGB, gRGB, bRGB);
                }
                break;
            }
            case 'LAB': {
                const parts = text.match(/-?\d+/g);
                if (parts && parts.length >= 3) {
                    const l = Math.max(0, Math.min(100, parseInt(parts[0])));
                    const aVal = Math.max(-128, Math.min(127, parseInt(parts[1])));
                    const bVal = Math.max(-128, Math.min(127, parseInt(parts[2])));
                    let y = (l + 16) / 116;
                    let x = aVal / 500 + y;
                    let z = y - bVal / 200;
                    y = Math.pow(y, 3) > 0.008856 ? Math.pow(y, 3) : (y - 16 / 116) / 7.787;
                    x = Math.pow(x, 3) > 0.008856 ? Math.pow(x, 3) : (x - 16 / 116) / 7.787;
                    z = Math.pow(z, 3) > 0.008856 ? Math.pow(z, 3) : (z - 16 / 116) / 7.787;
                    let xRef = 95.047, yRef = 100.0, zRef = 108.883;
                    x *= xRef / 100; y *= yRef / 100; z *= zRef / 100;
                    let rNorm = x * 3.2406 + y * -1.5372 + z * -0.4986;
                    let gNorm = x * -0.9689 + y * 1.8758 + z * 0.0415;
                    let bNorm = x * 0.0557 + y * -0.2040 + z * 1.0570;
                    rNorm = rNorm > 0.0031308 ? 1.055 * Math.pow(rNorm, 1 / 2.4) - 0.055 : 12.92 * rNorm;
                    gNorm = gNorm > 0.0031308 ? 1.055 * Math.pow(gNorm, 1 / 2.4) - 0.055 : 12.92 * gNorm;
                    bNorm = bNorm > 0.0031308 ? 1.055 * Math.pow(bNorm, 1 / 2.4) - 0.055 : 12.92 * bNorm;
                    const r = Math.max(0, Math.min(255, Math.round(rNorm * 255)));
                    const g = Math.max(0, Math.min(255, Math.round(gNorm * 255)));
                    const b = Math.max(0, Math.min(255, Math.round(bNorm * 255)));
                    return rgbToHex(r, g, b);
                }
                break;
            }
        }
        return null;
    }

    toggleFloatingColorPicker() {
        // Remove existing picker if any
        const existing = this.dom.querySelector('.floating-color-picker');
        if (existing) existing.remove();
        
        // Remove click listener if any
        if (this.onWindowClick) {
            window.removeEventListener('mousedown', this.onWindowClick);
        }
        
        if (!this.isColorPanelOpen) return;
        
        // Parse current hex color
        const hex = this.colorValue;
        let r = 255, g = 0, b = 0;
        const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (match) {
            r = parseInt(match[1], 16);
            g = parseInt(match[2], 16);
            b = parseInt(match[3], 16);
        }
        
        // Convert RGB to HSV
        const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
        const max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
                case gNorm: h = (bNorm - rNorm) / d + 2; break;
                case bNorm: h = (rNorm - gNorm) / d + 4; break;
            }
            h /= 6;
        }
        this.currentH = Math.round(h * 360);
        this.currentS = Math.round(s * 100);
        this.currentV = Math.round(v * 100);
        
        // Helper conversion HSV to RGB
        const hsvToRgb = (hVal, sVal, vVal) => {
            sVal /= 100;
            vVal /= 100;
            let c = vVal * sVal;
            let x = c * (1 - Math.abs((hVal / 60) % 2 - 1));
            let m = vVal - c;
            let rVal = 0, gVal = 0, bVal = 0;
            if (hVal >= 0 && hVal < 60) { rVal = c; gVal = x; }
            else if (hVal >= 60 && hVal < 120) { rVal = x; gVal = c; }
            else if (hVal >= 120 && hVal < 180) { gVal = c; bVal = x; }
            else if (hVal >= 180 && hVal < 240) { gVal = x; bVal = c; }
            else if (hVal >= 240 && hVal < 300) { rVal = x; bVal = c; }
            else if (hVal >= 300 && hVal < 360) { rVal = c; bVal = x; }
            return {
                r: Math.round((rVal + m) * 255),
                g: Math.round((gVal + m) * 255),
                b: Math.round((bVal + m) * 255)
            };
        };
        
        const swatchesHTML = this.app.projectPalette.map(color => {
            const borderStyle = color.toLowerCase() === '#ffffff' ? 'border: 1px solid rgba(0,0,0,0.1);' : '';
            return `<div class="prop-swatch" style="background-color: ${color}; width: 100%; height: 18px; border-radius: 4px; cursor: pointer; ${borderStyle}" data-color="${color}"></div>`;
        }).join('');
        
        const formattedValue = this.getFormattedColorValue(hex);
        
        const pickerEl = document.createElement('div');
        pickerEl.className = 'floating-color-picker';
        pickerEl.innerHTML = `
            <div style="font-size: 11px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>Color Picker</span>
                <div id="float-color-preview-${this.id}" style="width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: ${hex};"></div>
            </div>
            
            <!-- Photoshop S-V Square Box -->
            <div class="sv-box" style="position: relative; width: 100%; height: 110px; border-radius: 8px; cursor: crosshair; background-color: hsl(${this.currentH}, 100%, 50%); overflow: hidden; margin-bottom: 8px;">
                <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(to right, #fff, transparent);"></div>
                <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(to top, #000, transparent);"></div>
                <div id="sv-marker-${this.id}" style="position: absolute; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 2px rgba(0,0,0,0.5); transform: translate(-50%, -50%); pointer-events: none; left: ${this.currentS}%; top: ${100 - this.currentV}%;"></div>
            </div>
            
            <!-- Rainbow Hue Slider -->
            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
                <input id="hue-slider-${this.id}" type="range" min="0" max="360" value="${this.currentH}" style="width: 100%; height: 6px; margin: 0; cursor: pointer; -webkit-appearance: none; appearance: none; border-radius: 3px; background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);">
            </div>
            
            <!-- Hex / Smart Format Input Row -->
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 8px;">
                <button id="float-color-format-btn-${this.id}" class="btn" style="padding: 0 4px; font-size: 9px; font-weight: 700; height: 22px; width: 48px; min-width: 48px; border: 1px solid var(--border-panel); background: rgba(0,0,0,0.03); cursor: pointer; text-transform: uppercase; border-radius: 4px;" title="Switch Color Space">${this.currentFormat}:</button>
                <input id="float-color-val-${this.id}" type="text" class="prop-input" value="${formattedValue}" style="padding: 4px 8px; font-size: 11px; height: 22px; flex: 1;">
                <button id="float-color-dropper-${this.id}" class="btn" style="padding: 0; font-size: 11px; height: 22px; width: 24px; min-width: 24px; border: 1px solid var(--border-panel); background: rgba(0,0,0,0.03); cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center;" title="Pick color from screen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m14 2 4 4L7 17H3v-4L14 2z"/>
                        <path d="m12.5 3.5 4 4"/>
                        <path d="m5 15 1.5 1.5"/>
                    </svg>
                </button>
            </div>
            
            <div class="prop-swatches" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px;">
                ${swatchesHTML}
            </div>
        `;
        
        pickerEl.addEventListener('mousedown', (e) => e.stopPropagation());
        
        const svBox = pickerEl.querySelector('.sv-box');
        const marker = pickerEl.querySelector(`#sv-marker-${this.id}`);
        const hueSlider = pickerEl.querySelector(`#hue-slider-${this.id}`);
        const preview = pickerEl.querySelector(`#float-color-preview-${this.id}`);
        const textVal = pickerEl.querySelector(`#float-color-val-${this.id}`);
        const formatBtn = pickerEl.querySelector(`#float-color-format-btn-${this.id}`);
        
        let isDraggingSV = false;
        
        const updateColorFromSV = (clientX, clientY) => {
            const rect = svBox.getBoundingClientRect();
            let x = clientX - rect.left;
            let y = clientY - rect.top;
            
            x = Math.max(0, Math.min(rect.width, x));
            y = Math.max(0, Math.min(rect.height, y));
            
            this.currentS = Math.round((x / rect.width) * 100);
            this.currentV = Math.round((1 - y / rect.height) * 100);
            
            marker.style.left = `${(x / rect.width) * 100}%`;
            marker.style.top = `${(y / rect.height) * 100}%`;
            
            const rgb = hsvToRgb(this.currentH, this.currentS, this.currentV);
            const hexVal = "#" + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1);
            this.colorValue = hexVal;
            this.colorBlock.style.backgroundColor = hexVal;
            if (preview) preview.style.backgroundColor = hexVal;
            if (textVal) textVal.value = this.getFormattedColorValue(hexVal);
            this.update();
        };
        
        svBox.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDraggingSV = true;
            updateColorFromSV(e.clientX, e.clientY);
        });
        
        const onMouseMove = (e) => {
            if (!isDraggingSV) return;
            updateColorFromSV(e.clientX, e.clientY);
        };
        
        const onMouseUp = () => {
            isDraggingSV = false;
        };
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        
        hueSlider.addEventListener('input', (e) => {
            this.currentH = parseInt(e.target.value);
            svBox.style.backgroundColor = `hsl(${this.currentH}, 100%, 50%)`;
            
            const rgb = hsvToRgb(this.currentH, this.currentS, this.currentV);
            const hexVal = "#" + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1);
            this.colorValue = hexVal;
            this.colorBlock.style.backgroundColor = hexVal;
            if (preview) preview.style.backgroundColor = hexVal;
            if (textVal) textVal.value = this.getFormattedColorValue(hexVal);
            this.update();
        });
        
        const syncPickerFromHex = (hexInputVal) => {
            const matchInput = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexInputVal);
            if (matchInput) {
                const rNormVal = parseInt(matchInput[1], 16) / 255;
                const gNormVal = parseInt(matchInput[2], 16) / 255;
                const bNormVal = parseInt(matchInput[3], 16) / 255;
                const maxVal = Math.max(rNormVal, gNormVal, bNormVal), minVal = Math.min(rNormVal, gNormVal, bNormVal);
                let hVal, sVal, vVal = maxVal;
                let dVal = maxVal - minVal;
                sVal = maxVal === 0 ? 0 : dVal / maxVal;
                if (maxVal === minVal) {
                    hVal = 0;
                } else {
                    switch (maxVal) {
                        case rNormVal: hVal = (gNormVal - bNormVal) / dVal + (gNormVal < bNormVal ? 6 : 0); break;
                        case gNormVal: hVal = (bNormVal - rNormVal) / dVal + 2; break;
                        case bNormVal: hVal = (rNormVal - gNormVal) / dVal + 4; break;
                    }
                    hVal /= 6;
                }
                this.currentH = Math.round(hVal * 360);
                this.currentS = Math.round(sVal * 100);
                this.currentV = Math.round(vVal * 100);
                
                svBox.style.backgroundColor = `hsl(${this.currentH}, 100%, 50%)`;
                marker.style.left = `${this.currentS}%`;
                marker.style.top = `${100 - this.currentV}%`;
                hueSlider.value = this.currentH;
            }
        };
        
        // Format switcher click handler
        formatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const formats = ['HEX', 'RGB', 'CMYK', 'HSB', 'LAB'];
            let idx = formats.indexOf(this.currentFormat);
            idx = (idx + 1) % formats.length;
            this.currentFormat = formats[idx];
            
            formatBtn.textContent = `${this.currentFormat}:`;
            textVal.value = this.getFormattedColorValue(this.colorValue);
        });
        
        // Native screen EyeDropper integration
        const dropperBtn = pickerEl.querySelector(`#float-color-dropper-${this.id}`);
        if (dropperBtn) {
            if (!window.EyeDropper) {
                dropperBtn.style.display = 'none';
            } else {
                dropperBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const eyeDropper = new EyeDropper();
                    try {
                        const result = await eyeDropper.open();
                        const hexVal = result.sRGBHex;
                        
                        this.colorValue = hexVal;
                        this.colorBlock.style.backgroundColor = hexVal;
                        if (preview) preview.style.backgroundColor = hexVal;
                        if (textVal) textVal.value = this.getFormattedColorValue(hexVal);
                        syncPickerFromHex(hexVal);
                        this.update();
                    } catch (err) {
                        console.log('Eyedropper cancelled or failed', err);
                    }
                });
            }
        }
        
        textVal.addEventListener('input', (e) => {
            const parsedHex = this.parseColorFromInput(e.target.value);
            if (parsedHex) {
                this.colorValue = parsedHex;
                this.colorBlock.style.backgroundColor = parsedHex;
                if (preview) preview.style.backgroundColor = parsedHex;
                syncPickerFromHex(parsedHex);
                this.update();
            }
        });
        
        pickerEl.querySelectorAll('.prop-swatch').forEach((swatch, index) => {
            let clickTimer = null;
            
            swatch.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (clickTimer !== null) {
                    // Double Click detected! Cancel single click
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    
                    // Double click: Save current active color to swatch
                    const hexVal = this.colorValue;
                    this.app.projectPalette[index] = hexVal;
                    localStorage.setItem('canvas-project-palette', JSON.stringify(this.app.projectPalette));
                    
                    swatch.style.backgroundColor = hexVal;
                    swatch.dataset.color = hexVal;
                    if (hexVal.toLowerCase() === '#ffffff') {
                        swatch.style.border = '1px solid rgba(0,0,0,0.1)';
                    } else {
                        swatch.style.border = 'none';
                    }
                } else {
                    // Start timer for single click
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        
                        // Single click: Apply swatch color to picker
                        const hexVal = swatch.dataset.color;
                        this.colorValue = hexVal;
                        this.colorBlock.style.backgroundColor = hexVal;
                        if (preview) preview.style.backgroundColor = hexVal;
                        if (textVal) textVal.value = this.getFormattedColorValue(hexVal);
                        syncPickerFromHex(hexVal);
                        this.update();
                    }, 220);
                }
            });
        });
        
        this.dom.appendChild(pickerEl);
        
        // Counter-scale immediately to maintain constant screen size
        const zoom = this.app.canvas.zoom || 1.0;
        pickerEl.style.transform = `scale(${1 / zoom})`;
        pickerEl.style.transformOrigin = 'top right';
        
        // Window click listener to auto-close picker when clicking outside node/picker
        this.onWindowClick = (e) => {
            if (!this.dom.contains(e.target) && !e.target.closest('.floating-color-picker')) {
                this.isColorPanelOpen = false;
                this.toggleFloatingColorPicker();
            }
        };
        
        setTimeout(() => {
            window.addEventListener('mousedown', this.onWindowClick);
        }, 0);
    }
    
    getValue() {
        return this.colorValue;
    }
}

/**
 * IMAGE NODE
 * Rounded image block. Sockets: one output port on the right near the top.
 */
export class ImageNode extends Node {
    constructor(id, x, y, canvas, app) {
        super(id, 'Image Node', x, y, canvas, app);
        this.type = 'image';
        // Default modern architecture sketch photo matching the user's screenshot
        this.imageUrl = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80';
        
        // One output: output at 25% height (near upper right corner)
        this.setupSockets([], [
            { name: 'image', type: 'image', style: { top: '25%', right: '-7px' } }
        ]);
        
        this.maskCanvas = document.createElement('canvas');
        this.brushSize = 20;
        this.currentTool = 'brush';
    }
    
    renderBody(container) {
        this.imgEl = document.createElement('img');
        this.imgEl.className = 'node-image-block';
        this.imgEl.crossOrigin = 'anonymous';
        this.imgEl.src = this.imageUrl;
        this.imgEl.alt = 'Architecture Pic';
        
        // Dynamically compute aspect ratio and sizes
        this.adjustSizeFromImage = () => {
            const tempImg = new Image();
            tempImg.crossOrigin = 'anonymous';
            tempImg.onload = () => {
                const aspect = tempImg.width / tempImg.height;
                this.aspectRatio = aspect;
                this.height = 220;
                this.width = Math.round(220 * aspect);
                
                // Adjust mask canvas size as well
                this.maskCanvas.width = this.width;
                this.maskCanvas.height = this.height;
                
                if (this.dom) {
                    this.dom.style.width = `${this.width}px`;
                    this.dom.style.height = `${this.height}px`;
                }
                // Update connections and properties
                if (this.app && this.app.connections) {
                    this.app.connections.updateWiresForNode(this.id);
                }
                if (this.app && typeof this.app.updatePropertiesPanel === 'function') {
                    this.app.updatePropertiesPanel();
                }
            };
            tempImg.src = this.imageUrl;
        };
        
        // Initial run
        this.adjustSizeFromImage();
        
        // Hidden file input
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (readerEvent) => {
                    this.imageUrl = readerEvent.target.result;
                    this.imgEl.src = this.imageUrl;
                    this.update();
                    this.adjustSizeFromImage();
                };
                reader.readAsDataURL(file);
            }
        });
        
        container.appendChild(this.imgEl);
        container.appendChild(this.fileInput);
    }
    
    onNodeClick(e) {
        // Do nothing on click (prevent upload from opening on simple node click)
    }
    
    activateSelectionMode() {
        this.app.isSelectionModalActive = true;
        this.dom.classList.add('selection-mode-active');
        
        if (!this.perspectivePlanes || this.perspectivePlanes.length === 0) {
            this.perspectivePlanes = [
                {
                    id: 1,
                    points: [
                        { x: this.width * 0.15, y: this.height * 0.15 }, // Top-Left
                        { x: this.width * 0.85, y: this.height * 0.15 }, // Top-Right
                        { x: this.width * 0.85, y: this.height * 0.85 }, // Bottom-Right
                        { x: this.width * 0.15, y: this.height * 0.85 }  // Bottom-Left
                    ]
                }
            ];
            this.activePlaneId = 1;
        }
        
        // Scale existing mask canvas content to fit the current node width/height (preventing distortion or offsets)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.maskCanvas.width;
        tempCanvas.height = this.maskCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.maskCanvas, 0, 0);
        
        this.maskCanvas.width = this.width;
        this.maskCanvas.height = this.height;
        const maskCtx = this.maskCanvas.getContext('2d');
        if (tempCanvas.width > 0 && tempCanvas.height > 0) {
            maskCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, this.width, this.height);
        }
        
        this.selectionCanvas = document.createElement('canvas');
        this.selectionCanvas.className = 'selection-canvas';
        this.selectionCanvas.width = this.width;
        this.selectionCanvas.height = this.height;
        this.dom.querySelector('.node-body').appendChild(this.selectionCanvas);
        
        const ctx = this.selectionCanvas.getContext('2d');
        let isDrawing = false;
        let currentPath = [];
        
        this.mouseX = -1000;
        this.mouseY = -1000;
        
        // 1. Extract image pixel data for Magnetic Snapping
        let pixels = null;
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.width;
            tempCanvas.height = this.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.imgEl, 0, 0, this.width, this.height);
            const imgData = tempCtx.getImageData(0, 0, this.width, this.height);
            pixels = imgData.data;
        } catch (err) {
            console.warn("Could not read image pixel data for snapping due to CORS restrictions. Falling back to freehand pencil.", err);
        }
        
        // 2. Intelligent Magnetic Snapping algorithm
        const getSnappedCoordinates = (mx, my) => {
            if (!pixels) return { x: mx, y: my };
            
            const radius = 8;
            let maxGrad = -1;
            let snapX = mx;
            let snapY = my;
            
            const getPixelIntensity = (px, py) => {
                const rx = Math.round(px);
                const ry = Math.round(py);
                if (rx < 0 || rx >= this.width || ry < 0 || ry >= this.height) return 0;
                const idx = (ry * this.width + rx) * 4;
                return 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
            };
            
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    const px = mx + dx;
                    const py = my + dy;
                    if (px < 1 || px >= this.width - 1 || py < 1 || py >= this.height - 1) continue;
                    
                    // Central difference gradient calculation
                    const gx = getPixelIntensity(px + 1, py) - getPixelIntensity(px - 1, py);
                    const gy = getPixelIntensity(px, py + 1) - getPixelIntensity(px, py - 1);
                    const grad = gx*gx + gy*gy;
                    
                    if (grad > maxGrad) {
                        maxGrad = grad;
                        snapX = px;
                        snapY = py;
                    }
                }
            }
            // Snap to edge only if gradient is strong enough
            return maxGrad > 150 ? { x: snapX, y: snapY } : { x: mx, y: my };
        };
        
        // 3. Draw mask selection with constant opacity
        this.drawSelectionCanvas = () => {
            if (!this.selectionCanvas) return;
            ctx.clearRect(0, 0, this.width, this.height);
            
            ctx.save();
            // Draw the solid white binary mask
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(this.maskCanvas, 0, 0);
            
            // Mask coloring with fixed transparent blue overlay
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = 'rgba(0, 136, 204, 0.35)'; // constant 35% opacity
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.restore();
            
            // If Perspective Edit Mode is active, draw the quads and handles
            if (this.currentTool === 'perspective' && this.perspectivePlanes) {
                ctx.save();
                this.perspectivePlanes.forEach((plane, pIdx) => {
                    const isActive = plane.id === this.activePlaneId;
                    const pts = plane.points;
                    if (!pts || pts.length < 4) return;
                    
                    // Draw outline
                    ctx.strokeStyle = isActive ? '#0088cc' : '#94a3b8';
                    ctx.lineWidth = isActive ? 2.5 : 1.5;
                    ctx.setLineDash(isActive ? [4, 4] : [2, 2]);
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    ctx.lineTo(pts[1].x, pts[1].y);
                    ctx.lineTo(pts[2].x, pts[2].y);
                    ctx.lineTo(pts[3].x, pts[3].y);
                    ctx.closePath();
                    ctx.stroke();
                    
                    // Draw fill
                    ctx.fillStyle = isActive ? 'rgba(0, 136, 204, 0.15)' : 'rgba(148, 163, 184, 0.08)';
                    ctx.fill();
                    
                    // Draw center surface label badge
                    const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
                    const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
                    
                    ctx.save();
                    ctx.setLineDash([]); // clear dashes
                    const labelText = `Surface ${String.fromCharCode(65 + pIdx)}`;
                    ctx.font = 'bold 10px Inter, sans-serif';
                    const textWidth = ctx.measureText(labelText).width;
                    
                    // Badge rect
                    ctx.fillStyle = isActive ? '#0088cc' : '#94a3b8';
                    ctx.beginPath();
                    if (typeof ctx.roundRect === 'function') {
                        ctx.roundRect(cx - textWidth/2 - 6, cy - 8, textWidth + 12, 16, 4);
                    } else {
                        ctx.rect(cx - textWidth/2 - 6, cy - 8, textWidth + 12, 16);
                    }
                    ctx.fill();
                    
                    // Badge text
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(labelText, cx, cy);
                    ctx.restore();
                    
                    // Draw corner handles
                    pts.forEach((p, idx) => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, isActive ? 8 : 5, 0, Math.PI * 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.fill();
                        ctx.strokeStyle = isActive ? '#0088cc' : '#94a3b8';
                        ctx.lineWidth = isActive ? 2.5 : 1.5;
                        ctx.stroke();
                        
                        if (isActive) {
                            // Add text label (1, 2, 3, 4) for active plane only
                            ctx.fillStyle = '#0088cc';
                            ctx.font = 'bold 9px Inter, sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(idx + 1, p.x, p.y);
                        }
                    });
                });
                ctx.restore();
            }
        };
        
        let dashOffset = 0;
        this.lassoPoints = [];
        this.lassoClingingPath = [];
        this.isLassoActive = false;
        this.selectionMode = 'add'; // Default selection operation: add (+)
        
        const getClingingPath = (p1, p2) => {
            const path = [p1];
            const steps = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 6));
            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const lx = p1.x + (p2.x - p1.x) * t;
                const ly = p1.y + (p2.y - p1.y) * t;
                const snapped = getSnappedCoordinates(lx, ly);
                path.push(snapped);
            }
            path.push(p2);
            return path;
        };
        
        const closeLasso = () => {
            if (this.lassoPoints.length >= 3) {
                const maskCtx = this.maskCanvas.getContext('2d');
                maskCtx.globalCompositeOperation = (this.selectionMode === 'sub') ? 'destination-out' : 'source-over';
                maskCtx.fillStyle = '#ffffff';
                maskCtx.beginPath();
                maskCtx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
                for (let i = 1; i < this.lassoPoints.length; i++) {
                    maskCtx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
                }
                maskCtx.closePath();
                maskCtx.fill();
            }
            this.lassoPoints = [];
            this.lassoClingingPath = [];
            this.isLassoActive = false;
            this.drawSelectionCanvas();
        };
        
        // 4. Draw current lasso/pencil outline if drawing
        ctx.globalCompositeOperation = 'source-over';
        const drawLassoPath = () => {
            if ((this.currentTool === 'pencil' || this.currentTool === 'lasso') && this.isLassoActive && this.lassoPoints.length >= 1) {
                ctx.beginPath();
                ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
                for (let i = 1; i < this.lassoPoints.length; i++) {
                    ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
                }
                
                if (this.currentTool === 'lasso') {
                    // Draw a straight line to the mouse cursor
                    ctx.lineTo(this.mouseX, this.mouseY);
                } else if (this.lassoClingingPath && this.lassoClingingPath.length > 0) {
                    // Draw magnetic snap clinging path for pencil
                    for (let i = 0; i < this.lassoClingingPath.length; i++) {
                        ctx.lineTo(this.lassoClingingPath[i].x, this.lassoClingingPath[i].y);
                    }
                }
                
                ctx.strokeStyle = '#0088cc';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.lineDashOffset = dashOffset;
                ctx.stroke();
                
                // Draw vertices
                this.lassoPoints.forEach(pt => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.strokeStyle = '#0088cc';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });
                
                // Draw a snap circles green when close to starting node
                const distToStart = Math.hypot(this.mouseX - this.lassoPoints[0].x, this.mouseY - this.lassoPoints[0].y);
                if (distToStart < 15 && this.lassoPoints.length >= 3) {
                    ctx.beginPath();
                    ctx.arc(this.lassoPoints[0].x, this.lassoPoints[0].y, 8, 0, Math.PI * 2);
                    ctx.strokeStyle = '#10b981';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([]);
                    ctx.stroke();
                }
            }
        };
        
        // 5. Draw brush cursor outline (circular brush)
        const drawBrushCursor = () => {
            if (this.currentTool === 'brush') {
                ctx.beginPath();
                ctx.arc(this.mouseX, this.mouseY, this.brushSize, 0, Math.PI * 2);
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(this.mouseX, this.mouseY, this.brushSize, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(this.mouseX, this.mouseY, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
        };
        
        // 6. Draw crosshair indicator for pencil/lasso
        const drawCrosshairCursor = () => {
            if (this.currentTool === 'pencil' || this.currentTool === 'lasso') {
                ctx.beginPath();
                ctx.moveTo(this.mouseX - 10, this.mouseY); ctx.lineTo(this.mouseX + 10, this.mouseY);
                ctx.moveTo(this.mouseX, this.mouseY - 10); ctx.lineTo(this.mouseX, this.mouseY + 10);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(this.mouseX - 10, this.mouseY); ctx.lineTo(this.mouseX + 10, this.mouseY);
                ctx.moveTo(this.mouseX, this.mouseY - 10); ctx.lineTo(this.mouseX, this.mouseY + 10);
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        };
        
        const animateSelection = () => {
            if (!this.selectionCanvas) return;
            dashOffset = (dashOffset + 0.5) % 8;
            
            this.drawSelectionCanvas();
            
            if (this.currentTool === 'pencil' || this.currentTool === 'lasso') {
                this.selectionCanvas.style.cursor = 'crosshair';
            } else if (this.currentTool === 'perspective') {
                this.selectionCanvas.style.cursor = 'default';
            } else {
                this.selectionCanvas.style.cursor = 'none';
            }
            
            drawLassoPath();
            drawBrushCursor();
            drawCrosshairCursor();
            
            this.antsAnimId = requestAnimationFrame(animateSelection);
        };
        
        animateSelection();
        
        // Mouse and click event listeners for Drawing
        this.selectionCanvas.addEventListener('mousedown', (e) => {
            const rect = this.selectionCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.width / rect.width);
            const y = (e.clientY - rect.top) * (this.height / rect.height);
            
            this.lastMouseX = x;
            this.lastMouseY = y;
            
            if (this.currentTool === 'perspective') {
                const clickRadius = 15;
                let clickedHandleIdx = -1;
                let clickedPlaneId = -1;
                
                const isPointInQuad = (pt, quad) => {
                    const px = pt.x, py = pt.y;
                    let inside = false;
                    for (let i = 0, j = 3; i < 4; j = i++) {
                        const xi = quad[i].x, yi = quad[i].y;
                        const xj = quad[j].x, yj = quad[j].y;
                        const intersect = ((yi > py) !== (yj > py))
                            && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };
                
                if (this.perspectivePlanes) {
                    // 1. Check active plane handles
                    const activePlane = this.perspectivePlanes.find(p => p.id === this.activePlaneId);
                    if (activePlane) {
                        activePlane.points.forEach((p, idx) => {
                            if (Math.hypot(x - p.x, y - p.y) < clickRadius) {
                                clickedHandleIdx = idx;
                                clickedPlaneId = activePlane.id;
                            }
                        });
                    }
                    
                    // 2. Check other planes' handles to switch focus and drag
                    if (clickedPlaneId === -1) {
                        for (const plane of this.perspectivePlanes) {
                            if (plane.id === this.activePlaneId) continue;
                            plane.points.forEach((p, idx) => {
                                if (Math.hypot(x - p.x, y - p.y) < clickRadius) {
                                    clickedHandleIdx = idx;
                                    clickedPlaneId = plane.id;
                                    this.activePlaneId = plane.id;
                                }
                            });
                            if (clickedPlaneId !== -1) break;
                        }
                    }
                    
                    // 3. Check inside any plane body to switch focus
                    if (clickedPlaneId === -1) {
                        for (const plane of this.perspectivePlanes) {
                            if (isPointInQuad({ x, y }, plane.points)) {
                                this.activePlaneId = plane.id;
                                clickedPlaneId = plane.id;
                                this.drawSelectionCanvas();
                                break;
                            }
                        }
                    }
                }
                
                if (clickedHandleIdx !== -1 && clickedPlaneId !== -1) {
                    this.draggingPerspectiveHandleIdx = clickedHandleIdx;
                    this.isDraggingPerspective = true;
                    this.drawSelectionCanvas();
                }
                
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            
            if (this.currentTool === 'pencil' || this.currentTool === 'lasso') {
                const pt = this.currentTool === 'lasso' ? { x, y } : getSnappedCoordinates(x, y);
                if (!this.isLassoActive) {
                    // Start lasso session
                    this.isLassoActive = true;
                    this.lassoPoints = [pt];
                    this.lassoClingingPath = [];
                } else {
                    // Check if clicked near start node to close loop
                    const distToStart = Math.hypot(x - this.lassoPoints[0].x, y - this.lassoPoints[0].y);
                    if (distToStart < 15 && this.lassoPoints.length >= 3) {
                        closeLasso();
                    } else {
                        // Regular click drops a manual anchor point
                        this.lassoPoints.push(pt);
                        this.lassoClingingPath = [];
                    }
                }
            } else {
                isDrawing = true;
                const maskCtx = this.maskCanvas.getContext('2d');
                maskCtx.globalCompositeOperation = (this.selectionMode === 'sub') ? 'destination-out' : 'source-over';
                maskCtx.fillStyle = '#ffffff'; // solid mask fill
                maskCtx.beginPath();
                maskCtx.arc(x, y, this.brushSize, 0, Math.PI * 2);
                maskCtx.fill();
            }
            
            e.stopPropagation();
            e.preventDefault();
        });
        
        this.selectionCanvas.addEventListener('mousemove', (e) => {
            const rect = this.selectionCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.width / rect.width);
            const y = (e.clientY - rect.top) * (this.height / rect.height);
            
            this.mouseX = x;
            this.mouseY = y;
            
            if (this.currentTool === 'perspective' && this.isDraggingPerspective && this.perspectivePlanes) {
                const activePlane = this.perspectivePlanes.find(p => p.id === this.activePlaneId);
                if (activePlane) {
                    const pt = activePlane.points[this.draggingPerspectiveHandleIdx];
                    if (pt) {
                        pt.x = Math.max(0, Math.min(this.width, x));
                        pt.y = Math.max(0, Math.min(this.height, y));
                    }
                }
                this.drawSelectionCanvas();
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            
            if (this.currentTool === 'pencil' && this.isLassoActive) {
                const currentPt = getSnappedCoordinates(x, y);
                this.lassoClingingPath = getClingingPath(this.lassoPoints[this.lassoPoints.length - 1], currentPt);
                
                // Auto drop anchor point if dragged far enough (e.g. 35px)
                const lastAnchor = this.lassoPoints[this.lassoPoints.length - 1];
                const dist = Math.hypot(currentPt.x - lastAnchor.x, currentPt.y - lastAnchor.y);
                if (dist > 35) {
                    this.lassoPoints.push(currentPt);
                    this.lassoClingingPath = [];
                }
            } else if (isDrawing) {
                const maskCtx = this.maskCanvas.getContext('2d');
                maskCtx.globalCompositeOperation = (this.selectionMode === 'sub') ? 'destination-out' : 'source-over';
                maskCtx.strokeStyle = '#ffffff'; // solid mask paint
                maskCtx.lineWidth = this.brushSize * 2;
                maskCtx.lineCap = 'round';
                maskCtx.lineJoin = 'round';
                
                maskCtx.beginPath();
                maskCtx.moveTo(this.lastMouseX, this.lastMouseY);
                maskCtx.lineTo(x, y);
                maskCtx.stroke();
            }
            
            this.lastMouseX = x;
            this.lastMouseY = y;
            e.stopPropagation();
            e.preventDefault();
        });
        
        this.selectionCanvas.addEventListener('mouseup', (e) => {
            if (this.isDraggingPerspective) {
                this.isDraggingPerspective = false;
                this.draggingPerspectiveHandleIdx = -1;
                this.drawSelectionCanvas();
                
                // Trigger auto-save of new perspective coordinates
                this.app.saveProject(this.app.activeProjectName);
                
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if (!isDrawing) return;
            isDrawing = false;
            e.stopPropagation();
            e.preventDefault();
        });
        
        // Add double click handler to close the lasso loop instantly
        this.selectionCanvas.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if ((this.currentTool === 'pencil' || this.currentTool === 'lasso') && this.isLassoActive) {
                closeLasso();
            }
        });
        
        // Update enter key listener to close active lasso loop first
        const oldOnSelectionEnterKey = this.onSelectionEnterKey;
        this.onSelectionEnterKey = (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                ev.stopPropagation();
                if ((this.currentTool === 'pencil' || this.currentTool === 'lasso') && this.isLassoActive) {
                    closeLasso();
                } else {
                    const btnConfirm = this.dom.querySelector('.btn-confirm-selection');
                    if (btnConfirm) btnConfirm.click();
                }
            }
        };
        this.selectionCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -2 : 2;
            this.brushSize = Math.max(5, Math.min(100, this.brushSize + delta));
        });
        
        window.addEventListener('keydown', this.onSelectionEnterKey);
    }
    
    deactivateSelectionMode(saveSelection = false) {
        this.app.isSelectionModalActive = false;
        this.dom.classList.remove('selection-mode-active');
        
        if (this.selectionCanvas) {
            this.selectionCanvas.remove();
            this.selectionCanvas = null;
        }
        cancelAnimationFrame(this.antsAnimId);
        window.removeEventListener('keydown', this.onSelectionEnterKey);
        
        if (!saveSelection) {
            this.clearSelectionMask();
        }
    }
    
    clearSelectionMask() {
        const maskCtx = this.maskCanvas.getContext('2d');
        maskCtx.clearRect(0, 0, this.width, this.height);
        if (this.drawSelectionCanvas) this.drawSelectionCanvas();
    }
    
    getValue() {
        return this.imageUrl;
    }
}

/**
 * RECOLOR NODE
 * Takes an Image Node (with mask) and a Color Node, and recolors the mask.
 */
export class RecolorNode extends Node {
    constructor(id, x, y, canvas, app) {
        super(id, 'Recolor Mask', x, y, canvas, app);
        this.type = 'recolor';
        this.recoloredDataUrl = null;
        
        // Enforce fixed 250x250 size
        this.width = 250;
        this.height = 250;
        
        // Sockets: 2 inputs (image, color) on the left. NO output socket on the right!
        this.setupSockets([
            { name: 'image', type: 'image', style: { top: '30%', left: '-7px' } },
            { name: 'color', type: 'color', style: { top: '70%', left: '-7px' } }
        ], []);
    }
    
    renderBody(container) {
        // Enforce 250x250 dimensions
        this.width = 250;
        this.height = 250;
        if (this.dom) {
            this.dom.style.width = `${this.width}px`;
            this.dom.style.height = `${this.height}px`;
        }
        
        // Split-panel wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'recolor-node-wrapper';
        
        // Left Color panel (Default branded blue)
        this.leftPanel = document.createElement('div');
        this.leftPanel.className = 'recolor-left-panel';
        this.leftPanel.style.backgroundColor = '#0082c8';
        
        // Right Image panel (Default branded geometric building facade pattern)
        const rightPanel = document.createElement('div');
        rightPanel.className = 'recolor-right-panel';
        
        this.facadeImg = document.createElement('img');
        this.facadeImg.className = 'recolor-preview-img';
        this.facadeImg.src = 'blue_facade_pattern.jpg';
        this.facadeImg.style.display = 'block';
        
        rightPanel.appendChild(this.facadeImg);
        
        // Center play button
        this.btnPlay = document.createElement('button');
        this.btnPlay.className = 'recolor-play-btn';
        this.btnPlay.title = 'Run Recoloring';
        this.btnPlay.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">
                <polygon points="8 5 19 12 8 19 8 5"/>
            </svg>
        `;
        
        this.btnPlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.processAndSpawn();
        });
        
        wrapper.appendChild(this.leftPanel);
        wrapper.appendChild(rightPanel);
        wrapper.appendChild(this.btnPlay);
        
        container.appendChild(wrapper);
    }
    
    onInputValueChange(portName, value) {
        if (portName === 'color') {
            if (this.leftPanel) {
                this.leftPanel.style.backgroundColor = value || '#0082c8';
            }
        } else if (portName === 'image') {
            if (this.facadeImg) {
                this.facadeImg.src = value || 'blue_facade_pattern.jpg';
            }
        }
    }
    
    update() {
        super.update();
        if (!this.app || !this.app.connections) return;
        
        // Update color panel based on connection
        const colorConn = this.app.connections.getInputConnectionSource(this.id, 'color');
        if (colorConn) {
            const colorNode = this.app.nodes.get(colorConn.nodeId);
            if (colorNode && this.leftPanel) {
                this.leftPanel.style.backgroundColor = colorNode.getValue() || '#0082c8';
            }
        } else {
            if (this.leftPanel) this.leftPanel.style.backgroundColor = '#0082c8';
        }
        
        // Update image panel based on connection
        const imageConn = this.app.connections.getInputConnectionSource(this.id, 'image');
        if (imageConn) {
            const imageNode = this.app.nodes.get(imageConn.nodeId);
            if (imageNode && this.facadeImg) {
                this.facadeImg.src = imageNode.getValue() || 'blue_facade_pattern.jpg';
            }
        } else {
            if (this.facadeImg) this.facadeImg.src = 'blue_facade_pattern.jpg';
        }
    }
    
    processAndSpawn() {
        // Find connected source nodes
        let srcImageNode = null;
        let srcColorNode = null;
        
        if (!this.app || !this.app.connections) return;
        
        this.app.connections.connections.forEach(c => {
            if (c.toId === this.id) {
                const fromNode = this.app.nodes.get(c.fromId);
                if (fromNode) {
                    if (c.toPort === 'image') srcImageNode = fromNode;
                    if (c.toPort === 'color') srcColorNode = fromNode;
                }
            }
        });
        
        if (!srcImageNode) {
            alert("Please connect an Image Node to the 'image' input.");
            return;
        }
        if (!srcColorNode) {
            alert("Please connect a Color Node to the 'color' input.");
            return;
        }
        
        const targetColor = srcColorNode.getValue();
        const srcImgUrl = srcImageNode.getValue();
        
        if (!srcImgUrl) {
            alert("Source Image is empty.");
            return;
        }
        
        this.btnPlay.style.opacity = '0.5';
        this.btnPlay.disabled = true;
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imgData.data;
                
                // Read selection mask
                const maskCanvas = srcImageNode.maskCanvas;
                let hasMask = false;
                
                const tempMask = document.createElement('canvas');
                tempMask.width = canvas.width;
                tempMask.height = canvas.height;
                const maskCtx = tempMask.getContext('2d');
                
                if (maskCanvas) {
                    // Draw selection mask directly without any blur filter to maintain pixel-perfect sharp edges
                    maskCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, canvas.width, canvas.height);
                    const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);
                    const maskPixels = maskData.data;
                    
                    // Convert target hex color to RGB
                    const hexToRgb = (hex) => {
                        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 0, 0];
                    };
                    const [targetR, targetG, targetB] = hexToRgb(targetColor);
                    
                    // 2. Compute average color of original object to build a color profile
                    let sumFgR = 0, sumFgG = 0, sumFgB = 0, fgCount = 0;
                    let sumLum = 0;
                    let count = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        const maskAlpha = maskPixels[i + 3];
                        if (maskAlpha > 30) {
                            const r = pixels[i];
                            const g = pixels[i + 1];
                            const b = pixels[i + 2];
                            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                            sumLum += lum;
                            count++;
                            
                            if (maskAlpha > 180) {
                                sumFgR += r;
                                sumFgG += g;
                                sumFgB += b;
                                fgCount++;
                            }
                        }
                    }
                    const avgLum = count > 0 ? (sumLum / count) : 128;
                    const avgFgR = fgCount > 0 ? (sumFgR / fgCount) : 128;
                    const avgFgG = fgCount > 0 ? (sumFgG / fgCount) : 128;
                    const avgFgB = fgCount > 0 ? (sumFgB / fgCount) : 128;
                    

                    
                    // 3. Apply professional paint blending formula with smart edge snapping
                    for (let i = 0; i < pixels.length; i += 4) {
                        const origAlpha = maskPixels[i + 3];
                        if (origAlpha > 1) {
                            const r = pixels[i];
                            const g = pixels[i + 1];
                            const b = pixels[i + 2];
                            
                            const refinedAlpha = origAlpha;
                            
                            // Perceptual relative luminance of original pixel
                            const origY = 0.299 * r + 0.587 * g + 0.114 * b;
                            
                            if (refinedAlpha > 5) {
                                hasMask = true;
                                
                                // Scale contrast relative to the mask's average brightness (keeps shadows realistic)
                                const factor = origY / (avgLum || 1.0);
                                let nr = targetR * factor;
                                let ng = targetG * factor;
                                let nb = targetB * factor;
                                
                                // Specular highlights preservation: keep original reflection details in bright spots (>200)
                                if (origY > 200) {
                                    const highlightWeight = (origY - 200) / 55; // 0.0 to 1.0
                                    nr = nr * (1.0 - highlightWeight) + r * highlightWeight;
                                    ng = ng * (1.0 - highlightWeight) + g * highlightWeight;
                                    nb = nb * (1.0 - highlightWeight) + b * highlightWeight;
                                }
                                
                                // Smooth blend based on refined soft mask alpha
                                const blend = refinedAlpha / 255;
                                pixels[i] = Math.min(255, Math.max(0, nr * blend + r * (1.0 - blend)));
                                pixels[i + 1] = Math.min(255, Math.max(0, ng * blend + g * (1.0 - blend)));
                                pixels[i + 2] = Math.min(255, Math.max(0, nb * blend + b * (1.0 - blend)));
                            }
                        }
                    }
                }
                
                if (!hasMask) {
                    alert("Please select/draw a mask on the Image Node first using the brush tool.");
                    this.btnPlay.style.opacity = '1';
                    this.btnPlay.disabled = false;
                    return;
                }
                
                ctx.putImageData(imgData, 0, 0);
                const dataUrl = canvas.toDataURL();
                this.recoloredDataUrl = dataUrl;
                
                // Update UI preview (Disabled to maintain static branded appearance)
                // this.previewImg.src = dataUrl;
                // this.previewImg.style.display = 'block';
                // this.previewText.style.display = 'none';
                
                // Spawn one new ImageNode on the canvas next to this recolor node
                const spawnX = this.x + this.width + 50;
                const spawnY = this.y;
                const newId = this.app.nodeIdCounter++;
                
                const newImageNode = new ImageNode(newId, spawnX, spawnY, this.canvas, this.app);
                newImageNode.imageUrl = dataUrl;
                newImageNode.aspectRatio = srcImageNode.aspectRatio || 1.0;
                
                this.app.nodes.set(newId, newImageNode);
                const dom = newImageNode.createDOM();
                this.app.nodesLayer.appendChild(dom);
                dom.style.zIndex = this.app.getNextZIndex();
                newImageNode.update();
                
                // Save project & update UI
                this.app.saveProject(this.app.activeProjectName);
                
            } catch (err) {
                console.error("Recoloring failed:", err);
                alert("Recoloring failed due to image origin or canvas security restrictions.");
            } finally {
                this.btnPlay.style.opacity = '1';
                this.btnPlay.disabled = false;
            }
        };
        img.onerror = () => {
            alert("Failed to load source image.");
            this.btnPlay.style.opacity = '1';
            this.btnPlay.disabled = false;
        };
        img.src = srcImgUrl;
    }
    
    getValue() {
        return this.recoloredDataUrl;
    }
}

/**
 * MATERIAL NODE
 * Takes a building Image Node (with selection mask) and a Texture Image Node, and maps the texture onto the mask.
 */
export class MaterialNode extends Node {
    constructor(id, x, y, canvas, app) {
        super(id, 'Material Texture', x, y, canvas, app);
        this.type = 'material';
        this.recoloredDataUrl = null;
        this.textureScale = 1.0; // Default material texture scale factor
        
        // Enforce fixed 250x250 size
        this.width = 250;
        this.height = 250;
        
        // Sockets: 2 inputs (image, texture) on the left. NO output socket on the right!
        this.setupSockets([
            { name: 'image', type: 'image', style: { top: '30%', left: '-7px' } },
            { name: 'texture', type: 'image', style: { top: '70%', left: '-7px' } }
        ], []);
    }
    
    renderBody(container) {
        // Enforce 250x250 dimensions
        this.width = 250;
        this.height = 250;
        if (this.dom) {
            this.dom.style.width = `${this.width}px`;
            this.dom.style.height = `${this.height}px`;
        }
        
        // Split-panel wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'recolor-node-wrapper'; // Reuse split panels styles
        
        // Left Texture panel (Default branded wood texture)
        const leftPanel = document.createElement('div');
        leftPanel.className = 'recolor-left-panel'; // Left 50%
        leftPanel.style.backgroundColor = 'transparent'; // No background color
        
        this.textureImg = document.createElement('img');
        this.textureImg.className = 'recolor-preview-img';
        this.textureImg.src = 'wood_texture_pattern.jpg';
        this.textureImg.style.display = 'block';
        leftPanel.appendChild(this.textureImg);
        
        // Right Image panel (Default branded geometric building facade pattern)
        const rightPanel = document.createElement('div');
        rightPanel.className = 'recolor-right-panel'; // Right 50%
        
        this.facadeImg = document.createElement('img');
        this.facadeImg.className = 'recolor-preview-img';
        this.facadeImg.src = 'blue_facade_pattern.jpg';
        this.facadeImg.style.display = 'block';
        rightPanel.appendChild(this.facadeImg);
        
        // Center play button
        this.btnPlay = document.createElement('button');
        this.btnPlay.className = 'recolor-play-btn';
        this.btnPlay.title = 'Apply Material Texture';
        this.btnPlay.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">
                <polygon points="8 5 19 12 8 19 8 5"/>
            </svg>
        `;
        
        this.btnPlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.processAndSpawn();
        });
        
        wrapper.appendChild(leftPanel);
        wrapper.appendChild(rightPanel);
        wrapper.appendChild(this.btnPlay);
        
        container.appendChild(wrapper);
    }
    
    onInputValueChange(portName, value) {
        if (portName === 'texture') {
            if (this.textureImg) {
                this.textureImg.src = value || 'wood_texture_pattern.jpg';
            }
        } else if (portName === 'image') {
            if (this.facadeImg) {
                this.facadeImg.src = value || 'blue_facade_pattern.jpg';
            }
        }
    }
    
    update() {
        super.update();
        if (!this.app || !this.app.connections) return;
        
        // Update texture panel based on connection
        const textureConn = this.app.connections.getInputConnectionSource(this.id, 'texture');
        if (textureConn) {
            const textureNode = this.app.nodes.get(textureConn.nodeId);
            if (textureNode && this.textureImg) {
                this.textureImg.src = textureNode.getValue() || 'wood_texture_pattern.jpg';
            }
        } else {
            if (this.textureImg) this.textureImg.src = 'wood_texture_pattern.jpg';
        }
        
        // Update image panel based on connection
        const imageConn = this.app.connections.getInputConnectionSource(this.id, 'image');
        if (imageConn) {
            const imageNode = this.app.nodes.get(imageConn.nodeId);
            if (imageNode && this.facadeImg) {
                this.facadeImg.src = imageNode.getValue() || 'blue_facade_pattern.jpg';
            }
        } else {
            if (this.facadeImg) this.facadeImg.src = 'blue_facade_pattern.jpg';
        }
    }
    
    processAndSpawn() {
        // Find connected source nodes
        let srcImageNode = null;
        let srcTextureNode = null;
        
        if (!this.app || !this.app.connections) return;
        
        this.app.connections.connections.forEach(c => {
            if (c.toId === this.id) {
                const fromNode = this.app.nodes.get(c.fromId);
                if (fromNode) {
                    if (c.toPort === 'image') srcImageNode = fromNode;
                    if (c.toPort === 'texture') srcTextureNode = fromNode;
                }
            }
        });
        
        if (!srcImageNode) {
            alert("Please connect a building Image Node containing a mask to the 'image' input.");
            return;
        }
        if (!srcTextureNode) {
            alert("Please connect a Texture Image Node to the 'texture' input.");
            return;
        }
        
        const srcImgUrl = srcImageNode.getValue();
        const textureImgUrl = srcTextureNode.getValue();
        
        if (!srcImgUrl) {
            alert("Source Image is empty.");
            return;
        }
        if (!textureImgUrl) {
            alert("Texture Image is empty.");
            return;
        }
        
        this.btnPlay.style.opacity = '0.5';
        this.btnPlay.disabled = true;
        
        // Load both images
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const texImg = new Image();
        texImg.crossOrigin = 'anonymous';
        
        let loadedCount = 0;
        const onImageLoaded = () => {
            loadedCount++;
            if (loadedCount < 2) return;
            
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imgData.data;
                
                // Read selection mask
                const maskCanvas = srcImageNode.maskCanvas;
                let hasMask = false;
                
                const tempMask = document.createElement('canvas');
                tempMask.width = canvas.width;
                tempMask.height = canvas.height;
                const maskCtx = tempMask.getContext('2d');
                
                if (maskCanvas) {
                    // Draw selection mask directly without blur to maintain sharp edges
                    maskCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, canvas.width, canvas.height);
                    const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);
                    const maskPixels = maskData.data;
                    
                    // Create texture canvas to read its pixel data
                    const texCanvas = document.createElement('canvas');
                    texCanvas.width = texImg.naturalWidth || texImg.width;
                    texCanvas.height = texImg.naturalHeight || texImg.height;
                    const texCtx = texCanvas.getContext('2d');
                    texCtx.drawImage(texImg, 0, 0);
                    const texData = texCtx.getImageData(0, 0, texCanvas.width, texCanvas.height);
                    const texPixels = texData.data;
                    
                    // Calculate average luminance of original masked region for shadow preservation
                    let sumLum = 0;
                    let count = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        const maskAlpha = maskPixels[i + 3];
                        if (maskAlpha > 1) {
                            const r = pixels[i];
                            const g = pixels[i + 1];
                            const b = pixels[i + 2];
                            sumLum += (0.299 * r + 0.587 * g + 0.114 * b);
                            count++;
                        }
                    }
                    const avgLum = count > 0 ? (sumLum / count) : 128;
                    
                    // Apply professional auto-geometry perspective texture mapping and shadow preservation
                    const canvasW = canvas.width;
                    const texW = texCanvas.width;
                    const texH = texCanvas.height;
                    
                    // 1. Calculate selection mask bounds
                    let xMin = canvasW, xMax = 0, yMin = canvas.height, yMax = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        const maskAlpha = maskPixels[i + 3];
                        if (maskAlpha > 5) {
                            const pixelIndex = i / 4;
                            const px = pixelIndex % canvasW;
                            const py = Math.floor(pixelIndex / canvasW);
                            if (px < xMin) xMin = px;
                            if (px > xMax) xMax = px;
                            if (py < yMin) yMin = py;
                            if (py > yMax) yMax = py;
                        }
                    }
                    
                    // If no mask is found, fallback to canvas size
                    if (xMax <= xMin) {
                        xMin = 0;
                        xMax = canvasW;
                        yMin = 0;
                        yMax = canvas.height;
                    }
                    
                    const mWidth = xMax - xMin;
                    const mHeight = yMax - yMin;
                    const isVerticalStructure = mHeight > mWidth * 1.2;
                    
                    // 2. Scan for a strong vertical crease/corner inside vertical structures
                    let cornerX = -1;
                    let maxEdgeSum = 0;
                    
                    if (isVerticalStructure && mWidth > 15) {
                        const scanStart = Math.floor(xMin + mWidth * 0.15);
                        const scanEnd = Math.floor(xMax - mWidth * 0.15);
                        
                        for (let x = scanStart; x < scanEnd; x++) {
                            let edgeSum = 0;
                            let activeCount = 0;
                            
                            for (let y = yMin; y < yMax; y += 2) { // step by 2 for performance
                                const maskIdx = (y * canvasW + x) * 4;
                                if (maskPixels[maskIdx + 3] > 10) {
                                    const idx = (y * canvasW + x) * 4;
                                    const idxL = idx - 8; // 2 pixels left
                                    const idxR = idx + 8; // 2 pixels right
                                    
                                    if (idxL >= 0 && idxR < pixels.length) {
                                        const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
                                        const lumL = 0.299 * pixels[idxL] + 0.587 * pixels[idxL+1] + 0.114 * pixels[idxL+2];
                                        const lumR = 0.299 * pixels[idxR] + 0.587 * pixels[idxR+1] + 0.114 * pixels[idxR+2];
                                        edgeSum += Math.abs(lumR - lumL);
                                        activeCount++;
                                    }
                                }
                            }
                            
                            if (activeCount > (yMax - yMin) * 0.15) {
                                const avgEdge = edgeSum / activeCount;
                                if (avgEdge > maxEdgeSum) {
                                    maxEdgeSum = avgEdge;
                                    cornerX = x;
                                }
                            }
                        }
                    }
                    
                    // We have a corner/crease if maxEdgeSum is above a threshold
                    const hasVerticalCorner = maxEdgeSum > 14 && cornerX !== -1;
                    
                    const tScale = this.textureScale || 1.0;
                    
                    for (let i = 0; i < pixels.length; i += 4) {
                        const origAlpha = maskPixels[i + 3];
                        if (origAlpha > 1) {
                            const r = pixels[i];
                            const g = pixels[i + 1];
                            const b = pixels[i + 2];
                            
                            // Map pixel relative coordinate on the canvas to tile texture
                            const pixelIndex = i / 4;
                            const x = pixelIndex % canvasW;
                            const y = Math.floor(pixelIndex / canvasW);
                            
                            let tu = 0;
                            let tv = mHeight > 0 ? (y - yMin) / mHeight : 0;
                            
                            if (hasVerticalCorner) {
                                // Split mapping at the corner to warp both surfaces separately
                                if (x < cornerX) {
                                    const t = (x - xMin) / (cornerX - xMin);
                                    // Squeeze near the corner to simulate perspective tilt
                                    const tWarped = Math.pow(t, 1.35);
                                    tu = tWarped * 0.5;
                                } else {
                                    const t = (x - cornerX) / (xMax - cornerX);
                                    // Squeeze near the corner to simulate perspective tilt
                                    const tWarped = 1 - Math.pow(1 - t, 1.35);
                                    tu = 0.5 + tWarped * 0.5;
                                }
                            } else if (isVerticalStructure) {
                                // Cylindrical/Curved column wrap
                                const t = mWidth > 0 ? (x - xMin) / mWidth : 0.5;
                                const theta = Math.max(-0.98, Math.min(0.98, t * 2 - 1));
                                const tWarped = (Math.asin(theta) / (Math.PI / 2) + 1) / 2;
                                tu = tWarped;
                            } else {
                                // Flat standard surface mapping
                                tu = mWidth > 0 ? (x - xMin) / mWidth : 0;
                            }
                            
                            // Map normalized (tu, tv) coordinates to texture dimensions
                            const sTu = tu * texW * tScale;
                            const sTv = tv * texH * tScale;
                            
                            let tx = Math.floor(sTu) % texW;
                            let ty = Math.floor(sTv) % texH;
                            if (tx < 0) tx += texW;
                            if (ty < 0) ty += texH;
                            
                            const texIdx = (ty * texW + tx) * 4;
                            
                            const tr = texPixels[texIdx];
                            const tg = texPixels[texIdx + 1];
                            const tb = texPixels[texIdx + 2];
                            
                            const refinedAlpha = origAlpha;
                            const origY = 0.299 * r + 0.587 * g + 0.114 * b;
                            
                            if (refinedAlpha > 5) {
                                hasMask = true;
                                
                                // Scale contrast relative to the mask's average brightness (keeps shadows realistic)
                                const factor = origY / (avgLum || 1.0);
                                let nr = tr * factor;
                                let ng = tg * factor;
                                let nb = tb * factor;
                                
                                // Specular highlights preservation: keep original reflection details in bright spots (>200)
                                if (origY > 200) {
                                    const highlightWeight = (origY - 200) / 55; // 0.0 to 1.0
                                    nr = nr * (1.0 - highlightWeight) + r * highlightWeight;
                                    ng = ng * (1.0 - highlightWeight) + g * highlightWeight;
                                    nb = nb * (1.0 - highlightWeight) + b * highlightWeight;
                                }
                                
                                // Smooth blend based on refined soft mask alpha
                                const blend = refinedAlpha / 255;
                                pixels[i] = Math.min(255, Math.max(0, nr * blend + r * (1.0 - blend)));
                                pixels[i + 1] = Math.min(255, Math.max(0, ng * blend + g * (1.0 - blend)));
                                pixels[i + 2] = Math.min(255, Math.max(0, nb * blend + b * (1.0 - blend)));
                            }
                        }
                    }
                }
                
                if (!hasMask) {
                    alert("Please select/draw a mask on the Image Node first using the brush/lasso tools.");
                    this.btnPlay.style.opacity = '1';
                    this.btnPlay.disabled = false;
                    return;
                }
                
                ctx.putImageData(imgData, 0, 0);
                const dataUrl = canvas.toDataURL();
                this.recoloredDataUrl = dataUrl;
                
                // Spawn one new ImageNode on the canvas next to this material node
                const spawnX = this.x + this.width + 50;
                const spawnY = this.y;
                const newId = this.app.nodeIdCounter++;
                
                const newImageNode = new ImageNode(newId, spawnX, spawnY, this.canvas, this.app);
                newImageNode.imageUrl = dataUrl;
                newImageNode.aspectRatio = srcImageNode.aspectRatio || 1.0;
                
                this.app.nodes.set(newId, newImageNode);
                const dom = newImageNode.createDOM();
                this.app.nodesLayer.appendChild(dom);
                dom.style.zIndex = this.app.getNextZIndex();
                newImageNode.update();
                
                // Save project & update UI
                this.app.saveProject(this.app.activeProjectName);
                
            } catch (err) {
                console.error("Material mapping failed:", err);
                alert("Material mapping failed due to image origin or canvas security restrictions.");
            } finally {
                this.btnPlay.style.opacity = '1';
                this.btnPlay.disabled = false;
            }
        };
        
        img.onload = onImageLoaded;
        texImg.onload = onImageLoaded;
        
        img.onerror = () => {
            alert("Failed to load source image.");
            this.btnPlay.style.opacity = '1';
            this.btnPlay.disabled = false;
        };
        
        texImg.onerror = () => {
            alert("Failed to load texture image.");
            this.btnPlay.style.opacity = '1';
            this.btnPlay.disabled = false;
        };
        
        img.src = srcImgUrl;
        texImg.src = textureImgUrl;
    }
    
    getValue() {
        return this.recoloredDataUrl;
    }
}
