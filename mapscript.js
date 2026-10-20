/* PuzzleScript Next Map Editor - Core Logic */

const SYMBOL_MAP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const PS_COLOR_NAMES = {
  'black': '#000000', 'white': '#ffffff', 'gray': '#808080', 'grey': '#808080',
  'darkgray': '#404040', 'darkgrey': '#404040', 'lightgray': '#d3d3d3', 'lightgrey': '#d3d3d3',
  'red': '#ff0000', 'darkred': '#8b0000', 'lightred': '#ffcccb',
  'brown': '#a52a2a', 'darkbrown': '#5c4033', 'lightbrown': '#b5651d',
  'orange': '#ffa500', 'yellow': '#ffff00', 'green': '#008000', 'darkgreen': '#006400',
  'lightgreen': '#90ee90', 'blue': '#0000ff', 'lightblue': '#add8e6', 'darkblue': '#00008b',
  'purple': '#800080', 'pink': '#ffc0cb', 'transparent': 'transparent'
};

/* Application State */
let mapState = {
  width: 10,
  height: 10,
  grid: [],
  activeSymbol: '.',
  activeTool: 'draw',
  objects: {},
  legend: {},
  legendOrder: [],
  zoom: 1.0,           // Added zoom factor (1.0 = 100%)
  baseTileSize: 32,   // Base pixel dimensions per tile
  undoStack: [],
  redoStack: []
};

let isMapMouseDown = false;
let lastMapPoint = null;
let mapCanvas, mapCtx;

/* Initialize Map Editor */
window.addEventListener('DOMContentLoaded', () => {
  mapCanvas = document.getElementById('mapCanvas');
  mapCtx = mapCanvas.getContext('2d');

  // Canvas events
  mapCanvas.addEventListener('mousedown', handleMapPointerStart);
  mapCanvas.addEventListener('mousemove', handleMapPointerMove);
  window.addEventListener('mouseup', handleMapPointerEnd);

  mapCanvas.addEventListener('touchstart', handleMapPointerStart, { passive: false });
  mapCanvas.addEventListener('touchmove', handleMapPointerMove, { passive: false });
  window.addEventListener('touchend', handleMapPointerEnd);

  mapCanvas.addEventListener('mouseleave', () => {
    document.getElementById('mapCoordInfo').innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: - , Y: -`;
  });

  window.addEventListener('keydown', handleMapKeyDown);

  // Load initial default PuzzleScript objects definition
  const defaultPSCode = document.getElementById('objectsInputText').value;
  parsePuzzleScriptObjectsAndLegend(defaultPSCode);

  initMapGrid(10, 10);
  loadAutoSaveMap();
  refreshSavedMapStatesDropdown();
});

/* Initialize Grid */
function initMapGrid(w, h) {
  mapState.width = w;
  mapState.height = h;
  mapState.grid = Array.from({ length: h }, () => Array(w).fill('.'));

  document.getElementById('mapWidth').value = w;
  document.getElementById('mapHeight').value = h;
  document.getElementById('mapDimBadge').innerText = `${w} x ${h}`;
}

/* Parse OBJECTS & LEGEND from PuzzleScript Code */
function parseAndApplyObjects() {
  const code = document.getElementById('objectsInputText').value;
  const errBox = document.getElementById('objectsParseError');
  errBox.classList.add('d-none');

  if (!code.trim()) {
    errBox.innerText = 'Please paste valid PuzzleScript OBJECTS / LEGEND text.';
    errBox.classList.remove('d-none');
    return;
  }

  const success = parsePuzzleScriptObjectsAndLegend(code);
  if (success) {
    const modalEl = document.getElementById('objectsModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    showMapToast('Objects & Legend parsed successfully!');
    renderObjectsPaletteUI();
    renderMapCanvas();
    updatePSLevelOutput();
    autoSaveMap();
  }
}


function parsePuzzleScriptObjectsAndLegend(rawText) {
  const errBox = document.getElementById('objectsParseError');
  if (errBox) errBox.classList.add('d-none');

  const lines = rawText.split('\n').map(l => l.trim());

  let mode = 'NONE';
  let parsedObjects = {};
  let rawLegend = {}; // Unfiltered symbol -> definition mapping
  let rawLegendOrder = [];

  let currentObj = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines or comments
    if (!line || line.startsWith('(') || line.startsWith('//')) {
      if (currentObj) {
        parsedObjects[currentObj.name] = currentObj;
        currentObj = null;
      }
      continue;
    }

    const upper = line.toUpperCase();
    if (upper.includes('OBJECTS')) {
      if (currentObj) { parsedObjects[currentObj.name] = currentObj; currentObj = null; }
      mode = 'OBJECTS';
      continue;
    }
    if (upper.includes('LEGEND')) {
      if (currentObj) { parsedObjects[currentObj.name] = currentObj; currentObj = null; }
      mode = 'LEGEND';
      continue;
    }
    if (upper.includes('SOUNDS') || upper.includes('COLLISIONLAYERS') || upper.includes('RULES') || upper.includes('LEVELS')) {
      if (currentObj) { parsedObjects[currentObj.name] = currentObj; currentObj = null; }
      mode = 'OTHER';
      continue;
    }

    if (line.startsWith('=')) continue;

    // OBJECTS Section Parsing
    if (mode === 'OBJECTS' || mode === 'NONE') {
      const tokens = line.split(/\s+/);
      const isColorsLine = tokens.every(t => t.startsWith('#') || PS_COLOR_NAMES[t.toLowerCase()]);

      if (currentObj && isColorsLine && currentObj.colors.length === 0) {
        currentObj.colors = tokens.map(t => {
          const lower = t.toLowerCase();
          return PS_COLOR_NAMES[lower] ? PS_COLOR_NAMES[lower] : (t.startsWith('#') ? t : '#' + t);
        });
      } else if (currentObj && (line.match(/^[0-9\.\#\*\+]+$/) || line.length === currentObj.matrixWidth)) {
        if (!currentObj.matrixWidth) currentObj.matrixWidth = line.length;
        currentObj.matrix.push(line);
      } else {
        if (currentObj) {
          parsedObjects[currentObj.name] = currentObj;
        }

        const nameParts = line.split(/\s+/);
        let name = nameParts[0];
        let sym = '';

        if (nameParts.length > 1 && nameParts[nameParts.length - 1].length === 1) {
          sym = nameParts[nameParts.length - 1];
          name = nameParts.slice(0, -1).join(' ');
        }

        currentObj = {
          name: name,
          symbol: sym,
          colors: [],
          matrix: []
        };

        if (sym && sym.length === 1) {
          rawLegend[sym] = name;
          if (!rawLegendOrder.includes(sym)) rawLegendOrder.push(sym);
        }
      }
    } else if (mode === 'LEGEND') {
      // LEGEND Section Parsing
      if (line.includes('=')) {
        const parts = line.split('=').map(s => s.trim());
        const key = parts[0];
        const valStr = parts[1];

        rawLegend[key] = valStr;
        if (!rawLegendOrder.includes(key)) rawLegendOrder.push(key);
      }
    }
  }

  if (currentObj) {
    parsedObjects[currentObj.name] = currentObj;
  }

  // -------------------------------------------------------------
  // FILTER RULES FOR PALETTE:
  // 1.) Must be listed in BOTH Object section and Legend section.
  // 2.) Must NOT be defined with the keyword "or".
  // 3.) Must be defined with a single-character shortcut (key.length === 1).
  // -------------------------------------------------------------
  let filteredLegend = {};
  let filteredOrder = [];

  rawLegendOrder.forEach(key => {
    if (key.length !== 1) return;

    const valStr = rawLegend[key];
    if (!valStr) return;

    if (/\bor\b/i.test(valStr)) return;

    const targetObjNames = valStr.split(/\s+and\s+/i).map(s => s.trim());
    const allTargetsExistInObjects = targetObjNames.length > 0 && targetObjNames.every(name => Boolean(parsedObjects[name]));

    if (allTargetsExistInObjects) {
      filteredLegend[key] = targetObjNames;
      filteredOrder.push(key);
    }
  });

  mapState.objects = parsedObjects;
  mapState.legend = filteredLegend;
  mapState.legendOrder = filteredOrder;

  // Set default active symbol
  if (!filteredLegend[mapState.activeSymbol]) {
    mapState.activeSymbol = filteredOrder[0] || '';
  }

  // Render the Palette UI automatically whenever parsing completes
  renderObjectsPaletteUI();

  return true;
}


/* Render Palette UI for Objects & Legend Items */
function renderObjectsPaletteUI() {
  const container = document.getElementById('objectsPaletteContainer');
  container.innerHTML = '';

  // Erase / Empty Tile Slot
  const eraseSlot = document.createElement('div');
  eraseSlot.className = `palette-item ${mapState.activeSymbol === '' ? 'active' : ''}`;
  eraseSlot.onclick = () => selectLegendSymbol('');
  eraseSlot.title = 'Clear / Erase Tile';
  eraseSlot.innerHTML = `
    <span class="color-symbol-badge text-danger"><i class="fa-solid fa-eraser"></i></span>
    <span class="small font-monospace">Erase</span>
  `;
  container.appendChild(eraseSlot);

  // Render buttons for each legend key
  mapState.legendOrder.forEach(symbolKey => {
    const objNames = mapState.legend[symbolKey] || [];
    const slot = document.createElement('div');
    slot.className = `palette-item ${mapState.activeSymbol === symbolKey ? 'active' : ''}`;
    slot.onclick = () => selectLegendSymbol(symbolKey);

    const canvasThumb = createObjectThumbnailCanvas(objNames);

    slot.innerHTML = `
      <span class="color-symbol-badge text-info fw-bold">${symbolKey}</span>
    `;
    slot.appendChild(canvasThumb);

    const label = document.createElement('span');
    label.className = 'small font-monospace text-light';
    label.innerText = objNames.join(' + ');
    slot.appendChild(label);

    container.appendChild(slot);
  });

  updateActiveTileBadge();
}

/* Helper to render a thumbnail canvas for object(s) */
function createObjectThumbnailCanvas(objNames) {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  canvas.className = 'palette-thumb';
  const ctx = canvas.getContext('2d');

  objNames.forEach(objName => {
    const obj = mapState.objects[objName];
    if (!obj) return;

    if (obj.matrix && obj.matrix.length > 0) {
      const rows = obj.matrix.length;
      const cols = obj.matrix[0].length;
      const cellW = 24 / cols;
      const cellH = 24 / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = obj.matrix[r][c];
          const colorIdx = (ch === '.' || ch === ' ') ? -1 : parseInt(ch, 10);
          if (colorIdx >= 0 && colorIdx < obj.colors.length) {
            ctx.fillStyle = obj.colors[colorIdx];
            ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
          }
        }
      }
    } else {
      // Solid color thumbnail
      ctx.fillStyle = obj.colors[0] || '#808080';
      ctx.fillRect(0, 0, 24, 24);
    }
  });

  return canvas;
}

/* Select Palette Tile */
function selectLegendSymbol(symbolKey) {
  mapState.activeSymbol = symbolKey;
  if (symbolKey === '') {
    setMapTool('erase');
  } else if (mapState.activeTool === 'erase') {
    setMapTool('draw');
  }
  renderObjectsPaletteUI();
}

function setMapTool(toolName) {
  mapState.activeTool = toolName;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

  if (toolName === 'draw') document.getElementById('toolPencil').classList.add('active');
  if (toolName === 'erase') {
    document.getElementById('toolEraser').classList.add('active');
    mapState.activeSymbol = '';
  }
  if (toolName === 'fill') document.getElementById('toolFill').classList.add('active');
  if (toolName === 'pick') document.getElementById('toolEyedropper').classList.add('active');

  renderObjectsPaletteUI();
}

function updateActiveTileBadge() {
  const badge = document.getElementById('activeTileBadge');
  if (mapState.activeSymbol === '') {
    badge.innerText = 'Active Tile: [Eraser]';
  } else {
    const objNames = mapState.legend[mapState.activeSymbol] || ['Custom'];
    badge.innerText = `Active Tile: '${mapState.activeSymbol}' (${objNames.join(' + ')})`;
  }
}

function renderMapCanvas() {
  const tileSize = Math.max(4, Math.round((mapState.baseTileSize || 32) * (mapState.zoom || 1.0)));
  mapCanvas.width = mapState.width * tileSize;
  mapCanvas.height = mapState.height * tileSize;

  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

  const autoBG = document.getElementById('toggleAutoBackground').checked;
  const defaultBGObj = mapState.objects['Background'] || Object.values(mapState.objects)[0];

  for (let y = 0; y < mapState.height; y++) {
    for (let x = 0; x < mapState.width; x++) {
      const sym = mapState.grid[y][x];
      const objNames = mapState.legend[sym];

      if (autoBG && defaultBGObj && (!objNames || !objNames.includes('Background'))) {
        drawSingleObjectOnCanvas(mapCtx, defaultBGObj, x * tileSize, y * tileSize, tileSize);
      }

      if (objNames && objNames.length > 0) {
        objNames.forEach(objName => {
          const obj = mapState.objects[objName];
          if (obj) {
            drawSingleObjectOnCanvas(mapCtx, obj, x * tileSize, y * tileSize, tileSize);
          }
        });
      }
    }
  }

  // Draw Grid Overlay Lines
  const showGrid = document.getElementById('toggleMapGrid').checked;
  if (showGrid && tileSize >= 4) {
    mapCtx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
    mapCtx.lineWidth = 1;

    for (let x = 0; x <= mapState.width; x++) {
      mapCtx.beginPath();
      mapCtx.moveTo(x * tileSize + 0.5, 0);
      mapCtx.lineTo(x * tileSize + 0.5, mapCanvas.height);
      mapCtx.stroke();
    }

    for (let y = 0; y <= mapState.height; y++) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, y * tileSize + 0.5);
      mapCtx.lineTo(mapCanvas.width, y * tileSize + 0.5);
      mapCtx.stroke();
    }
  }

  updateZoomDisplay();
}

function drawSingleObjectOnCanvas(ctx, obj, xPos, yPos, size) {
  if (obj.matrix && obj.matrix.length > 0) {
    const rows = obj.matrix.length;
    const cols = obj.matrix[0].length;
    const cellW = size / cols;
    const cellH = size / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = obj.matrix[r][c];
        const colorIdx = (ch === '.' || ch === ' ') ? -1 : parseInt(ch, 10);
        if (colorIdx >= 0 && colorIdx < obj.colors.length) {
          ctx.fillStyle = obj.colors[colorIdx];
          ctx.fillRect(xPos + c * cellW, yPos + r * cellH, cellW, cellH);
        }
      }
    }
  } else {
    ctx.fillStyle = obj.colors[0] || '#808080';
    ctx.fillRect(xPos, yPos, size, size);
  }
}

/* Mouse / Touch Pointer Handling */
function getMapGridCoords(e) {
  const rect = mapCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const cellW = rect.width / mapState.width;
  const cellH = rect.height / mapState.height;

  const gridX = Math.floor(x / cellW);
  const gridY = Math.floor(y / cellH);

  if (gridX >= 0 && gridX < mapState.width && gridY >= 0 && gridY < mapState.height) {
    return { x: gridX, y: gridY };
  }
  return null;
}

function handleMapPointerStart(e) {
  if (e.type === 'touchstart') e.preventDefault();
  const pt = getMapGridCoords(e);
  if (!pt) return;

  isMapMouseDown = true;
  lastMapPoint = pt;

  pushMapUndoState();
  applyMapTool(pt.x, pt.y);
}

function handleMapPointerMove(e) {
  if (e.type === 'touchmove') e.preventDefault();
  const pt = getMapGridCoords(e);
  if (pt) {
    document.getElementById('mapCoordInfo').innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: ${pt.x + 1}, Y: ${pt.y + 1}`;
  }

  if (!isMapMouseDown || !pt) return;

  if (!lastMapPoint || lastMapPoint.x !== pt.x || lastMapPoint.y !== pt.y) {
    lastMapPoint = pt;
    applyMapTool(pt.x, pt.y);
  }
}

function handleMapPointerEnd() {
  isMapMouseDown = false;
  lastMapPoint = null;
}

function applyMapTool(x, y) {
  if (mapState.activeTool === 'draw') {
    mapState.grid[y][x] = mapState.activeSymbol || '.';
  } else if (mapState.activeTool === 'erase') {
    mapState.grid[y][x] = '.';
  } else if (mapState.activeTool === 'pick') {
    const sym = mapState.grid[y][x];
    selectLegendSymbol(sym);
    setMapTool('draw');
    return;
  } else if (mapState.activeTool === 'fill') {
    floodFillMap(x, y, mapState.grid[y][x], mapState.activeSymbol || '.');
  }

  renderMapCanvas();
  updatePSLevelOutput();
  autoSaveMap();
}

function floodFillMap(startX, startY, targetVal, fillVal) {
  if (targetVal === fillVal) return;
  const stack = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= mapState.width || y < 0 || y >= mapState.height) continue;

    if (mapState.grid[y][x] === targetVal) {
      mapState.grid[y][x] = fillVal;
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }
}

/* Map Resizing */
function applyMapDimensions() {
  const newW = parseInt(document.getElementById('mapWidth').value) || 10;
  const newH = parseInt(document.getElementById('mapHeight').value) || 10;

  if (newW === mapState.width && newH === mapState.height) return;

  pushMapUndoState();

  const newGrid = Array.from({ length: newH }, () => Array(newW).fill('.'));

  for (let y = 0; y < Math.min(mapState.height, newH); y++) {
    for (let x = 0; x < Math.min(mapState.width, newW); x++) {
      newGrid[y][x] = mapState.grid[y][x];
    }
  }

  mapState.width = newW;
  mapState.height = newH;
  mapState.grid = newGrid;

  document.getElementById('mapDimBadge').innerText = `${newW} x ${newH}`;
  autoFitMapZoom();
  updatePSLevelOutput();
  showMapToast(`Map resized to ${newW} x ${newH}`);
  autoSaveMap();
}

function setQuickMapSize(w, h) {
  document.getElementById('mapWidth').value = w;
  document.getElementById('mapHeight').value = h;
  applyMapDimensions();
}

function clearMapGrid() {
  pushMapUndoState();
  mapState.grid = Array.from({ length: mapState.height }, () => Array(mapState.width).fill('.'));
  renderMapCanvas();
  updatePSLevelOutput();
  showMapToast('Map grid cleared!');
  autoSaveMap();
}

function updatePSLevelOutput() {
  const mapName = (document.getElementById('mapNameInput') ? document.getElementById('mapNameInput').value.trim() : '') || 'Level 1';
  let levelLines = [`( ${mapName} )`];

  for (let y = 0; y < mapState.height; y++) {
    levelLines.push(mapState.grid[y].join(''));
  }

  document.getElementById('psLevelOutput').value = levelLines.join('\n');
  autoSaveMap();
}

function copyMapLevelCode() {
  const text = document.getElementById('psLevelOutput').value;
  if (!text) return;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showMapToast('Level code copied to clipboard!'));
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showMapToast('Level code copied!');
    } catch (err) {
      showMapToast('Copy failed, copy manually.');
    }
    document.body.removeChild(textArea);
  }
}

function processImportLevelMap() {
  const rawText = document.getElementById('importLevelText').value.trim();
  const errBox = document.getElementById('importLevelError');
  errBox.classList.add('d-none');

  if (!rawText) {
    errBox.innerText = 'Please paste ASCII level lines!';
    errBox.classList.remove('d-none');
    return;
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const h = lines.length;
  const w = Math.max(...lines.map(l => l.length));

  pushMapUndoState();

  const newGrid = Array.from({ length: h }, () => Array(w).fill('.'));

  for (let y = 0; y < h; y++) {
    const line = lines[y];
    for (let x = 0; x < line.length; x++) {
      newGrid[y][x] = line[x];
    }
  }

  mapState.width = w;
  mapState.height = h;
  mapState.grid = newGrid;

  document.getElementById('mapWidth').value = w;
  document.getElementById('mapHeight').value = h;
  document.getElementById('mapDimBadge').innerText = `${w} x ${h}`;

  // Automatically adjust zoom to fit the newly loaded level in the window
  autoFitMapZoom();
  updatePSLevelOutput();

  const modalEl = document.getElementById('importLevelModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();

  showMapToast(`Level imported (${w}x${h})!`);
  autoSaveMap();
}

/* High-Res PNG Export */
function exportMapPNG() {
  const exportCanvas = document.createElement('canvas');
  const tileSize = 32;
  exportCanvas.width = mapState.width * tileSize;
  exportCanvas.height = mapState.height * tileSize;

  const ctx = exportCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const defaultBGObj = mapState.objects['Background'] || Object.values(mapState.objects)[0];

  for (let y = 0; y < mapState.height; y++) {
    for (let x = 0; x < mapState.width; x++) {
      const sym = mapState.grid[y][x];
      const objNames = mapState.legend[sym];

      if (defaultBGObj && (!objNames || !objNames.includes('Background'))) {
        drawSingleObjectOnCanvas(ctx, defaultBGObj, x * tileSize, y * tileSize, tileSize);
      }

      if (objNames && objNames.length > 0) {
        objNames.forEach(objName => {
          const obj = mapState.objects[objName];
          if (obj) drawSingleObjectOnCanvas(ctx, obj, x * tileSize, y * tileSize, tileSize);
        });
      }
    }
  }

  const rawName = (document.getElementById('mapNameInput') ? document.getElementById('mapNameInput').value.trim() : 'level');
  const fileName = rawName.toLowerCase().replace(/[^a-z0-9]/gi, '_');

  const link = document.createElement('a');
  link.download = `${fileName}_${mapState.width}x${mapState.height}.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();

  showMapToast('Exported Map PNG!');
}

/* Undo / Redo System */
function pushMapUndoState() {
  mapState.redoStack = [];
  mapState.undoStack.push({
    width: mapState.width,
    height: mapState.height,
    grid: mapState.grid.map(row => [...row])
  });
  if (mapState.undoStack.length > 50) mapState.undoStack.shift();
  updateMapUndoRedoButtons();
}

function undoMap() {
  if (mapState.undoStack.length === 0) return;
  mapState.redoStack.push({
    width: mapState.width,
    height: mapState.height,
    grid: mapState.grid.map(row => [...row])
  });

  const prev = mapState.undoStack.pop();
  mapState.width = prev.width;
  mapState.height = prev.height;
  mapState.grid = prev.grid.map(row => [...row]);

  document.getElementById('mapWidth').value = mapState.width;
  document.getElementById('mapHeight').value = mapState.height;
  document.getElementById('mapDimBadge').innerText = `${mapState.width} x ${mapState.height}`;

  renderMapCanvas();
  updatePSLevelOutput();
  updateMapUndoRedoButtons();
  autoSaveMap();
}

function redoMap() {
  if (mapState.redoStack.length === 0) return;
  mapState.undoStack.push({
    width: mapState.width,
    height: mapState.height,
    grid: mapState.grid.map(row => [...row])
  });

  const next = mapState.redoStack.pop();
  mapState.width = next.width;
  mapState.height = next.height;
  mapState.grid = next.grid.map(row => [...row]);

  document.getElementById('mapWidth').value = mapState.width;
  document.getElementById('mapHeight').value = mapState.height;
  document.getElementById('mapDimBadge').innerText = `${mapState.width} x ${mapState.height}`;

  renderMapCanvas();
  updatePSLevelOutput();
  updateMapUndoRedoButtons();
  autoSaveMap();
}

function updateMapUndoRedoButtons() {
  document.getElementById('btnMapUndo').disabled = mapState.undoStack.length === 0;
  document.getElementById('btnMapRedo').disabled = mapState.redoStack.length === 0;
}

function autoSaveMap() {
  try {
    const mapName = document.getElementById('mapNameInput') ? document.getElementById('mapNameInput').value.trim() : 'Level 1';
    const data = {
      name: mapName,
      width: mapState.width,
      height: mapState.height,
      grid: mapState.grid,
      objectsCode: document.getElementById('objectsInputText').value
    };
    localStorage.setItem('psme_autosave', JSON.stringify(data));
  } catch (err) {
    console.warn('Map AutoSave failed:', err);
  }
}

function loadAutoSaveMap() {
  try {
    const raw = localStorage.getItem('psme_autosave');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.width && data.height && data.grid) {
        if (data.name && document.getElementById('mapNameInput')) {
          document.getElementById('mapNameInput').value = data.name;
        }
        if (data.objectsCode) {
          document.getElementById('objectsInputText').value = data.objectsCode;
          parsePuzzleScriptObjectsAndLegend(data.objectsCode);
        }
        mapState.width = data.width;
        mapState.height = data.height;
        mapState.grid = data.grid;

        document.getElementById('mapWidth').value = data.width;
        document.getElementById('mapHeight').value = data.height;
        document.getElementById('mapDimBadge').innerText = `${data.width} x ${data.height}`;

        renderMapCanvas();
        updatePSLevelOutput();
      }
    }
  } catch (err) {
    console.warn('Failed to load map autosave:', err);
  }
}

function saveMapStateManual() {
  const mapName = (document.getElementById('mapNameInput') ? document.getElementById('mapNameInput').value.trim() : '') || 'Level 1';
  const now = new Date();
  const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  const keyName = `${mapName} - ${dateStr}`;

  try {
    const data = {
      name: mapName,
      width: mapState.width,
      height: mapState.height,
      grid: mapState.grid,
      objectsCode: document.getElementById('objectsInputText').value,
      savedAt: dateStr
    };
    localStorage.setItem(keyName, JSON.stringify(data));
    updateMapKeysRegistry(keyName);
    refreshSavedMapStatesDropdown();

    const select = document.getElementById('savedMapsSelect');
    if (select) select.value = keyName;

    showMapToast(`Saved state as "${keyName}"!`);
  } catch (err) {
    showMapToast('Failed to save state.');
  }
}

function getMapKeys() {
  try {
    const raw = localStorage.getItem('psme_saved_keys');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function updateMapKeysRegistry(newKey) {
  let keys = getMapKeys();
  if (!keys.includes(newKey)) {
    keys.unshift(newKey);
    localStorage.setItem('psme_saved_keys', JSON.stringify(keys));
  }
}

function refreshSavedMapStatesDropdown() {
  const select = document.getElementById('savedMapsSelect');
  if (!select) return;

  select.innerHTML = '<option value="" disabled selected>--- Load Map ---</option>';

  if (localStorage.getItem('psme_autosave')) {
    const opt = document.createElement('option');
    opt.value = 'psme_autosave';
    opt.innerText = '⚡ Auto Save (Current Session)';
    select.appendChild(opt);
  }

  const keys = getMapKeys();
  keys.forEach(key => {
    if (localStorage.getItem(key)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.innerText = key;
      select.appendChild(opt);
    }
  });
}

function loadSelectedMapState(key) {
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      pushMapUndoState();

      if (data.name && document.getElementById('mapNameInput')) {
        document.getElementById('mapNameInput').value = data.name;
      }

      if (data.objectsCode) {
        document.getElementById('objectsInputText').value = data.objectsCode;
        parsePuzzleScriptObjectsAndLegend(data.objectsCode);
      }

      mapState.width = data.width;
      mapState.height = data.height;
      mapState.grid = data.grid;

      document.getElementById('mapWidth').value = data.width;
      document.getElementById('mapHeight').value = data.height;
      document.getElementById('mapDimBadge').innerText = `${data.width} x ${data.height}`;

      renderMapCanvas();
      updatePSLevelOutput();
      showMapToast(`Loaded map snapshot!`);
    }
  } catch (err) {
    showMapToast('Error loading map snapshot.');
  }
}

function deleteSelectedMapState() {
  const select = document.getElementById('savedMapsSelect');
  const key = select ? select.value : '';

  if (!key) {
    showMapToast('Please select a map snapshot to delete.');
    return;
  }

  if (key === 'psme_autosave') {
    localStorage.removeItem('psme_autosave');
    showMapToast('Cleared Auto Save session.');
  } else {
    localStorage.removeItem(key);
    let keys = getMapKeys().filter(k => k !== key);
    localStorage.setItem('psme_saved_keys', JSON.stringify(keys));
    showMapToast('Deleted map snapshot.');
  }

  refreshSavedMapStatesDropdown();
}

/* Keyboard Shortcuts */
function handleMapKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) redoMap(); else undoMap();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      redoMap();
    }
    return;
  }

  const key = e.key.toLowerCase();
  if (key === 'd') setMapTool('draw');
  else if (key === 'e') setMapTool('erase');
  else if (key === 'f') setMapTool('fill');
  else if (key === 'p') setMapTool('pick');
}

/* Toast Notification Helper */
function showMapToast(msg) {
  document.getElementById('mapToastMessage').innerText = msg;
  const toastEl = document.getElementById('mapToast');
  const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  toast.show();
}

/* Display current zoom percentage */
function updateZoomDisplay() {
  const badge = document.getElementById('zoomBadge');
  if (badge) {
    badge.innerText = `${Math.round((mapState.zoom || 1.0) * 100)}%`;
  }
}

/* Adjust zoom scale manually (+ / -) */
function zoomMap(delta) {
  const current = mapState.zoom || 1.0;
  mapState.zoom = Math.max(0.15, Math.min(3.0, Math.round((current + delta) * 100) / 100));
  renderMapCanvas();
}

/* Calculate and set zoom so the full map fits within the display window */
function autoFitMapZoom() {
  const wrapper = document.getElementById('mapCanvasWrapper');
  if (!wrapper) return;

  const availW = Math.max(100, wrapper.clientWidth - 32);
  const availH = Math.max(100, (wrapper.clientHeight || 480) - 32);

  const baseSize = mapState.baseTileSize || 32;
  const fitTileW = availW / mapState.width;
  const fitTileH = availH / mapState.height;

  const targetTileSize = Math.min(fitTileW, fitTileH);
  mapState.zoom = Math.max(0.15, Math.min(2.5, targetTileSize / baseSize));

  renderMapCanvas();
}

/* Pan wrapper scroll view Up / Down / Left / Right */
function panMap(direction) {
  const wrapper = document.getElementById('mapCanvasWrapper');
  if (!wrapper) return;

  const step = 96;
  if (direction === 'left') wrapper.scrollBy({ left: -step, behavior: 'smooth' });
  if (direction === 'right') wrapper.scrollBy({ left: step, behavior: 'smooth' });
  if (direction === 'up') wrapper.scrollBy({ top: -step, behavior: 'smooth' });
  if (direction === 'down') wrapper.scrollBy({ top: step, behavior: 'smooth' });
}