const C_SVG_W = 900;
const C_SVG_H = 900;
const C_PREVIEW_SCALE = 1;
const C_CANVAS_W = Math.round(C_SVG_W * C_PREVIEW_SCALE);
const C_CANVAS_H = Math.round(C_SVG_H * C_PREVIEW_SCALE);

const cCanvas = document.getElementById('c-view');
const cCtx = cCanvas.getContext('2d');
cCanvas.width = C_CANVAS_W;
cCanvas.height = C_CANVAS_H;

const cVideo = document.getElementById('c-video');
const cStatusEl = document.getElementById('c-status');
const cStartBtn = document.getElementById('c-startBtn');
const cModeToggleBtn = document.getElementById('c-modeToggle');
const cRecordStartBtn = document.getElementById('c-recordStart');
const cRecordStopBtn = document.getElementById('c-recordStop');
const cSaveBtn = document.getElementById('c-save-btn');
let cLastDots = [];

const cProcCanvas = document.createElement('canvas');
const cProcCtx = cProcCanvas.getContext('2d', { willReadFrequently: true });

let cParams = {
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

let cFrameId = null;
let cLastRenderTime = 0;
let cFrameCount = 0;
let cLastFpsStamp = performance.now();
let cFpsDisplay = 0;
let cFit = { drawW: 0, drawH: 0, offsetX: 0, offsetY: 0 };
let cProcW = 0, cProcH = 0;
let cStream = null;

let cRecorder = null;
let cRecordChunks = [];
let cIsRecording = false;

function cUpdateModeButton() {
  cModeToggleBtn.textContent = 'режим: ' + cParams.dotMode;
}

function cUpdateFit(srcW, srcH) {
  const scale = Math.min(C_SVG_W / srcW, C_SVG_H / srcH);
  cFit.drawW = srcW * scale;
  cFit.drawH = srcH * scale;
  cFit.offsetX = (C_SVG_W - cFit.drawW) / 2;
  cFit.offsetY = (C_SVG_H - cFit.drawH) / 2;
}

function cConfigureProcessingSize() {
  if (!cVideo.videoWidth || !cVideo.videoHeight) return;
  const scale = Math.min(1, cParams.procMax / Math.max(cVideo.videoWidth, cVideo.videoHeight));
  cProcW = Math.max(2, Math.round(cVideo.videoWidth * scale));
  cProcH = Math.max(2, Math.round(cVideo.videoHeight * scale));
  cProcCanvas.width = cProcW;
  cProcCanvas.height = cProcH;
  cUpdateFit(cProcW, cProcH);
}

function cBuildMapsFromFrame() {
  cProcCtx.drawImage(cVideo, 0, 0, cProcW, cProcH);
  const imgData = cProcCtx.getImageData(0, 0, cProcW, cProcH).data;
  const total = cProcW * cProcH;
  const gray = new Float32Array(total);

  for (let i = 0, j = 0; i < total; i++, j += 4) {
    gray[i] = (0.299 * imgData[j] + 0.587 * imgData[j + 1] + 0.114 * imgData[j + 2]) / 255;
  }

  const blurred = gaussianBlur(gray, cProcW, cProcH, cParams.blurR);
  const mag = sobelMag(blurred, cProcW, cProcH);
  const sorted = Array.from(mag).sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * (1 - cParams.edgeThresh / 100))] || 0;

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

function cDrawDot(xA5, yA5, r, alpha) {
  if (cParams.dotMode === 'stroke') {
    cCtx.beginPath();
    cCtx.strokeStyle = `rgba(0,0,0,${alpha / 255})`;
    cCtx.lineWidth = cParams.strokeW * C_PREVIEW_SCALE;
    cCtx.arc(xA5 * C_PREVIEW_SCALE, yA5 * C_PREVIEW_SCALE, r * C_PREVIEW_SCALE, 0, Math.PI * 2);
    cCtx.stroke();
  } else {
    cCtx.beginPath();
    cCtx.fillStyle = `rgba(0,0,0,${alpha / 255})`;
    cCtx.arc(xA5 * C_PREVIEW_SCALE, yA5 * C_PREVIEW_SCALE, r * C_PREVIEW_SCALE, 0, Math.PI * 2);
    cCtx.fill();
  }
}

function cRenderProcessedFrame() {
  if (!cProcW || !cProcH) return;
  cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
  cCtx.fillStyle = '#ffffff';
  cCtx.fillRect(0, 0, cCanvas.width, cCanvas.height);

  const maps = cBuildMapsFromFrame();
  const edgeCDF = maps.edgeCDF;
  const darkCDF = maps.darkCDF;

  const edgeR = cParams.dotSize * 1.1 / 2;
  for (let k = 0; k < cParams.edgeDots; k++) {
    if (!edgeCDF) break;
    const idx = sampleCDF(edgeCDF);
    const ix = idx % cProcW;
    const iy = Math.floor(idx / cProcW);
    const xA5 = cFit.offsetX + ((ix + Math.random()) / cProcW) * cFit.drawW;
    const yA5 = cFit.offsetY + ((iy + Math.random()) / cProcH) * cFit.drawH;
    cDrawDot(xA5, yA5, edgeR, 255);
  }

  if (darkCDF) {
    const fillR = cParams.dotSize * 0.75 / 2;
    for (let k = 0; k < cParams.fillDots; k++) {
      const idx = sampleCDF(darkCDF);
      const ix = idx % cProcW;
      const iy = Math.floor(idx / cProcW);
      const xA5 = cFit.offsetX + ((ix + Math.random()) / cProcW) * cFit.drawW;
      const yA5 = cFit.offsetY + ((iy + Math.random()) / cProcH) * cFit.drawH;
      cDrawDot(xA5, yA5, fillR, 160);
    }
  }

  cFrameCount++;
  const now = performance.now();
  if (now - cLastFpsStamp > 1000) {
    cFpsDisplay = cFrameCount;
    cFrameCount = 0;
    cLastFpsStamp = now;
  }

  cStatusEl.textContent =
    `камера: ${cVideo.videoWidth}×${cVideo.videoHeight} · proc: ${cProcW}×${cProcH} · fps: ${cFpsDisplay} · режим: ${cParams.dotMode}${cIsRecording ? ' · запись' : ''}`;
}

function cOnFrame(now) {
  if (!cStream || cVideo.paused || cVideo.ended) return;

  const minDelta = 1000 / cParams.targetFps;
  if (now - cLastRenderTime >= minDelta) {
    cLastRenderTime = now;
    cRenderProcessedFrame();
  }

  cFrameId = requestAnimationFrame(cOnFrame);
}

function cStartLoop() {
  cStopLoop();
  cLastRenderTime = 0;
  cFrameCount = 0;
  cLastFpsStamp = performance.now();
  cFrameId = requestAnimationFrame(cOnFrame);
}

function cStopLoop() {
  if (cFrameId != null) {
    cancelAnimationFrame(cFrameId);
    cFrameId = null;
  }
}

function cRefreshIfPaused() {
  if (cVideo.readyState >= 2 && cVideo.paused) {
    cRenderProcessedFrame();
  }
}

function cStopRecordingIfNeeded() {
  if (cIsRecording && cRecorder) {
    try { cRecorder.stop(); } catch (e) {}
  }
  cIsRecording = false;
  cRecorder = null;
  cRecordChunks = [];
  cRecordStartBtn.disabled = !cStream;
  cRecordStopBtn.disabled = true;
}

function cPauseIfRunning() {
  if (cVideo && !cVideo.paused) cVideo.pause();
}

async function cStartCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cStatusEl.textContent = 'getUserMedia не поддерживается этим браузером';
    return;
  }

  try {
    cStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });
  } catch (err) {
    cStatusEl.textContent = 'доступ к камере не получен';
    return;
  }

  cVideo.srcObject = cStream;
  try {
    await cVideo.play();
  } catch (err) {
    cStatusEl.textContent = 'камера подключена, но поток не запущен';
    return;
  }

  cStartBtn.disabled = true;
  cRecordStartBtn.disabled = false;
  cRecordStopBtn.disabled = true;
  cStatusEl.textContent = 'поток камеры активен, инициализация...';
}

function cStopCamera() {
  cStopLoop();
  cStopRecordingIfNeeded();

  if (cStream) {
    cStream.getTracks().forEach(track => track.stop());
    cStream = null;
  }

  cVideo.pause();
  cVideo.srcObject = null;

  cStartBtn.disabled = false;
  cRecordStartBtn.disabled = true;
  cRecordStopBtn.disabled = true;

  cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
  cCtx.fillStyle = '#ffffff';
  cCtx.fillRect(0, 0, cCanvas.width, cCanvas.height);

  cStatusEl.textContent = 'камера остановлена';
}

cUpdateModeButton();
cCtx.fillStyle = '#fff';
cCtx.fillRect(0, 0, cCanvas.width, cCanvas.height);

const cIds = ['edgeDots', 'fillDots', 'edgeThresh', 'blurR', 'dotSize', 'strokeW', 'targetFps', 'procMax'];
for (const id of cIds) {
  const el = document.getElementById('c-' + id);
  const out = document.getElementById('c-' + id + 'V');
  el.addEventListener('input', () => {
    cParams[id] = parseFloat(el.value);
    out.textContent = el.value + (id === 'edgeThresh' ? '%' : (id === 'blurR' ? 'px' : ''));
    if (id === 'procMax' && cVideo.videoWidth) cConfigureProcessingSize();
    cRefreshIfPaused();
  });
}

cVideo.addEventListener('loadedmetadata', () => {
  cConfigureProcessingSize();
  cStatusEl.textContent = `камера готова: ${cVideo.videoWidth}×${cVideo.videoHeight}`;
});

cVideo.addEventListener('play', () => {
  cStatusEl.textContent = 'идёт обработка потока камеры...';
  cStartLoop();
});

cVideo.addEventListener('pause', () => {
  cStopLoop();
  cRefreshIfPaused();
});

cModeToggleBtn.addEventListener('click', () => {
  cParams.dotMode = cParams.dotMode === 'fill' ? 'stroke' : 'fill';
  cUpdateModeButton();
  cRefreshIfPaused();
});

cStartBtn.addEventListener('click', cStartCamera);

cRecordStartBtn.addEventListener('click', () => {
  if (cIsRecording) return;
  if (typeof MediaRecorder === 'undefined') {
    cStatusEl.textContent = 'MediaRecorder не поддерживается этим браузером';
    return;
  }

  const stream = cCanvas.captureStream(cParams.targetFps);
  cRecordChunks = [];

  let options = {};
  if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
    options = { mimeType: 'video/webm; codecs=vp9' };
  } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
    options = { mimeType: 'video/webm; codecs=vp8' };
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    options = { mimeType: 'video/webm' };
  }

  try {
    cRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    try {
      cRecorder = new MediaRecorder(stream);
    } catch (e2) {
      cStatusEl.textContent = 'не удалось создать MediaRecorder';
      return;
    }
  }

  cRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) cRecordChunks.push(ev.data);
  };

  cRecorder.onstop = () => {
    if (!cRecordChunks.length) {
      cStatusEl.textContent = 'запись остановлена, но данных нет';
      cStopRecordingIfNeeded();
      return;
    }

    const mime = cRecorder.mimeType || 'video/webm';
    const blob = new Blob(cRecordChunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `am-camera-dots-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    cStatusEl.textContent = 'запись завершена, поток камеры сохранён';
    cStopRecordingIfNeeded();
  };

  cRecorder.start();
  cIsRecording = true;
  cRecordStartBtn.disabled = true;
  cRecordStopBtn.disabled = false;
  cStatusEl.textContent = 'идёт запись атомизированного потока камеры';
});

cRecordStopBtn.addEventListener('click', () => {
  if (!cIsRecording || !cRecorder) return;
  try { cRecorder.stop(); } catch (e) {
    cStopRecordingIfNeeded();
  }
});

