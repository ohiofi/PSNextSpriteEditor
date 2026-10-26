/* PuzzleScript Next Animation Editor Engine */

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

const PALETTE_PRESETS = {
  'ps_classic': ['#000000', '#ff0000', '#00ff00', '#0000ff'],
  'pico8': ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  'gameboy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  'c64': ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb']
};

/* Animation Editor State */
let state = {
  width: 5,
  height: 5,
  palette: ['#000000', '#ff0000', '#00ff00', '#0000ff'],
  activeTool: 'draw',
  activeColorIndex: 0,
  brushSize: 2,
  previewScale: 4,
  isWallpaper: false,
  animName: 'PLAYER_WALK',
  frames: [], // Array of pixel arrays (each size: width * height)
  activeFrameIndex: 0,
  isPlaying: true,
  animInterval: 0.2, // seconds
  playbackFrameIndex: 0,
  animTimer: null,
  undoStack: [],
  redoStack: []
};

let isMouseDown = false;
let lastPoint = null;

let editorCanvas, editorCtx;
let previewCanvas, previewCtx;

/* Initialize Application */
window.addEventListener('DOMContentLoaded', () => {
  editorCanvas = document.getElementById('editorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  previewCanvas = document.getElementById('previewCanvas');
  previewCtx = previewCanvas.getContext('2d');

  // Canvas interaction
  editorCanvas.addEventListener('mousedown', handlePointerStart);
  editorCanvas.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerEnd);

  editorCanvas.addEventListener('touchstart', handlePointerStart, { passive: false });
  editorCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
  window.addEventListener('touchend', handlePointerEnd);

  editorCanvas.addEventListener('mouseleave', () => {
    document.getElementById('coordInfo').innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: - , Y: -`;
  });

  window.addEventListener('keydown', handleKeyDown);

  // Initialize frame 0
  initAnimState(5, 5);
  loadAutoSaveAnim();
  refreshSavedAnimsDropdown();
  startPlayback();
});

/* Initialize Frame Grid */
function initAnimState(w, h) {
  state.width = w;
  state.height = h;
  state.frames = [new Array(w * h).fill(-1)];
  state.activeFrameIndex = 0;

  document.getElementById('gridWidth').value = w;
  document.getElementById('gridHeight').value = h;
  document.getElementById('gridDimBadge').innerText = `${w} x ${h}`;

  renderPaletteUI();
  renderFramesStripUI();
  renderAll();
}

/* Add Blank Frame */
function addBlankFrame() {
  pushUndoState();
  const blank = new Array(state.width * state.height).fill(-1);
  state.frames.push(blank);
  state.activeFrameIndex = state.frames.length - 1;
  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
  showToast('Added new blank frame.');
}

/* Duplicate Selected Frame */
function duplicateFrame() {
  pushUndoState();
  const currentPixels = [...state.frames[state.activeFrameIndex]];
  state.frames.splice(state.activeFrameIndex + 1, 0, currentPixels);
  state.activeFrameIndex = state.activeFrameIndex + 1;
  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
  showToast('Duplicated frame.');
}

/* Delete Selected Frame */
function deleteFrame(index, e) {
  if (e) e.stopPropagation();
  if (state.frames.length <= 1) {
    showToast('Animation must have at least 1 frame!');
    return;
  }

  pushUndoState();
  state.frames.splice(index, 1);
  if (state.activeFrameIndex >= state.frames.length) {
    state.activeFrameIndex = state.frames.length - 1;
  }

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
  showToast(`Deleted frame ${index}.`);
}

/* Re-order Frame Position */
function moveFrame(index, direction, e) {
  if (e) e.stopPropagation();
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.frames.length) return;

  pushUndoState();
  const temp = state.frames[index];
  state.frames[index] = state.frames[targetIndex];
  state.frames[targetIndex] = temp;

  if (state.activeFrameIndex === index) {
    state.activeFrameIndex = targetIndex;
  } else if (state.activeFrameIndex === targetIndex) {
    state.activeFrameIndex = index;
  }

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

/* Select Active Frame for Drawing */
function selectFrame(index) {
  state.activeFrameIndex = index;
  renderFramesStripUI();
  renderAll();
}

/* Render Frames Window Strip with Automatic Naming */
function renderFramesStripUI() {
  const container = document.getElementById('framesStrip');
  container.innerHTML = '';

  const animName = (document.getElementById('animNameInput').value.trim() || 'ANIM').replace(/[^a-z0-9_]/gi, '_');

  state.frames.forEach((framePixels, idx) => {
    const frameName = `${animName}_frame${idx}`;
    const isActive = idx === state.activeFrameIndex;

    const frameCard = document.createElement('div');
    frameCard.className = `card p-2 text-center flex-shrink-0 ${isActive ? 'border-primary bg-dark-preview' : 'border-secondary'}`;
    frameCard.style.cursor = 'pointer';
    frameCard.style.minWidth = '90px';
    frameCard.onclick = () => selectFrame(idx);

    // Frame Thumbnail Canvas
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 48;
    thumbCanvas.height = 48;
    thumbCanvas.className = 'bg-checkerboard mx-auto mb-1 border border-secondary';
    drawPixelsToCanvas(thumbCanvas, framePixels, state.width, state.height);

    frameCard.appendChild(thumbCanvas);

    // Frame Label
    const label = document.createElement('div');
    label.className = 'small font-monospace text-truncate text-light fw-bold mb-1';
    label.style.maxWidth = '85px';
    label.innerText = frameName;
    label.title = frameName;
    frameCard.appendChild(label);

    // Frame Control Buttons (Move Left, Delete, Move Right)
    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group btn-group-sm w-100';

    btnGroup.innerHTML = `
      <button class="btn btn-outline-secondary p-0" onclick="moveFrame(${idx}, -1, event)" title="Move Left" ${idx === 0 ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-left small"></i>
      </button>
      <button class="btn btn-outline-danger p-0" onclick="deleteFrame(${idx}, event)" title="Delete Frame">
        <i class="fa-solid fa-xmark small"></i>
      </button>
      <button class="btn btn-outline-secondary p-0" onclick="moveFrame(${idx}, 1, event)" title="Move Right" ${idx === state.frames.length - 1 ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-right small"></i>
      </button>
    `;

    frameCard.appendChild(btnGroup);
    container.appendChild(frameCard);
  });

  document.getElementById('activeFrameTitle').innerHTML = `<i class="fa-solid fa-pen-to-square text-primary me-2"></i>Editing: ${animName}_frame${state.activeFrameIndex}`;
}

/* Helper to render pixel matrix on thumbnail canvas */
function drawPixelsToCanvas(canvas, pixels, w, h) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cellW = canvas.width / w;
  const cellH = canvas.height / h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const colorIdx = pixels[x + y * w];
      if (colorIdx >= 0 && colorIdx < state.palette.length) {
        ctx.fillStyle = state.palette[colorIdx];
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }
  }
}

/* Update Animation Name */
function updateAnimName(val) {
  state.animName = val.trim() || 'ANIM';
  renderFramesStripUI();
  updatePuzzleScriptOutput();
  autoSaveAnim();
}

/* Render Editor & Live Preview */
function renderAll() {
  renderEditorCanvas();
  renderPreviewCanvas();
  updatePuzzleScriptOutput();
}

function renderEditorCanvas() {
  const maxCanvasDisplaySize = 360;
  const cellSize = Math.max(8, Math.floor(maxCanvasDisplaySize / Math.max(state.width, state.height)));

  editorCanvas.width = state.width * cellSize;
  editorCanvas.height = state.height * cellSize;
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

  const activePixels = state.frames[state.activeFrameIndex] || [];

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const colorIdx = activePixels[x + y * state.width];
      if (colorIdx >= 0 && colorIdx < state.palette.length) {
        editorCtx.fillStyle = state.palette[colorIdx];
        editorCtx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }

  // Draw Grid Overlay
  const showGrid = document.getElementById('toggleGridLines').checked;
  if (showGrid && cellSize >= 4) {
    editorCtx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
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

/* Live Animation Playback Engine */
function startPlayback() {
  if (state.animTimer) clearInterval(state.animTimer);
  state.animTimer = setInterval(() => {
    if (state.isPlaying && state.frames.length > 0) {
      state.playbackFrameIndex = (state.playbackFrameIndex + 1) % state.frames.length;
      renderPreviewCanvas();
    }
  }, Math.max(20, state.animInterval * 1000));
}

function togglePlayPause() {
  state.isPlaying = !state.isPlaying;
  const btn = document.getElementById('btnPlayPause');
  if (state.isPlaying) {
    btn.className = 'btn btn-sm btn-primary';
    btn.innerHTML = `<i class="fa-solid fa-pause me-1"></i> Pause`;
  } else {
    btn.className = 'btn btn-sm btn-success';
    btn.innerHTML = `<i class="fa-solid fa-play me-1"></i> Play`;
  }
}

function updateAnimInterval(val) {
  const sec = parseFloat(val);
  if (!isNaN(sec) && sec >= 0.01) {
    state.animInterval = sec;
    startPlayback();
    autoSaveAnim();
  }
}

function renderPreviewCanvas() {
  const scale = state.previewScale;
  const isWallpaper = state.isWallpaper;
  const tilesX = isWallpaper ? 3 : 1;
  const tilesY = isWallpaper ? 3 : 1;

  previewCanvas.width = state.width * scale * tilesX;
  previewCanvas.height = state.height * scale * tilesY;
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  const currentFramePixels = state.frames[state.playbackFrameIndex] || state.frames[0] || [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const offsetX = tx * state.width * scale;
      const offsetY = ty * state.height * scale;

      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const colorIdx = currentFramePixels[x + y * state.width];
          if (colorIdx >= 0 && colorIdx < state.palette.length) {
            previewCtx.fillStyle = state.palette[colorIdx];
            previewCtx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
          }
        }
      }
    }
  }
}

/* Palette UI */
function renderPaletteUI() {
  const container = document.getElementById('paletteContainer');
  container.innerHTML = '';

  const eraseSlot = document.createElement('div');
  eraseSlot.className = `palette-item ${state.activeColorIndex === -1 ? 'active' : ''}`;
  eraseSlot.onclick = () => selectColor(-1);
  eraseSlot.title = 'Erase (.)';
  eraseSlot.innerHTML = `<span class="color-symbol-badge text-danger"><i class="fa-solid fa-eraser"></i></span><span class="small font-monospace">.</span>`;
  container.appendChild(eraseSlot);

  state.palette.forEach((colorHex, idx) => {
    const symbol = SYMBOL_MAP[idx] || '?';
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

function selectColor(index) {
  state.activeColorIndex = index;
  if (index === -1) setTool('erase');
  else if (state.activeTool === 'erase') setTool('draw');
  renderPaletteUI();
}

function addColorSlot(hex = '#ff8800') {
  pushUndoState();
  state.palette.push(hex);
  state.activeColorIndex = state.palette.length - 1;
  setTool('draw');
  renderPaletteUI();
  renderAll();
  autoSaveAnim();
}

function updateColorHex(idx, hexVal) {
  pushUndoState();
  state.palette[idx] = hexVal;
  renderPaletteUI();
  renderAll();
  autoSaveAnim();
}

function deleteColorSlot(idx) {
  if (state.palette.length <= 1) return;
  pushUndoState();
  state.palette.splice(idx, 1);

  state.frames.forEach(frame => {
    for (let i = 0; i < frame.length; i++) {
      if (frame[i] === idx) frame[i] = -1;
      else if (frame[i] > idx) frame[i]--;
    }
  });

  if (state.activeColorIndex >= state.palette.length) state.activeColorIndex = 0;
  renderPaletteUI();
  renderAll();
  autoSaveAnim();
}

function loadPalettePreset(key) {
  if (!PALETTE_PRESETS[key]) return;
  pushUndoState();
  state.palette = [...PALETTE_PRESETS[key]];
  state.activeColorIndex = 0;
  renderPaletteUI();
  renderAll();
  autoSaveAnim();
}

/* Tool Handlers */
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
    setTool('brush');
  }
}

/* Canvas Interaction Logic */
function getGridCoords(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const cellW = rect.width / state.width;
  const cellH = rect.height / state.height;

  const gridX = Math.floor((clientX - rect.left) / cellW);
  const gridY = Math.floor((clientY - rect.top) / cellH);

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
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  const idx = x + y * state.width;

  if (state.activeTool === 'draw') {
    pixels[idx] = state.activeColorIndex;
  } else if (state.activeTool === 'brush') {
    const size = state.brushSize || 2;
    const startX = x - Math.floor((size - 1) / 2);
    const startY = y - Math.floor((size - 1) / 2);

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const px = startX + dx;
        const py = startY + dy;
        if (px >= 0 && px < state.width && py >= 0 && py < state.height) {
          pixels[px + py * state.width] = state.activeColorIndex;
        }
      }
    }
  } else if (state.activeTool === 'erase') {
    pixels[idx] = -1;
  } else if (state.activeTool === 'pick') {
    const picked = pixels[idx];
    selectColor(picked >= 0 ? picked : -1);
    setTool('draw');
    return;
  } else if (state.activeTool === 'fill') {
    floodFill(pixels, x, y, pixels[idx], state.activeColorIndex);
  }

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function floodFill(pixels, startX, startY, targetVal, fillVal) {
  if (targetVal === fillVal) return;
  const stack = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= state.width || y < 0 || y >= state.height) continue;
    const idx = x + y * state.width;

    if (pixels[idx] === targetVal) {
      pixels[idx] = fillVal;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
}

function applyGridSize() {
  const newW = parseInt(document.getElementById('gridWidth').value) || 5;
  const newH = parseInt(document.getElementById('gridHeight').value) || 5;

  if (newW === state.width && newH === state.height) return;
  pushUndoState();

  state.frames = state.frames.map(oldPixels => {
    const newPixels = new Array(newW * newH).fill(-1);
    for (let y = 0; y < Math.min(state.height, newH); y++) {
      for (let x = 0; x < Math.min(state.width, newW); x++) {
        newPixels[x + y * newW] = oldPixels[x + y * state.width];
      }
    }
    return newPixels;
  });

  state.width = newW;
  state.height = newH;
  document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
  showToast(`Resized frames to ${newW}x${newH}`);
}

function clearCurrentFrame() {
  pushUndoState();
  if (state.frames[state.activeFrameIndex]) {
    state.frames[state.activeFrameIndex].fill(-1);
  }
  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
  showToast('Cleared active frame canvas!');
}


function updatePuzzleScriptOutput() {
  const animNameInput = document.getElementById('animNameInput');
  const animName = (animNameInput ? animNameInput.value.trim() : 'ANIM').replace(/[^a-z0-9_]/gi, '_');
  const colorsLine = state.palette.join(' ');

  let outputBlocks = [];

  state.frames.forEach((framePixels, fIdx) => {
    const frameName = `${animName}_frame${fIdx}`;
    let gridLines = [];

    for (let y = 0; y < state.height; y++) {
      let rowStr = '';
      for (let x = 0; x < state.width; x++) {
        const colorIdx = framePixels[x + y * state.width];
        rowStr += colorIdx >= 0 ? (SYMBOL_MAP[colorIdx] || '?') : '.';
      }
      gridLines.push(rowStr);
    }

    outputBlocks.push(`${frameName}\n${colorsLine}\n${gridLines.join('\n')}`);
  });

  // Safe null-check before setting value
  const outputEl = document.getElementById('psCodeOutput');
  if (outputEl) {
    outputEl.value = outputBlocks.join('\n\n');
  }

  // Also keep modal export code fresh if modal elements exist
  if (typeof generateExportCode === 'function' && document.getElementById('exportObjectsCode')) {
    generateExportCode();
  }
}

function copyPuzzleScriptCode() {
  const text = document.getElementById('psCodeOutput').value;
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('Animation code copied!'));
  }
}

function copyField(elementId) {
  const el = document.getElementById(elementId);
  if (!el || !el.value) return;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(el.value).then(() => showToast('Copied to clipboard!'));
  } else {
    el.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    } catch (err) {
      showToast('Copy failed.');
    }
  }
}

/* Import Multiple Sprites into Frames */
function importAnimationCode() {
  const rawText = document.getElementById('importAnimCodeArea').value.trim();
  const errBox = document.getElementById('importAnimErrorAlert');
  errBox.classList.add('d-none');

  if (!rawText) {
    errBox.innerText = 'Please paste valid PuzzleScript sprite code!';
    errBox.classList.remove('d-none');
    return;
  }

  try {
    const blocks = rawText.split(/\n\s*\n/).filter(b => b.trim().length > 0);
    let importedFrames = [];
    let importedPalette = null;
    let impW = 0, impH = 0;

    blocks.forEach(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('('));
      if (lines.length < 2) return;

      const colorTokens = lines[1].split(/\s+/);
      const newPalette = colorTokens.map(tok => PS_COLOR_NAMES[tok.toLowerCase()] || tok);
      if (!importedPalette) importedPalette = newPalette;

      const gridLines = lines.slice(2);
      if (gridLines.length === 0) return;

      impH = gridLines.length;
      impW = Math.max(...gridLines.map(l => l.length));

      const pixels = new Array(impW * impH).fill(-1);

      for (let y = 0; y < impH; y++) {
        const line = gridLines[y];
        for (let x = 0; x < line.length; x++) {
          const ch = line[x];
          pixels[x + y * impW] = (ch === '.' || ch === ' ') ? -1 : SYMBOL_MAP.indexOf(ch);
        }
      }

      importedFrames.push(pixels);
    });

    if (importedFrames.length === 0) throw new Error('Could not parse any frame blocks.');

    pushUndoState();
    state.frames = importedFrames;
    if (importedPalette) state.palette = importedPalette;
    state.width = impW;
    state.height = impH;
    state.activeFrameIndex = 0;

    document.getElementById('gridWidth').value = impW;
    document.getElementById('gridHeight').value = impH;
    document.getElementById('gridDimBadge').innerText = `${impW} x ${impH}`;

    renderPaletteUI();
    renderFramesStripUI();
    renderAll();

    const modal = bootstrap.Modal.getInstance(document.getElementById('importAnimModal'));
    if (modal) modal.hide();

    showToast(`Imported ${importedFrames.length} animation frames!`);
    autoSaveAnim();
  } catch (err) {
    errBox.innerText = 'Import failed: ' + err.message;
    errBox.classList.remove('d-none');
  }
}

/* Undo / Redo */
function pushUndoState() {
  state.redoStack = [];
  state.undoStack.push({
    width: state.width,
    height: state.height,
    palette: [...state.palette],
    frames: state.frames.map(f => [...f]),
    activeFrameIndex: state.activeFrameIndex
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
    frames: state.frames.map(f => [...f]),
    activeFrameIndex: state.activeFrameIndex
  });

  const prev = state.undoStack.pop();
  state.width = prev.width;
  state.height = prev.height;
  state.palette = [...prev.palette];
  state.frames = prev.frames.map(f => [...f]);
  state.activeFrameIndex = Math.min(prev.activeFrameIndex, state.frames.length - 1);

  renderPaletteUI();
  renderFramesStripUI();
  renderAll();
  updateUndoRedoButtons();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push({
    width: state.width,
    height: state.height,
    palette: [...state.palette],
    frames: state.frames.map(f => [...f]),
    activeFrameIndex: state.activeFrameIndex
  });

  const next = state.redoStack.pop();
  state.width = next.width;
  state.height = next.height;
  state.palette = [...next.palette];
  state.frames = next.frames.map(f => [...f]);
  state.activeFrameIndex = Math.min(next.activeFrameIndex, state.frames.length - 1);

  renderPaletteUI();
  renderFramesStripUI();
  renderAll();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  document.getElementById('btnUndo').disabled = state.undoStack.length === 0;
  document.getElementById('btnRedo').disabled = state.redoStack.length === 0;
}

/* LocalStorage AutoSave & Snapshots */
function autoSaveAnim() {
  try {
    const data = {
      name: state.animName,
      width: state.width,
      height: state.height,
      palette: state.palette,
      frames: state.frames,
      interval: state.animInterval
    };
    localStorage.setItem('psae_autosave', JSON.stringify(data));
  } catch (err) {
    console.warn('AutoSave failed:', err);
  }
}

function loadAutoSaveAnim() {
  try {
    const raw = localStorage.getItem('psae_autosave');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.width && data.height && data.frames) {
        state.width = data.width;
        state.height = data.height;
        state.palette = data.palette;
        state.frames = data.frames;
        state.animName = data.name || 'PLAYER_WALK';
        state.animInterval = data.interval || 0.2;

        document.getElementById('animNameInput').value = state.animName;
        document.getElementById('animIntervalInput').value = state.animInterval;
        document.getElementById('gridWidth').value = data.width;
        document.getElementById('gridHeight').value = data.height;
        document.getElementById('gridDimBadge').innerText = `${data.width} x ${data.height}`;

        renderPaletteUI();
        renderFramesStripUI();
        renderAll();
      }
    }
  } catch (err) {
    console.warn('Failed to load auto save:', err);
  }
}

function saveAnimStateManual() {
  const name = state.animName;
  const dateStr = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
  const keyName = `${name} - ${dateStr}`;

  try {
    const data = {
      name: name,
      width: state.width,
      height: state.height,
      palette: state.palette,
      frames: state.frames,
      interval: state.animInterval,
      savedAt: dateStr
    };
    localStorage.setItem(keyName, JSON.stringify(data));
    updateAnimKeysRegistry(keyName);
    refreshSavedAnimsDropdown();
    showToast(`Saved snapshot as "${keyName}"`);
  } catch (err) {
    showToast('Failed to save snapshot.');
  }
}

function updateAnimKeysRegistry(newKey) {
  let keys = getAnimKeys();
  if (!keys.includes(newKey)) {
    keys.unshift(newKey);
    localStorage.setItem('psae_saved_keys', JSON.stringify(keys));
  }
}

function getAnimKeys() {
  try {
    const raw = localStorage.getItem('psae_saved_keys');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function refreshSavedAnimsDropdown() {
  const select = document.getElementById('savedAnimsSelect');
  if (!select) return;

  select.innerHTML = '<option value="" disabled selected>-- load animation --</option>';

  if (localStorage.getItem('psae_autosave')) {
    const opt = document.createElement('option');
    opt.value = 'psae_autosave';
    opt.innerText = 'Auto Save';
    select.appendChild(opt);
  }

  getAnimKeys().forEach(key => {
    if (localStorage.getItem(key)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.innerText = key;
      select.appendChild(opt);
    }
  });
}

function loadSelectedAnimState(key) {
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      pushUndoState();

      state.width = data.width;
      state.height = data.height;
      state.palette = data.palette;
      state.frames = data.frames;
      state.animName = data.name || 'PLAYER_WALK';
      state.animInterval = data.interval || 0.2;

      document.getElementById('animNameInput').value = state.animName;
      document.getElementById('animIntervalInput').value = state.animInterval;
      document.getElementById('gridWidth').value = data.width;
      document.getElementById('gridHeight').value = data.height;

      renderPaletteUI();
      renderFramesStripUI();
      renderAll();
      showToast('Loaded animation snapshot!');
    }
  } catch (err) {
    showToast('Failed to load snapshot.');
  }
}

function deleteSelectedAnimState() {
  const select = document.getElementById('savedAnimsSelect');
  const key = select ? select.value : '';
  if (!key) return;

  if (key === 'psae_autosave') {
    localStorage.removeItem('psae_autosave');
  } else {
    localStorage.removeItem(key);
    let keys = getAnimKeys().filter(k => k !== key);
    localStorage.setItem('psae_saved_keys', JSON.stringify(keys));
  }
  refreshSavedAnimsDropdown();
  showToast('Deleted snapshot.');
}

/* Keyboard Shortcuts */
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
  if (key === 'd') setTool('draw');
  else if (key === 'b') setTool('brush');
  else if (key === 'e') setTool('erase');
  else if (key === 'f') setTool('fill');
  else if (key === 'p') setTool('pick');
}

function setPreviewScale(scale) {
  state.previewScale = parseInt(scale, 10) || 4;
  renderPreviewCanvas();
}

function toggleWallpaperMode(enabled) {
  state.isWallpaper = !!enabled;
  renderPreviewCanvas();
}

function showToast(msg) {
  document.getElementById('toastMessage').innerText = msg;
  const toastEl = document.getElementById('liveToast');
  const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  toast.show();
}

/* Generate Custom PuzzleScript Export Code for Stationary / Projectile Animations */
function generateExportCode() {
  const isProjectile = document.getElementById('typeProjectile')?.checked ?? false;
  const isStationary = document.getElementById('typeStationary')?.checked ?? true;
  
  const animName = (document.getElementById('animNameInput').value.trim() || 'ANIM').replace(/[^a-z0-9_]/gi, '_');
  const colorsLine = state.palette.join(' ');
  const frameCount = state.frames.length;
  const interval = state.animInterval || 0.2;

  const directionsContainer = document.getElementById('projectileDirectionsGroup');

  if (isProjectile) {
    if (directionsContainer) directionsContainer.classList.remove('d-none');

    // Gather selected directions
    let selectedDirs = [];
    if (document.getElementById('dirRight')?.checked) selectedDirs.push('right');
    if (document.getElementById('dirLeft')?.checked) selectedDirs.push('left');
    if (document.getElementById('dirUp')?.checked) selectedDirs.push('up');
    if (document.getElementById('dirDown')?.checked) selectedDirs.push('down');

    if (selectedDirs.length === 0) {
      selectedDirs = ['right'];
      if (document.getElementById('dirRight')) document.getElementById('dirRight').checked = true;
    }

    const isMultiDir = selectedDirs.length > 1;
    const keyRepeat = (parseFloat(interval) + 0.1).toFixed(2);

    // --- Description ---
    let descriptionText = `These settings generate projectile movement and animation rules for firing objects across the screen.`;

    // --- 0. PRELUDE ---
    let preludeCode = `realtime_interval ${interval}\nthrottle_movement\nkey_repeat_interval ${keyRepeat}`;

    // --- 1. OBJECTS ---
    let objectsCode = `( marker to prevent multiple frames per clock tick )\n${animName}_hasAnimated\ntransparent\n\n`;
    
    const primaryDir = selectedDirs[0];

    // Primary direction full bitmaps
    state.frames.forEach((framePixels, fIdx) => {
      const frameName = isMultiDir ? `${animName}_${primaryDir}_frame${fIdx}` : `${animName}_frame${fIdx}`;
      let gridLines = [];
      for (let y = 0; y < state.height; y++) {
        let rowStr = '';
        for (let x = 0; x < state.width; x++) {
          const colorIdx = framePixels[x + y * state.width];
          rowStr += colorIdx >= 0 ? (SYMBOL_MAP[colorIdx] || '?') : '.';
        }
        gridLines.push(rowStr);
      }
      objectsCode += `${frameName}\n${colorsLine}\n${gridLines.join('\n')}\n\n`;
    });

    // Additional directions use shortcut syntax
    for (let i = 1; i < selectedDirs.length; i++) {
      const dir = selectedDirs[i];
      state.frames.forEach((_, fIdx) => {
        const frameName = `${animName}_${dir}_frame${fIdx}`;
        const sourceFrameName = `${animName}_${primaryDir}_frame${fIdx}`;
        objectsCode += `${frameName}\n${colorsLine}\ncopy:${sourceFrameName} flip:${dir}\n\n`;
      });
    }

    // --- 2. LEGEND ---
    const mapChar = animName.charAt(0).toUpperCase() || 'B';
    const firstFrameName = isMultiDir ? `${animName}_${primaryDir}_frame0` : `${animName}_frame0`;
    let legendClassifyLines = [];

    if (isMultiDir) {
      // Define each directional alias with its frames
      selectedDirs.forEach(dir => {
        let dirFrames = [];
        for (let fIdx = 0; fIdx < frameCount; fIdx++) {
          dirFrames.push(`${animName}_${dir}_frame${fIdx}`);
        }
        legendClassifyLines.push(`${animName}_${dir} = ${dirFrames.join(' or ')}`);
      });

      // Union definition linking all directions under the primary name
      const dirAliases = selectedDirs.map(dir => `${animName}_${dir}`);
      legendClassifyLines.push(`${animName} = ${dirAliases.join(' or ')}`);
    } else {
      let singleFrames = [];
      for (let fIdx = 0; fIdx < frameCount; fIdx++) {
        singleFrames.push(`${animName}_frame${fIdx}`);
      }
      legendClassifyLines.push(`${animName} = ${singleFrames.join(' or ')}`);
    }

    let legendCode = `( classify all frames as ${animName} )\n${legendClassifyLines.join('\n')}\n\n( list objects that collide with ${animName} here )\n${animName}Obstacle = Wall or Crate\n\n( use ${mapChar} to add ${animName} to map )\n${mapChar} = ${firstFrameName}`;

    // --- 3. COLLISIONLAYERS ---
    let collisionCode = `${animName}_hasAnimated ( should be its own separate layer )`;

    // --- 4. RULES ---
    let rulesCode = `late [ ${animName}_hasAnimated ] -> []\n\n`;

    selectedDirs.forEach(dir => {
      const objBase = isMultiDir ? `${animName}_${dir}` : animName;
      rulesCode += `( ${objBase} projectile object animation cycle )\n`;
      rulesCode += `( moves at a constant speed whether player moves or not )\n`;
      rulesCode += `( ${objBase} always moves ${dir} )\n`;

      for (let fIdx = 0; fIdx < frameCount; fIdx++) {
        const currFrame = isMultiDir ? `${animName}_${dir}_frame${fIdx}` : `${animName}_frame${fIdx}`;
        const nextFrame = isMultiDir ? `${animName}_${dir}_frame${(fIdx + 1) % frameCount}` : `${animName}_frame${(fIdx + 1) % frameCount}`;
        rulesCode += `[ stationary Player ] [ ${currFrame} no ${animName}_hasAnimated ] -> [ Player ] [ ${dir} ${nextFrame} ${animName}_hasAnimated ]\n`;
      }

      rulesCode += `( if ${objBase} on target, target dies )\n`;
      rulesCode += `[ ${objBase} target ] -> [ target ]\n`;
      rulesCode += `( if ${objBase} is on top of an obstacle, remove it )\n`;
      rulesCode += `[ ${objBase} ${animName}Obstacle ] -> [ ${animName}Obstacle ]\n\n`;
    });

    rulesCode += `( NOTE: spawn ${animName} below all other bullet rules as movement cannot be late )\n`;
    rulesCode += `( spawn ${animName} when user presses action button )\n`;
    
    if (isMultiDir) {
      selectedDirs.forEach(dir => {
        rulesCode += `[ action Player_facing_${dir} ] -> [ Player_facing_${dir} ${animName}_${dir}_frame0 ]\n`;
      });
    } else {
      rulesCode += `[ action Player_facing_right ] -> [ Player_facing_right ${animName}_frame0 ]\n`;
    }

    // Update UI elements
    if (document.getElementById('spriteTypeDescription')) document.getElementById('spriteTypeDescription').innerText = descriptionText;
    if (document.getElementById('exportPreludeCode')) document.getElementById('exportPreludeCode').value = preludeCode;
    if (document.getElementById('exportObjectsCode')) document.getElementById('exportObjectsCode').value = objectsCode.trim();
    if (document.getElementById('exportLegendCode')) document.getElementById('exportLegendCode').value = legendCode;
    if (document.getElementById('exportCollisionLayersCode')) document.getElementById('exportCollisionLayersCode').value = collisionCode;
    if (document.getElementById('exportRulesCode')) document.getElementById('exportRulesCode').value = rulesCode.trim();

  } else {
    // --- Stationary Mode ---
    if (directionsContainer) directionsContainer.classList.add('d-none');

    let descriptionText = `These settings work well for "Stationary" objects that either don't move at all or only move when pushed by the player`;
    let preludeCode = `realtime_interval ${interval}`;

    let frameNames = [];
    let objectsCode = `( marker to prevent multiple frames per clock tick )\n${animName}_hasAnimated\ntransparent\n\n`;

    state.frames.forEach((framePixels, fIdx) => {
      const frameName = `${animName}_frame${fIdx}`;
      frameNames.push(frameName);

      let gridLines = [];
      for (let y = 0; y < state.height; y++) {
        let rowStr = '';
        for (let x = 0; x < state.width; x++) {
          const colorIdx = framePixels[x + y * state.width];
          rowStr += colorIdx >= 0 ? (SYMBOL_MAP[colorIdx] || '?') : '.';
        }
        gridLines.push(rowStr);
      }
      objectsCode += `${frameName}\n${colorsLine}\n${gridLines.join('\n')}\n\n`;
    });

    const mapChar = animName.charAt(0).toUpperCase() || 'N';
    let legendCode = `( classify all frames as ${animName} )\n${animName} = ${frameNames.join(' or ')}\n\n( use ${mapChar} to add ${animName} to map )\n${mapChar} = ${animName}_frame0`;

    let collisionCode = `${animName}_hasAnimated ( should be its own separate layer )`;

    let rulesCode = `( ${animName} stationary object animation cycle )\n( stays constant whether player moves or not )\nlate [ ${animName}_hasAnimated ] -> []\n`;
    if (frameCount > 1) {
      for (let i = 0; i < frameCount; i++) {
        const nextI = (i + 1) % frameCount;
        rulesCode += `[ stationary Player ] [ ${animName}_frame${i} no ${animName}_hasAnimated ] -> [ Player ] [ ${animName}_frame${nextI} ${animName}_hasAnimated ]\n`;
      }
    } else {
      rulesCode += `( Single frame animation - no rules needed )`;
    }

    if (document.getElementById('spriteTypeDescription')) document.getElementById('spriteTypeDescription').innerText = descriptionText;
    if (document.getElementById('exportPreludeCode')) document.getElementById('exportPreludeCode').value = preludeCode;
    if (document.getElementById('exportObjectsCode')) document.getElementById('exportObjectsCode').value = objectsCode.trim();
    if (document.getElementById('exportLegendCode')) document.getElementById('exportLegendCode').value = legendCode;
    if (document.getElementById('exportCollisionLayersCode')) document.getElementById('exportCollisionLayersCode').value = collisionCode;
    if (document.getElementById('exportRulesCode')) document.getElementById('exportRulesCode').value = rulesCode.trim();
  }
}

/* Frame Transformation Actions */
function shiftGrid(dir) {
  pushUndoState();
  const w = state.width;
  const h = state.height;
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  if (dir === 'left') {
    for (let y = 0; y < h; y++) {
      const first = pixels[0 + y * w];
      for (let x = 0; x < w - 1; x++) pixels[x + y * w] = pixels[(x + 1) + y * w];
      pixels[(w - 1) + y * w] = first;
    }
  } else if (dir === 'right') {
    for (let y = 0; y < h; y++) {
      const last = pixels[(w - 1) + y * w];
      for (let x = w - 1; x > 0; x--) pixels[x + y * w] = pixels[(x - 1) + y * w];
      pixels[0 + y * w] = last;
    }
  } else if (dir === 'up') {
    const topRow = [];
    for (let x = 0; x < w; x++) topRow[x] = pixels[x + 0 * w];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) pixels[x + y * w] = pixels[x + (y + 1) * w];
    }
    for (let x = 0; x < w; x++) pixels[x + (h - 1) * w] = topRow[x];
  } else if (dir === 'down') {
    const bottomRow = [];
    for (let x = 0; x < w; x++) bottomRow[x] = pixels[x + (h - 1) * w];
    for (let y = h - 1; y > 0; y--) {
      for (let x = 0; x < w; x++) pixels[x + y * w] = pixels[x + (y - 1) * w];
    }
    for (let x = 0; x < w; x++) pixels[x + 0 * w] = bottomRow[x];
  }

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function flipGrid(dir) {
  pushUndoState();
  const w = state.width;
  const h = state.height;
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  if (dir === 'h') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.floor(w / 2); x++) {
        const idx1 = x + y * w;
        const idx2 = (w - 1 - x) + y * w;
        const tmp = pixels[idx1];
        pixels[idx1] = pixels[idx2];
        pixels[idx2] = tmp;
      }
    }
  } else if (dir === 'v') {
    for (let y = 0; y < Math.floor(h / 2); y++) {
      for (let x = 0; x < w; x++) {
        const idx1 = x + y * w;
        const idx2 = x + (h - 1 - y) * w;
        const tmp = pixels[idx1];
        pixels[idx1] = pixels[idx2];
        pixels[idx2] = tmp;
      }
    }
  }

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function rotate90() {
  pushUndoState();
  const oldW = state.width;
  const oldH = state.height;
  const newW = oldH;
  const newH = oldW;

  // Rotate all frames so dimensions stay synchronized across the animation
  state.frames = state.frames.map(oldPixels => {
    const newPixels = new Array(newW * newH).fill(-1);
    for (let y = 0; y < oldH; y++) {
      for (let x = 0; x < oldW; x++) {
        const oldVal = oldPixels[x + y * oldW];
        const newX = oldH - 1 - y;
        const newY = x;
        newPixels[newX + newY * newW] = oldVal;
      }
    }
    return newPixels;
  });

  state.width = newW;
  state.height = newH;

  if (document.getElementById('gridWidth')) document.getElementById('gridWidth').value = newW;
  if (document.getElementById('gridHeight')) document.getElementById('gridHeight').value = newH;
  if (document.getElementById('gridDimBadge')) document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function growX() {
  pushUndoState();
  const w = state.width;
  const h = state.height;
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  const newPixels = new Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < Math.floor(w / 2); x++) {
      const oldVal = pixels[x + y * w];
      newPixels[x * 2 + 0 + y * w] = oldVal;
      newPixels[x * 2 + 1 + y * w] = oldVal;
    }
  }
  state.frames[state.activeFrameIndex] = newPixels;

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function growY() {
  pushUndoState();
  const w = state.width;
  const h = state.height;
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  const newPixels = new Array(w * h).fill(-1);
  for (let y = 0; y < Math.floor(h / 2); y++) {
    for (let x = 0; x < w; x++) {
      const oldVal = pixels[x + y * w];
      newPixels[x + (y * 2 + 0) * w] = oldVal;
      newPixels[x + (y * 2 + 1) * w] = oldVal;
    }
  }
  state.frames[state.activeFrameIndex] = newPixels;

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function shrinkX() {
  pushUndoState();
  const w = state.width;
  const h = state.height;
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  const newPixels = new Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const oldVal = pixels[x + y * w];
      newPixels[Math.floor(x / 2) + y * w] = oldVal;
    }
  }
  state.frames[state.activeFrameIndex] = newPixels;

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}

function shrinkY() {
  pushUndoState();
  const w = state.width;
  const h = state.height;
  const pixels = state.frames[state.activeFrameIndex];
  if (!pixels) return;

  const newPixels = new Array(w * h).fill(-1);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x++) {
      const oldVal = pixels[x + y * w];
      newPixels[x + Math.floor(y / 2) * w] = oldVal;
    }
  }
  state.frames[state.activeFrameIndex] = newPixels;

  renderFramesStripUI();
  renderAll();
  autoSaveAnim();
}