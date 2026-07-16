/**
 * Connections and Wires Manager Class
 * Handles socket interactions, SVG path rendering, connection validation, and flow triggering.
 */
export class ConnectionsManager {
    constructor(svgEl, connectionsGroupEl, tempWireEl, canvas, app) {
        this.svg = svgEl;
        this.group = connectionsGroupEl;
        this.tempWire = tempWireEl;
        this.canvas = canvas;
        this.app = app;
        
        this.connections = []; // Array of { id, fromId, fromPort, toId, toPort, type, path }
        this.selectedWireId = null;
        
        this.initEvents();
    }
    
    /**
     * Set up mouse events on the canvas for socket connecting
     */
    initEvents() {
        let isDraggingPort = false;
        let dragSource = null; // { nodeId, portName, portType, direction, socketEl }
        
        // Listen on the document for socket mousedown
        document.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('socket')) {
                const s = e.target;
                
                isDraggingPort = true;
                dragSource = {
                    nodeId: parseInt(s.dataset.nodeId),
                    portName: s.dataset.name,
                    portType: s.dataset.type,
                    direction: s.dataset.direction,
                    socketEl: s
                };
                
                // Show temporary wire
                this.tempWire.style.display = 'block';
                this.tempWire.setAttribute('class', `wire temp-wire ${dragSource.portType}-wire`);
                
                e.stopPropagation();
                e.preventDefault();
            }
            
            // Wire click to select / deselect
            if (e.target.classList.contains('wire') && !e.target.classList.contains('temp-wire')) {
                const wireId = e.target.dataset.wireId;
                this.selectWire(wireId);
                e.stopPropagation();
            } else {
                this.deselectWire();
            }
        });
        
        // Mouse move to update temporary wire
        window.addEventListener('mousemove', (e) => {
            if (!isDraggingPort) return;
            
            // Source socket coords
            const sourceNode = this.app.nodes.get(dragSource.nodeId);
            const sourceCoords = sourceNode.getSocketCoords(dragSource.portName, dragSource.direction === 'input');
            
            // Mouse coords in canvas space
            const mouseCanvasCoords = this.canvas.screenToCanvas(e.clientX, e.clientY);
            
            // Draw path
            let d;
            if (dragSource.direction === 'output') {
                d = this.calculateBezierPath(sourceCoords.x, sourceCoords.y, mouseCanvasCoords.x, mouseCanvasCoords.y);
            } else {
                d = this.calculateBezierPath(mouseCanvasCoords.x, mouseCanvasCoords.y, sourceCoords.x, sourceCoords.y);
            }
            
            this.tempWire.setAttribute('d', d);
        });
        
        // Mouse up to finalize connection
        window.addEventListener('mouseup', (e) => {
            if (!isDraggingPort) return;
            isDraggingPort = false;
            this.tempWire.style.display = 'none';
            
            // Check if hovered element is a socket
            const targetSocket = e.target.closest('.socket');
            if (targetSocket) {
                const targetNodeId = parseInt(targetSocket.dataset.nodeId);
                const targetPortName = targetSocket.dataset.name;
                const targetPortType = targetSocket.dataset.type;
                const targetDirection = targetSocket.dataset.direction;
                
                // Connection Validations
                const isDifferentNode = dragSource.nodeId !== targetNodeId;
                const isDifferentDirection = dragSource.direction !== targetDirection;
                const isMatchingType = dragSource.portType === targetPortType;
                
                if (isDifferentNode && isDifferentDirection && isMatchingType) {
                    // Normalize: output -> input
                    const outputNodeId = dragSource.direction === 'output' ? dragSource.nodeId : targetNodeId;
                    const outputPortName = dragSource.direction === 'output' ? dragSource.portName : targetPortName;
                    const inputNodeId = dragSource.direction === 'input' ? dragSource.nodeId : targetNodeId;
                    const inputPortName = dragSource.direction === 'input' ? dragSource.portName : targetPortName;
                    
                    this.createConnection(outputNodeId, outputPortName, inputNodeId, inputPortName, dragSource.portType);
                }
            }
            
            dragSource = null;
        });
        
        // Keydown to delete selected connection
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedWireId) {
                this.deleteConnection(this.selectedWireId);
            }
        });
    }
    
    /**
     * Creates and renders a new connection
     */
    createConnection(fromId, fromPort, toId, toPort, type) {
        // Validation: an input port can only have ONE incoming connection
        const existingInputConn = this.connections.find(c => c.toId === toId && c.toPort === toPort);
        if (existingInputConn) {
            this.deleteConnection(existingInputConn.id);
        }
        
        const connId = `conn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Create SVG Path Element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', `wire ${type}-wire`);
        path.setAttribute('fill', 'none');
        path.dataset.wireId = connId;
        
        this.group.appendChild(path);
        
        const connection = {
            id: connId,
            fromId,
            fromPort,
            toId,
            toPort,
            type,
            path
        };
        
        this.connections.push(connection);
        
        // Add visual indicator to the sockets
        this.updateSocketState(fromId, fromPort, 'output', true);
        this.updateSocketState(toId, toPort, 'input', true);
        
        // Render the wire
        this.renderWire(connection);
        
        // Propagate data change
        this.app.evaluateFlow(fromId);
        const toNode = this.app.nodes.get(toId);
        if (toNode && typeof toNode.update === 'function') {
            toNode.update();
        }
        this.app.saveProject(this.app.activeProjectName);
    }
    
    /**
     * Removes a connection
     */
    deleteConnection(connId) {
        const index = this.connections.findIndex(c => c.id === connId);
        if (index === -1) return;
        
        const conn = this.connections[index];
        conn.path.remove(); // Remove from DOM
        
        this.connections.splice(index, 1);
        
        // Reset socket visually if no more connections on it
        this.checkAndResetSocket(conn.fromId, conn.fromPort, 'output');
        this.checkAndResetSocket(conn.toId, conn.toPort, 'input');
        
        if (this.selectedWireId === connId) {
            this.selectedWireId = null;
        }
        
        // Propagate updates: trigger input node's evaluations
        this.app.evaluateFlow(conn.toId);
        const toNode = this.app.nodes.get(conn.toId);
        if (toNode && typeof toNode.update === 'function') {
            toNode.update();
        }
        this.app.saveProject(this.app.activeProjectName);
    }
    
    /**
     * Clears all connections from canvas
     */
    clearAll() {
        [...this.connections].forEach(c => this.deleteConnection(c.id));
    }
    
    /**
     * Highlights selected wire
     */
    selectWire(wireId) {
        this.deselectWire();
        this.selectedWireId = wireId;
        const conn = this.connections.find(c => c.id === wireId);
        if (conn) {
            conn.path.classList.add('selected');
        }
    }
    
    /**
     * Deselects current wire
     */
    deselectWire() {
        if (this.selectedWireId) {
            const conn = this.connections.find(c => c.id === this.selectedWireId);
            if (conn) {
                conn.path.classList.remove('selected');
            }
            this.selectedWireId = null;
        }
    }
    
    /**
     * Updates path D parameter for a connection wire
     */
    renderWire(conn) {
        const fromNode = this.app.nodes.get(conn.fromId);
        const toNode = this.app.nodes.get(conn.toId);
        
        if (!fromNode || !toNode) return;
        
        const fromCoords = fromNode.getSocketCoords(conn.fromPort, false);
        const toCoords = toNode.getSocketCoords(conn.toPort, true);
        
        const d = this.calculateBezierPath(fromCoords.x, fromCoords.y, toCoords.x, toCoords.y);
        conn.path.setAttribute('d', d);
    }
    
    /**
     * Recalculates all connections linked to a moved node
     */
    updateWiresForNode(nodeId) {
        this.connections.forEach(conn => {
            if (conn.fromId === nodeId || conn.toId === nodeId) {
                this.renderWire(conn);
            }
        });
    }
    
    /**
     * Calculates nice bezier s-curve coordinates
     */
    calculateBezierPath(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1) * 0.5;
        // Make sure there is always a curve even if nodes are aligned
        const curveOffset = Math.max(50, dx);
        return `M ${x1} ${y1} C ${x1 + curveOffset} ${y1}, ${x2 - curveOffset} ${y2}, ${x2} ${y2}`;
    }
    
    /**
     * Toggles socket filled state
     */
    updateSocketState(nodeId, portName, direction, isConnected) {
        const node = this.app.nodes.get(nodeId);
        if (node && node.dom) {
            const socket = node.dom.querySelector(`.socket[data-name="${portName}"][data-direction="${direction}"]`);
            if (socket) {
                if (isConnected) {
                    socket.classList.add('connected');
                } else {
                    socket.classList.remove('connected');
                }
            }
        }
    }
    
    /**
     * Resets socket filled status if no connections are left
     */
    checkAndResetSocket(nodeId, portName, direction) {
        const hasConnections = this.connections.some(c => 
            (direction === 'output' && c.fromId === nodeId && c.fromPort === portName) ||
            (direction === 'input' && c.toId === nodeId && c.toPort === portName)
        );
        if (!hasConnections) {
            this.updateSocketState(nodeId, portName, direction, false);
        }
    }
    
    /**
     * Get connection path value for a given input socket
     */
    getInputConnectionSource(nodeId, portName) {
        const conn = this.connections.find(c => c.toId === nodeId && c.toPort === portName);
        if (conn) {
            return {
                nodeId: conn.fromId,
                portName: conn.fromPort
            };
        }
        return null;
    }
}
