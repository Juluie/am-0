const V_SVG_W = 900;
const V_SVG_H = 900;
const V_PREVIEW_SCALE = 1;
const V_CANVAS_W = Math.round(V_SVG_W * V_PREVIEW_SCALE);
const V_CANVAS_H = Math.round(V_SVG_H * V_PREVIEW_SCALE);

const vCanvas = document.getElementById('v-view');
const vCtx = vCanvas.getContext('2d');
vCanvas.width = V_CANVAS_W;
vCanvas.height = V_CANVAS_H;

const vVideo = document.getElementById('v-video');
const vStatusEl = document.getElementById('v-status');
const vPlayBtn = document.getElementById('v-playBtn');
const vPauseBtn = document.getElementById('v-pauseBtn');
const vModeToggleBtn = document.getElementById('v-modeToggle');
const vRecordStartBtn = document.getElementById('v-recordStart');
const vRecordStopBtn = document.getElementById('v-recordStop');

const vProcCanvas = document.createElement('canvas');
const vProcCtx = vProcCanvas.getContext('2d', { willReadFrequently: true });

let vParams = {
  edgeDots: 4200,
  fillDots: 1200,
  edgeThresh: 22,
  blurR: 3,
  dotSize: 2.2,
  strokeW: 1.0,
  dotMode: 'fill',
  targetFps: 10,
  procMax: 520
};

let vFrameCallbackId = null;
let vLastRenderTime = 0;
let vFrameCount = 0;
let vLastFpsStamp = performance.now();
let vFpsDisplay = 0;
let vFit = { drawW: 0, drawH: 0, offsetX: 0, offsetY: 0 };
let vProcW = 0, vProcH = 0;

let vRecorder = null;
let vRecordChunks = [];
let vIsRecording = false;

function vUpdateModeButton() {
  vModeToggleBtn.textContent = 'режим атома: ' + modeLabel(vParams.dotMode);
}

function vUpdateFit(srcW, srcH) {
  const scale = Math.min(V_SVG_W / srcW, V_SVG_H / srcH);
  vFit.drawW = srcW * scale;
  vFit.drawH = srcH * scale;
  vFit.offsetX = (V_SVG_W - vFit.drawW) / 2;
  vFit.offsetY = (V_SVG_H - vFit.drawH) / 2;
}

function vConfigureProcessingSize() {
  if (!vVideo.videoWidth || !vVideo.videoHeight) return;
  const scale = Math.min(1, vParams.procMax / Math.max(vVideo.videoWidth, vVideo.videoHeight));
  vProcW = Math.max(2, Math.round(vVideo.videoWidth * scale));
  vProcH = Math.max(2, Math.round(vVideo.videoHeight * scale));
  vProcCanvas.width = vProcW;
  vProcCanvas.height = vProcH;
  vUpdateFit(vProcW, vProcH);
}

function vBuildMapsFromFrame() {
  vProcCtx.drawImage(vVideo, 0, 0, vProcW, vProcH);
  const imgData = vProcCtx.getImageData(0, 0, vProcW, vProcH).data;
  const total = vProcW * vProcH;
  const gray = new Float32Array(total);

  for (let i = 0, j = 0; i < total; i++, j += 4) {
    gray[i] = (0.299 * imgData[j] + 0.587 * imgData[j + 1] + 0.114 * imgData[j + 2]) / 255;
  }

  const blurred = gaussianBlur(gray, vProcW, vProcH, vParams.blurR);
  const mag = sobelMag(blurred, vProcW, vProcH);
  const sorted = Array.from(mag).sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * (1 - vParams.edgeThresh / 100))] || 0;

  const edgeW = new Float32Array(total);
  const darkW = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    if (mag[i] >= cutoff) {
      edgeW[i] = Math.pow(mag[i], 0.7);
    } else {
      const dark = 1 - gray[i];
      if (dark > 0.35) darkW[i] = Math.pow(dark - 0.35, 1.5);
    }
  }

  return { edgeCDF: buildCDF(edgeW), darkCDF: buildCDF(darkW) };
}

function vDrawDot(xA5, yA5, r, alpha) {
  if (vParams.dotMode === 'stroke') {
    vCtx.beginPath();
    vCtx.strokeStyle = `rgba(0,0,0,${alpha / 255})`;
    vCtx.lineWidth = vParams.strokeW * V_PREVIEW_SCALE;
    vCtx.arc(xA5 * V_PREVIEW_SCALE, yA5 * V_PREVIEW_SCALE, r * V_PREVIEW_SCALE, 0, Math.PI * 2);
    vCtx.stroke();
  } else {
    vCtx.beginPath();
    vCtx.fillStyle = `rgba(0,0,0,${alpha / 255})`;
    vCtx.arc(xA5 * V_PREVIEW_SCALE, yA5 * V_PREVIEW_SCALE, r * V_PREVIEW_SCALE, 0, Math.PI * 2);
    vCtx.fill();
  }
}

function vRenderProcessedFrame() {
  if (!vProcW || !vProcH) return;
  vCtx.clearRect(0, 0, vCanvas.width, vCanvas.height);
  vCtx.fillStyle = '#ffffff';
  vCtx.fillRect(0, 0, vCanvas.width, vCanvas.height);

  const maps = vBuildMapsFromFrame();
  const edgeCDF = maps.edgeCDF;
  const darkCDF = maps.darkCDF;

  const edgeR = vParams.dotSize * 1.1 / 2;
  for (let k = 0; k < vParams.edgeDots; k++) {
    if (!edgeCDF) break;
    const idx = sampleCDF(edgeCDF);
    const ix = idx % vProcW;
    const iy = Math.floor(idx / vProcW);
    const xA5 = vFit.offsetX + ((ix + Math.random()) / vProcW) * vFit.drawW;
    const yA5 = vFit.offsetY + ((iy + Math.random()) / vProcH) * vFit.drawH;
    vDrawDot(xA5, yA5, edgeR, 255);
  }

  if (darkCDF) {
    const fillR = vParams.dotSize * 0.75 / 2;
    for (let k = 0; k < vParams.fillDots; k++) {
      const idx = sampleCDF(darkCDF);
      const ix = idx % vProcW;
      const iy = Math.floor(idx / vProcW);
      const xA5 = vFit.offsetX + ((ix + Math.random()) / vProcW) * vFit.drawW;
      const yA5 = vFit.offsetY + ((iy + Math.random()) / vProcH) * vFit.drawH;
      vDrawDot(xA5, yA5, fillR, 160);
    }
  }

  vFrameCount++;
  const now = performance.now();
  if (now - vLastFpsStamp > 1000) {
    vFpsDisplay = vFrameCount;
    vFrameCount = 0;
    vLastFpsStamp = now;
  }

  vStatusEl.textContent =
    `видеопоток: ${vVideo.videoWidth}×${vVideo.videoHeight} · расчёт: ${vProcW}×${vProcH} · fps: ${vFpsDisplay} · режим атома: ${modeLabel(vParams.dotMode)}${vIsRecording ? ' · запись' : ''}`;
}

function vOnVideoFrame(now) {
  if (vVideo.paused || vVideo.ended) return;

  const minDelta = 1000 / vParams.targetFps;
  if (now - vLastRenderTime >= minDelta) {
    vLastRenderTime = now;
    vRenderProcessedFrame();
  }

  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    vFrameCallbackId = vVideo.requestVideoFrameCallback(vOnVideoFrame);
  } else {
    vFrameCallbackId = requestAnimationFrame(vOnVideoFrame);
  }
}

function vStartFrameLoop() {
  vStopFrameLoop();
  vLastRenderTime = 0;
  vFrameCount = 0;
  vLastFpsStamp = performance.now();
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    vFrameCallbackId = vVideo.requestVideoFrameCallback(vOnVideoFrame);
  } else {
    vFrameCallbackId = requestAnimationFrame(vOnVideoFrame);
  }
}

function vStopFrameLoop() {
  if (vFrameCallbackId == null) return;
  if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype &&
      'requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    try { vVideo.cancelVideoFrameCallback(vFrameCallbackId); } catch (e) {}
  } else {
    cancelAnimationFrame(vFrameCallbackId);
  }
  vFrameCallbackId = null;
}

function vRefreshIfPaused() {
  if (vVideo.readyState >= 2 && vVideo.paused) {
    vRenderProcessedFrame();
  }
}

function vStopRecordingIfNeeded() {
  if (vIsRecording && vRecorder) {
    try { vRecorder.stop(); } catch (e) {}
  }
  vIsRecording = false;
  vRecorder = null;
  vRecordChunks = [];
  vRecordStartBtn.disabled = true;
  vRecordStopBtn.disabled = true;
}

function vPauseIfPlaying() {
  if (!vVideo.paused) vVideo.pause();
}

vUpdateModeButton();
vCtx.fillStyle = '#fff';
vCtx.fillRect(0, 0, vCanvas.width, vCanvas.height);

const vIds = ['edgeDots', 'fillDots', 'edgeThresh', 'blurR', 'dotSize', 'strokeW', 'targetFps', 'procMax'];
for (const id of vIds) {
  const el = document.getElementById('v-' + id);
  const out = document.getElementById('v-' + id + 'V');
  el.addEventListener('input', () => {
    vParams[id] = parseFloat(el.value);
    out.textContent = el.value + (id === 'edgeThresh' ? '%' : (id === 'blurR' ? 'px' : ''));
    if (id === 'procMax' && vVideo.videoWidth) vConfigureProcessingSize();
    vRefreshIfPaused();
  });
}

document.getElementById('v-fi').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  vStopFrameLoop();
  vStopRecordingIfNeeded();
  vVideo.src = url;
  vVideo.load();
  vStatusEl.textContent = 'видеопоток загружен, жду метаданные...';
});

vVideo.addEventListener('loadedmetadata', () => {
  vConfigureProcessingSize();
  vPlayBtn.disabled = false;
  vPauseBtn.disabled = false;
  vRecordStartBtn.disabled = false;
  vRecordStopBtn.disabled = true;
  vStatusEl.textContent = `готово: ${vVideo.videoWidth}×${vVideo.videoHeight} · нажми пуск`;
  vRefreshIfPaused();
});

vVideo.addEventListener('play', () => {
  vStatusEl.textContent = 'обрабатываю видеопоток...';
  vStartFrameLoop();
});

vVideo.addEventListener('pause', () => {
  vStopFrameLoop();
  vRefreshIfPaused();
});

vVideo.addEventListener('ended', () => {
  vStopFrameLoop();
  vRefreshIfPaused();
});

vPlayBtn.addEventListener('click', async () => {
  try {
    await vVideo.play();
  } catch (err) {
    vStatusEl.textContent = 'браузер не дал запустить видеопоток автоматически';
  }
});

vPauseBtn.addEventListener('click', () => {
  vVideo.pause();
});

vModeToggleBtn.addEventListener('click', () => {
  vParams.dotMode = vParams.dotMode === 'fill' ? 'stroke' : 'fill';
  vUpdateModeButton();
  vRefreshIfPaused();
});

vRecordStartBtn.addEventListener('click', () => {
  if (vIsRecording) return;
  if (typeof MediaRecorder === 'undefined') {
    vStatusEl.textContent = 'MediaRecorder не поддерживается этим браузером';
    return;
  }

  const stream = vCanvas.captureStream(vParams.targetFps);
  vRecordChunks = [];

  let options = {};
  if (MediaRecorder.isTypeSupported('video/mp4')) {
    options = { mimeType: 'video/mp4' };
  } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
    options = { mimeType: 'video/webm; codecs=vp9' };
  } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
    options = { mimeType: 'video/webm; codecs=vp8' };
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    options = { mimeType: 'video/webm' };
  }

  try {
    vRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    try {
      vRecorder = new MediaRecorder(stream);
    } catch (e2) {
      vStatusEl.textContent = 'не удалось создать MediaRecorder';
      return;
    }
  }

  vRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) vRecordChunks.push(ev.data);
  };

  vRecorder.onstop = () => {
    if (!vRecordChunks.length) {
      vStatusEl.textContent = 'запись остановлена, но данных нет';
      vStopRecordingIfNeeded();
      return;
    }

    const mime = vRecorder.mimeType || 'video/webm';
    const blob = new Blob(vRecordChunks, { type: mime });

    let ext = 'webm';
    if (mime.startsWith('video/mp4')) ext = 'mp4';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `am-video-dots-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    vStatusEl.textContent = `запись завершена, файл (${ext}) скачан`;
    vStopRecordingIfNeeded();
  };

  vRecorder.start();
  vIsRecording = true;
  vRecordStartBtn.disabled = true;
  vRecordStopBtn.disabled = false;
  vStatusEl.textContent = 'идёт запись canvas → видео';
});

vRecordStopBtn.addEventListener('click', () => {
  if (!vIsRecording || !vRecorder) return;
  try { vRecorder.stop(); } catch (e) {
    vStopRecordingIfNeeded();
  }
});
