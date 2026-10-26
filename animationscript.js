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
    animType: 'stationary', // 'stationary' | 'projectile' | 'walking'
    animName: 'PLAYER',
    width: 5,
    height: 5,
    palette: ['#000000', '#ff0000', '#00ff00', '#0000ff'],
    activeTool: 'draw',
    activeColorIndex: 0,
    brushSize: 2,
    previewScale: 4,
    isWallpaper: false,
    rows: [], // Array of { id, name, frames: [ pixelArrays ] }
    activeRowIndex: 0,
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
let draggedItem = null; // { rowIndex, frameIndex }

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
        const coordEl = document.getElementById('coordInfo');
        if (coordEl) coordEl.innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: - , Y: -`;
    });

    window.addEventListener('keydown', handleKeyDown);

    // Initialize state
    initAnimState(5, 5);
    loadAutoSaveAnim();
    refreshSavedAnimsDropdown();
    startPlayback();
});

/* Initialize Frame Grid & Default Rows */
function initAnimState(w, h) {
    state.width = w;
    state.height = h;

    const blankFrame = new Array(w * h).fill(-1);
    state.rows = [
        {
            id: 'row_' + Date.now(),
            name: state.animName,
            frames: [blankFrame]
        }
    ];

    state.activeRowIndex = 0;
    state.activeFrameIndex = 0;

    if (document.getElementById('gridWidth')) document.getElementById('gridWidth').value = w;
    if (document.getElementById('gridHeight')) document.getElementById('gridHeight').value = h;
    if (document.getElementById('gridDimBadge')) document.getElementById('gridDimBadge').innerText = `${w} x ${h}`;

    updateTypeRadioUI();
    renderPaletteUI();
    renderFramesGridUI();
    renderAll();
}

/* Set Animation Type (Stationary, Projectile, Walking) */
function setAnimType(type) {
    if (state.animType === type && state.rows.length > 0) {
        updateTypeRadioUI();
        return;
    }

    pushUndoState();
    state.animType = type;
    updateTypeRadioUI();

    const baseName = state.animName || 'PLAYER';
    const defaultSuffixes = ['_MovingRight', '_MovingLeft', '_MovingUp', '_MovingDown'];

    if (type === 'projectile' || type === 'walking') {
        // If we only have 1 row or non-directional rows, populate/update standard 4 directional rows
        const firstFramePixels = (state.rows[0] && state.rows[0].frames[0])
            ? [...state.rows[0].frames[0]]
            : new Array(state.width * state.height).fill(-1);

        if (state.rows.length === 1) {
            const existingFrames = state.rows[0].frames;
            state.rows = defaultSuffixes.map((suffix, idx) => ({
                id: 'row_' + idx + '_' + Date.now(),
                name: `${baseName}${suffix}`,
                frames: existingFrames.map(f => [...f])
            }));
        } else {
            defaultSuffixes.forEach((suffix, idx) => {
                if (state.rows[idx]) {
                    if (!state.rows[idx].name.includes('_Moving')) {
                        state.rows[idx].name = `${baseName}${suffix}`;
                    }
                } else {
                    state.rows.push({
                        id: 'row_' + idx + '_' + Date.now(),
                        name: `${baseName}${suffix}`,
                        frames: [[...firstFramePixels]]
                    });
                }
            });
        }
    } else if (type === 'stationary') {
        if (state.rows.length === 4 && state.rows[0].name.includes('_Moving')) {
            // Keep existing rows or simplify main row name
            if (state.rows[0]) state.rows[0].name = baseName;
        }
    }

    state.activeRowIndex = 0;
    state.activeFrameIndex = 0;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast(`Switched mode to ${type.charAt(0).toUpperCase() + type.slice(1)}`);
}

/* Sync Radio Buttons UI & Input Label */
function updateTypeRadioUI() {
  const t = state.animType || 'stationary';
  
  const mainRadios = {
    'stationary': document.getElementById('mainTypeStationary'),
    'projectile': document.getElementById('mainTypeProjectile'),
    'enemy': document.getElementById('mainTypeEnemy'),
    'player': document.getElementById('mainTypePlayer'),
    'walking': document.getElementById('mainTypePlayer')
  };
  if (mainRadios[t]) mainRadios[t].checked = true;

  // Dynamic Input Label Map
  const labelMap = {
    'stationary': 'Sprite Name',
    'projectile': 'Projectile Name',
    'enemy': 'Enemy Name',
    'player': 'Player Name',
    'walking': 'Player Name'
  };

  const animNameLabel = document.getElementById('animNameLabel');
  if (animNameLabel && labelMap[t]) {
    animNameLabel.innerText = labelMap[t];
  }

  const badge = document.getElementById('modalAnimTypeBadge');
  if (badge) badge.innerText = t.toUpperCase();
}

/* Update Base Sprite Name */
function updateAnimName(val) {
    const oldName = state.animName;
    const newName = val.trim() || 'PLAYER';
    state.animName = newName;

    // Update row names if they used the base name prefix
    state.rows.forEach(row => {
        if (oldName && row.name.startsWith(oldName)) {
            row.name = row.name.replace(oldName, newName);
        } else if (row.name.startsWith('PLAYER')) {
            row.name = row.name.replace('PLAYER', newName);
        }
    });

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

/* Row Management */
function addRow(name, frames) {
    pushUndoState();
    const rowIdx = state.rows.length;
    const defaultName = name || `${state.animName}_Row${rowIdx + 1}`;
    const initialFrames = frames || [new Array(state.width * state.height).fill(-1)];

    state.rows.push({
        id: 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: defaultName,
        frames: initialFrames
    });

    state.activeRowIndex = state.rows.length - 1;
    state.activeFrameIndex = 0;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast(`Added row "${defaultName}"`);
}

function deleteRow(rowIndex, e) {
    if (e) e.stopPropagation();
    if (state.rows.length <= 1) {
        showToast('Animation must have at least 1 row!');
        return;
    }

    pushUndoState();
    state.rows.splice(rowIndex, 1);
    if (state.activeRowIndex >= state.rows.length) {
        state.activeRowIndex = state.rows.length - 1;
    }
    const curRow = state.rows[state.activeRowIndex];
    state.activeFrameIndex = Math.min(state.activeFrameIndex, curRow.frames.length - 1);

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast('Deleted row.');
}

function renameRow(rowIndex, newName) {
    const name = newName.trim().replace(/[^a-z0-9_]/gi, '_');
    if (name && state.rows[rowIndex]) {
        state.rows[rowIndex].name = name;
        renderFramesGridUI();
        renderAll();
        autoSaveAnim();
    }
}

/* Frame Management within Rows */
function addBlankFrame(rIdx) {
    const targetRowIdx = (typeof rIdx === 'number') ? rIdx : state.activeRowIndex;
    if (!state.rows[targetRowIdx]) return;

    pushUndoState();
    const blank = new Array(state.width * state.height).fill(-1);
    state.rows[targetRowIdx].frames.push(blank);
    state.activeRowIndex = targetRowIdx;
    state.activeFrameIndex = state.rows[targetRowIdx].frames.length - 1;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast('Added blank frame.');
}

function duplicateFrame(rIdx, fIdx) {
    const targetRowIdx = (typeof rIdx === 'number') ? rIdx : state.activeRowIndex;
    const targetFrameIdx = (typeof fIdx === 'number') ? fIdx : state.activeFrameIndex;
    const targetRow = state.rows[targetRowIdx];

    if (!targetRow || !targetRow.frames[targetFrameIdx]) return;

    pushUndoState();
    const currentPixels = [...targetRow.frames[targetFrameIdx]];
    targetRow.frames.splice(targetFrameIdx + 1, 0, currentPixels);
    state.activeRowIndex = targetRowIdx;
    state.activeFrameIndex = targetFrameIdx + 1;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast('Duplicated frame.');
}

function deleteFrame(rIdx, fIdx, e) {
    if (e) e.stopPropagation();
    const targetRow = state.rows[rIdx];
    if (!targetRow) return;

    if (targetRow.frames.length <= 1) {
        showToast('Each row must have at least 1 frame!');
        return;
    }

    pushUndoState();
    targetRow.frames.splice(fIdx, 1);
    state.activeRowIndex = rIdx;
    if (state.activeFrameIndex >= targetRow.frames.length) {
        state.activeFrameIndex = targetRow.frames.length - 1;
    }

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast(`Deleted frame ${fIdx}.`);
}

function moveFrame(rIdx, fIdx, direction, e) {
    if (e) e.stopPropagation();
    const targetRow = state.rows[rIdx];
    if (!targetRow) return;

    const targetFIdx = fIdx + direction;
    if (targetFIdx < 0 || targetFIdx >= targetRow.frames.length) return;

    pushUndoState();
    const temp = targetRow.frames[fIdx];
    targetRow.frames[fIdx] = targetRow.frames[targetFIdx];
    targetRow.frames[targetFIdx] = temp;

    state.activeRowIndex = rIdx;
    state.activeFrameIndex = targetFIdx;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

function selectRowAndFrame(rIdx, fIdx) {
  state.activeRowIndex = rIdx;
  state.activeFrameIndex = fIdx;
  state.previewRowIndex = rIdx; // Follow currently selected row
  renderFramesGridUI();
  renderAll();
}

/* Drag and Drop Handlers for Frame Strip Grid */
function handleDragStart(e, rIdx, fIdx, el) {
    draggedItem = { rowIndex: rIdx, frameIndex: fIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedItem));
    el.classList.add('opacity-50', 'border-warning');
}

function handleDragOverFrame(e, rIdx, fIdx, el) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('border-info', 'shadow');
}

function handleDragLeaveFrame(e, el) {
    el.classList.remove('border-info', 'shadow');
}

function handleDropOnFrame(e, targetRIdx, targetFIdx) {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem) return;
    const { rowIndex: srcRIdx, frameIndex: srcFIdx } = draggedItem;

    pushUndoState();

    // Extract moved frame from source row
    const [movedFrame] = state.rows[srcRIdx].frames.splice(srcFIdx, 1);

    // If source row became empty, insert blank frame
    if (state.rows[srcRIdx].frames.length === 0) {
        state.rows[srcRIdx].frames.push(new Array(state.width * state.height).fill(-1));
    }

    let insertIdx = targetFIdx;
    if (srcRIdx === targetRIdx && srcFIdx < targetFIdx) {
        // Array shifted left by 1 when removed from same row
    }

    state.rows[targetRIdx].frames.splice(insertIdx, 0, movedFrame);

    state.activeRowIndex = targetRIdx;
    state.activeFrameIndex = insertIdx;

    draggedItem = null;
    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast('Frame moved successfully!');
}

function handleDragOverRow(e, rIdx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragLeaveRow(e, rowCard) {
    // clean up highlight if needed
}

function handleDropOnRow(e, targetRIdx) {
    e.preventDefault();
    if (!draggedItem) return;

    const { rowIndex: srcRIdx, frameIndex: srcFIdx } = draggedItem;

    pushUndoState();

    const [movedFrame] = state.rows[srcRIdx].frames.splice(srcFIdx, 1);
    if (state.rows[srcRIdx].frames.length === 0) {
        state.rows[srcRIdx].frames.push(new Array(state.width * state.height).fill(-1));
    }

    state.rows[targetRIdx].frames.push(movedFrame);

    state.activeRowIndex = targetRIdx;
    state.activeFrameIndex = state.rows[targetRIdx].frames.length - 1;

    draggedItem = null;
    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast('Frame moved to row!');
}

function handleDragEnd(e, el) {
    if (el) el.classList.remove('opacity-50', 'border-warning');
    draggedItem = null;
}



/* Render Frames Multi-row Grid UI (Multiple rows can be open simultaneously) */
function renderFramesGridUI() {
  const container = document.getElementById('framesGridContainer');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('accordion');

  // Track all open row indices in state (defaulting to current active row)
  if (!Array.isArray(state.openRows)) {
    state.openRows = [state.activeRowIndex];
  }
  if (!state.openRows.includes(state.activeRowIndex)) {
    state.openRows.push(state.activeRowIndex);
  }

  state.rows.forEach((row, rIdx) => {
    const isRowActive = rIdx === state.activeRowIndex;
    const isRowOpen = state.openRows.includes(rIdx);

    const accordionItem = document.createElement('div');
    accordionItem.className = `accordion-item bg-dark border ${isRowActive ? 'border-primary' : 'border-secondary'} mb-2 rounded`;

    accordionItem.ondragover = (e) => handleDragOverRow(e, rIdx);
    accordionItem.ondragleave = (e) => handleDragLeaveRow(e, accordionItem);
    accordionItem.ondrop = (e) => handleDropOnRow(e, rIdx);

    // Accordion Header
    const accordionHeader = document.createElement('h2');
    accordionHeader.className = 'accordion-header m-0';
    accordionHeader.id = `headingRow${rIdx}`;

    const headerContent = document.createElement('div');
    headerContent.className = 'd-flex align-items-center justify-content-between p-2 bg-dark rounded-top gap-2';

    // Left: Accordion Toggle Button, Drag handle & Name input
    const leftDiv = document.createElement('div');
    leftDiv.className = 'd-flex align-items-center gap-2 flex-grow-1';
    leftDiv.style.maxWidth = '380px';

    leftDiv.innerHTML = `
      <button class="accordion-button ${isRowOpen ? '' : 'collapsed'} py-1 px-2 w-auto bg-transparent shadow-none" 
        type="button" 
        data-bs-toggle="collapse" 
        data-bs-target="#collapseRow${rIdx}" 
        aria-expanded="${isRowOpen ? 'true' : 'false'}" 
        aria-controls="collapseRow${rIdx}"
        title="Toggle Row Display">
      </button>
      <span class="text-secondary cursor-grab" title="Row ${rIdx + 1}">
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-dark border-secondary text-secondary small">Row Name</span>
        <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary fw-bold font-monospace" 
          value="${row.name}" 
          onchange="renameRow(${rIdx}, this.value)" 
          onclick="event.stopPropagation()"
          title="Click to rename row">
      </div>
    `;

    // Right: Action buttons
    const rightDiv = document.createElement('div');
    rightDiv.className = 'btn-group btn-group-sm';
    rightDiv.innerHTML = `
      <button class="btn btn-outline-success btn-sm" onclick="addBlankFrame(${rIdx}); event.stopPropagation();" title="Add blank frame to this row">
        <i class="fa-solid fa-plus me-1"></i> Frame
      </button>
      <button class="btn btn-outline-info btn-sm" onclick="duplicateFrame(${rIdx}, ${state.activeFrameIndex}); event.stopPropagation();" title="Duplicate active frame in row">
        <i class="fa-solid fa-clone"></i>
      </button>
      <button class="btn btn-outline-danger btn-sm" onclick="deleteRow(${rIdx}, event)" title="Delete Row" ${state.rows.length <= 1 ? 'disabled' : ''}>
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;

    headerContent.appendChild(leftDiv);
    headerContent.appendChild(rightDiv);
    accordionHeader.appendChild(headerContent);
    accordionItem.appendChild(accordionHeader);

    // Accordion Collapse Body (WITHOUT data-bs-parent attribute)
    const collapseDiv = document.createElement('div');
    collapseDiv.id = `collapseRow${rIdx}`;
    collapseDiv.className = `accordion-collapse collapse ${isRowOpen ? 'show' : ''}`;
    collapseDiv.setAttribute('aria-labelledby', `headingRow${rIdx}`);

    // Sync state when accordion rows open or close
    collapseDiv.addEventListener('shown.bs.collapse', () => {
      if (!state.openRows.includes(rIdx)) {
        state.openRows.push(rIdx);
      }
      state.activeRowIndex = rIdx;
      const targetRow = state.rows[rIdx];
      if (targetRow) {
        state.activeFrameIndex = Math.min(state.activeFrameIndex, targetRow.frames.length - 1);
      }
      renderEditorCanvas();
      renderPreviewCanvas();
      updatePuzzleScriptOutput();
    });

    collapseDiv.addEventListener('hidden.bs.collapse', () => {
      state.openRows = state.openRows.filter(id => id !== rIdx);
    });

    const rowBody = document.createElement('div');
    rowBody.className = 'accordion-body p-2 d-flex gap-2 overflow-x-auto align-items-center bg-dark-subtle rounded-bottom';
    rowBody.style.minHeight = '115px';

    row.frames.forEach((framePixels, fIdx) => {
      const isFrameActive = isRowActive && fIdx === state.activeFrameIndex;
      const frameCard = document.createElement('div');
      frameCard.className = `frame-card card p-2 text-center flex-shrink-0 ${isFrameActive ? 'border-primary bg-dark-preview shadow-sm' : 'border-secondary bg-dark'}`;
      frameCard.style.cursor = 'pointer';
      frameCard.style.minWidth = '95px';
      frameCard.draggable = true;

      frameCard.onclick = () => selectRowAndFrame(rIdx, fIdx);

      // Drag event handlers
      frameCard.ondragstart = (e) => handleDragStart(e, rIdx, fIdx, frameCard);
      frameCard.ondragover = (e) => handleDragOverFrame(e, rIdx, fIdx, frameCard);
      frameCard.ondragleave = (e) => handleDragLeaveFrame(e, frameCard);
      frameCard.ondrop = (e) => handleDropOnFrame(e, rIdx, fIdx);
      frameCard.ondragend = (e) => handleDragEnd(e, frameCard);

      // Thumbnail Canvas
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 44;
      thumbCanvas.height = 44;
      thumbCanvas.className = 'bg-checkerboard mx-auto mb-1 border border-secondary rounded-1';
      drawPixelsToCanvas(thumbCanvas, framePixels, state.width, state.height);
      frameCard.appendChild(thumbCanvas);

      // Frame Label
      const label = document.createElement('div');
      label.className = 'small font-monospace text-truncate text-light fw-bold mb-1';
      label.innerText = `Frame ${fIdx}`;
      frameCard.appendChild(label);

      // Frame Controls
      const btnGroup = document.createElement('div');
      btnGroup.className = 'btn-group btn-group-sm w-100';
      btnGroup.innerHTML = `
        <button class="btn btn-outline-secondary p-0" onclick="moveFrame(${rIdx}, ${fIdx}, -1, event)" title="Move Left" ${fIdx === 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left small"></i>
        </button>
        <button class="btn btn-outline-danger p-0" onclick="deleteFrame(${rIdx}, ${fIdx}, event)" title="Delete Frame">
          <i class="fa-solid fa-xmark small"></i>
        </button>
        <button class="btn btn-outline-secondary p-0" onclick="moveFrame(${rIdx}, ${fIdx}, 1, event)" title="Move Right" ${fIdx === row.frames.length - 1 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-right small"></i>
        </button>
      `;
      frameCard.appendChild(btnGroup);

      rowBody.appendChild(frameCard);
    });

    collapseDiv.appendChild(rowBody);
    accordionItem.appendChild(collapseDiv);
    container.appendChild(accordionItem);
  });

  const activeRow = state.rows[state.activeRowIndex];
  const activeRowName = activeRow ? activeRow.name : 'ANIM';
  const activeTitleEl = document.getElementById('activeFrameTitle');
  if (activeTitleEl) {
    activeTitleEl.innerHTML = `<i class="fa-solid fa-pen-to-square text-primary me-2"></i>Editing: ${activeRowName}_frame${state.activeFrameIndex}`;
  }

  updatePreviewRowDropdown();
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

/* Update Preview Row Dropdown */
function updatePreviewRowDropdown() {
    const select = document.getElementById('previewRowSelect');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="active">Active Row</option>';

    state.rows.forEach((row, idx) => {
        const opt = document.createElement('option');
        opt.value = idx.toString();
        opt.innerText = row.name || `Row ${idx + 1}`;
        select.appendChild(opt);
    });

    if (currentVal && (currentVal === 'active' || parseInt(currentVal) < state.rows.length)) {
        select.value = currentVal;
    } else {
        select.value = 'active';
    }
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

    const activeRow = state.rows[state.activeRowIndex];
    const activePixels = activeRow ? (activeRow.frames[state.activeFrameIndex] || []) : [];

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
    const showGrid = document.getElementById('toggleGridLines')?.checked ?? true;
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
        if (state.isPlaying && state.rows.length > 0) {
            state.playbackFrameIndex++;
            renderPreviewCanvas();
        }
    }, Math.max(20, state.animInterval * 1000));
}

function stepNextRow() {
  if (!state.rows || state.rows.length === 0) return;

  if (state.previewRowIndex === undefined || state.previewRowIndex === null) {
    state.previewRowIndex = state.activeRowIndex;
  }

  // Advance to next row index
  state.previewRowIndex = (state.previewRowIndex + 1) % state.rows.length;
  state.playbackFrameIndex = 0; // Reset frame cycle index for smooth start
  
  renderPreviewCanvas();
}

function togglePlayPause() {
    state.isPlaying = !state.isPlaying;
    const btn = document.getElementById('btnPlayPause');
    if (btn) {
        if (state.isPlaying) {
            btn.className = 'btn btn-sm btn-outline-primary';
            btn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
        } else {
            btn.className = 'btn btn-sm btn-outline-success';
            btn.innerHTML = `<i class="fa-solid fa-play"></i>`;
        }
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

  // Determine row to render: user cycled previewRowIndex or default activeRowIndex
  let rowIdx = (state.previewRowIndex !== undefined && state.previewRowIndex < state.rows.length)
    ? state.previewRowIndex
    : state.activeRowIndex;

  const targetRow = state.rows[rowIdx] || state.rows[0];
  if (!targetRow || !targetRow.frames || targetRow.frames.length === 0) return;

  const frameIdx = state.playbackFrameIndex % targetRow.frames.length;
  const currentFramePixels = targetRow.frames[frameIdx] || targetRow.frames[0];

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
    if (!container) return;
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

    state.rows.forEach(row => {
        row.frames.forEach(frame => {
            for (let i = 0; i < frame.length; i++) {
                if (frame[i] === idx) frame[i] = -1;
                else if (frame[i] > idx) frame[i]--;
            }
        });
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
    if (toolName === 'draw') document.getElementById('toolPencil')?.classList.add('active');
    if (toolName === 'brush') document.getElementById('toolBrush')?.classList.add('active');
    if (toolName === 'erase') {
        document.getElementById('toolEraser')?.classList.add('active');
        state.activeColorIndex = -1;
    }
    if (toolName === 'fill') document.getElementById('toolFill')?.classList.add('active');
    if (toolName === 'pick') document.getElementById('toolEyedropper')?.classList.add('active');
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
        const coordEl = document.getElementById('coordInfo');
        if (coordEl) coordEl.innerHTML = `<i class="fa-solid fa-location-crosshairs me-1"></i> X: ${pt.x + 1}, Y: ${pt.y + 1}`;
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
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
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

    renderFramesGridUI();
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

    state.rows.forEach(row => {
        row.frames = row.frames.map(oldPixels => {
            const newPixels = new Array(newW * newH).fill(-1);
            for (let y = 0; y < Math.min(state.height, newH); y++) {
                for (let x = 0; x < Math.min(state.width, newW); x++) {
                    newPixels[x + y * newW] = oldPixels[x + y * state.width];
                }
            }
            return newPixels;
        });
    });

    state.width = newW;
    state.height = newH;
    if (document.getElementById('gridDimBadge')) document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast(`Resized frames to ${newW}x${newH}`);
}

function clearCurrentFrame() {
    pushUndoState();
    const activeRow = state.rows[state.activeRowIndex];
    if (activeRow && activeRow.frames[state.activeFrameIndex]) {
        activeRow.frames[state.activeFrameIndex].fill(-1);
    }
    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
    showToast('Cleared active frame canvas!');
}

function updatePuzzleScriptOutput() {
    if (typeof generateExportCode === 'function') {
        generateExportCode();
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

/* Import Sprites into Rows & Frames */
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
        const blocks = rawText.split(/\\n\\s*\\n/).filter(b => b.trim().length > 0);
        let parsedRowsMap = {};
        let importedPalette = null;
        let impW = 0, impH = 0;

        blocks.forEach(block => {
            const lines = block.split('\\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('('));
            if (lines.length < 2) return;

            const title = lines[0];
            let rowName = title;
            if (title.includes('_frame')) {
                rowName = title.substring(0, title.lastIndexOf('_frame'));
            }

            const colorTokens = lines[1].split(/\\s+/);
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

            if (!parsedRowsMap[rowName]) parsedRowsMap[rowName] = [];
            parsedRowsMap[rowName].push(pixels);
        });

        const rowNames = Object.keys(parsedRowsMap);
        if (rowNames.length === 0) throw new Error('Could not parse any frame blocks.');

        pushUndoState();

        state.rows = rowNames.map((rName, idx) => ({
            id: 'row_' + idx + '_' + Date.now(),
            name: rName,
            frames: parsedRowsMap[rName]
        }));

        if (importedPalette) state.palette = importedPalette;
        state.width = impW;
        state.height = impH;
        state.activeRowIndex = 0;
        state.activeFrameIndex = 0;

        if (document.getElementById('gridWidth')) document.getElementById('gridWidth').value = impW;
        if (document.getElementById('gridHeight')) document.getElementById('gridHeight').value = impH;
        if (document.getElementById('gridDimBadge')) document.getElementById('gridDimBadge').innerText = `${impW} x ${impH}`;

        renderPaletteUI();
        renderFramesGridUI();
        renderAll();

        const modalEl = document.getElementById('importAnimModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        showToast(`Imported ${blocks.length} frames across ${state.rows.length} rows!`);
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
        animName: state.animName,
        animType: state.animType,
        rows: state.rows.map(r => ({
            id: r.id,
            name: r.name,
            frames: r.frames.map(f => [...f])
        })),
        activeRowIndex: state.activeRowIndex,
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
        animName: state.animName,
        animType: state.animType,
        rows: state.rows.map(r => ({
            id: r.id,
            name: r.name,
            frames: r.frames.map(f => [...f])
        })),
        activeRowIndex: state.activeRowIndex,
        activeFrameIndex: state.activeFrameIndex
    });

    const prev = state.undoStack.pop();
    state.width = prev.width;
    state.height = prev.height;
    state.palette = [...prev.palette];
    state.animName = prev.animName || 'PLAYER';
    state.animType = prev.animType || 'stationary';
    state.rows = prev.rows.map(r => ({
        id: r.id,
        name: r.name,
        frames: r.frames.map(f => [...f])
    }));

    state.activeRowIndex = Math.min(prev.activeRowIndex, state.rows.length - 1);
    const curRow = state.rows[state.activeRowIndex];
    state.activeFrameIndex = Math.min(prev.activeFrameIndex, curRow ? curRow.frames.length - 1 : 0);

    updateTypeRadioUI();
    renderPaletteUI();
    renderFramesGridUI();
    renderAll();
    updateUndoRedoButtons();
}

function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push({
        width: state.width,
        height: state.height,
        palette: [...state.palette],
        animName: state.animName,
        animType: state.animType,
        rows: state.rows.map(r => ({
            id: r.id,
            name: r.name,
            frames: r.frames.map(f => [...f])
        })),
        activeRowIndex: state.activeRowIndex,
        activeFrameIndex: state.activeFrameIndex
    });

    const next = state.redoStack.pop();
    state.width = next.width;
    state.height = next.height;
    state.palette = [...next.palette];
    state.animName = next.animName || 'PLAYER';
    state.animType = next.animType || 'stationary';
    state.rows = next.rows.map(r => ({
        id: r.id,
        name: r.name,
        frames: r.frames.map(f => [...f])
    }));

    state.activeRowIndex = Math.min(next.activeRowIndex, state.rows.length - 1);
    const curRow = state.rows[state.activeRowIndex];
    state.activeFrameIndex = Math.min(next.activeFrameIndex, curRow ? curRow.frames.length - 1 : 0);

    updateTypeRadioUI();
    renderPaletteUI();
    renderFramesGridUI();
    renderAll();
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = state.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = state.redoStack.length === 0;
}

/* LocalStorage AutoSave & Snapshots */
function autoSaveAnim() {
    try {
        const data = {
            name: state.animName,
            animType: state.animType,
            width: state.width,
            height: state.height,
            palette: state.palette,
            rows: state.rows,
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
            if (data.width && data.height) {
                state.width = data.width;
                state.height = data.height;
                state.palette = data.palette || state.palette;
                state.animName = data.name || 'PLAYER';
                state.animType = data.animType || 'stationary';
                state.animInterval = data.interval || 0.2;

                if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
                    state.rows = data.rows;
                } else if (data.frames) {
                    // Backward compatibility for legacy flat frames
                    state.rows = [{
                        id: 'row_' + Date.now(),
                        name: state.animName,
                        frames: data.frames
                    }];
                }

                const nameInput = document.getElementById('animNameInput');
                if (nameInput) nameInput.value = state.animName;

                const intervalInput = document.getElementById('animIntervalInput');
                if (intervalInput) intervalInput.value = state.animInterval;

                if (document.getElementById('gridWidth')) document.getElementById('gridWidth').value = data.width;
                if (document.getElementById('gridHeight')) document.getElementById('gridHeight').value = data.height;
                if (document.getElementById('gridDimBadge')) document.getElementById('gridDimBadge').innerText = `${data.width} x ${data.height}`;

                updateTypeRadioUI();
                renderPaletteUI();
                renderFramesGridUI();
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
            animType: state.animType,
            width: state.width,
            height: state.height,
            palette: state.palette,
            rows: state.rows,
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
            state.animName = data.name || 'PLAYER';
            state.animType = data.animType || 'stationary';
            state.animInterval = data.interval || 0.2;

            if (data.rows && Array.isArray(data.rows)) {
                state.rows = data.rows;
            } else if (data.frames) {
                state.rows = [{
                    id: 'row_' + Date.now(),
                    name: state.animName,
                    frames: data.frames
                }];
            }

            if (document.getElementById('animNameInput')) document.getElementById('animNameInput').value = state.animName;
            if (document.getElementById('animIntervalInput')) document.getElementById('animIntervalInput').value = state.animInterval;
            if (document.getElementById('gridWidth')) document.getElementById('gridWidth').value = data.width;
            if (document.getElementById('gridHeight')) document.getElementById('gridHeight').value = data.height;

            updateTypeRadioUI();
            renderPaletteUI();
            renderFramesGridUI();
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
    const toastMsg = document.getElementById('toastMessage');
    const toastEl = document.getElementById('liveToast');
    if (toastMsg && toastEl) {
        toastMsg.innerText = msg;
        const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
        toast.show();
    }
}

/* Generate Custom PuzzleScript Export Code for Stationary / Projectile / Walking */
function generateExportCode() {
    const animType = state.animType || 'stationary';
    const animName = (state.animName || 'PLAYER').trim().replace(/[^a-z0-9_]/gi, '_');
    const colorsLine = state.palette.join(' ');
    const interval = state.animInterval || 0.2;

    let descriptionText = '';
    let preludeCode = '';
    let objectsCode = '';
    let legendCode = '';
    let collisionCode = '';
    let rulesCode = '';

    const mapChar = animName.charAt(0).toUpperCase() || 'P';

    if (animType === 'walking') {
        descriptionText = `These settings generate walking NPC movement and directional animation rules for characters moving across the grid when the player moves.`;
        preludeCode = `realtime_interval ${interval}`;

        objectsCode = `( marker to prevent multiple frames per clock tick )\n${animName}_hasAnimated\ntransparent\n\n`;

        let allRowClassifications = [];
        let firstFrameName = '';

        state.rows.forEach((row, rIdx) => {
            const rowName = (row.name || `${animName}_Row${rIdx}`).trim().replace(/[^a-z0-9_]/gi, '_');
            let frameNamesInRow = [];

            row.frames.forEach((framePixels, fIdx) => {
                const frameName = `${rowName}_frame${fIdx}`;
                if (!firstFrameName) firstFrameName = frameName;
                frameNamesInRow.push(frameName);

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

            allRowClassifications.push(`${rowName} = ${frameNamesInRow.join(' or ')}`);
        });

        const allRowNames = state.rows.map((r, i) => (r.name || `${animName}_Row${i}`).trim().replace(/[^a-z0-9_]/gi, '_'));
        legendCode = `( classify frames into directional states )\n${allRowClassifications.join('\n')}\n\n( group all walking states into main ${animName} alias )\n${animName} = ${allRowNames.join(' or ')}\n\n( use ${mapChar} to place starting ${animName} on map )\n${mapChar} = ${firstFrameName || `${animName}_MovingRight_frame0`}`;

        collisionCode = `${animName}_hasAnimated ( separate collision layer for animation state lock )\n\n( list the object that collide with this NPC )\n${animName}_obstacle = Wall or Target or Crate or Player or ${animName}`;

        // RULES SECTION
        rulesCode = `( clear animation marker at end of turn )\nlate [ ${animName}_hasAnimated ] -> []\n\n( ${animName} NPC only moves when the player moves )\n`;

        // 1. NPC movement triggers based on player movement
        state.rows.forEach((row) => {
            const rowName = (row.name || `${animName}_Row`).trim().replace(/[^a-z0-9_]/gi, '_');
            const lowerName = rowName.toLowerCase();

            let dir = 'right';
            if (lowerName.includes('left')) dir = 'left';
            else if (lowerName.includes('up')) dir = 'up';
            else if (lowerName.includes('down')) dir = 'down';

            rulesCode += `[ moving Player ] [ ${rowName} ] -> [ moving Player ] [ ${dir} ${rowName} ]\n`;
        });

        rulesCode += `\n`;

        // 2. Standalone frame animation cycles
        state.rows.forEach((row) => {
            const rowName = (row.name || `${animName}_Row`).trim().replace(/[^a-z0-9_]/gi, '_');
            const frameCount = row.frames.length;

            rulesCode += `( ${rowName} walking animation cycle )\n`;
            if (frameCount > 1) {
                for (let fIdx = 0; fIdx < frameCount; fIdx++) {
                    const nextIdx = (fIdx + 1) % frameCount;
                    rulesCode += `[ ${rowName}_frame${fIdx} no ${animName}_hasAnimated ] -> [ ${rowName}_frame${nextIdx} ${animName}_hasAnimated ]\n`;
                }
            }
            rulesCode += `\n`;
        });

        // Helper to resolve directional row names for collision turning
        function getRowNameForDir(d) {
            const found = state.rows.find(r => r.name.toLowerCase().includes(d));
            if (found) return found.name.trim().replace(/[^a-z0-9_]/gi, '_');
            if (d === 'right') return `${animName}_MovingRight`;
            if (d === 'left') return `${animName}_MovingLeft`;
            if (d === 'up') return `${animName}_MovingUp`;
            if (d === 'down') return `${animName}_MovingDown`;
            return `${animName}_${d}`;
        }

        const rightRow = getRowNameForDir('right');
        const leftRow = getRowNameForDir('left');
        const upRow = getRowNameForDir('up');
        const downRow = getRowNameForDir('down');

        // 3. Clockwise obstacle turn rules
        rulesCode += `[ > ${rightRow} | ${animName}_obstacle ] -> [ ${downRow}_frame0 | ${animName}_obstacle ]\n`;
        rulesCode += `[ > ${leftRow} | ${animName}_obstacle ] -> [ ${upRow}_frame0 | ${animName}_obstacle ]\n`;
        rulesCode += `[ > ${upRow} | ${animName}_obstacle ] -> [ ${rightRow}_frame0 | ${animName}_obstacle ]\n`;
        rulesCode += `[ > ${downRow} | ${animName}_obstacle ] -> [ ${leftRow}_frame0 | ${animName}_obstacle ]\n`;

    }

    else if (animType === 'projectile') {
        descriptionText = `These settings generate projectile movement and animation rules for firing objects across the screen.`;
        const keyRepeat = (parseFloat(interval) + 0.1).toFixed(2);
        preludeCode = `realtime_interval ${interval}\nthrottle_movement\nkey_repeat_interval ${keyRepeat}`;

        objectsCode = `( marker to prevent multiple frames per clock tick )\n${animName}_hasAnimated\ntransparent\n\n`;

        let allRowClassifications = [];
        let firstFrameName = '';

        state.rows.forEach((row, rIdx) => {
            const rowName = (row.name || `${animName}_Row${rIdx}`).trim().replace(/[^a-z0-9_]/gi, '_');
            let frameNamesInRow = [];

            row.frames.forEach((framePixels, fIdx) => {
                const frameName = `${rowName}_frame${fIdx}`;
                if (!firstFrameName) firstFrameName = frameName;
                frameNamesInRow.push(frameName);

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

            allRowClassifications.push(`${rowName} = ${frameNamesInRow.join(' or ')}`);
        });

        const allRowNames = state.rows.map((r, i) => (r.name || `${animName}_Row${i}`).trim().replace(/[^a-z0-9_]/gi, '_'));
        legendCode = `( classify frames into directional projectile aliases )\n${allRowClassifications.join('\n')}\n\n( group all projectile directions into main ${animName} alias )\n${animName} = ${allRowNames.join(' or ')}\n\n( list objects that collide with ${animName} here )\n${animName}Obstacle = Wall or Crate\n\n( map symbol ${mapChar} )\n${mapChar} = ${firstFrameName}`;

        collisionCode = `${animName}_hasAnimated ( separate collision layer for animation marker )`;

        rulesCode = `late [ ${animName}_hasAnimated ] -> []\n\n`;

        state.rows.forEach((row, rIdx) => {
            const rowName = (row.name || `${animName}_Row${rIdx}`).trim().replace(/[^a-z0-9_]/gi, '_');
            const lowerName = rowName.toLowerCase();

            let dir = 'right';
            if (lowerName.includes('left')) dir = 'left';
            else if (lowerName.includes('up')) dir = 'up';
            else if (lowerName.includes('down')) dir = 'down';

            rulesCode += `( ${rowName} projectile movement & frame cycle )\n`;
            const frameCount = row.frames.length;
            for (let fIdx = 0; fIdx < frameCount; fIdx++) {
                const currFrame = `${rowName}_frame${fIdx}`;
                const nextFrame = `${rowName}_frame${(fIdx + 1) % frameCount}`;
                rulesCode += `[ stationary Player ] [ ${currFrame} no ${animName}_hasAnimated ] -> [ Player ] [ ${dir} ${nextFrame} ${animName}_hasAnimated ]\n`;
            }

            rulesCode += `( collision & obstacle destruction )\n`;
            rulesCode += `[ ${rowName} target ] -> [ target ]\n`;
            rulesCode += `[ ${rowName} ${animName}Obstacle ] -> [ ${animName}Obstacle ]\n\n`;
        });

        rulesCode += `( spawn ${animName} when action button pressed )\n`;
        state.rows.forEach((row, rIdx) => {
            const rowName = (row.name || `${animName}_Row${rIdx}`).trim().replace(/[^a-z0-9_]/gi, '_');
            const lowerName = rowName.toLowerCase();
            let dir = 'right';
            if (lowerName.includes('left')) dir = 'left';
            else if (lowerName.includes('up')) dir = 'up';
            else if (lowerName.includes('down')) dir = 'down';

            rulesCode += `[ action Player_facing_${dir} ] -> [ Player_facing_${dir} ${rowName}_frame0 ]\n`;
        });

    } else {
        // Stationary mode
        descriptionText = `These settings work well for "Stationary" objects that either don't move at all or cycle frames continuously.`;
        preludeCode = `realtime_interval ${interval}`;

        objectsCode = `( marker to prevent multiple frames per clock tick )\n${animName}_hasAnimated\ntransparent\n\n`;

        let allRowClassifications = [];
        let firstFrameName = '';

        state.rows.forEach((row, rIdx) => {
            const rowName = (row.name || `${animName}_Row${rIdx}`).trim().replace(/[^a-z0-9_]/gi, '_');
            let frameNamesInRow = [];

            row.frames.forEach((framePixels, fIdx) => {
                const frameName = `${rowName}_frame${fIdx}`;
                if (!firstFrameName) firstFrameName = frameName;
                frameNamesInRow.push(frameName);

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

            allRowClassifications.push(`${rowName} = ${frameNamesInRow.join(' or ')}`);
        });

        const allRowNames = state.rows.map((r, i) => (r.name || `${animName}_Row${i}`).trim().replace(/[^a-z0-9_]/gi, '_'));
        legendCode = `( classify frames into animation alias )\n${allRowClassifications.join('\n')}\n\n${animName} = ${allRowNames.join(' or ')}\n\n( map symbol ${mapChar} )\n${mapChar} = ${firstFrameName}`;

        collisionCode = `${animName}_hasAnimated ( separate collision layer )`;

        rulesCode = `late [ ${animName}_hasAnimated ] -> []\n\n`;

        state.rows.forEach((row, rIdx) => {
            const rowName = (row.name || `${animName}_Row${rIdx}`).trim().replace(/[^a-z0-9_]/gi, '_');
            rulesCode += `( ${rowName} frame cycling rule )\n`;
            const frameCount = row.frames.length;
            if (frameCount > 1) {
                for (let fIdx = 0; fIdx < frameCount; fIdx++) {
                    const currFrame = `${rowName}_frame${fIdx}`;
                    const nextFrame = `${rowName}_frame${(fIdx + 1) % frameCount}`;
                    rulesCode += `[ stationary Player ] [ ${currFrame} no ${animName}_hasAnimated ] -> [ Player ] [ ${nextFrame} ${animName}_hasAnimated ]\n`;
                }
            } else {
                rulesCode += `( single frame animation - no cycling rules required )\n`;
            }
            rulesCode += `\n`;
        });
    }

    // Update UI elements
    if (document.getElementById('modalAnimTypeBadge')) {
        document.getElementById('modalAnimTypeBadge').innerText = animType.toUpperCase();
    }
    if (document.getElementById('spriteTypeDescription')) {
        document.getElementById('spriteTypeDescription').innerText = descriptionText;
    }
    if (document.getElementById('exportPreludeCode')) {
        document.getElementById('exportPreludeCode').value = preludeCode.trim();
    }
    if (document.getElementById('exportObjectsCode')) {
        document.getElementById('exportObjectsCode').value = objectsCode.trim();
    }
    if (document.getElementById('exportLegendCode')) {
        document.getElementById('exportLegendCode').value = legendCode.trim();
    }
    if (document.getElementById('exportCollisionLayersCode')) {
        document.getElementById('exportCollisionLayersCode').value = collisionCode.trim();
    }
    if (document.getElementById('exportRulesCode')) {
        document.getElementById('exportRulesCode').value = rulesCode.trim();
    }
}

/* Frame Transformation Actions */
function shiftGrid(dir) {
    pushUndoState();
    const w = state.width;
    const h = state.height;
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
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

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

function flipGrid(dir) {
    pushUndoState();
    const w = state.width;
    const h = state.height;
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
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

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

function rotate90() {
    pushUndoState();
    const oldW = state.width;
    const oldH = state.height;
    const newW = oldH;
    const newH = oldW;

    // Retrieve only the currently active frame
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
    if (!pixels) return;

    const newPixels = new Array(newW * newH).fill(-1);
    for (let y = 0; y < oldH; y++) {
        for (let x = 0; x < oldW; x++) {
            const oldVal = pixels[x + y * oldW];
            const newX = oldH - 1 - y;
            const newY = x;
            newPixels[newX + newY * newW] = oldVal;
        }
    }

    // Assign rotated pixel matrix to the active frame only
    activeRow.frames[state.activeFrameIndex] = newPixels;

    state.width = newW;
    state.height = newH;

    if (document.getElementById('gridWidth')) document.getElementById('gridWidth').value = newW;
    if (document.getElementById('gridHeight')) document.getElementById('gridHeight').value = newH;
    if (document.getElementById('gridDimBadge')) document.getElementById('gridDimBadge').innerText = `${newW} x ${newH}`;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}
function growX() {
    pushUndoState();
    const w = state.width;
    const h = state.height;
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
    if (!pixels) return;

    const newPixels = new Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < Math.floor(w / 2); x++) {
            const oldVal = pixels[x + y * w];
            newPixels[x * 2 + 0 + y * w] = oldVal;
            newPixels[x * 2 + 1 + y * w] = oldVal;
        }
    }
    activeRow.frames[state.activeFrameIndex] = newPixels;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

function growY() {
    pushUndoState();
    const w = state.width;
    const h = state.height;
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
    if (!pixels) return;

    const newPixels = new Array(w * h).fill(-1);
    for (let y = 0; y < Math.floor(h / 2); y++) {
        for (let x = 0; x < w; x++) {
            const oldVal = pixels[x + y * w];
            newPixels[x + (y * 2 + 0) * w] = oldVal;
            newPixels[x + (y * 2 + 1) * w] = oldVal;
        }
    }
    activeRow.frames[state.activeFrameIndex] = newPixels;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

function shrinkX() {
    pushUndoState();
    const w = state.width;
    const h = state.height;
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
    if (!pixels) return;

    const newPixels = new Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x += 2) {
            const oldVal = pixels[x + y * w];
            newPixels[Math.floor(x / 2) + y * w] = oldVal;
        }
    }
    activeRow.frames[state.activeFrameIndex] = newPixels;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}

function shrinkY() {
    pushUndoState();
    const w = state.width;
    const h = state.height;
    const activeRow = state.rows[state.activeRowIndex];
    if (!activeRow) return;

    const pixels = activeRow.frames[state.activeFrameIndex];
    if (!pixels) return;

    const newPixels = new Array(w * h).fill(-1);
    for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x++) {
            const oldVal = pixels[x + y * w];
            newPixels[x + Math.floor(y / 2) * w] = oldVal;
        }
    }
    activeRow.frames[state.activeFrameIndex] = newPixels;

    renderFramesGridUI();
    renderAll();
    autoSaveAnim();
}