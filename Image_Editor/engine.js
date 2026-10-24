/* ================= 核心算法与渲染 ================= */

/* 动画循环参数：每个通道的基础频率、相位偏移与振幅增益 */
const TAU = Math.PI * 2;
const CH_FREQ_X  = [1.30, 0.70, 1.20];
const CH_FREQ_Y  = [1.10, 0.90, 1.00];
const CH_PHASE_X = [0, 1.0, Math.PI / 2];
const CH_PHASE_Y = [Math.PI / 2, 2.0 + Math.PI / 2, 0];
const CH_GAIN_X  = [1, 0.4, 1];
const CH_GAIN_Y  = [0.5, 0.4, 0.5];

function dilate(mask, W, H, r) {
  if (r <= 0) return mask;
  const a = new Uint8Array(W * H);
  const b = new Uint8Array(W * H);

  for (let y = 0; y < H; y++) {
    const row = y * W;
    let last = -1e9;
    for (let x = 0; x < W; x++) {
      if (mask[row + x]) last = x;
      if (x - last <= r) a[row + x] = 1;
    }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) {
      if (mask[row + x]) last = x;
      if (last - x <= r) a[row + x] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) {
      if (a[y * W + x]) last = y;
      if (y - last <= r) b[y * W + x] = 1;
    }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) {
      if (a[y * W + x]) last = y;
      if (last - y <= r) b[y * W + x] = 1;
    }
  }
  return b;
}

function computeOutline() {
  if (!origData || !enableOutlineEl.checked) return;
  const W = origData.width, H = origData.height;
  const src = origData.data;
  const tol = +tolEl.value;
  const lw  = +lwEl.value;
  const r   = (lw - 1) / 2;
  const pos = posEl.value;
  const splitBlocks = splitEl.checked;
  const N = W * H;

  const isBg = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i << 2;
    if (src[p + 3] < 10) { isBg[i] = 1; continue; }
    if (!bg) continue;
    if (Math.abs(src[p] - bg.r) <= tol && Math.abs(src[p + 1] - bg.g) <= tol && Math.abs(src[p + 2] - bg.b) <= tol) isBg[i] = 1;
  }

  const edge = new Uint8Array(N);
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isBg[i]) continue;
      const p = i << 2;
      let hit = false;

      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { hit = true; break; }
        const j = ny * W + nx;
        if (isBg[j]) { hit = true; break; }
        if (splitBlocks) {
          const q = j << 2;
          if (Math.abs(src[p] - src[q]) > tol || Math.abs(src[p + 1] - src[q + 1]) > tol || Math.abs(src[p + 2] - src[q + 2]) > tol) { hit = true; break; }
        }
      }
      if (hit) edge[i] = 1;
    }
  }

  const mask = dilate(edge, W, H, r);
  const out  = new ImageData(new Uint8ClampedArray(src), W, H);
  const od   = out.data;

  for (let i = 0; i < N; i++) {
    const p = i << 2;
    const isBgPixel = isBg[i];

    if (mask[i]) {
      if (isBgPixel) {
        if (pos === 'center' || pos === 'outer') {
          od[p] = 0; od[p + 1] = 0; od[p + 2] = 0; od[p + 3] = 255;
        } else {
          od[p + 3] = 0;
        }
      } else {
        if (pos === 'center' || pos === 'inner') {
          od[p] = 0; od[p + 1] = 0; od[p + 2] = 0; od[p + 3] = 255;
        }
      }
    } else {
      if (isBgPixel) {
        od[p + 3] = 0;
      }
    }
  }

  outlineData = out;
  outData = null;
}

function regenSlices() {
  if (!origData || !enableSliceEl.checked) return;
  const W = origData.width, H = origData.height;
  const maxShiftX = +sliceShiftXEl.value;
  const maxShiftY = +sliceShiftYEl.value;
  const avgSize = +sliceSizeEl.value;

  shiftX = new Int16Array(H);
  let i = 0;
  while (i < H) {
    const size = Math.max(1, Math.floor(Math.random() * avgSize) + Math.floor(avgSize / 2));
    const shift = Math.floor(Math.random() * (maxShiftX * 2 + 1)) - maxShiftX;
    for (let j = 0; j < size && i < H; j++, i++) shiftX[i] = shift;
  }

  if (maxShiftY > 0) {
    shiftY = new Int16Array(W);
    i = 0;
    while (i < W) {
      const size = Math.max(1, Math.floor(Math.random() * avgSize) + Math.floor(avgSize / 2));
      const shift = Math.floor(Math.random() * (maxShiftY * 2 + 1)) - maxShiftY;
      for (let j = 0; j < size && i < W; j++, i++) shiftY[i] = shift;
    }
  } else {
    shiftY = new Int16Array(W);
  }
  requestRender();
}

/* 取当前动画进度（0~1）。录制时以录制起点为 0，预览时按固定周期循环，
   这样预览与导出 GIF 的节奏一致，且 GIF 首尾可以无缝衔接。 */
function loopPhase(nowMs) {
  const durationMs = Math.max(1, (+document.getElementById('gifDuration').value || 1) * 1000);
  const elapsed = isRecording ? (nowMs - recordStartTime) : nowMs;
  return (((elapsed % durationMs) + durationMs) % durationMs) / durationMs;
}

/* 计算三个通道的采样偏移。每个通道在一段录制时长内走完整数个周期，
   周期数按原始频率比例取整，因此 loopPhase 回到 0 时相位完全复位。 */
function computeChannelOffsets() {
  const ox = [0, 0, 0];
  const oy = [0, 0, 0];
  if (!enableRGBEl.checked) return { ox, oy };

  const baseX = [chans.r.x, chans.g.x, chans.b.x];
  const baseY = [chans.r.y, chans.g.y, chans.b.y];
  const cycles = Math.max(1, Math.round(+driftCyclesEl.value) || 1);
  const p = loopPhase(performance.now());
  const A = autoEl.checked ? +ampEl.value : 0;

  const kx = CH_FREQ_X.map(f => Math.max(1, Math.round(cycles * f / CH_FREQ_X[0])));
  const ky = CH_FREQ_Y.map(f => Math.max(1, Math.round(cycles * f / CH_FREQ_Y[0])));

  for (let c = 0; c < 3; c++) {
    ox[c] = baseX[c] + Math.round(Math.sin(TAU * kx[c] * p + CH_PHASE_X[c]) * A * CH_GAIN_X[c]);
    oy[c] = baseY[c] + Math.round(Math.sin(TAU * ky[c] * p + CH_PHASE_Y[c]) * A * CH_GAIN_Y[c]);
  }

  const maxRandX = +randXEl.value;
  const maxRandY = +randYEl.value;

  if (maxRandX > 0) {
    for (let c = 0; c < 3; c++) ox[c] += Math.floor(Math.random() * (maxRandX * 2 + 1)) - maxRandX;
  }
  if (maxRandY > 0) {
    for (let c = 0; c < 3; c++) oy[c] += Math.floor(Math.random() * (maxRandY * 2 + 1)) - maxRandY;
  }
  return { ox, oy };
}

/* ================= 画布背景 ================= */
function hexToRgb(hex) {
  const v = parseInt(String(hex).replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function currentBgFill() {
  const enableEl = document.getElementById('bgFillEnable');
  if (!enableEl || !enableEl.checked) return null;
  const colorEl = document.getElementById('bgFillColor');
  return colorEl ? hexToRgb(colorEl.value) : null;
}

/* 把半透明结果合成到纯色背景上（原地修改，源图保持透明） */
function compositeBg(d, pixels, fill) {
  const fr = fill.r, fg = fill.g, fb = fill.b;
  const n = pixels << 2;
  for (let i = 0; i < n; i += 4) {
    const a = d[i + 3];
    if (a === 255) continue;
    const t = a / 255;
    const u = 1 - t;
    d[i]     = d[i] * t + fr * u;
    d[i + 1] = d[i + 1] * t + fg * u;
    d[i + 2] = d[i + 2] * t + fb * u;
    d[i + 3] = 255;
  }
}

/* 输出一帧：无背景时直接贴图，有背景时先合成再贴图 */
function presentImage(imgData, fill) {
  if (!fill) {
    ctx.putImageData(imgData, 0, 0);
    return;
  }
  const W = imgData.width, H = imgData.height;
  if (!outData || outData.width !== W || outData.height !== H) {
    outData = new ImageData(W, H);
  }
  outData.data.set(imgData.data);
  compositeBg(outData.data, W * H, fill);
  ctx.putImageData(outData, 0, 0);
}

function render() {
  if (!origData) return;
  const fill = currentBgFill();

  if (!enableOutlineEl.checked && !enableRGBEl.checked && !enableSliceEl.checked && !enableNoiseEl.checked) {
    presentImage(origData, fill);
    return;
  }

  const baseData = enableOutlineEl.checked ? (outlineData || origData) : origData;
  const W = baseData.width, H = baseData.height;
  const s = baseData.data;
  const useSlice = enableSliceEl.checked;

  // 快速路径：只有描边或只有噪点时无需逐像素重采样，直接贴图
  if (!enableRGBEl.checked && !useSlice) {
    presentImage(baseData, fill);
    if (enableNoiseEl.checked) drawNoise(W, H);
    return;
  }

  const { ox, oy } = computeChannelOffsets();

  if (!outData || outData.width !== W || outData.height !== H) {
    outData = new ImageData(W, H);
  }
  const d = outData.data;
  const wrap = edgeEl.value === 'wrap';

  for (let y = 0; y < H; y++) {
    const rowBase = y * W;
    const cutX = useSlice ? (shiftX[y] || 0) : 0;

    for (let x = 0; x < W; x++) {
      const di = (rowBase + x) << 2;
      const cutY = useSlice ? (shiftY[x] || 0) : 0;

      let outR = 0, outG = 0, outB = 0;
      let aR = 0, aG = 0, aB = 0;

      // 逐通道采样：颜色和 Alpha 一起取。
      // 这样位移后的通道不会再被原图轮廓裁掉，也不会把透明区域采成黑色实心块。
      for (let c = 0; c < 3; c++) {
        let sx = x - cutX - ox[c];
        let sy = y - cutY - oy[c];

        if (sx < 0 || sx >= W || sy < 0 || sy >= H) {
          if (wrap) {
            sx = ((sx % W) + W) % W;
            sy = ((sy % H) + H) % H;
          } else {
            sx = sx < 0 ? 0 : (sx >= W ? W - 1 : sx);
            sy = sy < 0 ? 0 : (sy >= H ? H - 1 : sy);
          }
        }

        const sp = ((sy * W + sx) << 2);
        const a = s[sp + 3];
        if (c === 0) { outR = s[sp]; aR = a; }
        else if (c === 1) { outG = s[sp + 1]; aG = a; }
        else { outB = s[sp + 2]; aB = a; }
      }

      // 三个通道的轮廓取并集，颜色按各自 Alpha 预乘归一，避免接缝发黑
      const aMax = aR > aG ? (aR > aB ? aR : aB) : (aG > aB ? aG : aB);
      if (aMax === 0) {
        d[di] = 0;
        d[di + 1] = 0;
        d[di + 2] = 0;
      } else if (aR === aMax && aG === aMax && aB === aMax) {
        // 不透明图或三个通道完全重合时走原值，省去除法
        d[di] = outR;
        d[di + 1] = outG;
        d[di + 2] = outB;
      } else {
        const inv = 1 / aMax;
        d[di]     = Math.round(outR * aR * inv);
        d[di + 1] = Math.round(outG * aG * inv);
        d[di + 2] = Math.round(outB * aB * inv);
      }
      d[di + 3] = aMax;
    }
  }

  if (fill) compositeBg(d, W * H, fill);
  ctx.putImageData(outData, 0, 0);

  if (enableNoiseEl.checked) {
    drawNoise(W, H);
  }
}

/* 噪点图层。噪点 ImageData 与快照画布都复用，避免逐帧分配大对象。 */
let noiseImg = null;
const noiseSnap = document.createElement('canvas');
const noiseSnapCtx = noiseSnap.getContext('2d');

function drawNoise(W, H) {
  const intensity = +noiseIntensityEl.value / 100;
  if (intensity <= 0) return;

  const size = Math.max(1, +noiseSizeEl.value);
  const isColor = noiseColorEl.value === 'color';
  const useStripe = noiseStripeEl.checked;

  const noiseW = Math.max(1, Math.floor(W / size));
  const noiseH = Math.max(1, Math.floor(H / size));

  if (noiseCv.width !== noiseW || noiseCv.height !== noiseH) {
    noiseCv.width = noiseW;
    noiseCv.height = noiseH;
    noiseImg = null;
  }
  if (!noiseImg) noiseImg = noiseCtx.createImageData(noiseW, noiseH);

  const data = noiseImg.data;

  for (let i = 0; i < data.length; i += 4) {
    if (isColor) {
      data[i] = Math.random() * 255;
      data[i + 1] = Math.random() * 255;
      data[i + 2] = Math.random() * 255;
    } else {
      const v = Math.random() * 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
    data[i + 3] = Math.random() * 255;
  }

  noiseCtx.putImageData(noiseImg, 0, 0);

  ctx.save();
  ctx.globalAlpha = intensity * 0.8;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCv, 0, 0, W, H);

  if (intensity > 0.2) {
    // 先把当前画面整体拷入快照，再逐条取源绘制。
    // 直接反复从 canvas 自身取区域会读到大半已被改写的像素，产生拖影累积。
    if (noiseSnap.width !== W || noiseSnap.height !== H) {
      noiseSnap.width = W;
      noiseSnap.height = H;
    }
    noiseSnapCtx.clearRect(0, 0, W, H);
    noiseSnapCtx.drawImage(canvas, 0, 0);

    ctx.globalAlpha = 1;
    const numGlitchBands = Math.floor(intensity * 15) + 3;

    for (let i = 0; i < numGlitchBands; i++) {
      const sliceH = Math.random() * 15 + 2;
      const maxY = Math.max(0, H - sliceH);
      const sliceY = Math.random() * maxY;
      const offsetX = (Math.random() - 0.5) * W * 0.3 * intensity;

      ctx.drawImage(
        noiseSnap,
        0, sliceY, W, sliceH,
        offsetX, sliceY, W, sliceH
      );
    }
  }

  if (useStripe) {
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    for (let y = 0; y < H; y += 3) {
      ctx.fillRect(0, y, W, 1);
    }

    const numLines = Math.floor(intensity * 10);
    for (let i = 0; i < numLines; i++) {
      const ly = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(0,255,255,0.6)';
      ctx.fillRect(0, ly, W, Math.random() * 1.5 + 0.5);
    }
  }

  ctx.restore();
}
