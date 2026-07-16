import { Canvas } from './canvas.js';
import { ConnectionsManager } from './connections.js';
import { ColorNode, ImageNode, RecolorNode, MaterialNode } from './nodes.js';
import AI_ENGINE from './ai-engine.js';

// IndexedDB Database Helpers to store project state without localStorage size limit (5MB)
const dbName = 'ArchiCanvasDB';
const storeName = 'projects';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getProjectDB(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function setProjectDB(key, val) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(val, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function deleteProjectDB(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

class App {
    constructor() {
        this.nodeIdCounter = 1;
        this.zIndexCounter = 10;
        this.nodes = new Map();
        let palette = ['#ff0000', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ff007f', '#000000', '#ffffff'];
        try {
            const savedPalette = localStorage.getItem('canvas-project-palette');
            if (savedPalette) {
                const parsed = JSON.parse(savedPalette);
                if (Array.isArray(parsed) && parsed.length === 8) {
                    palette = parsed;
                }
            }
        } catch (e) {
            console.error('Failed to parse saved project palette:', e);
        }
        this.projectPalette = palette;
        
        // DOM Elements
        this.container = document.getElementById('canvas-container');
        this.board = document.getElementById('canvas-board');
        this.nodesLayer = document.getElementById('nodes-layer');
        this.svgLayer = document.getElementById('svg-layer');
        this.connectionsGroup = document.getElementById('connections-group');
        this.tempWire = document.getElementById('temp-wire');
        this.zoomIndicator = document.getElementById('zoom-indicator');
        this.propertiesContent = document.getElementById('properties-content');
        this.propertiesPanel = document.getElementById('properties-panel');
        
        if (this.propertiesPanel) {
            this.propertiesPanel.addEventListener('click', () => {
                if (this.propertiesPanel.classList.contains('collapsed')) {
                    this.propertiesPanel.classList.remove('collapsed');
                }
            });
        }
        
        // Toolbar Buttons
        this.btnNewProject = document.getElementById('btn-new-project');
        this.recentProjectsList = document.getElementById('recent-projects-list');
        
        // Initialize Canvas
        this.canvas = new Canvas(this.container, this.board, this.zoomIndicator, this);
        
        // Initialize Connections
        this.connections = new ConnectionsManager(
            this.svgLayer, 
            this.connectionsGroup, 
            this.tempWire, 
            this.canvas, 
            this 
        );
        
        // Multi-select state
        this.selectedNodeIds = new Set();
        this.isLoading = false;

        // Setup Event Listeners
        this.initEvents();
        
        if (this.btnNewProject) {
            this.btnNewProject.addEventListener('click', () => this.createNewProject());
        }
        
        // Load active project or set up Project 01 initial scene
        const activeProj = localStorage.getItem('canvas-active-project') || 'Project 01';
        this.activeProjectName = activeProj;
        
        this.initActiveProject(this.activeProjectName);
        
        // Auto-save on page exit
        window.addEventListener('beforeunload', () => this.saveProject(this.activeProjectName));
        window.addEventListener('pagehide', () => this.saveProject(this.activeProjectName));

        // Initialize AI Engine UI
        this.aiEngine = AI_ENGINE;
        this.initAI();
    }
    
    // ─── AI Engine UI ──────────────────────────────────────────────────────
    initAI() {
        const tokenModal       = document.getElementById('ai-token-modal');
        const falTokenInput    = document.getElementById('fal-token-input');
        const tokenSaveBtn     = document.getElementById('ai-token-save');
        const tokenSkipBtn     = document.getElementById('ai-token-skip');
        const settingsBtn      = document.getElementById('btn-ai-settings');
        const statusDot        = document.getElementById('ai-status-dot');

        // Status dot = green if Fal token is present
        const updateStatusDot = () => {
            if (statusDot) {
                statusDot.classList.toggle('connected', this.aiEngine.hasFalToken());
            }
        };
        updateStatusDot();

        // Show modal on first load if no token
        if (!this.aiEngine.hasFalToken()) {
            setTimeout(() => { if (tokenModal) tokenModal.classList.add('active'); }, 800);
        }

        // AI Settings button → open modal and populate
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                if (tokenModal) {
                    if (falTokenInput)  falTokenInput.value  = this.aiEngine.getFalToken();
                    tokenModal.classList.add('active');
                }
            });
        }

        // Save button
        if (tokenSaveBtn) {
            tokenSaveBtn.addEventListener('click', () => {
                const falVal  = falTokenInput   ? falTokenInput.value.trim()  : '';
                let cleanVal = falVal;
                if (cleanVal.startsWith('Key ')) {
                    cleanVal = cleanVal.replace('Key ', '').trim();
                }

                if (!cleanVal) {
                    if (falTokenInput) {
                        falTokenInput.style.borderColor = '#ef4444';
                        falTokenInput.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.2)';
                        setTimeout(() => {
                            falTokenInput.style.borderColor = '';
                            falTokenInput.style.boxShadow = '';
                        }, 2000);
                    }
                    return;
                }

                this.aiEngine.setFalToken(cleanVal);
                updateStatusDot();
                if (tokenModal) tokenModal.classList.remove('active');
            });
        }

        // Skip button
        if (tokenSkipBtn) {
            tokenSkipBtn.addEventListener('click', () => {
                if (tokenModal) tokenModal.classList.remove('active');
            });
        }

        // Close on backdrop click
        if (tokenModal) {
            tokenModal.addEventListener('click', (e) => {
                if (e.target === tokenModal) tokenModal.classList.remove('active');
            });
        }
    }

    // ─── AI Loading UI ────────────────────────────────────────────────────
    showAILoading(message = 'Processing...') {
        const overlay = document.getElementById('ai-loading-overlay');
        const status  = document.getElementById('ai-loading-status');
        if (overlay) overlay.classList.add('active');
        if (status)  status.textContent = message;
    }

    updateAILoadingStatus(message) {
        const status = document.getElementById('ai-loading-status');
        if (status) status.textContent = message;
    }

    hideAILoading() {
        const overlay = document.getElementById('ai-loading-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    async initActiveProject(projectName) {
        const loaded = await this.loadProject(projectName);
        if (!loaded) {
            this.clearCanvas();
            this.setupInitialScene();
            await this.saveProject('Project 01');
        }
    }
    
    /**
     * Spawns default Color and Image nodes in the center
     */
    setupInitialScene() {
        const center = this.canvas.screenToCanvas(
            window.innerWidth / 2,
            window.innerHeight / 2
        );
        
        // Spawn Color Node on the left
        this.addNode('color', center.x - 220, center.y - 120);
        
        // Spawn Image Node on the right
        this.addNode('image', center.x + 80, center.y - 120);
    }
    
    /**
     * Binds toolbar buttons and window key controls
     */
    initEvents() {

        // Handle window key delete for selected nodes
        window.addEventListener('keydown', (e) => {
            if (this.isSelectionModalActive) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNodeId) {
                // Make sure we're not typing in an input
                if (document.activeElement.tagName.toLowerCase() !== 'input' && 
                    document.activeElement.tagName.toLowerCase() !== 'textarea') {
                    this.removeNode(this.selectedNodeId);
                }
            }
        });
        
        // Deselect node on clicking canvas background
        this.container.addEventListener('mousedown', (e) => {
            if (this.isSelectionModalActive) return;
            if (e.target.id === 'svg-layer' || e.target.tagName.toLowerCase() === 'rect') {
                this.deselectAllNodes();
            }
        });

        // Right-click context menu on canvas background
        this.container.addEventListener('contextmenu', (e) => {
            if (this.isSelectionModalActive) return;
            const isClickingBg = e.target.id === 'svg-layer' || e.target.tagName.toLowerCase() === 'rect';
            if (isClickingBg) {
                e.preventDefault();
                this.showContextMenu(e.clientX, e.clientY);
            }
        });
    }
    
    /**
     * Get spawn position in canvas space (centered in viewport)
     */
    getSpawnPosition() {
        const center = this.canvas.screenToCanvas(
            window.innerWidth / 2,
            window.innerHeight / 2
        );
        // Add slight random offset to prevent nodes from overlapping exactly
        return {
            x: center.x - 130 + (Math.random() * 40 - 20),
            y: center.y - 100 + (Math.random() * 40 - 20)
        };
    }
    
    /**
     * Instantiate and mount a node of a specific type
     */
    addNode(type, x, y) {
        const id = this.nodeIdCounter++;
        let node;
        
        if (type === 'color') {
            node = new ColorNode(id, x, y, this.canvas, this);
        } else if (type === 'image') {
            node = new ImageNode(id, x, y, this.canvas, this);
        } else if (type === 'recolor') {
            node = new RecolorNode(id, x, y, this.canvas, this);
        } else if (type === 'material') {
            node = new MaterialNode(id, x, y, this.canvas, this);
        }
        
        if (node) {
            this.nodes.set(id, node);
            const dom = node.createDOM();
            this.nodesLayer.appendChild(dom);
            
            // Set high z-index initially
            dom.style.zIndex = this.getNextZIndex();
            
            // Update decorations scale instantly
            this.canvas.updateTransform();
            
            // Select newly created node
            this.selectNode(id);
            
            node.update();
            this.saveProject(this.activeProjectName);
            return node;
        }
        return null;
    }
    
    /**
     * Duplicates an existing node, matching its dimensions, configurations, and offsetting position.
     */
    duplicateNode(id) {
        const sourceNode = this.nodes.get(id);
        if (!sourceNode) return;
        
        const newId = this.nodeIdCounter++;
        const gap = 20;
        const newX = sourceNode.x;
        const newY = sourceNode.y + sourceNode.height + gap;
        
        let newNode;
        if (sourceNode.type === 'color') {
            newNode = new ColorNode(newId, newX, newY, this.canvas, this);
            newNode.colorValue = sourceNode.getValue();
        } else if (sourceNode.type === 'image') {
            newNode = new ImageNode(newId, newX, newY, this.canvas, this);
            newNode.imageUrl = sourceNode.getValue();
            newNode.aspectRatio = sourceNode.aspectRatio;
            newNode.selectionPaths = JSON.parse(JSON.stringify(sourceNode.selectionPaths || []));
            // Duplicate selection mask
            if (sourceNode.maskCanvas) {
                setTimeout(() => {
                    const maskCtx = newNode.maskCanvas.getContext('2d');
                    maskCtx.clearRect(0, 0, newNode.width, newNode.height);
                    maskCtx.drawImage(sourceNode.maskCanvas, 0, 0);
                }, 0);
            }
        } else if (sourceNode.type === 'recolor') {
            newNode = new RecolorNode(newId, newX, newY, this.canvas, this);
            newNode.recoloredDataUrl = sourceNode.recoloredDataUrl;
        } else if (sourceNode.type === 'material') {
            newNode = new MaterialNode(newId, newX, newY, this.canvas, this);
            newNode.recoloredDataUrl = sourceNode.recoloredDataUrl;
        }
        
        if (newNode) {
            newNode.width = sourceNode.width;
            newNode.height = sourceNode.height;
            
            this.nodes.set(newId, newNode);
            const dom = newNode.createDOM();
            this.nodesLayer.appendChild(dom);
            
            dom.style.zIndex = this.getNextZIndex();
            
            this.canvas.updateTransform();
            this.selectNode(newId);
            newNode.update();
            this.saveProject(this.activeProjectName);
        }
    }
    
    /**
     * Removes a node, deleting all connected wires
     */
    removeNode(id) {
        const node = this.nodes.get(id);
        if (!node) return;
        
        // Find and delete any connection tied to this node
        const relatedConns = this.connections.connections.filter(c => 
            c.fromId === id || c.toId === id
        );
        relatedConns.forEach(c => this.connections.deleteConnection(c.id));
        
        // Remove DOM element
        node.dom.remove();
        this.nodes.delete(id);
        this.selectedNodeIds.delete(id);
        
        if (this.selectedNodeId === id) {
            this.selectedNodeId = null;
            if (this.propertiesContent) {
                this.propertiesContent.innerHTML = '<div class="no-selection-msg">Select a node to edit properties</div>';
                delete this.propertiesContent.dataset.renderedNodeId;
            }
            if (this.propertiesPanel) {
                this.propertiesPanel.classList.add('collapsed');
            }
        }
        this.saveProject(this.activeProjectName);
    }
    
    /**
     * Selects a node and visually highlights it
     */
    selectNode(id, append = false) {
        if (this.isSelectionModalActive) return;
        if (!append) {
            this.deselectAllNodes();
        }
        
        const node = this.nodes.get(id);
        if (node) {
            this.selectedNodeIds.add(id);
            this.selectedNodeId = id;
            node.setSelected(true);
            node.dom.style.zIndex = this.getNextZIndex();
            
            // Keep properties panel open for both single and multi-selection
            if (this.propertiesPanel) {
                this.propertiesPanel.classList.remove('collapsed');
            }
            this.updatePropertiesPanel();
        }
    }
    
    /**
     * Deselects all selected nodes
     */
    deselectAllNodes() {
        if (this.isSelectionModalActive) return;
        this.nodes.forEach(n => n.setSelected(false));
        this.selectedNodeIds.clear();
        this.selectedNodeId = null;
        if (this.propertiesContent) {
            this.propertiesContent.innerHTML = '<div class="no-selection-msg">Select a node to edit properties</div>';
            delete this.propertiesContent.dataset.renderedNodeId;
        }
        if (this.propertiesPanel) {
            this.propertiesPanel.classList.add('collapsed');
        }
    }
    
    /**
     * Get incremental Z-index to bring active items to foreground
     */
    getNextZIndex() {
        this.zIndexCounter += 1;
        return this.zIndexCounter;
    }
    
    /**
     * Evaluates data updates and propagates changes downstream
     */
    evaluateFlow(fromNodeId) {
        const fromNode = this.nodes.get(fromNodeId);
        if (!fromNode) return;
        
        const downstreamConns = this.connections.connections.filter(c => c.fromId === fromNodeId);
        
        downstreamConns.forEach(conn => {
            const toNode = this.nodes.get(conn.toId);
            if (toNode) {
                const val = fromNode.getValue();
                if (typeof toNode.onInputValueChange === 'function') {
                    toNode.onInputValueChange(conn.toPort, val);
                }
            }
        });
    }
    
    /**
     * Deletes all elements from workspace
     */
    clearCanvas() {
        this.connections.clearAll();
        this.nodes.forEach(n => n.dom.remove());
        this.nodes.clear();
        this.selectedNodeIds.clear();
        this.selectedNodeId = null;
        if (this.propertiesContent) {
            this.propertiesContent.innerHTML = '<div class="no-selection-msg">Select a node to edit properties</div>';
            delete this.propertiesContent.dataset.renderedNodeId;
        }
        if (this.propertiesPanel) {
            this.propertiesPanel.classList.add('collapsed');
        }
        this.saveProject(this.activeProjectName);
    }

    /**
     * Serializes all nodes and wires, saving to localStorage
     */
    /**
     * Serializes all nodes and wires, saving to IndexedDB
     */
    async saveProject(projectName = 'Project 01') {
        if (this.isLoading) return;
        const nodesData = [];
        this.nodes.forEach(node => {
            const base = {
                id: node.id,
                type: node.type,
                x: node.x,
                y: node.y,
                width: node.width,
                height: node.height
            };
            if (node.type === 'color') {
                base.colorValue = node.colorValue;
                base.currentFormat = node.currentFormat;
            } else if (node.type === 'image') {
                base.imageUrl = node.imageUrl;
                base.aspectRatio = node.aspectRatio;
                base.maskData = node.maskCanvas ? node.maskCanvas.toDataURL() : '';
                base.perspectivePlanes = node.perspectivePlanes || null;
            } else if (node.type === 'recolor') {
                base.recoloredDataUrl = node.recoloredDataUrl || null;
            } else if (node.type === 'material') {
                base.recoloredDataUrl = node.recoloredDataUrl || null;
                base.textureScale = node.textureScale || 1.0;
                base.projectionMode = node.projectionMode || 'auto';
            }
            nodesData.push(base);
        });

        const connsData = this.connections.connections.map(c => ({
            fromId: c.fromId,
            fromPort: c.fromPort,
            toId: c.toId,
            toPort: c.toPort,
            type: c.type
        }));

        const projectState = {
            nodes: nodesData,
            connections: connsData,
            zoom: this.canvas.zoom,
            panX: this.canvas.panX,
            panY: this.canvas.panY,
            nodeIdCounter: this.nodeIdCounter
        };

        try {
            await setProjectDB(`canvas-project-data-${projectName}`, projectState);
            localStorage.setItem('canvas-active-project', projectName);
            
            let projects = [];
            const saved = localStorage.getItem('canvas-saved-projects') || localStorage.getItem('canvas-recent-projects');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) projects = parsed;
                } catch(err) {}
            }
            if (!projects.includes(projectName)) {
                projects.push(projectName);
            }
            localStorage.setItem('canvas-saved-projects', JSON.stringify(projects));
            
            this.activeProjectName = projectName;
            this.updateRecentProjectsUI();
        } catch (e) {
            console.error('Failed to save project:', e);
        }
    }

    /**
     * Clears canvas and restores a project from IndexedDB
     */
    async loadProject(projectName = 'Project 01') {
        try {
            this.isLoading = true;
            
            const state = await getProjectDB(`canvas-project-data-${projectName}`);
            if (!state) {
                this.isLoading = false;
                return false;
            }

            // Clear current canvas (silently, without auto-save loop)
            this.connections.clearAll();
            this.nodes.forEach(n => n.dom.remove());
            this.nodes.clear();
            this.selectedNodeIds.clear();
            this.selectedNodeId = null;

            this.nodeIdCounter = state.nodeIdCounter || 1;

            if (Array.isArray(state.nodes)) {
                state.nodes.forEach(nData => {
                    let node;
                    if (nData.type === 'color') {
                        node = new ColorNode(nData.id, nData.x, nData.y, this.canvas, this);
                        node.colorValue = nData.colorValue || '#ff0000';
                        node.currentFormat = nData.currentFormat || 'HEX';
                    } else if (nData.type === 'image') {
                        node = new ImageNode(nData.id, nData.x, nData.y, this.canvas, this);
                        node.imageUrl = nData.imageUrl || '';
                        node.aspectRatio = nData.aspectRatio || 1.0;
                        node.savedMaskData = nData.maskData || '';
                        node.perspectivePlanes = nData.perspectivePlanes || null;
                        if (node.perspectivePlanes && node.perspectivePlanes.length > 0) {
                            node.activePlaneId = node.perspectivePlanes[0].id;
                        }
                    } else if (nData.type === 'recolor') {
                        node = new RecolorNode(nData.id, nData.x, nData.y, this.canvas, this);
                        node.recoloredDataUrl = nData.recoloredDataUrl || null;
                    } else if (nData.type === 'material') {
                        node = new MaterialNode(nData.id, nData.x, nData.y, this.canvas, this);
                        node.recoloredDataUrl = nData.recoloredDataUrl || null;
                        node.textureScale = nData.textureScale || 1.0;
                        node.projectionMode = nData.projectionMode || 'auto';
                    }
                    
                    if (node) {
                        node.width = nData.width || 220;
                        node.height = nData.height || 220;
                        this.nodes.set(nData.id, node);
                        const dom = node.createDOM();
                        this.nodesLayer.appendChild(dom);
                        dom.style.zIndex = this.getNextZIndex();
                        node.update();
                        
                        // Restore saved mask for ImageNodes
                        if (node.type === 'image' && node.savedMaskData) {
                            const maskImg = new Image();
                            maskImg.onload = () => {
                                const maskCtx = node.maskCanvas.getContext('2d');
                                maskCtx.clearRect(0, 0, node.width, node.height);
                                maskCtx.drawImage(maskImg, 0, 0, node.width, node.height);
                            };
                            maskImg.src = node.savedMaskData;
                        }
                    }
                });
            }

            if (Array.isArray(state.connections)) {
                state.connections.forEach(cData => {
                    this.connections.createConnection(
                        cData.fromId,
                        cData.fromPort,
                        cData.toId,
                        cData.toPort,
                        cData.type
                    );
                });
            }

            if (state.zoom !== undefined) this.canvas.zoom = state.zoom;
            if (state.panX !== undefined) this.canvas.panX = state.panX;
            if (state.panY !== undefined) this.canvas.panY = state.panY;
            this.canvas.updateTransform();

            this.activeProjectName = projectName;
            localStorage.setItem('canvas-active-project', projectName);
            this.updateRecentProjectsUI();
            
            this.isLoading = false;
            return true;
        } catch (e) {
            console.error('Failed to load project:', e);
            this.isLoading = false;
            return false;
        }
    }

    /**
     * Prompts for a name and sets up a new blank project
     */
    async createNewProject() {
        const name = prompt("Enter new project name:", `Project-${Math.floor(100 + Math.random() * 900)}`);
        if (!name) return;
        const cleanedName = name.trim().replace(/[^a-zA-Z0-9 _-]/g, '');
        if (!cleanedName) {
            alert("Invalid project name.");
            return;
        }
        
        await this.saveProject(this.activeProjectName);
        this.clearCanvas();
        this.nodeIdCounter = 1;
        this.setupInitialScene();
        await this.saveProject(cleanedName);
    }

    /**
     * Refreshes the Projects UI list inside left toolbar sidebar
     */
    updateRecentProjectsUI() {
        if (!this.recentProjectsList) return;
        this.recentProjectsList.innerHTML = '';
        
        let projects = [];
        const saved = localStorage.getItem('canvas-saved-projects') || localStorage.getItem('canvas-recent-projects');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) projects = parsed;
            } catch(err) {}
        }
        
        if (projects.length === 0) {
            this.recentProjectsList.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); padding-left: 4px; font-style: italic;">No saved projects</div>';
            return;
        }
        
        projects.forEach((pName, index) => {
            const item = document.createElement('div');
            item.className = `recent-project-item ${pName === this.activeProjectName ? 'active' : ''}`;
            item.setAttribute('draggable', 'true');
            
            // Drag and drop events for manual reordering
            item.addEventListener('dragstart', (ev) => {
                ev.dataTransfer.setData('text/plain', index);
                item.style.opacity = '0.4';
            });
            
            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
                const items = this.recentProjectsList.querySelectorAll('.recent-project-item');
                items.forEach(el => el.style.borderTop = 'none');
            });
            
            item.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                item.style.borderTop = '2px solid var(--accent)';
            });
            
            item.addEventListener('dragleave', () => {
                item.style.borderTop = 'none';
            });
            
            item.addEventListener('drop', (ev) => {
                ev.preventDefault();
                item.style.borderTop = 'none';
                
                const fromIndex = parseInt(ev.dataTransfer.getData('text/plain'));
                if (isNaN(fromIndex) || fromIndex === index) return;
                
                // Reorder array
                const movedProj = projects.splice(fromIndex, 1)[0];
                projects.splice(index, 0, movedProj);
                
                // Save new order
                localStorage.setItem('canvas-saved-projects', JSON.stringify(projects));
                this.updateRecentProjectsUI();
            });
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = pName;
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            nameSpan.style.maxWidth = '130px';
            nameSpan.style.pointerEvents = 'none';
            item.appendChild(nameSpan);
            
            // Buttons container
            const btnsContainer = document.createElement('div');
            btnsContainer.style.display = 'flex';
            btnsContainer.style.gap = '6px';
            btnsContainer.style.alignItems = 'center';
            
            // Rename Button (✏️)
            const renBtn = document.createElement('span');
            renBtn.innerHTML = '✏️';
            renBtn.style.fontSize = '12px';
            renBtn.style.cursor = 'pointer';
            renBtn.style.opacity = '0.6';
            renBtn.style.transition = 'opacity 0.2s';
            renBtn.title = "Rename Project";
            renBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const newName = prompt(`Enter new name for project "${pName}":`, pName);
                if (!newName) return;
                const cleanedName = newName.trim().replace(/[^a-zA-Z0-9 _-]/g, '');
                if (!cleanedName) {
                    alert("Invalid project name.");
                    return;
                }
                if (projects.includes(cleanedName)) {
                    alert("A project with this name already exists.");
                    return;
                }
                
                // Rename in IndexedDB
                const projectData = await getProjectDB(`canvas-project-data-${pName}`);
                if (projectData) {
                    await setProjectDB(`canvas-project-data-${cleanedName}`, projectData);
                    await deleteProjectDB(`canvas-project-data-${pName}`);
                }
                
                // Update projects list
                const updated = projects.map(x => x === pName ? cleanedName : x);
                localStorage.setItem('canvas-saved-projects', JSON.stringify(updated));
                
                if (this.activeProjectName === pName) {
                    this.activeProjectName = cleanedName;
                    localStorage.setItem('canvas-active-project', cleanedName);
                }
                
                this.updateRecentProjectsUI();
            });
            btnsContainer.appendChild(renBtn);
            
            // Delete Button (×)
            const delBtn = document.createElement('span');
            delBtn.innerHTML = '×';
            delBtn.style.fontSize = '18px';
            delBtn.style.fontWeight = 'bold';
            delBtn.style.cursor = 'pointer';
            delBtn.style.padding = '0 2px';
            delBtn.style.opacity = '0.6';
            delBtn.style.transition = 'opacity 0.2s';
            delBtn.title = "Delete Project";
            delBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (confirm(`Delete project "${pName}"?`)) {
                    await deleteProjectDB(`canvas-project-data-${pName}`);
                    let updated = projects.filter(x => x !== pName);
                    localStorage.setItem('canvas-saved-projects', JSON.stringify(updated));
                    
                    if (this.activeProjectName === pName) {
                        if (updated.length > 0) {
                            await this.loadProject(updated[0]);
                        } else {
                            // If no projects left, create and load a fresh 'Project 01'
                            this.clearCanvas();
                            this.setupInitialScene();
                            await this.saveProject('Project 01');
                        }
                    } else {
                        this.updateRecentProjectsUI();
                    }
                }
            });
            btnsContainer.appendChild(delBtn);
            
            item.appendChild(btnsContainer);
            
            // Hover effects
            renBtn.addEventListener('mouseenter', () => renBtn.style.opacity = '1');
            renBtn.addEventListener('mouseleave', () => renBtn.style.opacity = '0.6');
            delBtn.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
            delBtn.addEventListener('mouseleave', () => delBtn.style.opacity = '0.6');
            
            item.addEventListener('click', async () => {
                if (pName !== this.activeProjectName) {
                    await this.saveProject(this.activeProjectName);
                    await this.loadProject(pName);
                }
            });
            this.recentProjectsList.appendChild(item);
        });
    }
    
    /**
     * Updates the properties sidebar panel elements dynamically
     */
    updatePropertiesPanel() {
        if (!this.propertiesContent) return;
        
        if (this.selectedNodeIds.size > 1) {
            this.propertiesContent.innerHTML = `
                <div class="no-selection-msg">
                    <div style="font-size: 24px; margin-bottom: 8px;">📐</div>
                    Multiple Nodes Selected
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Properties are variable</div>
                </div>
            `;
            delete this.propertiesContent.dataset.renderedNodeId;
            return;
        }
        
        if (!this.selectedNodeId) {
            this.propertiesContent.innerHTML = '<div class="no-selection-msg">Select a node to edit properties</div>';
            delete this.propertiesContent.dataset.renderedNodeId;
            return;
        }
        
        const node = this.nodes.get(this.selectedNodeId);
        if (!node) return;
        
        const activeEl = document.activeElement;
        const activeId = activeEl ? activeEl.id : null;
        
        const isAlreadyRendered = this.propertiesContent.dataset.renderedNodeId === String(node.id);
        
        if (isAlreadyRendered) {
            const inputW = document.getElementById('prop-w');
            const inputH = document.getElementById('prop-h');
            if (inputW && activeId !== 'prop-w') inputW.value = Math.round(node.width);
            if (inputH && activeId !== 'prop-h') inputH.value = Math.round(node.height);
            return;
        }
        
        this.propertiesContent.dataset.renderedNodeId = node.id;
        
        const disabledAttr = this.isSelectionModalActive ? 'disabled' : '';
        let uploadBtnHTML = '';
        if (node.type === 'image') {
            uploadBtnHTML = `
                <button id="prop-btn-upload" class="btn btn-secondary" style="width: 36px; height: 36px; min-width: 36px; border-radius: 8px; padding: 0; display: flex; align-items: center; justify-content: center;" title="Upload Image File" ${disabledAttr}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                </button>
            `;
        }
        
        let materialRowHTML = '';
        if (node.type === 'material') {
            materialRowHTML = `
                <div class="prop-row" style="margin-top: 12px;">
                    <div class="prop-group" style="width: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <span class="prop-label">Texture Scale</span>
                            <span id="prop-scale-val" style="font-size: 11px; font-weight: 600; color: var(--accent);">${node.textureScale.toFixed(2)}x</span>
                        </div>
                        <input id="prop-scale-slider" type="range" min="0.1" max="5.0" step="0.05" value="${node.textureScale}" style="width: 100%; height: 6px; accent-color: var(--accent); cursor: pointer;" ${disabledAttr}>
                    </div>
                </div>
            `;
        }
        
        this.propertiesContent.innerHTML = `
            <div class="prop-row">
                <div class="prop-group">
                    <span class="prop-label">Width (px)</span>
                    <input id="prop-w" type="number" class="prop-input" value="${Math.round(node.width)}" ${disabledAttr}>
                </div>
                <div class="prop-group">
                    <span class="prop-label">Height (px)</span>
                    <input id="prop-h" type="number" class="prop-input" value="${Math.round(node.height)}" ${disabledAttr}>
                </div>
            </div>
            
            ${materialRowHTML}
            
            <div style="display: flex; gap: 8px; margin-top: 15px; justify-content: flex-end; width: 100%;">
                ${uploadBtnHTML}
                <button id="prop-btn-delete" class="btn btn-danger-ghost" style="width: 36px; height: 36px; min-width: 36px; border-radius: 8px; padding: 0; display: flex; align-items: center; justify-content: center; background-color: rgba(239, 68, 68, 0.04);" title="Delete Node" ${disabledAttr}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; color: var(--danger);">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Listeners for manual size updates
        
        // Width
        document.getElementById('prop-w').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            if (val > 20) {
                if (node.type === 'image') {
                    const aspect = node.width / node.height;
                    node.width = val;
                    node.height = Math.round(val / aspect);
                    node.dom.style.height = `${node.height}px`;
                    const inputH = document.getElementById('prop-h');
                    if (inputH) inputH.value = node.height;
                } else if (node.type === 'color') {
                    node.width = val;
                    node.height = val;
                    node.dom.style.height = `${val}px`;
                    const inputH = document.getElementById('prop-h');
                    if (inputH) inputH.value = val;
                } else {
                    node.width = val;
                }
                node.dom.style.width = `${node.width}px`;
                this.connections.updateWiresForNode(node.id);
                this.saveProject(this.activeProjectName);
            }
        });
        
        // Height
        document.getElementById('prop-h').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            if (val > 20) {
                if (node.type === 'image') {
                    const aspect = node.width / node.height;
                    node.height = val;
                    node.width = Math.round(val * aspect);
                    node.dom.style.width = `${node.width}px`;
                    const inputW = document.getElementById('prop-w');
                    if (inputW) inputW.value = node.width;
                } else if (node.type === 'color') {
                    node.width = val;
                    node.height = val;
                    node.dom.style.width = `${val}px`;
                    const inputW = document.getElementById('prop-w');
                    if (inputW) inputW.value = val;
                } else {
                    node.height = val;
                }
                node.dom.style.height = `${node.height}px`;
                this.connections.updateWiresForNode(node.id);
                this.saveProject(this.activeProjectName);
            }
        });
        
        // Delete Node Button
        document.getElementById('prop-btn-delete').addEventListener('click', () => {
            this.removeNode(node.id);
        });
        
        // Image specific properties
        if (node.type === 'image') {
            const btnUpload = document.getElementById('prop-btn-upload');
            if (btnUpload) {
                btnUpload.addEventListener('click', () => {
                    node.fileInput.click();
                });
            }
        }
        
        // Material specific properties
        if (node.type === 'material') {
            const slider = document.getElementById('prop-scale-slider');
            const valLabel = document.getElementById('prop-scale-val');
            if (slider && valLabel) {
                slider.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    node.textureScale = val;
                    valLabel.textContent = `${val.toFixed(2)}x`;
                    this.saveProject(this.activeProjectName);
                });
            }
            

        }
    }

    /**
     * Context Menu logic (right-click popover with search filter)
     */
    showContextMenu(clientX, clientY) {
        this.closeContextMenu();
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${clientX}px`;
        menu.style.top = `${clientY}px`;
        
        const canvasPos = this.canvas.screenToCanvas(clientX, clientY);
        
        menu.innerHTML = `
            <div style="padding: 4px;">
                <input id="ctx-search-input" type="text" class="prop-input" placeholder="Search nodes..." style="width: 100%; height: 26px; font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-panel); background: var(--bg-canvas);" autofocus>
            </div>
            <div class="divider" style="margin: 4px 0;"></div>
            <div id="ctx-options-list" style="display: flex; flex-direction: column; gap: 2px;">
                <div class="context-menu-item" id="ctx-add-color" data-search="color node add 🎨">
                    <span style="font-size:14px;">🎨</span> Color Node
                </div>
                <div class="context-menu-item" id="ctx-add-image" data-search="image node add 🖼️">
                    <span style="font-size:14px;">🖼️</span> Image Node
                </div>
                <div class="context-menu-item" id="ctx-add-recolor" data-search="recolor node add variations 🪄">
                    <span style="font-size:14px;">🪄</span> Recolor Mask
                </div>
                <div class="context-menu-item" id="ctx-add-material" data-search="material texture apply map wood concrete steel 🧱">
                    <span style="font-size:14px;">🧱</span> Material Texture
                </div>
                <div class="divider" id="ctx-divider-clear" style="margin: 4px 6px;"></div>
                <div class="context-menu-item danger" id="ctx-clear" data-search="clear canvas delete 🗑️">
                    <span style="font-size:14px;">🗑️</span> Clear Canvas
                </div>
            </div>
        `;
        
        document.body.appendChild(menu);
        this.contextMenu = menu;
        
        const searchInput = menu.querySelector('#ctx-search-input');
        if (searchInput) {
            searchInput.focus();
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const items = menu.querySelectorAll('.context-menu-item');
                
                items.forEach(item => {
                    const searchStr = item.dataset.search.toLowerCase() + " " + item.textContent.toLowerCase();
                    if (searchStr.includes(query)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
                
                // Toggle divider visibility based on filters
                const divider = menu.querySelector('#ctx-divider-clear');
                const clearItem = menu.querySelector('#ctx-clear');
                const colorItem = menu.querySelector('#ctx-add-color');
                const imageItem = menu.querySelector('#ctx-add-image');
                const recolorItem = menu.querySelector('#ctx-add-recolor');
                
                if (divider) {
                    const showDivider = (colorItem.style.display !== 'none' || imageItem.style.display !== 'none' || recolorItem.style.display !== 'none') && clearItem.style.display !== 'none';
                    divider.style.display = showDivider ? 'block' : 'none';
                }
            });
            
            // Prevent close on click inside search input
            searchInput.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const visibleItem = menu.querySelector('.context-menu-item:not([style*="display: none"])');
                    if (visibleItem) {
                        visibleItem.click();
                    }
                }
            });
        }
        
        // Bind click events
        menu.querySelector('#ctx-add-color').addEventListener('click', () => {
            this.addNode('color', canvasPos.x, canvasPos.y);
            this.closeContextMenu();
        });
        
        menu.querySelector('#ctx-add-image').addEventListener('click', () => {
            this.addNode('image', canvasPos.x, canvasPos.y);
            this.closeContextMenu();
        });
        
        menu.querySelector('#ctx-add-recolor').addEventListener('click', () => {
            this.addNode('recolor', canvasPos.x, canvasPos.y);
            this.closeContextMenu();
        });
        
        menu.querySelector('#ctx-add-material').addEventListener('click', () => {
            this.addNode('material', canvasPos.x, canvasPos.y);
            this.closeContextMenu();
        });
        
        menu.querySelector('#ctx-clear').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the canvas?')) {
                this.clearCanvas();
            }
            this.closeContextMenu();
        });
        
        // Close menu on clicking outside
        const closeHandler = (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this.closeContextMenu();
                window.removeEventListener('mousedown', closeHandler);
            }
        };
        
        setTimeout(() => {
            window.addEventListener('mousedown', closeHandler);
        }, 0);
    }
    
    closeContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }
}

// Instantiate App
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
