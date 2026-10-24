/* ================= GIF 录制与导出模块 ================= */
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

function resetRecordButton() {
  recordGifBtn.disabled = !origData || isRecording || isEncoding;
  recordGifBtn.textContent = isRecording ? '录制中...' : (isEncoding ? '生成中...' : '开始录制并导出');
}

/* 还原录制前被临时打开的动画开关 */
function restorePlaybackState() {
  if (window.prevAuto !== undefined) autoEl.checked = window.prevAuto;
  if (window.prevAutoSlice !== undefined) autoSliceEl.checked = window.prevAutoSlice;
  window.prevAuto = undefined;
  window.prevAutoSlice = undefined;
}

/* 点击开始录制 */
recordGifBtn.addEventListener('click', () => {
  if (!origData || isRecording || isEncoding) return;

  if (typeof GIF === 'undefined') {
    gifStatusEl.textContent = 'gif.js 尚未加载完成或加载失败，请稍后重试或检查网络';
    return;
  }

  const scale = +gifScaleEl.value / 100;
  const targetW = Math.max(1, Math.floor(canvas.width * scale));
  const targetH = Math.max(1, Math.floor(canvas.height * scale));

  if (targetW * targetH > 3000000) {
    if (!confirm(`当前尺寸 (${targetW}x${targetH}) 极大，编码处理将非常缓慢。是否继续？`)) return;
  }

  window.prevAuto = autoEl.checked;
  window.prevAutoSlice = autoSliceEl.checked;

  if (!autoEl.checked && !autoSliceEl.checked && !enableNoiseEl.checked) {
    autoEl.checked = true;
    presetRGBEl.value = 'custom';
  }

  gifRecCanvas.width = targetW;
  gifRecCanvas.height = targetH;
  currentGifFps = (targetW * targetH > 1500000) ? 8 : 12;

  isRecording = true;
  recordedCanvases = [];
  recordStartTime = performance.now();

  recordGifBtn.disabled = true;
  recordGifBtn.textContent = '录制中...';
  gifStatusEl.textContent = '正在捕获帧...';
  recordingDot.style.display = 'block';

  requestRender();
});

/* 停止录制并开始编码 */
function stopRecordingAndEncode() {
  isRecording = false;
  rafId = null;
  recordingDot.style.display = 'none';

  if (recordedCanvases.length === 0) {
    gifStatusEl.textContent = '未捕获到帧';
    isEncoding = false;
    restorePlaybackState();
    resetRecordButton();
    requestRender();
    return;
  }

  isEncoding = true;
  recordGifBtn.disabled = true;
  recordGifBtn.textContent = '生成中...';
  gifStatusEl.textContent = '正在准备编码...';

  let gif;
  try {
    gif = new GIF({
      workers: workerBlobUrl ? 2 : 0,
      quality: 10,
      workerScript: workerBlobUrl,
      width: gifRecCanvas.width,
      height: gifRecCanvas.height,
      dither: false
    });
  } catch (err) {
    console.error(err);
    gifStatusEl.textContent = 'GIF 编码器初始化失败';
    isEncoding = false;
    restorePlaybackState();
    resetRecordButton();
    requestRender();
    return;
  }

  const delay = Math.round(1000 / currentGifFps);

  recordedCanvases.forEach(frameCanvas => {
    gif.addFrame(frameCanvas, { delay: delay, copy: true });
  });

  let settled = false;
  function finish() {
    if (settled) return;
    settled = true;
    isEncoding = false;
    recordedCanvases = [];
    restorePlaybackState();
    resetRecordButton();
    rafId = null;
    requestRender();
  }

  gif.on('progress', function (p) {
    gifStatusEl.textContent = `正在编码 GIF (${Math.round(p * 100)}%)`;
  });

  gif.on('finished', function (blob) {
    gifStatusEl.textContent = '生成完毕，已开始下载！';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glitch-animation.gif';
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      gifStatusEl.textContent = '';
      finish();
    }, 1500);
  });

  // Worker 异常或渲染中止时也要恢复按钮，否则界面会一直停在“生成中”
  gif.on('abort', function () {
    gifStatusEl.textContent = 'GIF 编码已中止';
    finish();
  });

  setTimeout(() => {
    gifStatusEl.textContent = '正在计算颜色...';
    gif.render();
  }, 100);
}
