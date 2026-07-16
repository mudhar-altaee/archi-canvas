/**
 * Canvas Manager Class
 * Handles panning, zooming, and coordinate systems for the node editor board.
 */
export class Canvas {
    constructor(containerEl, boardEl, zoomIndicatorEl, app) {
        this.container = containerEl;
        this.board = boardEl;
        this.zoomIndicator = zoomIndicatorEl;
        this.app = app;
        
        // Transform states
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1.0;
        
        // Zoom constraints
        this.minZoom = 0.2;
        this.maxZoom = 2.5;
        
        // Panning states
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        
        // Area selection states (AutoCAD style)
        this.isAreaSelecting = false;
        this.areaStartX = 0;
        this.areaStartY = 0;
        this.selectionBoxEl = null;
        
        // Setup initial position (centered in workspace)
        this.centerView();
        
        // Bind events
        this.initEvents();
    }
    
    /**
     * Centers the canvas view in the container
     */
    centerView() {
        const containerRect = this.container.getBoundingClientRect();
        
        // Center the 10000x10000 board inside the container
        this.panX = (containerRect.width - 10000) / 2;
        this.panY = (containerRect.height - 10000) / 2;
        this.zoom = 1.0;
        
        this.updateTransform();
    }
    
    /**
     * Initializes mouse/wheel event listeners
     */
    initEvents() {
        // Prevent default browser middle-click scroll auto-anchor behaviour
        window.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        }, { passive: false });

        // Panning & Area selection mouse down
        this.container.addEventListener('mousedown', (e) => {
            const isClickingBg = e.target.id === 'svg-layer' || e.target.tagName.toLowerCase() === 'rect';
            
            if (e.button === 1) { // Middle click (scroll wheel)
                this.isPanning = true;
                this.container.style.cursor = 'grabbing';
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
                e.preventDefault();
                e.stopPropagation();
            } else if (e.button === 0 && isClickingBg) { // Left click on background
                // Start AutoCAD area selection!
                this.isAreaSelecting = true;
                this.areaStartX = e.clientX;
                this.areaStartY = e.clientY;
                
                // Create selection div
                this.selectionBoxEl = document.createElement('div');
                this.selectionBoxEl.style.position = 'absolute';
                this.selectionBoxEl.style.border = '1px dashed #2563eb';
                this.selectionBoxEl.style.background = 'rgba(37, 99, 235, 0.12)';
                this.selectionBoxEl.style.pointerEvents = 'none';
                this.selectionBoxEl.style.zIndex = '10000';
                this.selectionBoxEl.style.left = `${e.clientX}px`;
                this.selectionBoxEl.style.top = `${e.clientY}px`;
                this.selectionBoxEl.style.width = '0px';
                this.selectionBoxEl.style.height = '0px';
                this.selectionBoxEl.style.borderRadius = '2px';
                
                this.container.appendChild(this.selectionBoxEl);
            }
        });
        
        // Mouse move
        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.updateTransform();
            } else if (this.isAreaSelecting && this.selectionBoxEl) {
                const currentX = e.clientX;
                const currentY = e.clientY;
                
                const left = Math.min(this.areaStartX, currentX);
                const top = Math.min(this.areaStartY, currentY);
                const width = Math.abs(this.areaStartX - currentX);
                const height = Math.abs(this.areaStartY - currentY);
                
                this.selectionBoxEl.style.left = `${left}px`;
                this.selectionBoxEl.style.top = `${top}px`;
                this.selectionBoxEl.style.width = `${width}px`;
                this.selectionBoxEl.style.height = `${height}px`;
                
                // AutoCAD colors: blue (left-to-right, complete containment) vs green (right-to-left, crossing intersection)
                if (currentX >= this.areaStartX) {
                    // Window selection: Blue
                    this.selectionBoxEl.style.border = '1px dashed #3b82f6';
                    this.selectionBoxEl.style.background = 'rgba(59, 130, 246, 0.15)';
                } else {
                    // Crossing selection: Green
                    this.selectionBoxEl.style.border = '1px dashed #10b981';
                    this.selectionBoxEl.style.background = 'rgba(16, 185, 129, 0.15)';
                }
            }
        });
        
        // Mouse up
        window.addEventListener('mouseup', (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                this.container.style.cursor = 'grab';
            } else if (this.isAreaSelecting && this.selectionBoxEl) {
                const rect = this.selectionBoxEl.getBoundingClientRect();
                this.selectionBoxEl.remove();
                this.selectionBoxEl = null;
                this.isAreaSelecting = false;
                
                const endX = e.clientX;
                const isWindowSelect = endX >= this.areaStartX; // Left to right
                
                // Check if they clicked instead of dragged (extremely small box)
                const isClick = rect.width < 5 && rect.height < 5;
                
                if (isClick) {
                    // Deselect all nodes
                    if (this.app) {
                        this.app.deselectAllNodes();
                    }
                } else if (this.app) {
                    const selectedNodeIdsList = [];
                    this.app.nodes.forEach(node => {
                        const nodeRect = node.dom.getBoundingClientRect();
                        
                        let isSelected = false;
                        if (isWindowSelect) {
                            // Window Selection: Node must be completely inside
                            isSelected = (nodeRect.left >= rect.left &&
                                          nodeRect.right <= rect.right &&
                                          nodeRect.top >= rect.top &&
                                          nodeRect.bottom <= rect.bottom);
                        } else {
                            // Crossing Selection: Node can intersect
                            isSelected = !(nodeRect.right < rect.left ||
                                           nodeRect.left > rect.right ||
                                           nodeRect.bottom < rect.top ||
                                           nodeRect.top > rect.bottom);
                        }
                        
                        if (isSelected) {
                            selectedNodeIdsList.push(node.id);
                        }
                    });
                    
                    // Apply selection
                    if (selectedNodeIdsList.length > 0) {
                        this.app.deselectAllNodes();
                        selectedNodeIdsList.forEach(id => {
                            this.app.selectNode(id, true); // multi-select append=true
                        });
                    } else {
                        this.app.deselectAllNodes();
                    }
                }
            }
        });
        
        // Zooming on mouse wheel
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const zoomFactor = 0.08;
            const direction = e.deltaY < 0 ? 1 : -1;
            
            // Calculate new zoom
            let newZoom = this.zoom + direction * zoomFactor * this.zoom;
            // Clamp zoom
            newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
            
            // Zoom to mouse cursor coordinate logic:
            const containerRect = this.container.getBoundingClientRect();
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;
            
            // Get coordinates in canvas space before zoom change
            const canvasX = (mouseX - this.panX) / this.zoom;
            const canvasY = (mouseY - this.panY) / this.zoom;
            
            // Apply zoom
            this.zoom = newZoom;
            
            // Adjust pan so the same point in canvas space is under the mouse cursor
            this.panX = mouseX - canvasX * this.zoom;
            this.panY = mouseY - canvasY * this.zoom;
            
            this.updateTransform();
        }, { passive: false });
    }
    
    /**
     * Updates the DOM node transforms and updates the zoom status indicators
     */
    updateTransform() {
        this.board.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        
        if (this.zoomIndicator) {
            this.zoomIndicator.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
        }
        
        // Counter-scale decorative elements to maintain constant physical size on screen
        const invScale = 1 / this.zoom;
        document.querySelectorAll('.corner-dot').forEach(el => {
            el.style.transform = `scale(${invScale})`;
        });
        document.querySelectorAll('.drag-handle').forEach(el => {
            el.style.transform = `translate(-50%, -50%) scale(${invScale})`;
        });
        document.querySelectorAll('.socket').forEach(el => {
            el.style.transform = `translateY(-50%) scale(${invScale})`;
        });
        document.querySelectorAll('.floating-color-picker').forEach(el => {
            el.style.transform = `scale(${invScale})`;
            el.style.transformOrigin = 'top right';
        });
    }
    
    /**
     * Resets the pan & zoom views to defaults
     */
    reset() {
        this.centerView();
    }
    
    /**
     * Converts screen coordinates (from mouse events) to relative canvas coordinates
     */
    screenToCanvas(clientX, clientY) {
        const boardRect = this.board.getBoundingClientRect();
        return {
            x: (clientX - boardRect.left) / this.zoom,
            y: (clientY - boardRect.top) / this.zoom
        };
    }
    
    /**
     * Get zoom factor (useful for drag increments)
     */
    getZoom() {
        return this.zoom;
    }
}
