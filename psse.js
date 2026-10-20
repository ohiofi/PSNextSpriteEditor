/* PuzzleScript Symbol Mapping Constant */
const SYMBOL_MAP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/* Standard PuzzleScript Color Names Lookup */
const PS_COLOR_NAMES = {
  'black': '#000000', 'white': '#ffffff', 'gray': '#808080', 'grey': '#808080',
  'darkgray': '#404040', 'darkgrey': '#404040', 'lightgray': '#d3d3d3', 'lightgrey': '#d3d3d3',
  'red': '#ff0000', 'darkred': '#8b0000', 'lightred': '#ffcccb',
  'brown': '#a52a2a', 'darkbrown': '#5c4033', 'lightbrown': '#b5651d',
  'orange': '#ffa500', 'yellow': '#ffff00', 'green': '#008000', 'darkgreen': '#006400',
  'lightgreen': '#90ee90', 'blue': '#0000ff', 'lightblue': '#add8e6', 'darkblue': '#00008b',
  'purple': '#800080', 'pink': '#ffc0cb', 'transparent': 'transparent'
};

/* Preset Palettes Definition */
const PALETTE_PRESETS = {
  'ps_classic': ['#000000', '#ff0000', '#00ff00', '#0000ff'],
  'pico8': ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  'gameboy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  'c64': ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'],
  'neon': ['#00f3ff', '#ff0055', '#ffe600', '#b500fe', '#00ff66', '#ff6600'],
  'pastel': ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#e8baff']
};

let state = {
  width: 5,
  height: 5,
  palette: ['#000000', '#ff0000', '#00ff00', '#0000ff'],
  pixels: [],
  activeTool: 'draw',
  activeColorIndex: 0,
  brushSize: 2,
  previewScale: 4,
  isWallpaper: false,
  previewBG: 'checkerboard',
  undoStack: [],
  redoStack: []
};

/* Mouse / Drag state */
let isMouseDown = false;
let lastPoint = null;

/* Canvas references */
let editorCanvas, editorCtx;
let previewCanvas, previewCtx;




/* Initialize Application */
window.addEventListener('DOMContentLoaded', () => {
  editorCanvas = document.getElementById('editorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  previewCanvas = document.getElementById('previewCanvas');
  previewCtx = previewCanvas.getContext('2d');

  // Initialize default 5x5 pixels array
  initPixelGrid(5, 5);

  // Attach Canvas Event Listeners
  editorCanvas.addEventListener('mousedown', handlePointerStart);
  editorCanvas.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerEnd);

  // Touch events for mobile responsiveness
  editorCanvas.addEventListener('touchstart', handlePointerStart, { passive: false });
  editorCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
  window.addEventListener('touchend', handlePointerEnd);

  // Mouse leave coordinate tracker reset
  editorCanvas.addEventListener('mouseleave', () => {
    document.getElementById('coordInfo').innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: - , Y: -`;
  });

  // Keyboard Shortcuts Listener
  window.addEventListener('keydown', handleKeyDown);

  // Initial Render
  renderPaletteUI();
  renderAll();
  loadAutoSave();
});

/* Pixel Grid Initialization */
function initPixelGrid(w, h) {
  state.width = w;
  state.height = h;
  state.pixels = new Array(w * h).fill(-1); // -1 = transparent / erase
  document.getElementById('gridWidth').value = w;
  document.getElementById('gridHeight').value = h;
  document.getElementById('gridDimBadge').innerText = `${w} x ${h}`;
}

/* Rendering Functions */
function renderAll() {
  renderEditorCanvas();
  renderPreviewCanvas();
  updatePuzzleScriptOutput();
}

/* Render Editor Canvas Grid */
function renderEditorCanvas() {
  const maxCanvasDisplaySize = 360; // Max visual CSS dimension
  const cellSize = Math.max(8, Math.floor(maxCanvasDisplaySize / Math.max(state.width, state.height)));

  editorCanvas.width = state.width * cellSize;
  editorCanvas.height = state.height * cellSize;

  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

  // Draw Pixels
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const colorIdx = state.pixels[x + y * state.width];
      if (colorIdx >= 0 && colorIdx < state.palette.length) {
        editorCtx.fillStyle = state.palette[colorIdx];
        editorCtx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }

  // Draw Grid Overlay Lines
  const showGrid = document.getElementById('toggleGridLines').checked;
  if (showGrid && cellSize >= 4) {
    editorCtx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
    editorCtx.lineWidth = 1;

    for (let x = 0; x <= state.width; x++) {
      editorCtx.beginPath();
      editorCtx.moveTo(x * cellSize + 0.5, 0);
      editorCtx.lineTo(x * cellSize + 0.5, editorCanvas.height);
      editorCtx.stroke();
    }

    for (let y = 0; y <= state.height; y++) {
      editorCtx.beginPath();
      editorCtx.moveTo(0, y * cellSize + 0.5);
      editorCtx.lineTo(editorCanvas.width, y * cellSize + 0.5);
      editorCtx.stroke();
    }
    editorCtx.beginPath();
    editorCtx.moveTo(editorCanvas.width - 0.5, 0);
    editorCtx.lineTo(editorCanvas.width - 0.5, editorCanvas.height - 0.5);
    editorCtx.stroke();
    editorCtx.beginPath();
    editorCtx.moveTo(0, editorCanvas.height - 0.5);
    editorCtx.lineTo(editorCanvas.width - 0.5, editorCanvas.height - 0.5);
    editorCtx.stroke();

  }
}

function renderPreviewCanvas() {
  const scale = state.previewScale;
  const isWallpaper = state.isWallpaper || false;
  const tilesX = isWallpaper ? 3 : 1;
  const tilesY = isWallpaper ? 3 : 1;

  previewCanvas.width = state.width * scale * tilesX;
  previewCanvas.height = state.height * scale * tilesY;

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const offsetX = tx * state.width * scale;
      const offsetY = ty * state.height * scale;

      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const colorIdx = state.pixels[x + y * state.width];
          if (colorIdx >= 0 && colorIdx < state.palette.length) {
            previewCtx.fillStyle = state.palette[colorIdx];
            previewCtx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
          }
        }
      }
    }
  }
}

/* Dynamic Color Palette UI Renderer */
function renderPaletteUI() {
  const container = document.getElementById('paletteContainer');
  container.innerHTML = '';

  // 1. Transparent / Erase Option Button
  const eraseSlot = document.createElement('div');
  eraseSlot.className = `palette-item ${state.activeColorIndex === -1 ? 'active' : ''}`;
  eraseSlot.onclick = () => selectColor(-1);
  eraseSlot.title = 'Erase / Transparent (.)';
  eraseSlot.innerHTML = `
        <span class="color-symbol-badge text-danger"><i class="fa-solid fa-eraser"></i></span>
        <span class="small font-monospace">.</span>
      `;
  container.appendChild(eraseSlot);

  // 2. Palette Color Slots
  state.palette.forEach((colorHex, idx) => {
    const symbol = getSymbolForIndex(idx);
    const slot = document.createElement('div');
    slot.className = `palette-item ${state.activeColorIndex === idx ? 'active' : ''}`;

    slot.onclick = (e) => {
      if (!e.target.classList.contains('delete-btn') && !e.target.closest('.delete-btn') && e.target.tagName !== 'INPUT') {
        selectColor(idx);
      }
    };

    slot.innerHTML = `
          <span class="color-symbol-badge text-secondary">${symbol}</span>
          <input type="color" class="color-picker-input" value="${colorHex}" onchange="updateColorHex(${idx}, this.value)">
          <span class="small font-monospace text-secondary">${colorHex.toUpperCase()}</span>
          <button class="btn btn-link btn-sm p-0 text-secondary ms-1 delete-btn" onclick="deleteColorSlot(${idx})" title="Delete Color">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;

    container.appendChild(slot);
  });
}

/* Color Selection & Palette Handlers */
function selectColor(index) {
  state.activeColorIndex = index;
  if (index === -1) {
    setTool('erase');
  } else {
    if (state.activeTool === 'erase') {
      setTool('draw');
    }
  }
  renderPaletteUI();
}

function addColorSlot(hex = '#ff8800') {
  pushUndoState();
  state.palette.push(hex);
  state.activeColorIndex = state.palette.length - 1;
  setTool('draw');
  renderPaletteUI();
  renderAll();
  showToast('New color added!');
  autoSave();
}

function updateColorHex(idx, hexVal) {
  pushUndoState();
  state.palette[idx] = hexVal;
  renderPaletteUI();
  renderAll();
  autoSave();
}

function deleteColorSlot(idx) {
  if (state.palette.length <= 1) {
    showToast('Palette must keep at least 1 color slot!');
    return;
  }

  pushUndoState();
  state.palette.splice(idx, 1);

  // Adjust pixel indices
  for (let i = 0; i < state.pixels.length; i++) {
    if (state.pixels[i] === idx) {
      state.pixels[i] = -1; // Erase deleted color pixels
    } else if (state.pixels[i] > idx) {
      state.pixels[i]--; // Shift index down
    }
  }

  if (state.activeColorIndex === idx) {
    state.activeColorIndex = 0;
  } else if (state.activeColorIndex > idx) {
    state.activeColorIndex--;
  }

  renderPaletteUI();
  renderAll();
  showToast('Color slot deleted');
  autoSave();
}

function loadPalettePreset(key) {
  if (!PALETTE_PRESETS[key]) return;
  pushUndoState();
  state.palette = [...PALETTE_PRESETS[key]];
  state.activeColorIndex = 0;
  renderPaletteUI();
  renderAll();
  showToast(`Loaded palette: ${key}`);
  autoSave();
}

/* Helper: Convert Index to PuzzleScript Symbol */
function getSymbolForIndex(idx) {
  if (idx < 0) return '.';
  return SYMBOL_MAP[idx] || '?';
}

function getIndexForSymbol(sym) {
  if (sym === '.' || sym === ' ') return -1;
  return SYMBOL_MAP.indexOf(sym);
}

function setTool(toolName) {
  state.activeTool = toolName;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

  if (toolName === 'draw') document.getElementById('toolPencil').classList.add('active');
  if (toolName === 'brush') document.getElementById('toolBrush').classList.add('active');
  if (toolName === 'erase') {
    document.getElementById('toolEraser').classList.add('active');
    state.activeColorIndex = -1;
  }
  if (toolName === 'fill') document.getElementById('toolFill').classList.add('active');
  if (toolName === 'pick') document.getElementById('toolEyedropper').classList.add('active');

  renderPaletteUI();
}

function updateBrushSize(val) {
  const sz = parseInt(val, 10);
  if (!isNaN(sz) && sz >= 1 && sz <= 32) {
    state.brushSize = sz;
    setTool('brush'); // Automatically activate brush tool
  }
}

/* Mouse / Touch Drawing Logic */
function getGridCoords(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const cellW = rect.width / state.width;
  const cellH = rect.height / state.height;

  const gridX = Math.floor(x / cellW);
  const gridY = Math.floor(y / cellH);

  if (gridX >= 0 && gridX < state.width && gridY >= 0 && gridY < state.height) {
    return { x: gridX, y: gridY };
  }
  return null;
}

function handlePointerStart(e) {
  if (e.type === 'touchstart') e.preventDefault();
  const pt = getGridCoords(e);
  if (!pt) return;

  isMouseDown = true;
  lastPoint = pt;

  pushUndoState();
  applyTool(pt.x, pt.y);

}

function handlePointerMove(e) {
  if (e.type === 'touchmove') e.preventDefault();
  const pt = getGridCoords(e);
  if (pt) {
    document.getElementById('coordInfo').innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: ${pt.x + 1}, Y: ${pt.y + 1}`;
  }

  if (!isMouseDown || !pt) return;

  if (!lastPoint || lastPoint.x !== pt.x || lastPoint.y !== pt.y) {
    lastPoint = pt;
    applyTool(pt.x, pt.y);
  }
}

function handlePointerEnd() {
  isMouseDown = false;
  lastPoint = null;
}

function applyTool(x, y) {
  const idx = x + y * state.width;

  if (state.activeTool === 'draw') {
    state.pixels[idx] = state.activeColorIndex;
  } else if (state.activeTool === 'brush') {
    const size = state.brushSize || 2;
    const startX = x - Math.floor((size - 1) / 2);
    const startY = y - Math.floor((size - 1) / 2);

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const px = startX + dx;
        const py = startY + dy;
        if (px >= 0 && px < state.width && py >= 0 && py < state.height) {
          state.pixels[px + py * state.width] = state.activeColorIndex;
        }
      }
    }
  } else if (state.activeTool === 'erase') {
    state.pixels[idx] = -1;
  } else if (state.activeTool === 'pick') {
    const pickedColorIdx = state.pixels[idx];
    if (pickedColorIdx >= 0) {
      selectColor(pickedColorIdx);
    } else {
      selectColor(-1);
    }
    setTool('draw');
    return;
  } else if (state.activeTool === 'fill') {
    floodFill(x, y, state.pixels[idx], state.activeColorIndex);
  }

  renderAll();
  autoSave();
}

/* Flood Fill Algorithm */
function floodFill(startX, startY, targetVal, fillVal) {
  if (targetVal === fillVal) return;

  const stack = [[startX, startY]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= state.width || y < 0 || y >= state.height) continue;

    const idx = x + y * state.width;
    if (state.pixels[idx] === targetVal) {
      state.pixels[idx] = fillVal;
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }
}

/* Non-Destructive Grid Resizing */
function applyGridSize() {
  const newW = parseInt(document.getElementById('gridWidth').value) || 5;
  const newH = parseInt(document.getElementById('gridHeight').value) || 5;

  if (newW === state.width && newH === state.height) return;

  pushUndoState();

  const newPixels = new Array(newW * newH).fill(-1);

  // Preserve existing pixels
  for (let y = 0; y < Math.min(state.height, newH); y++) {
    for (let x = 0; x < Math.min(state.width, newW); x++) {
      newPixels[x + y * newW] = state.pixels[x + y * state.width];
    }
  }

  state.width = newW;
  state.height = newH;
  state.pixels = newPixels;

  document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;
  renderAll();
  showToast(`Grid resized to ${newW} x ${newH}`);
  autoSave();
}

function setQuickSize(w, h) {
  document.getElementById('gridWidth').value = w;
  document.getElementById('gridHeight').value = h;
  applyGridSize();
  autoSave();
}

function clearGrid() {
  pushUndoState();
  state.pixels.fill(-1);
  renderAll();
  showToast('Canvas cleared!');
}

/* Transformation Actions */
function shiftGrid(dir) {
  pushUndoState();
  const w = state.width;
  const h = state.height;

  if (dir === 'left') {
    for (let y = 0; y < h; y++) {
      const first = state.pixels[0 + y * w];
      for (let x = 0; x < w - 1; x++) state.pixels[x + y * w] = state.pixels[(x + 1) + y * w];
      state.pixels[(w - 1) + y * w] = first;
    }
  } else if (dir === 'right') {
    for (let y = 0; y < h; y++) {
      const last = state.pixels[(w - 1) + y * w];
      for (let x = w - 1; x > 0; x--) state.pixels[x + y * w] = state.pixels[(x - 1) + y * w];
      state.pixels[0 + y * w] = last;
    }
  } else if (dir === 'up') {
    const topRow = [];
    for (let x = 0; x < w; x++) topRow[x] = state.pixels[x + 0 * w];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) state.pixels[x + y * w] = state.pixels[x + (y + 1) * w];
    }
    for (let x = 0; x < w; x++) state.pixels[x + (h - 1) * w] = topRow[x];
  } else if (dir === 'down') {
    const bottomRow = [];
    for (let x = 0; x < w; x++) bottomRow[x] = state.pixels[x + (h - 1) * w];
    for (let y = h - 1; y > 0; y--) {
      for (let x = 0; x < w; x++) state.pixels[x + y * w] = state.pixels[x + (y - 1) * w];
    }
    for (let x = 0; x < w; x++) state.pixels[x + 0 * w] = bottomRow[x];
  }

  renderAll();
  autoSave();
}

function flipGrid(dir) {
  pushUndoState();
  const w = state.width;
  const h = state.height;

  if (dir === 'h') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.floor(w / 2); x++) {
        const idx1 = x + y * w;
        const idx2 = (w - 1 - x) + y * w;
        const tmp = state.pixels[idx1];
        state.pixels[idx1] = state.pixels[idx2];
        state.pixels[idx2] = tmp;
      }
    }
  } else if (dir === 'v') {
    for (let y = 0; y < Math.floor(h / 2); y++) {
      for (let x = 0; x < w; x++) {
        const idx1 = x + y * w;
        const idx2 = x + (h - 1 - y) * w;
        const tmp = state.pixels[idx1];
        state.pixels[idx1] = state.pixels[idx2];
        state.pixels[idx2] = tmp;
      }
    }
  }

  renderAll();
  autoSave();
}

function rotate90() {
  pushUndoState();
  const oldW = state.width;
  const oldH = state.height;
  const newW = oldH;
  const newH = oldW;
  const newPixels = new Array(newW * newH).fill(-1);

  for (let y = 0; y < oldH; y++) {
    for (let x = 0; x < oldW; x++) {
      const oldVal = state.pixels[x + y * oldW];
      const newX = oldH - 1 - y;
      const newY = x;
      newPixels[newX + newY * newW] = oldVal;
    }
  }

  state.width = newW;
  state.height = newH;
  state.pixels = newPixels;

  document.getElementById('gridWidth').value = newW;
  document.getElementById('gridHeight').value = newH;
  document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;

  renderAll();
  autoSave();
}

function growX() {
  pushUndoState();
  const newPixels = new Array(state.width * state.height).fill(-1);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width / 2; x++) {
      const oldVal = state.pixels[x + y * state.width];
      newPixels[x * 2 + 0 + y * state.width] = oldVal;
      newPixels[x * 2 + 1 + y * state.width] = oldVal;
    }
  }
  state.pixels = newPixels;
  renderAll();
  autoSave();
}

function growY() {
  pushUndoState();
  const newPixels = new Array(state.width * state.height).fill(-1);
  for (let y = 0; y < state.height / 2; y++) {
    for (let x = 0; x < state.width; x++) {
      const oldVal = state.pixels[x + y * state.width];
      newPixels[x + (y * 2 + 0) * state.width] = oldVal;
      newPixels[x + (y * 2 + 1) * state.width] = oldVal;
    }
  }
  state.pixels = newPixels;
  renderAll();
  autoSave();
}

function shrinkX() {
  pushUndoState();
  const newPixels = new Array(state.width * state.height).fill(-1);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x += 2) {
      const oldVal = state.pixels[x + y * state.width];
      newPixels[parseInt(x / 2) + y * state.width] = oldVal;
    }
  }
  state.pixels = newPixels;
  renderAll();
  autoSave();
}

function shrinkY() {
  pushUndoState();
  const newPixels = new Array(state.width * state.height).fill(-1);
  for (let y = 0; y < state.height; y += 2) {
    for (let x = 0; x < state.width; x++) {
      const oldVal = state.pixels[x + y * state.width];
      newPixels[x + parseInt(y / 2) * state.width] = oldVal;
    }
  }
  state.pixels = newPixels;
  renderAll();
  autoSave();
}

/* Undo / Redo System */
function pushUndoState() {
  state.redoStack = [];
  state.undoStack.push({
    width: state.width,
    height: state.height,
    palette: [...state.palette],
    pixels: [...state.pixels]
  });
  if (state.undoStack.length > 50) state.undoStack.shift();
  updateUndoRedoButtons();
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push({
    width: state.width,
    height: state.height,
    palette: [...state.palette],
    pixels: [...state.pixels]
  });

  const prev = state.undoStack.pop();
  state.width = prev.width;
  state.height = prev.height;
  state.palette = [...prev.palette];
  state.pixels = [...prev.pixels];

  document.getElementById('gridWidth').value = state.width;
  document.getElementById('gridHeight').value = state.height;
  document.getElementById('gridDimBadge').innerText = `${state.width} x ${state.height}`;

  renderPaletteUI();
  renderAll();
  updateUndoRedoButtons();
  autoSave();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push({
    width: state.width,
    height: state.height,
    palette: [...state.palette],
    pixels: [...state.pixels]
  });

  const next = state.redoStack.pop();
  state.width = next.width;
  state.height = next.height;
  state.palette = [...next.palette];
  state.pixels = [...next.pixels];

  document.getElementById('gridWidth').value = state.width;
  document.getElementById('gridHeight').value = state.height;
  document.getElementById('gridDimBadge').innerText = `${state.width} x ${state.height}`;

  renderPaletteUI();
  renderAll();
  updateUndoRedoButtons();
  autoSave();
}

function updateUndoRedoButtons() {
  document.getElementById('btnUndo').disabled = state.undoStack.length === 0;
  document.getElementById('btnRedo').disabled = state.redoStack.length === 0;
}

/* Live Preview Controls */
function setPreviewBG(mode) {
  state.previewBG = mode;
  const previewBox = document.getElementById('previewContainer');
  previewBox.className = 'p-3 mb-3 border-secondary d-flex justify-content-center align-items-center ';
  const editorBox = document.getElementById('canvasWrapper');
  editorBox.className = 'canvas-container mx-auto ';

  document.querySelectorAll('#bgModeCheck, #bgModeDark, #bgModeLight').forEach(b => b.classList.remove('active'));

  if (mode === 'checkerboard') {
    previewBox.classList.add('bg-checkerboard');
    editorBox.classList.add('bg-checkerboard');
    document.getElementById('bgModeCheck').classList.add('active');
  } else if (mode === 'dark') {
    previewBox.classList.add('bg-dark-preview');
    editorBox.classList.add('bg-dark-preview');
    document.getElementById('bgModeDark').classList.add('active');
  } else if (mode === 'light') {
    previewBox.classList.add('bg-light-preview');
    editorBox.classList.add('bg-light-preview');
    document.getElementById('bgModeLight').classList.add('active');
  }
}

function setPreviewScale(scale) {
  state.previewScale = parseInt(scale, 10) || 4;
  updatePreviewBadge();
  renderPreviewCanvas();
  autoSave();
}

function toggleWallpaperMode(enabled) {
  state.isWallpaper = !!enabled;
  updatePreviewBadge();
  renderPreviewCanvas();
  autoSave();
}

function updatePreviewBadge() {
  const badge = document.getElementById('previewScaleBadge');
  if (badge) {
    badge.innerText = `${state.previewScale}x ${state.isWallpaper ? 'Wallpaper' : 'Scale'}`;
  }
}

/* PuzzleScript Code Output & Parser */
function updatePuzzleScriptOutput() {
  const name = document.getElementById('spriteNameInput').value.trim() || 'SPRITE';
  const colorsLine = state.palette.join(' ');

  let gridLines = [];
  for (let y = 0; y < state.height; y++) {
    let rowStr = '';
    for (let x = 0; x < state.width; x++) {
      const colorIdx = state.pixels[x + y * state.width];
      rowStr += getSymbolForIndex(colorIdx);
    }
    gridLines.push(rowStr);
  }

  const code = `${name}\n${colorsLine}\n${gridLines.join('\n')}`;
  document.getElementById('psCodeOutput').value = code;
}

function copyPuzzleScriptCode() {
  const text = document.getElementById('psCodeOutput').value;
  if (!text) return;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('Code copied to clipboard!'));
  } else {
    // Fallback for iFrame restrictions
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Code copied to clipboard!');
    } catch (err) {
      showToast('Copy failed, please copy manually.');
    }
    document.body.removeChild(textArea);
  }
}

function importAsIs() {
  processImportCode(null, null); // Tells it to use original dimensions
}

function importAndScale() {
  const wInput = document.getElementById('importScaleW').value;
  const hInput = document.getElementById('importScaleH').value;
  
  const targetW = parseInt(wInput, 10);
  const targetH = parseInt(hInput, 10);

  if (isNaN(targetW) || isNaN(targetH) || targetW < 1 || targetW > 128 || targetH < 1 || targetH > 128) {
    alert("Please enter valid dimensions (between 1 and 128).");
    return;
  }
  
  processImportCode(targetW, targetH);
}

function processImportCode(targetW, targetH) {
  const rawText = document.getElementById('importCodeArea').value.trim();
  const errorBox = document.getElementById('importErrorAlert');
  errorBox.classList.add('d-none');

  if (!rawText) {
    errorBox.innerText = 'Please paste some PuzzleScript sprite code!';
    errorBox.classList.remove('d-none');
    return;
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('(') && !l.startsWith('//'));

  if (lines.length < 2) {
    errorBox.innerText = 'Invalid PuzzleScript sprite format! Need color definitions and pixel rows.';
    errorBox.classList.remove('d-none');
    return;
  }

  try {
    pushUndoState();

    let spriteName = 'SPRITE';
    let colorLineIdx = -1;

    // Find color row
    for (let i = 0; i < Math.min(2, lines.length); i++) {
      const tokens = lines[i].split(/\s+/);
      const looksLikeColors = tokens.every(t => t.startsWith('#') || PS_COLOR_NAMES[t.toLowerCase()]);
      if (looksLikeColors) {
        colorLineIdx = i;
        if (i > 0) spriteName = lines[0];
        break;
      }
    }

    if (colorLineIdx === -1) {
      colorLineIdx = 1;
      spriteName = lines[0];
    }

    const colorTokens = lines[colorLineIdx].split(/\s+/);
    const newPalette = colorTokens.map(tok => {
      const lower = tok.toLowerCase();
      if (PS_COLOR_NAMES[lower]) return PS_COLOR_NAMES[lower];
      if (tok.startsWith('#')) return tok;
      return '#' + tok; // fallback
    });

    const gridLines = lines.slice(colorLineIdx + 1);
    if (gridLines.length === 0) throw new Error('No grid rows found.');

    const origH = gridLines.length;
    const origW = Math.max(...gridLines.map(l => l.length));

    // Determine final dimensions (use target if provided, else use original)
    const newW = targetW !== null ? targetW : origW;
    const newH = targetH !== null ? targetH : origH;
    const newPixels = new Array(newW * newH).fill(-1);

    // Nearest-Neighbor interpolation loop
    for (let y = 0; y < newH; y++) {
      for (let x = 0; x < newW; x++) {
        // Map the new (x,y) back to the original (origX, origY) coordinates
        const origX = Math.floor((x / newW) * origW);
        const origY = Math.floor((y / newH) * origH);

        const line = gridLines[origY];
        // Safely get the character (if rows had uneven lengths, fallback to transparent '.')
        const char = (origX < line.length) ? line[origX] : '.';
        const colorIdx = getIndexForSymbol(char);

        newPixels[x + y * newW] = colorIdx;
      }
    }

    state.palette = newPalette;
    state.width = newW;
    state.height = newH;
    state.pixels = newPixels;
    state.activeColorIndex = 0;

    document.getElementById('spriteNameInput').value = spriteName;
    document.getElementById('gridWidth').value = newW;
    document.getElementById('gridHeight').value = newH;
    document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;

    renderPaletteUI();
    renderAll();

    // Close modal
    const modalEl = document.getElementById('importModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    showToast(`Successfully imported at ${newW}x${newH}!`);
    autoSave();

  } catch (err) {
    errorBox.innerText = 'Failed to parse PuzzleScript code: ' + err.message;
    errorBox.classList.remove('d-none');
  }
}

/* Export PNG Image */
function exportPNG() {
  const exportCanvas = document.createElement('canvas');
  const scale = 16; // Crisp high quality export
  exportCanvas.width = state.width * scale;
  exportCanvas.height = state.height * scale;

  const ctx = exportCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const colorIdx = state.pixels[x + y * state.width];
      if (colorIdx >= 0 && colorIdx < state.palette.length) {
        ctx.fillStyle = state.palette[colorIdx];
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }

  const name = (document.getElementById('spriteNameInput').value.trim() || 'sprite').toLowerCase();
  const link = document.createElement('a');
  link.download = `${name}.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();

  showToast('Exported sprite PNG!');
}

/* Save / Load JSON State */
function saveJSONSession() {
  const data = {
    name: document.getElementById('spriteNameInput').value.trim() || 'PLAYER',
    width: state.width,
    height: state.height,
    palette: state.palette,
    pixels: state.pixels
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = `${data.name.toLowerCase()}_sprite.json`;
  link.href = URL.createObjectURL(blob);
  link.click();

  showToast('Saved session JSON!');
}

function loadJSONSession(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.width && data.height && data.palette && data.pixels) {
        pushUndoState();
        state.width = data.width;
        state.height = data.height;
        state.palette = data.palette;
        state.pixels = data.pixels;

        document.getElementById('spriteNameInput').value = data.name || 'SPRITE';
        document.getElementById('gridWidth').value = data.width;
        document.getElementById('gridHeight').value = data.height;
        document.getElementById('gridDimBadge').innerText = `${data.width} x ${data.height}`;

        renderPaletteUI();
        renderAll();
        showToast('Loaded session JSON!');
      }
    } catch (err) {
      showToast('Failed to load JSON file.');
    }
  };
  reader.readAsText(file);
}

/* Keyboard Shortcuts Handler */
function handleKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      redo();
    }
    return;
  }

  const key = e.key.toLowerCase();
  if (key >= '0' && key <= '9') {
    const idx = parseInt(key);
    if (idx < state.palette.length) selectColor(idx);
  } else if (key === 'e') {
    setTool('erase');
  } else if (key === 'd') {
    setTool('draw');
  } else if (key === 'b') {
    setTool('brush');
  } else if (key === 'f') {
    setTool('fill');
  } else if (key === 'p') {
    setTool('pick');
  }
}

/* Toast Helper */
function showToast(msg) {
  document.getElementById('toastMessage').innerText = msg;
  const toastEl = document.getElementById('liveToast');
  const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  toast.show();
}

window.addEventListener('DOMContentLoaded', () => {
  editorCanvas = document.getElementById('editorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  previewCanvas = document.getElementById('previewCanvas');
  previewCtx = previewCanvas.getContext('2d');

  // Initialize default 5x5 pixels array
  initPixelGrid(5, 5);

  // Restore auto-saved session if available
  loadAutoSave();

  // Attach Canvas Event Listeners
  editorCanvas.addEventListener('mousedown', handlePointerStart);
  editorCanvas.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerEnd);

  // Touch events for mobile responsiveness
  editorCanvas.addEventListener('touchstart', handlePointerStart, { passive: false });
  editorCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
  window.addEventListener('touchend', handlePointerEnd);

  // Mouse leave coordinate tracker reset
  editorCanvas.addEventListener('mouseleave', () => {
    document.getElementById('coordInfo').innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: - , Y: -`;
  });

  // Keyboard Shortcuts Listener
  window.addEventListener('keydown', handleKeyDown);

  // Initial Render & Dropdown Refresh
  renderPaletteUI();
  renderAll();
  refreshSavedStatesDropdown();
});

/* PuzzleScript Code Output & Parser */
function updatePuzzleScriptOutput() {
  const name = document.getElementById('spriteNameInput').value.trim() || 'SPRITE';
  const colorsLine = state.palette.join(' ');

  let gridLines = [];
  for (let y = 0; y < state.height; y++) {
    let rowStr = '';
    for (let x = 0; x < state.width; x++) {
      const colorIdx = state.pixels[x + y * state.width];
      rowStr += getSymbolForIndex(colorIdx);
    }
    gridLines.push(rowStr);
  }

  const code = `${name}\n${colorsLine}\n${gridLines.join('\n')}`;
  document.getElementById('psCodeOutput').value = code;

  // Auto save current session state
  //   autoSave();
}

/* Toast Helper */
function showToast(msg) {
  document.getElementById('toastMessage').innerText = msg;
  const toastEl = document.getElementById('liveToast');
  const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  toast.show();
}

/* LocalStorage Autosave & Snapshots System */
function getSerializedState() {
  return {
    name: document.getElementById('spriteNameInput').value.trim() || 'SPRITE',
    width: state.width,
    height: state.height,
    palette: [...state.palette],
    pixels: [...state.pixels],
    timestamp: new Date().toISOString()
  };
}

function autoSave() {
  // console.log("writing to autosave")
  try {
    const data = getSerializedState();
    localStorage.setItem('autosave', JSON.stringify(data));
  } catch (err) {
    console.warn('AutoSave failed:', err);
  }
}

function loadAutoSave() {
  // console.log("trying to load autosave")
  try {
    const raw = localStorage.getItem('autosave');
    // console.log(raw)
    if (raw) {
      const data = JSON.parse(raw);
      if (data.width && data.height && data.palette && data.pixels) {
        state.width = data.width;
        state.height = data.height;
        state.palette = [...data.palette];
        state.pixels = [...data.pixels];

        if (document.getElementById('spriteNameInput') && data.name) {
          document.getElementById('spriteNameInput').value = data.name;
        }
        if (document.getElementById('gridWidth')) {
          document.getElementById('gridWidth').value = data.width;
        }
        if (document.getElementById('gridHeight')) {
          document.getElementById('gridHeight').value = data.height;
        }
        if (document.getElementById('gridDimBadge')) {
          document.getElementById('gridDimBadge').innerText = `${data.width} x ${data.height}`;
        }
      }
      renderPaletteUI();
      renderAll();
    }
  } catch (err) {
    console.warn('Failed to restore autosave state:', err);
  }
}

function saveCurrentStateManual() {
  const spriteName = document.getElementById('spriteNameInput').value.trim() || 'SPRITE';
  const now = new Date();
  const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  const keyName = `${spriteName} - ${dateStr}`;

  try {
    const data = getSerializedState();
    data.savedAt = dateStr;
    localStorage.setItem(keyName, JSON.stringify(data));

    updateSavedKeysRegistry(keyName);
    refreshSavedStatesDropdown();

    // Auto select newly created save in dropdown
    const select = document.getElementById('savedStatesSelect');
    if (select) select.value = keyName;

    showToast(`Saved state as "${keyName}"!`);
  } catch (err) {
    showToast('Failed to save state to localStorage.');
  }
}

function getSavedKeys() {
  try {
    const raw = localStorage.getItem('psse_saved_keys');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function updateSavedKeysRegistry(newKey) {
  let keys = getSavedKeys();
  if (!keys.includes(newKey)) {
    keys.unshift(newKey);
    localStorage.setItem('psse_saved_keys', JSON.stringify(keys));
  }
}

function removeSavedKeyFromRegistry(key) {
  let keys = getSavedKeys();
  keys = keys.filter(k => k !== key);
  localStorage.setItem('psse_saved_keys', JSON.stringify(keys));
}

function refreshSavedStatesDropdown() {
  const select = document.getElementById('savedStatesSelect');
  if (!select) return;

  const currentSelection = select.value;
  select.innerHTML = '<option value="" disabled selected>-- load sprite --</option>';

  if (localStorage.getItem('autosave')) {
    const opt = document.createElement('option');
    opt.value = 'autosave';
    opt.innerText = 'Auto Save';
    select.appendChild(opt);
  }

  const keys = getSavedKeys();
  keys.forEach(key => {
    if (localStorage.getItem(key)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.innerText = key;
      select.appendChild(opt);
    }
  });

  if (currentSelection && select.querySelector(`option[value="${CSS.escape(currentSelection)}"]`)) {
    select.value = currentSelection;
  }
}

function loadSelectedState(key) {
  if (!key) return;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      showToast('Selected saved state not found.');
      return;
    }

    const data = JSON.parse(raw);
    if (data.width && data.height && data.palette && data.pixels) {
      pushUndoState();

      state.width = data.width;
      state.height = data.height;
      state.palette = [...data.palette];
      state.pixels = [...data.pixels];

      document.getElementById('spriteNameInput').value = data.name || 'SPRITE';
      document.getElementById('gridWidth').value = data.width;
      document.getElementById('gridHeight').value = data.height;
      document.getElementById('gridDimBadge').innerText = `${data.width} x ${data.height}`;

      renderPaletteUI();
      renderAll();
      showToast(`Loaded saved state: ${key}`);
    }
  } catch (err) {
    showToast('Error parsing saved state data.');
  }
}

function deleteSelectedState() {
  const select = document.getElementById('savedStatesSelect');
  const key = select ? select.value : '';

  if (!key) {
    showToast('Please select a state to delete.');
    return;
  }

  if (key === 'autosave') {
    localStorage.removeItem('autosave');
    showToast('Cleared Auto Save session.');
  } else {
    localStorage.removeItem(key);
    removeSavedKeyFromRegistry(key);
    showToast(`Deleted state snapshot.`);
  }

  refreshSavedStatesDropdown();
}