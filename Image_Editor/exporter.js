/* ================= GIF 录制与导出模块 ================= */
const gifDurationEl = document.getElementById('gifDuration');
const gifScaleEl = document.getElementById('gifScale');

/* 预加载 Worker */
async function fetchWorkerScript() {
  const url = 'https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('网络响应异常');
    const text = await res.text();
    const blob = new Blob([text], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
    console.log('Worker 脚本注入成功');
  } catch (e) {
    console.warn('Worker 脚本获取失败，将降级为单线程 (速度较慢)：', e);
    workerBlobUrl = null;
  }
}
fetchWorkerScript();

/* 点击开始录制 */
recordGifBtn.addEventListener('click', () => {
  if (!origData || isRecording || isEncoding) return;

  const scale = +gifScaleEl.value / 100;
  const targetW = Math.floor(canvas.width * scale);
  const targetH = Math.floor(canvas.height * scale);
  
  if (targetW * targetH > 3000000) {
    if (!confirm(`当前尺寸 (${targetW}x${targetH}) 极大，编码处理将非常缓慢。是否继续？`)) return;
  }

  window.prevAuto = autoEl.checked;
  window.prevAutoSlice = autoSliceEl.checked;

  if (!autoEl.checked && !autoSliceEl.checked && !enableNoiseEl.checked) {
    autoEl.checked = true;
    presetRGBEl.value = 'custom';
    requestRender();
  }

  gifRecCanvas.width = targetW;
  gifRecCanvas.height = targetH;
  currentGifFps = (targetW * targetH > 1500000) ? 8 : 12;

  isRecording = true;
  recordedCanvases = [];
  recordStartTime = performance.now();
  lastFrameTime = 0;

  recordGifBtn.disabled = true;
  recordGifBtn.textContent = '录制中...';
  gifStatusEl.textContent = '正在捕获帧...';
  recordingDot.style.display = 'block';
  
  requestRender();
});

/* 停止录制并开始编码 */
function stopRecordingAndEncode() {
  isRecording = false;
  recordingDot.style.display = 'none';
  
  if (recordedCanvases.length === 0) {
    gifStatusEl.textContent = '未捕获到帧';
    recordGifBtn.disabled = false;
    recordGifBtn.textContent = '开始录制并导出';
    isEncoding = false;
    requestRender();
    return;
  }

  isEncoding = true;
  recordGifBtn.textContent = '生成中...';
  gifStatusEl.textContent = '正在准备编码...';

  const gif = new GIF({
    workers: workerBlobUrl ? 2 : 0,
    quality: 10,
    workerScript: workerBlobUrl,
    width: gifRecCanvas.width,
    height: gifRecCanvas.height,
    dither: false
  });

  const delay = Math.round(1000 / currentGifFps);
  
  recordedCanvases.forEach(frameCanvas => {
    gif.addFrame(frameCanvas, { delay: delay, copy: true });
  });

  gifStatusEl.textContent = '正在计算颜色...';
  
  setTimeout(() => {
    gif.render();
  }, 100);

  gif.on('progress', function(p) {
    gifStatusEl.textContent = `正在编码 GIF (${Math.round(p * 100)}%)`;
  });

  gif.on('finished', function(blob) {
    gifStatusEl.textContent = '生成完毕，已开始下载！';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glitch-animation.gif';
    a.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
      gifStatusEl.textContent = '';
      recordGifBtn.disabled = false;
      recordGifBtn.textContent = '开始录制并导出';
      
      isEncoding = false;
      recordedCanvases = [];

      if (window.prevAuto !== undefined) {
        autoEl.checked = window.prevAuto;
        autoSliceEl.checked = window.prevAutoSlice;
      }

      rafId = null;
      requestRender();
      
    }, 1500);
  });
}
