const P_SVG_W = 298;
const P_SVG_H = 420;
const P_PREVIEW_SCALE = 1.8;
const P_CANVAS_W = Math.round(P_SVG_W * P_PREVIEW_SCALE);
const P_CANVAS_H = Math.round(P_SVG_H * P_PREVIEW_SCALE);

let pImg = null, pEdgeCDF = null, pDarkCDF = null, pIW = 0, pIH = 0, pAllDots = [];
let pParams = {
  edgeDots: 8000,
  fillDots: 100,
  edgeThresh: 20,
  blurR: 3,
  dotSize: 2.5,
  dotMode: 'fill',
  strokeW: 1.2
};
let pNeedsRedraw = false;
let pFit = { drawW: 0, drawH: 0, offsetX: 0, offsetY: 0 };

const pStatusEl = document.getElementById('p-status');
const pSaveBtn = document.getElementById('p-save-btn');
const pModeToggleBtn = document.getElementById('p-modeToggle');

function pUpdateModeButton() {
  pModeToggleBtn.textContent = 'режим: ' + pParams.dotMode;
}

function pUpdateFit() {
  const scale = Math.min(P_SVG_W / pIW, P_SVG_H / pIH);
  pFit.drawW = pIW * scale;
  pFit.drawH = pIH * scale;
  pFit.offsetX = (P_SVG_W - pFit.drawW) / 2;
  pFit.offsetY = (P_SVG_H - pFit.drawH) / 2;
}

function pBuildMasks() {
  pStatusEl.textContent = 'строю карты...';
  pIW = pImg.width;
  pIH = pImg.height;

  const gray = new Float32Array(pIW * pIH);
  for (let i = 0; i < pIW * pIH; i++) {
    gray[i] = (
      0.299 * pImg.pixels[i * 4] +
      0.587 * pImg.pixels[i * 4 + 1] +
      0.114 * pImg.pixels[i * 4 + 2]
    ) / 255;
  }

  const blurred = gaussianBlur(gray, pIW, pIH, pParams.blurR);
  const mag = sobelMag(blurred, pIW, pIH);
  const sorted = Array.from(mag).sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * (1 - pParams.edgeThresh / 100))];

  const edgeW = new Float32Array(pIW * pIH);
  const darkW = new Float32Array(pIW * pIH);

  for (let i = 0; i < pIW * pIH; i++) {
    if (mag[i] >= cutoff) {
      edgeW[i] = Math.pow(mag[i], 0.7);
    } else {
      const dark = 1 - gray[i];
      if (dark > 0.35) darkW[i] = Math.pow(dark - 0.35, 1.5);
    }
  }

  pEdgeCDF = buildCDF(edgeW);
  pDarkCDF = buildCDF(darkW);
  pUpdateFit();
  pStatusEl.textContent = 'готово, генерирую...';
}

function pRedrawDotsPreview(p) {
  p.background(255);
  for (const d of pAllDots) {
    if (pParams.dotMode === 'stroke') {
      p.noFill();
      p.stroke(0, 0, 0, d.alpha);
      p.strokeWeight(pParams.strokeW * P_PREVIEW_SCALE);
    } else {
      p.noStroke();
      p.fill(0, 0, 0, d.alpha);
    }
    p.ellipse(
      d.x * P_PREVIEW_SCALE,
      d.y * P_PREVIEW_SCALE,
      d.r * 2 * P_PREVIEW_SCALE,
      d.r * 2 * P_PREVIEW_SCALE
    );
  }
}

function pSaveSVG(dots, w, h) {
  if (!dots || !dots.length) {
    pStatusEl.textContent = 'нет точек для сохранения';
    return;
  }

  let paths = '';

  for (const d of dots) {
    if (!isFinite(d.x) || !isFinite(d.y) || !isFinite(d.r)) continue;

    if (pParams.dotMode === 'stroke') {
      paths += `<circle cx="${d.x.toFixed(2)}"
                        cy="${d.y.toFixed(2)}"
                        r="${Math.max(0.01, d.r).toFixed(2)}"
                        fill="none"
                        stroke="#000000"
                        stroke-width="${pParams.strokeW.toFixed(2)}"
                        stroke-opacity="${((d.alpha ?? 255) / 255).toFixed(3)}" />\n`;
    } else {
      paths += `<circle cx="${d.x.toFixed(2)}"
                        cy="${d.y.toFixed(2)}"
                        r="${Math.max(0.01, d.r).toFixed(2)}"
                        fill="#000000"
                        fill-opacity="${((d.alpha ?? 255) / 255).toFixed(3)}" />\n`;
    }
  }

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg"
          width="${w}"
          height="${h}"
          viewBox="0 0 ${w} ${h}">\n` +
    `${paths}` +
    `</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'am-0-transparent.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}



new p5(function(p) {
  p.setup = function() {
    const cnv = p.createCanvas(P_CANVAS_W, P_CANVAS_H);
    cnv.parent(photoStage);
    p.background(255);
    pUpdateModeButton();

    document.getElementById('p-fi').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);

      p.loadImage(url, function(loaded) {
        pImg = loaded;
        pImg.loadPixels();
        pBuildMasks();
        pNeedsRedraw = true;
        URL.revokeObjectURL(url);
      });
    });

    document.getElementById('p-regen').addEventListener('click', function() {
      if (pImg) pNeedsRedraw = true;
    });

    pModeToggleBtn.addEventListener('click', function() {
      pParams.dotMode = pParams.dotMode === 'fill' ? 'stroke' : 'fill';
      pUpdateModeButton();
      if (pAllDots.length > 0) pRedrawDotsPreview(p);
    });

    pSaveBtn.addEventListener('click', function() {
      if (pAllDots.length > 0) pSaveSVG(pAllDots, P_SVG_W, P_SVG_H);
    });

    ['edgeDots', 'fillDots', 'edgeThresh', 'blurR', 'dotSize'].forEach(function(id) {
      const el = document.getElementById('p-' + id), val = document.getElementById('p-' + id + 'V');
      el.addEventListener('input', function() {
        pParams[id] = parseFloat(el.value);
        val.textContent = el.value + (id === 'edgeThresh' ? '%' : (id === 'blurR' ? 'px' : ''));
        if ((id === 'edgeThresh' || id === 'blurR') && pImg) pBuildMasks();
        if (pImg) pNeedsRedraw = true;
      });
    });

    const strokeEl = document.getElementById('p-strokeW');
    const strokeVal = document.getElementById('p-strokeWV');
    strokeEl.addEventListener('input', function() {
      pParams.strokeW = parseFloat(strokeEl.value);
      strokeVal.textContent = strokeEl.value;
      if (pAllDots.length > 0) pRedrawDotsPreview(p);
    });
  };

  p.draw = function() {
    if (!pNeedsRedraw || !pEdgeCDF) return;

    pNeedsRedraw = false;
    pSaveBtn.disabled = true;
    pAllDots = [];

    setTimeout(function() {
      const edgeR = pParams.dotSize * 1.1 / 2;
      const edgeAlpha = 255;

      for (let k = 0; k < pParams.edgeDots; k++) {
        const idx = sampleCDF(pEdgeCDF), ix = idx % pIW, iy = Math.floor(idx / pIW);
        const xA5 = pFit.offsetX + ((ix + Math.random()) / pIW) * pFit.drawW;
        const yA5 = pFit.offsetY + ((iy + Math.random()) / pIH) * pFit.drawH;
        pAllDots.push({ x: xA5, y: yA5, r: edgeR, alpha: edgeAlpha });
      }

      if (pDarkCDF) {
        const fillR = pParams.dotSize * 0.75 / 2;
        const fillAlpha = 160;

        for (let k = 0; k < pParams.fillDots; k++) {
          const idx = sampleCDF(pDarkCDF), ix = idx % pIW, iy = Math.floor(idx / pIW);
          const xA5 = pFit.offsetX + ((ix + Math.random()) / pIW) * pFit.drawW;
          const yA5 = pFit.offsetY + ((iy + Math.random()) / pIH) * pFit.drawH;
          pAllDots.push({ x: xA5, y: yA5, r: fillR, alpha: fillAlpha });
        }
      }

      pRedrawDotsPreview(p);

      pStatusEl.textContent =
        'режим: ' + pParams.dotMode +
        ' · контур: ' + pParams.edgeDots +
        ' · заливка: ' + pParams.fillDots +
        ' · A5: ' + P_SVG_W + '×' + P_SVG_H;

      pSaveBtn.disabled = false;
    }, 10);
  };
});

