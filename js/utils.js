  function gaussianBlur(gray, w, h, radius) {
  if (radius <= 0) return gray;
  const sigma = Math.max(0.1, radius / 2);
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let ksum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    ksum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= ksum;

  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = 0; k < size; k++) {
        const xi = Math.min(w - 1, Math.max(0, x + k - radius));
        v += gray[row + xi] * kernel[k];
      }
      tmp[row + x] = v;
    }
  }

function sobelMag(gray, w, h) {
  const mag = new Float32Array(w * h);
  let mx = 0;
  for (let y = 1; y < h - 1; y++) {
    const yw = y * w;
    const ymw = (y - 1) * w;
    const ypw = (y + 1) * w;
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[ymw + x - 1], tc = gray[ymw + x], tr = gray[ymw + x + 1];
      const ml = gray[yw + x - 1], mr = gray[yw + x + 1];
      const bl = gray[ypw + x - 1], bc = gray[ypw + x], br = gray[ypw + x + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[yw + x] = m;
      if (m > mx) mx = m;
    }
  }
  if (mx > 0) {
    const inv = 1 / mx;
    for (let i = 0; i < mag.length; i++) mag[i] *= inv;
  }
  return mag;
}

function buildCDF(map) {
  let sum = 0;
  for (let i = 0; i < map.length; i++) sum += map[i];
  if (sum === 0) return null;
  const cdf = new Float64Array(map.length);
  let acc = 0;
  for (let i = 0; i < map.length; i++) {
    acc += map[i];
    cdf[i] = acc / sum;
  }
  return cdf;
}

function sampleCDF(cdf) {
  const r = Math.random();
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
