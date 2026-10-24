/* ================= 核心算法与渲染 ================= */
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

function render() {
  if (!origData) return;

  if (!enableOutlineEl.checked && !enableRGBEl.checked && !enableSliceEl.checked && !enableNoiseEl.checked) {
    ctx.putImageData(origData, 0, 0);
    return;
  }

  const baseData = enableOutlineEl.checked ? (outlineData || origData) : origData;
  const W = baseData.width, H = baseData.height;
  const s = baseData.data;

  // 核心修改：引入速度系数
  const speed = +driftSpeedEl.value;
  const t = (performance.now() * 0.001) * speed;
  const A = (enableRGBEl.checked && autoEl.checked) ? +ampEl.value : 0;

  let ox = [0, 0, 0], oy = [0, 0, 0];
  if (enableRGBEl.checked) {
    ox = [
      chans.r.x + Math.round(Math.sin(t * 1.30) * A),
      chans.g.x + Math.round(Math.sin(t * 0.70 + 1.0) * A * 0.4),
      chans.b.x + Math.round(Math.cos(t * 1.20) * A)
    ];
    oy = [
      chans.r.y + Math.round(Math.cos(t * 1.10) * A * 0.5),
      chans.g.y + Math.round(Math.cos(t * 0.90 + 2.0) * A * 0.4),
      chans.b.y + Math.round(Math.sin(t * 1.00) * A * 0.5)
    ];

    const maxRandX = +randXEl.value;
    const maxRandY = +randYEl.value;

    if (maxRandX > 0) {
      ox[0] += Math.floor(Math.random() * (maxRandX * 2 + 1)) - maxRandX;
      ox[1] += Math.floor(Math.random() * (maxRandX * 2 + 1)) - maxRandX;
      ox[2] += Math.floor(Math.random() * (maxRandX * 2 + 1)) - maxRandX;
    }
    if (maxRandY > 0) {
      oy[0] += Math.floor(Math.random() * (maxRandY * 2 + 1)) - maxRandY;
      oy[1] += Math.floor(Math.random() * (maxRandY * 2 + 1)) - maxRandY;
      oy[2] += Math.floor(Math.random() * (maxRandY * 2 + 1)) - maxRandY;
    }
  }

  const useSlice = enableSliceEl.checked;

  if (!outData || outData.width !== W || outData.height !== H) {
    outData = new ImageData(W, H);
  }
  const d = outData.data;
  const mode = edgeEl.value;
  const wrap = mode === 'wrap';
  const alphaMode = mode === 'alpha';
  
  const useOutline = enableOutlineEl.checked;
  const forceOpaque = !useOutline && !alphaMode;

  for (let y = 0; y < H; y++) {
    const rowBase = y * W;
    const cutX = useSlice ? (shiftX[y] || 0) : 0;

    for (let x = 0; x < W; x++) {
      const di = (rowBase + x) << 2;
      const cutY = useSlice ? (shiftY[x] || 0) : 0;

      let outR = 0, outG = 0, outB = 0, outA = 0;

      for (let c = 0; c < 3; c++) {
        let sx = x - cutX - ox[c];
        let sy = y - cutY - oy[c];

        if (sx < 0 || sx >= W || sy < 0 || sy >= H) {
          if (alphaMode) { continue; }
          if (wrap) {
            sx = ((sx % W) + W) % W;
            sy = ((sy % H) + H) % H;
          } else {
            sx = sx < 0 ? 0 : (sx >= W ? W - 1 : sx);
            sy = sy < 0 ? 0 : (sy >= H ? H - 1 : sy);
          }
        }
        
        const sp = ((sy * W + sx) << 2);
        if (c === 0) outR = s[sp];
        else if (c === 1) outG = s[sp + 1];
        else if (c === 2) outB = s[sp + 2];
      }

      if (forceOpaque) {
        outA = 255;
      } else {
        let baseSx = x - cutX;
        let baseSy = y - cutY;
        if (baseSx < 0 || baseSx >= W || baseSy < 0 || baseSy >= H) {
          if (alphaMode) {
            outA = 0;
          } else if (wrap) {
            baseSx = ((baseSx % W) + W) % W;
            baseSy = ((baseSy % H) + H) % H;
            outA = s[((baseSy * W + baseSx) << 2) + 3];
          } else {
            baseSx = baseSx < 0 ? 0 : (baseSx >= W ? W - 1 : baseSx);
            baseSy = baseSy < 0 ? 0 : (baseSy >= H ? H - 1 : baseSy);
            outA = s[((baseSy * W + baseSx) << 2) + 3];
          }
        } else {
          outA = s[((baseSy * W + baseSx) << 2) + 3];
        }
      }

      if (outA === 0) {
        outR = 0; outG = 0; outB = 0; outA = 255;
      }

      d[di] = outR;
      d[di + 1] = outG;
      d[di + 2] = outB;
      d[di + 3] = outA;
    }
  }
  
  ctx.putImageData(outData, 0, 0);

  if (enableNoiseEl.checked) {
    drawNoise(W, H);
  }
}

function drawNoise(W, H) {
  const intensity = +noiseIntensityEl.value / 100;
  if (intensity <= 0) return;
  
  const size = +noiseSizeEl.value;
  const isColor = noiseColorEl.value === 'color';
  const useStripe = noiseStripeEl.checked;
  
  ctx.save();

  const noiseW = Math.max(1, Math.floor(W / size));
  const noiseH = Math.max(1, Math.floor(H / size));
  
  if (noiseCv.width !== noiseW || noiseCv.height !== noiseH) {
    noiseCv.width = noiseW;
    noiseCv.height = noiseH;
  }
  
  const imgData = noiseCtx.createImageData(noiseW, noiseH);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    if (isColor) {
      data[i] = Math.random() * 255;
      data[i+1] = Math.random() * 255;
      data[i+2] = Math.random() * 255;
    } else {
      const v = Math.random() * 255;
      data[i] = v; data[i+1] = v; data[i+2] = v;
    }
    data[i+3] = Math.random() * 255;
  }
  
  noiseCtx.putImageData(imgData, 0, 0);
  
  ctx.globalAlpha = intensity * 0.8;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCv, 0, 0, W, H);

  if (intensity > 0.2) {
    ctx.globalAlpha = 1;
    const numGlitchBands = Math.floor(intensity * 15) + 3;
    
    for (let i = 0; i < numGlitchBands; i++) {
      const sliceY = Math.random() * H;
      const sliceH = Math.random() * 15 + 2;
      const offsetX = (Math.random() - 0.5) * W * 0.3 * intensity;
      
      ctx.drawImage(
        canvas, 
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
