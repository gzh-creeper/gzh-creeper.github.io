/* ================= 全局状态与元素 ================= */
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d', { willReadFrequently: true });
const fileInput = document.getElementById('fileInput');

const padEl = document.getElementById('pad');
const padVal = document.getElementById('padVal');
const exportPresetBtn = document.getElementById('exportPresetBtn');
const importPresetBtn = document.getElementById('importPresetBtn');
const importPresetInput = document.getElementById('importPresetInput');

const groupOutline = document.getElementById('groupOutline');
const enableOutlineEl = document.getElementById('enableOutline');
const presetOutlineEl = document.getElementById('presetOutline');

const groupRGB = document.getElementById('groupRGB');
const enableRGBEl = document.getElementById('enableRGB');
const presetRGBEl = document.getElementById('presetRGB');

const groupSlice = document.getElementById('groupSlice');
const enableSliceEl = document.getElementById('enableSlice');
const presetSliceEl = document.getElementById('presetSlice');

const groupNoise = document.getElementById('groupNoise');
const enableNoiseEl = document.getElementById('enableNoise');
const presetNoiseEl = document.getElementById('presetNoise');
const noiseIntensityEl = document.getElementById('noiseIntensity');
const noiseIntensityVal = document.getElementById('noiseIntensityVal');
const noiseSizeEl = document.getElementById('noiseSize');
const noiseSizeVal = document.getElementById('noiseSizeVal');
const noiseColorEl = document.getElementById('noiseColor');
const noiseStripeEl = document.getElementById('noiseStripe');

const tolEl   = document.getElementById('tol');
const tolVal  = document.getElementById('tolVal');
const lwEl    = document.getElementById('lw');
const lwVal   = document.getElementById('lwVal');
const posEl   = document.getElementById('pos');
const splitEl = document.getElementById('split');
const swatch  = document.getElementById('swatch');
const bgText  = document.getElementById('bgText');

const edgeEl = document.getElementById('edge');
const autoEl = document.getElementById('auto');
const ampEl  = document.getElementById('amp');
const ampVal = document.getElementById('ampVal');

const randXEl = document.getElementById('randX');
const randXVal = document.getElementById('randXVal');
const randYEl = document.getElementById('randY');
const randYVal = document.getElementById('randYVal');

const sliceShiftXEl = document.getElementById('sliceShiftX');
const sliceShiftXVal = document.getElementById('sliceShiftXVal');
const sliceShiftYEl = document.getElementById('sliceShiftY');
const sliceShiftYVal = document.getElementById('sliceShiftYVal');
const sliceSizeEl = document.getElementById('sliceSize');
const sliceSizeVal = document.getElementById('sliceSizeVal');
const regenBtn = document.getElementById('regenSlices');
const autoSliceEl = document.getElementById('autoSlice');

const recordGifBtn = document.getElementById('recordGif');
const gifStatusEl = document.getElementById('gifStatus');
const recordingDot = document.getElementById('recordingDot');

/* 核心状态变量 */
let rawOrigData = null;
let origData    = null;
let outlineData = null;
let outData     = null;
let bg          = null;

const chans = { r: { x: 0, y: 0 }, g: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
let shiftX = new Int16Array(0);
let shiftY = new Int16Array(0);

let isApplyingPreset = false;
let outlineDirty = false;
let outlineTimer = null;
let lastSliceTime = 0;
let rafId = null;

// 录制状态
let isRecording = false;
let isEncoding = false;
let recordStartTime = 0;
let lastFrameTime = 0;
let currentGifFps = 12;
let recordedCanvases = [];
let gifRecCanvas = document.createElement('canvas');
let workerBlobUrl = null;

// 噪点 Canvas
let noiseCv = document.createElement('canvas');
let noiseCtx = noiseCv.getContext('2d');

/* ================= 预设控制 ================= */
function setVal(id, val, type = 'input') {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = val;
  else el.value = val;
  const valEl = document.getElementById(id + 'Val');
  if (valEl) valEl.textContent = val;
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

presetOutlineEl.addEventListener('change', (e) => {
  if (e.target.value === 'custom') return;
  isApplyingPreset = true;
  if (e.target.value === 'default') {
    setVal('lw', 3); setVal('pos', 'outer'); setVal('split', true, 'change');
  } else if (e.target.value === 'thin') {
    setVal('lw', 1); setVal('pos', 'outer'); setVal('split', true, 'change');
  } else if (e.target.value === 'inner') {
    setVal('lw', 7); setVal('pos', 'inner'); setVal('split', false, 'change');
  }
  isApplyingPreset = false;
});

presetRGBEl.addEventListener('change', (e) => {
  if (e.target.value === 'custom') return;
  isApplyingPreset = true;
  if (e.target.value === 'red_blue') {
    setVal('rx', 15); setVal('ry', 0); setVal('gx', 0); setVal('gy', 0); setVal('bx', -15); setVal('by', 0);
    setVal('auto', false, 'change'); setVal('randX', 0); setVal('randY', 0);
  } else if (e.target.value === 'extreme') {
    setVal('rx', 20); setVal('ry', 0); setVal('gx', 0); setVal('gy', 0); setVal('bx', -20); setVal('by', 0);
    setVal('auto', true, 'change'); setVal('amp', 10); setVal('randX', 15); setVal('randY', 10);
  } else if (e.target.value === 'static') {
    setVal('rx', 0); setVal('ry', 0); setVal('gx', 0); setVal('gy', 0); setVal('bx', 0); setVal('by', 0);
    setVal('auto', false, 'change'); setVal('randX', 0); setVal('randY', 0);
  }
  isApplyingPreset = false;
});

presetSliceEl.addEventListener('change', (e) => {
  if (e.target.value === 'custom') return;
  isApplyingPreset = true;
  if (e.target.value === 'bad_signal') {
    setVal('sliceShiftX', 2); setVal('sliceShiftY', 0); setVal('sliceSize', 5); setVal('autoSlice', false, 'change');
  } else if (e.target.value === 'horizontal_tear') {
    setVal('sliceShiftX', 80); setVal('sliceShiftY', 0); setVal('sliceSize', 40); setVal('autoSlice', false, 'change');
  } else if (e.target.value === 'heavy_glitch') {
    setVal('sliceShiftX', 50); setVal('sliceShiftY', 15); setVal('sliceSize', 20); setVal('autoSlice', true, 'change');
  }
  isApplyingPreset = false;
  regenSlices();
});

presetNoiseEl.addEventListener('change', (e) => {
  if (e.target.value === 'custom') return;
  isApplyingPreset = true;
  if (e.target.value === 'tv_static') {
    setVal('noiseIntensity', 40); setVal('noiseSize', 1); setVal('noiseColor', 'gray'); setVal('noiseStripe', false, 'change');
  } else if (e.target.value === 'color_glitch') {
    setVal('noiseIntensity', 60); setVal('noiseSize', 2); setVal('noiseColor', 'color'); setVal('noiseStripe', false, 'change');
  } else if (e.target.value === 'scanlines') {
    setVal('noiseIntensity', 30); setVal('noiseSize', 1); setVal('noiseColor', 'color'); setVal('noiseStripe', true, 'change');
  }
  isApplyingPreset = false;
});

const ignoreForPreset = ['fileInput', 'gifDuration', 'gifScale', 'recordGif', 'download', 'reset', 'regenSlices'];
document.querySelectorAll('input, select').forEach(el => {
  if (ignoreForPreset.includes(el.id) || el.id.startsWith('preset')) return;
  el.addEventListener('input', () => {
    if (isApplyingPreset) return;
    if (['tol','lw','pos','split'].includes(el.id)) presetOutlineEl.value = 'custom';
    else if (['rx','ry','gx','gy','bx','by','edge','auto','amp','randX','randY'].includes(el.id)) presetRGBEl.value = 'custom';
    else if (['sliceShiftX','sliceShiftY','sliceSize','autoSlice'].includes(el.id)) presetSliceEl.value = 'custom';
    else if (['noiseIntensity','noiseSize','noiseColor','noiseStripe'].includes(el.id)) presetNoiseEl.value = 'custom';
  });
  el.addEventListener('change', () => {
    if (isApplyingPreset) return;
    if (['pos','split'].includes(el.id)) presetOutlineEl.value = 'custom';
    else if (['edge','auto'].includes(el.id)) presetRGBEl.value = 'custom';
    else if (['autoSlice'].includes(el.id)) presetSliceEl.value = 'custom';
    else if (['noiseColor','noiseStripe'].includes(el.id)) presetNoiseEl.value = 'custom';
  });
});

/* ================= 微调器 ================= */
document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.dataset.target;
    const step = Number(btn.dataset.step) || 1;
    const input = document.getElementById(targetId);
    if (!input) return;
    
    let newVal = Number(input.value) + step;
    newVal = Math.max(Number(input.min), Math.min(Number(input.max), newVal));
    input.value = newVal;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

/* ================= 边距与主循环 ================= */
function applyPadding() {
  if (!rawOrigData) return;
  const pad = +padEl.value;
  const W = rawOrigData.width;
  const H = rawOrigData.height;
  
  canvas.width = W + pad * 2;
  canvas.height = H + pad * 2;
  
  const temp = document.createElement('canvas');
  temp.width = W;
  temp.height = H;
  temp.getContext('2d').putImageData(rawOrigData, 0, 0);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, pad, pad);
  
  origData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  if (enableOutlineEl.checked) computeOutline();
  outlineDirty = false;
  outData = null;
  regenSlices();
  requestRender();
}

/* ================= 互斥逻辑核心 ================= */
function updateUIState() {
  const isOutline = enableOutlineEl.checked;

  // 互斥逻辑：如果启用了描边，强制关闭并禁用其他特效
  if (isOutline) {
    if (enableRGBEl.checked) { enableRGBEl.checked = false; }
    if (enableSliceEl.checked) { enableSliceEl.checked = false; }
    if (enableNoiseEl.checked) { enableNoiseEl.checked = false; }
    
    // 同时取消动画
    autoEl.checked = false;
    autoSliceEl.checked = false;
  }

  enableRGBEl.disabled = isOutline;
  enableSliceEl.disabled = isOutline;
  enableNoiseEl.disabled = isOutline;

  // UI 隐藏控制
  groupOutline.classList.toggle('off', !enableOutlineEl.checked);
  groupRGB.classList.toggle('off', !enableRGBEl.checked);
  groupSlice.classList.toggle('off', !enableSliceEl.checked);
  groupNoise.classList.toggle('off', !enableNoiseEl.checked);

  requestRender();
}

/* ================= 其他特效被选中时，取消描边 ================= */
enableRGBEl.addEventListener('change', () => {
  if (enableRGBEl.checked) enableOutlineEl.checked = false;
  updateUIState();
});
enableSliceEl.addEventListener('change', () => {
  if (enableSliceEl.checked) enableOutlineEl.checked = false;
  updateUIState();
});
enableNoiseEl.addEventListener('change', () => {
  if (enableNoiseEl.checked) enableOutlineEl.checked = false;
  updateUIState();
  if (enableNoiseEl.checked) requestRender();
});

enableOutlineEl.addEventListener('change', () => {
  updateUIState();
  onOutlineChange();
});

/* ================= 循环渲染 ================= */
function tick() {
  if (isEncoding) {
    rafId = null;
    return;
  }

  const now = performance.now();

  if (outlineDirty && enableOutlineEl.checked) {
    computeOutline();
    outlineDirty = false;
  }

  if (enableSliceEl.checked && autoSliceEl.checked && now - lastSliceTime > 120) {
    regenSlices();
    lastSliceTime = now;
  }

  render();

  if (isRecording) {
    const delay = 1000 / currentGifFps;
    if (now - lastFrameTime > delay) {
      lastFrameTime = now;
      const frameCv = document.createElement('canvas');
      frameCv.width = gifRecCanvas.width;
      frameCv.height = gifRecCanvas.height;
      frameCv.getContext('2d').drawImage(canvas, 0, 0, frameCv.width, frameCv.height);
      recordedCanvases.push(frameCv);
    }
    
    const duration = +document.getElementById('gifDuration').value * 1000;
    if (now - recordStartTime >= duration) {
      stopRecordingAndEncode();
      return;
    }
  }

  const needAnim = (enableRGBEl.checked && (autoEl.checked || +randXEl.value > 0 || +randYEl.value > 0)) || 
                   (enableSliceEl.checked && autoSliceEl.checked) || 
                   enableNoiseEl.checked || 
                   isRecording;
  
  if (needAnim) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
  }
}

function requestRender() {
  if (rafId !== null || isEncoding) return;
  rafId = requestAnimationFrame(tick);
}

function onOutlineChange() {
  if (!enableOutlineEl.checked) return;
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => {
    outlineDirty = true;
    requestRender();
  }, 80);
}

/* ================= 事件绑定 ================= */
padEl.addEventListener('input', () => { padVal.textContent = padEl.value; applyPadding(); });
tolEl.addEventListener('input', () => { tolVal.textContent = tolEl.value; onOutlineChange(); });
lwEl.addEventListener('input',  () => { lwVal.textContent  = lwEl.value;  onOutlineChange(); });
posEl.addEventListener('change', onOutlineChange);
splitEl.addEventListener('change', onOutlineChange);

['r', 'g', 'b'].forEach(c => {
  ['x', 'y'].forEach(a => {
    const el  = document.getElementById(c + a);
    const lab = document.getElementById(c + a + 'Val');
    el.addEventListener('input', () => {
      chans[c][a] = +el.value;
      lab.textContent = el.value;
      requestRender();
    });
  });
});

edgeEl.addEventListener('change', requestRender);
ampEl.addEventListener('input', () => { ampVal.textContent = ampEl.value; requestRender(); });
autoEl.addEventListener('change', requestRender);
autoSliceEl.addEventListener('change', () => {
  if (autoSliceEl.checked) requestRender();
  else if (!autoEl.checked && !isRecording) {
    cancelAnimationFrame(rafId);
    rafId = null;
    requestRender();
  }
});

randXEl.addEventListener('input', () => { randXVal.textContent = randXEl.value; requestRender(); });
randYEl.addEventListener('input', () => { randYVal.textContent = randYEl.value; requestRender(); });

noiseIntensityEl.addEventListener('input', () => { noiseIntensityVal.textContent = noiseIntensityEl.value; requestRender(); });
noiseSizeEl.addEventListener('input', () => { noiseSizeVal.textContent = noiseSizeEl.value; requestRender(); });
noiseColorEl.addEventListener('change', requestRender);
noiseStripeEl.addEventListener('change', requestRender);

sliceShiftXEl.addEventListener('input', () => { sliceShiftXVal.textContent = sliceShiftXEl.value; regenSlices(); });
sliceShiftYEl.addEventListener('input', () => { sliceShiftYVal.textContent = sliceShiftYEl.value; regenSlices(); });
sliceSizeEl.addEventListener('input', () => { sliceSizeVal.textContent = sliceSizeEl.value; regenSlices(); });
regenBtn.addEventListener('click', regenSlices);

/* ================= 取色与上传 ================= */
function updateSwatch() {
  if (!bg) { swatch.style.background = ''; bgText.textContent = '未选择'; return; }
  swatch.style.background = `rgb(${bg.r},${bg.g},${bg.b})`;
  bgText.textContent = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
}

canvas.addEventListener('click', e => {
  if (!origData || isRecording || isEncoding) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * canvas.width  / rect.width);
  const y = Math.floor((e.clientY - rect.top)  * canvas.height / rect.height);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

  const p = (y * canvas.width + x) * 4;
  if (origData.data[p + 3] < 10) {
    bgText.textContent = "透明像素，已忽略";
    setTimeout(() => updateSwatch(), 1500);
    return;
  }
  
  bg = { r: origData.data[p], g: origData.data[p + 1], b: origData.data[p + 2] };
  updateSwatch();
  presetOutlineEl.value = 'custom';
  onOutlineChange();
});

function loadFile(file) {
  if (!file || isRecording || isEncoding) return;
  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(img, 0, 0);
    
    rawOrigData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const d = rawOrigData.data;
    bg = { r: d[0], g: d[1], b: d[2] };
    updateSwatch();

    applyPadding();
    recordGifBtn.disabled = false;
    
    URL.revokeObjectURL(url);
    requestRender();
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

/* ================= 导入/导出预设 ================= */
exportPresetBtn.addEventListener('click', () => {
  const presetData = {
    pad: +padEl.value,
    enableOutline: enableOutlineEl.checked,
    tol: +tolEl.value,
    lw: +lwEl.value,
    pos: posEl.value,
    split: splitEl.checked,
    enableRGB: enableRGBEl.checked,
    rx: +document.getElementById('rx').value,
    ry: +document.getElementById('ry').value,
    gx: +document.getElementById('gx').value,
    gy: +document.getElementById('gy').value,
    bx: +document.getElementById('bx').value,
    by: +document.getElementById('by').value,
    edge: edgeEl.value,
    auto: autoEl.checked,
    amp: +ampEl.value,
    randX: +randXEl.value,
    randY: +randYEl.value,
    enableSlice: enableSliceEl.checked,
    sliceShiftX: +sliceShiftXEl.value,
    sliceShiftY: +sliceShiftYEl.value,
    sliceSize: +sliceSizeEl.value,
    autoSlice: autoSliceEl.checked,
    enableNoise: enableNoiseEl.checked,
    noiseIntensity: +noiseIntensityEl.value,
    noiseSize: +noiseSizeEl.value,
    noiseColor: noiseColorEl.value,
    noiseStripe: noiseStripeEl.checked,
    bg: bg
  };

  const blob = new Blob([JSON.stringify(presetData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glitch_preset_${Date.now()}.glitchartimageeditor`;
  a.click();
  URL.revokeObjectURL(url);
});

importPresetBtn.addEventListener('click', () => {
  if (isRecording || isEncoding) return;
  importPresetInput.click();
});

importPresetInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      isApplyingPreset = true;

      // 重置互斥状态
      enableRGBEl.disabled = false;
      enableSliceEl.disabled = false;
      enableNoiseEl.disabled = false;

      if (data.pad !== undefined) setVal('pad', data.pad);
      
      if (data.enableOutline !== undefined) setVal('enableOutline', data.enableOutline, 'change');
      if (data.tol !== undefined) setVal('tol', data.tol);
      if (data.lw !== undefined) setVal('lw', data.lw);
      if (data.pos !== undefined) setVal('pos', data.pos, 'change');
      if (data.split !== undefined) setVal('split', data.split, 'change');
      
      if (data.enableRGB !== undefined) setVal('enableRGB', data.enableRGB, 'change');
      if (data.rx !== undefined) setVal('rx', data.rx);
      if (data.ry !== undefined) setVal('ry', data.ry);
      if (data.gx !== undefined) setVal('gx', data.gx);
      if (data.gy !== undefined) setVal('gy', data.gy);
      if (data.bx !== undefined) setVal('bx', data.bx);
      if (data.by !== undefined) setVal('by', data.by);
      if (data.edge !== undefined) setVal('edge', data.edge, 'change');
      if (data.auto !== undefined) setVal('auto', data.auto, 'change');
      if (data.amp !== undefined) setVal('amp', data.amp);
      if (data.randX !== undefined) setVal('randX', data.randX);
      if (data.randY !== undefined) setVal('randY', data.randY);
      
      if (data.enableSlice !== undefined) setVal('enableSlice', data.enableSlice, 'change');
      if (data.sliceShiftX !== undefined) setVal('sliceShiftX', data.sliceShiftX);
      if (data.sliceShiftY !== undefined) setVal('sliceShiftY', data.sliceShiftY);
      if (data.sliceSize !== undefined) setVal('sliceSize', data.sliceSize);
      if (data.autoSlice !== undefined) setVal('autoSlice', data.autoSlice, 'change');
      
      if (data.enableNoise !== undefined) setVal('enableNoise', data.enableNoise, 'change');
      if (data.noiseIntensity !== undefined) setVal('noiseIntensity', data.noiseIntensity);
      if (data.noiseSize !== undefined) setVal('noiseSize', data.noiseSize);
      if (data.noiseColor !== undefined) setVal('noiseColor', data.noiseColor, 'change');
      if (data.noiseStripe !== undefined) setVal('noiseStripe', data.noiseStripe, 'change');
      
      if (data.bg) {
        bg = data.bg;
        updateSwatch();
      }

      presetOutlineEl.value = 'custom';
      presetRGBEl.value = 'custom';
      presetSliceEl.value = 'custom';
      presetNoiseEl.value = 'custom';
      
      isApplyingPreset = false;
      updateUIState();
      applyPadding();
      
      importPresetInput.value = '';
      
    } catch (err) {
      console.error(err);
      alert('预设文件解析失败，请确认文件格式是否正确。');
      importPresetInput.value = '';
    }
  };
  reader.readAsText(file);
});

/* ================= 重置与下载 ================= */
document.getElementById('reset').addEventListener('click', () => {
  if (isRecording || isEncoding) return;
  
  isApplyingPreset = true;
  presetOutlineEl.value = 'custom';
  presetRGBEl.value = 'custom';
  presetSliceEl.value = 'custom';
  presetNoiseEl.value = 'custom';

  padEl.value = 80; padVal.textContent = 80;
  enableOutlineEl.checked = true;
  enableRGBEl.checked = false;
  enableSliceEl.checked = false;
  enableNoiseEl.checked = false;
  
  tolEl.value = 30;  tolVal.textContent = 30;
  lwEl.value  = 3;   lwVal.textContent  = 3;
  posEl.value = 'outer'; 
  splitEl.checked = true;

  ['r', 'g', 'b'].forEach(c => {
    ['x', 'y'].forEach(a => {
      document.getElementById(c + a).value = 0;
      document.getElementById(c + a + 'Val').textContent = '0';
      chans[c][a] = 0;
    });
  });
  edgeEl.value = 'alpha';
  autoEl.checked = true;
  ampEl.value = 14; ampVal.textContent = 14;

  randXEl.value = 0; randXVal.textContent = '0';
  randYEl.value = 0; randYVal.textContent = '0';

  sliceShiftXEl.value = 30; sliceShiftXVal.textContent = '30';
  sliceShiftYEl.value = 0; sliceShiftYVal.textContent = '0';
  sliceSizeEl.value = 30; sliceSizeVal.textContent = '30';
  autoSliceEl.checked = true;

  noiseIntensityEl.value = 30; noiseIntensityVal.textContent = '30';
  noiseSizeEl.value = 2; noiseSizeVal.textContent = '2';
  noiseColorEl.value = 'color';
  noiseStripeEl.checked = false;

  document.getElementById('gifScale').value = '50';
  isApplyingPreset = false;

  updateUIState();
  applyPadding();
});

document.getElementById('download').addEventListener('click', () => {
  if (!origData || isRecording || isEncoding) return;
  const a = document.createElement('a');
  a.download = 'glitch-outline.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

/* ================= 拖拽与粘贴 ================= */
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  if (isRecording || isEncoding) return;
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f);
});
window.addEventListener('paste', e => {
  if (isRecording || isEncoding) return;
  const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (it) loadFile(it.getAsFile());
});
