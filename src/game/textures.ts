import * as THREE from 'three';

export interface TextureBundle {
  tileAlbedo: THREE.CanvasTexture;
  tileBump: THREE.CanvasTexture;
  tileRoughness: THREE.CanvasTexture;
  wallAlbedo: THREE.CanvasTexture;
  wallBump: THREE.CanvasTexture;
  concreteAlbedo: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  cautionAlbedo: THREE.CanvasTexture;
  metalAlbedo: THREE.CanvasTexture;
  metalBump: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  woodRoughness: THREE.CanvasTexture;
  ceilingAlbedo: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  monsterSkin: THREE.CanvasTexture;
  monsterBump: THREE.CanvasTexture;
  monsterNormal: THREE.CanvasTexture;
  monsterRoughness: THREE.CanvasTexture;
  monsterEye: THREE.CanvasTexture;
  setAnisotropy: (maxAniso: number) => void;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAniso: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAniso: number, compact = false): TextureBundle {
  const aniso = Math.min(compact ? 4 : 8, Math.max(1, maxAniso));
  const texSize = compact ? 256 : 512;
  const texScale = texSize / 512;

  // 1. Ceramic Pool Tile Albedo + Bump + Roughness (512 desktop / 256 compact)
  const [tileCanvas, tCtx] = makeCanvas(texSize);
  const [bumpCanvas, bCtx] = makeCanvas(texSize);
  const [roughCanvas, rCtx] = makeCanvas(texSize);

  tCtx.fillStyle = '#475457'; // dark mineral grout
  tCtx.fillRect(0, 0, texSize, texSize);
  bCtx.fillStyle = '#242424'; // deeply recessed grout
  bCtx.fillRect(0, 0, texSize, texSize);
  rCtx.fillStyle = '#d6d6d6'; // matte rough grout
  rCtx.fillRect(0, 0, texSize, texSize);

  const cells = 8;
  const step = texSize / cells;
  const gap = 4.5 * texScale;

  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const x = col * step + gap * 0.5;
      const y = row * step + gap * 0.5;
      const w = step - gap;
      const h = step - gap;

      // Natural porcelain tone variance + damp teal cast
      const shade = 158 + Math.floor(Math.sin(row * 13.7 + col * 7.3) * 14);
      const blueShift = Math.floor(Math.cos(row * 5.1 - col * 9.7) * 7);
      const grad = tCtx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, `rgb(${shade - 6}, ${shade + 7}, ${shade + 11 + blueShift})`);
      grad.addColorStop(1, `rgb(${shade - 15}, ${shade - 2}, ${shade + 3 + blueShift})`);
      tCtx.fillStyle = grad;
      tCtx.fillRect(x, y, w, h);

      // Glazed bevel rim (3D light catch on tile shoulders)
      tCtx.strokeStyle = 'rgba(235, 248, 250, 0.34)';
      tCtx.lineWidth = Math.max(1, 1.8 * texScale);
      tCtx.strokeRect(x + texScale, y + texScale, w - 2 * texScale, h - 2 * texScale);
      tCtx.strokeStyle = 'rgba(28, 38, 40, 0.25)';
      tCtx.lineWidth = Math.max(0.75, texScale);
      tCtx.strokeRect(x + 0.5 * texScale, y + 0.5 * texScale, w - texScale, h - texScale);

      // Bump: smooth raised glazed tile face with softly chamfered edge
      bCtx.fillStyle = '#8e8e8e';
      bCtx.fillRect(x, y, w, h);
      bCtx.fillStyle = '#e6e6e6';
      bCtx.fillRect(x + 2 * texScale, y + 2 * texScale, w - 4 * texScale, h - 4 * texScale);

      // Roughness: wet/dry puddles & slick ceramic glaze contrast
      const puddle = Math.sin(row * 2.7 + col * 4.3) * 0.5 + 0.5;
      const roughVal = Math.round(42 + puddle * 52);
      rCtx.fillStyle = `rgb(${roughVal},${roughVal},${roughVal})`;
      rCtx.fillRect(x, y, w, h);
    }
  }

  // Organic damp calcification & water-ring blotches across tiles
  const blotchCount = compact ? 42 : 65;
  for (let i = 0; i < blotchCount; i++) {
    const gx = ((i * 97) % 512) * texScale;
    const gy = ((i * 53) % 512) * texScale;
    const gr = (14 + (i % 34)) * texScale;
    const g2 = tCtx.createRadialGradient(gx, gy, 2 * texScale, gx, gy, gr);
    g2.addColorStop(0, i % 3 === 0 ? 'rgba(28, 42, 44, 0.16)' : 'rgba(205, 222, 225, 0.1)');
    g2.addColorStop(1, 'rgba(38, 52, 54, 0)');
    tCtx.fillStyle = g2;
    tCtx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);

    if (i % 2 === 0) {
      const rg = rCtx.createRadialGradient(gx, gy, 2 * texScale, gx, gy, gr);
      rg.addColorStop(0, 'rgba(28, 28, 28, 0.45)');
      rg.addColorStop(1, 'rgba(28, 28, 28, 0)');
      rCtx.fillStyle = rg;
      rCtx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
  }

  // 2. Wall Larger Ceramic Masonry Tile Albedo + Bump (512 desktop / 256 compact)
  const [wallCanvas, wCtx] = makeCanvas(texSize);
  const [wallBumpCanvas, wbCtx] = makeCanvas(texSize);
  wCtx.fillStyle = '#404c50';
  wCtx.fillRect(0, 0, texSize, texSize);
  wbCtx.fillStyle = '#252525';
  wbCtx.fillRect(0, 0, texSize, texSize);

  const wCols = 4;
  const wRows = 8;
  const wW = texSize / wCols;
  const wH = texSize / wRows;
  for (let r = 0; r < wRows; r++) {
    for (let c = 0; c < wCols; c++) {
      const offset = (r % 2) * (wW * 0.5);
      const x = (c * wW + offset) % texSize;
      const v = 132 + Math.floor(Math.sin(r * 9.3 + c * 4.7) * 12);
      const drawWallBrick = (bx: number) => {
        const g = wCtx.createLinearGradient(bx, r * wH, bx, r * wH + wH);
        g.addColorStop(0, `rgb(${v - 4}, ${v + 6}, ${v + 10})`);
        g.addColorStop(1, `rgb(${v - 14}, ${v - 2}, ${v + 2})`);
        wCtx.fillStyle = g;
        wCtx.fillRect(bx + 2 * texScale, r * wH + 2 * texScale, wW - 4 * texScale, wH - 4 * texScale);
        wCtx.strokeStyle = 'rgba(220, 236, 240, 0.2)';
        wCtx.lineWidth = Math.max(1, 1.5 * texScale);
        wCtx.strokeRect(bx + 3 * texScale, r * wH + 3 * texScale, wW - 6 * texScale, wH - 6 * texScale);

        wbCtx.fillStyle = '#909090';
        wbCtx.fillRect(bx + 2 * texScale, r * wH + 2 * texScale, wW - 4 * texScale, wH - 4 * texScale);
        wbCtx.fillStyle = '#e0e0e0';
        wbCtx.fillRect(bx + 4 * texScale, r * wH + 4 * texScale, wW - 8 * texScale, wH - 8 * texScale);
      };
      drawWallBrick(x);
      if (x + wW > texSize) drawWallBrick(x - texSize);
    }
  }
  // Damp mineral water-line staining & vertical drip streaks
  const dampStart = 260 * texScale;
  const dampGrad = wCtx.createLinearGradient(0, dampStart, 0, texSize);
  dampGrad.addColorStop(0, 'rgba(20, 32, 35, 0)');
  dampGrad.addColorStop(1, 'rgba(15, 24, 26, 0.42)');
  wCtx.fillStyle = dampGrad;
  wCtx.fillRect(0, dampStart, texSize, texSize - dampStart);
  for (let i = 0; i < 24; i++) {
    const sx = ((i * 41 + 13) % 512) * texScale;
    const sg = wCtx.createLinearGradient(sx, 0, sx, texSize);
    sg.addColorStop(0, 'rgba(18, 28, 30, 0)');
    sg.addColorStop(0.5, 'rgba(18, 28, 30, 0.12)');
    sg.addColorStop(1, 'rgba(12, 20, 22, 0.25)');
    wCtx.fillStyle = sg;
    wCtx.fillRect(sx, 0, (4 + (i % 5)) * texScale, texSize);
  }

  // 3. Architectural Cast Concrete Albedo + Bump (512 desktop / 256 compact)
  const [concCanvas, cCtx] = makeCanvas(texSize);
  const [concBumpCanvas, cbCtx] = makeCanvas(texSize);
  cCtx.fillStyle = '#6c767a';
  cCtx.fillRect(0, 0, texSize, texSize);
  cbCtx.fillStyle = '#8a8a8a';
  cbCtx.fillRect(0, 0, texSize, texSize);

  const concSpecks = compact ? 2200 : 4200;
  for (let i = 0; i < concSpecks; i++) {
    const px = ((i * 73) % 512) * texScale;
    const py = ((i * 139) % 512) * texScale;
    const sz = (2 + (i % 4)) * texScale;
    const v = 82 + ((i * 29) % 52);
    cCtx.fillStyle = `rgba(${v}, ${v + 5}, ${v + 7}, 0.28)`;
    cCtx.fillRect(px, py, sz, sz);
    const bv = 105 + ((i * 37) % 60);
    cbCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.45)`;
    cbCtx.fillRect(px, py, sz, sz);
  }
  // Formwork panel seams & tie-rod dimples
  cCtx.strokeStyle = 'rgba(26, 34, 36, 0.36)';
  cCtx.lineWidth = Math.max(1.5, 3 * texScale);
  cbCtx.strokeStyle = '#363636';
  cbCtx.lineWidth = Math.max(2, 4 * texScale);
  for (const pos of [0, texSize * 0.5]) {
    cCtx.beginPath();
    cCtx.moveTo(0, pos);
    cCtx.lineTo(texSize, pos);
    cCtx.moveTo(pos, 0);
    cCtx.lineTo(pos, texSize);
    cCtx.stroke();

    cbCtx.beginPath();
    cbCtx.moveTo(0, pos);
    cbCtx.lineTo(texSize, pos);
    cbCtx.moveTo(pos, 0);
    cbCtx.lineTo(pos, texSize);
    cbCtx.stroke();
  }
  const tieRadius = 5 * texScale;
  for (const ty of [64 * texScale, 192 * texScale, 320 * texScale, 448 * texScale]) {
    for (const tx of [64 * texScale, 192 * texScale, 320 * texScale, 448 * texScale]) {
      cCtx.fillStyle = 'rgba(30, 38, 40, 0.45)';
      cCtx.beginPath();
      cCtx.arc(tx, ty, tieRadius, 0, Math.PI * 2);
      cCtx.fill();
      cbCtx.fillStyle = '#202020';
      cbCtx.beginPath();
      cbCtx.arc(tx, ty, tieRadius, 0, Math.PI * 2);
      cbCtx.fill();
    }
  }

  // 4. Industrial Caution Deck Trim (512 desktop / 256 compact)
  const [cautCanvas, caCtx] = makeCanvas(texSize);
  caCtx.fillStyle = '#7e888c';
  caCtx.fillRect(0, 0, texSize, texSize);
  caCtx.fillStyle = '#232a2d';
  const cStep = 64 * texScale;
  const cSpan = 1024 * texScale;
  for (let i = -texSize; i < cSpan; i += cStep) {
    caCtx.beginPath();
    caCtx.moveTo(i, 0);
    caCtx.lineTo(i + 32 * texScale, 0);
    caCtx.lineTo(i - 48 * texScale, 92 * texScale);
    caCtx.lineTo(i - 80 * texScale, 92 * texScale);
    caCtx.closePath();
    caCtx.fill();
  }
  caCtx.fillStyle = '#c29834';
  caCtx.fillRect(0, 0, texSize, 22 * texScale);
  caCtx.fillStyle = '#232a2d';
  caCtx.fillRect(0, 90 * texScale, texSize, 6 * texScale);
  // Perforated industrial deck panels
  caCtx.strokeStyle = '#3f4a4d';
  caCtx.lineWidth = Math.max(2, 4 * texScale);
  const deckStart = 96 * texScale;
  const deckStep = 128 * texScale;
  for (let i = 0; i <= texSize; i += deckStep) {
    caCtx.beginPath();
    caCtx.moveTo(i, deckStart);
    caCtx.lineTo(i, texSize);
    caCtx.stroke();
    caCtx.beginPath();
    caCtx.moveTo(0, Math.max(deckStart, i));
    caCtx.lineTo(texSize, Math.max(deckStart, i));
    caCtx.stroke();
  }

  // 5. Diamond-Plate / Brushed Stainless Catwalk Metal Albedo + Bump (256x256)
  const [metalCanvas, mCtx] = makeCanvas(256);
  const [metalBumpCanvas, mbCtx] = makeCanvas(256);
  mCtx.fillStyle = '#a7b5b9';
  mCtx.fillRect(0, 0, 256, 256);
  mbCtx.fillStyle = '#707070';
  mbCtx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    const lum = 158 + Math.floor(Math.sin(y * 0.9) * 16);
    mCtx.fillStyle = `rgb(${lum}, ${lum + 6}, ${lum + 10})`;
    mCtx.fillRect(0, y, 256, 1);
  }
  // Raised non-slip diamond tread lozenges
  const stepM = 32;
  for (let y = 0; y < 256; y += stepM) {
    for (let x = 0; x < 256; x += stepM) {
      const horiz = ((x / stepM + y / stepM) & 1) === 0;
      const cx = x + stepM * 0.5;
      const cy = y + stepM * 0.5;
      mCtx.save();
      mCtx.translate(cx, cy);
      mCtx.rotate(horiz ? Math.PI / 4 : -Math.PI / 4);
      mCtx.fillStyle = 'rgba(220, 232, 236, 0.36)';
      mCtx.fillRect(-8, -2.5, 16, 5);
      mCtx.restore();

      mbCtx.save();
      mbCtx.translate(cx, cy);
      mbCtx.rotate(horiz ? Math.PI / 4 : -Math.PI / 4);
      mbCtx.fillStyle = '#f0f0f0';
      mbCtx.fillRect(-8, -2.5, 16, 5);
      mbCtx.restore();
    }
  }

  // 6. Ceiling Acoustic / Concrete Coffer Grid (256x256)
  const [ceilCanvas, ceCtx] = makeCanvas(256);
  ceCtx.fillStyle = '#3d474a';
  ceCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      ceCtx.fillStyle = '#475256';
      ceCtx.fillRect(x + 4, y + 4, 56, 56);
      ceCtx.strokeStyle = '#262e31';
      ceCtx.lineWidth = 4;
      ceCtx.strokeRect(x + 2, y + 2, 60, 60);
    }
  }

  // 7. Procedural Water Normal Map (512 desktop / 256 compact)
  const wnSize = compact ? 256 : 512;
  const wnTauStep = (Math.PI * 2) / wnSize;
  const [wnCanvas, wnCtx] = makeCanvas(wnSize);
  const imgData = wnCtx.createImageData(wnSize, wnSize);
  const data = imgData.data;
  for (let y = 0; y < wnSize; y++) {
    const v = y * wnTauStep;
    const rowOff = y * wnSize;
    for (let x = 0; x < wnSize; x++) {
      const u = x * wnTauStep;
      const dx =
        Math.cos(u * 3 + v * 2) * 0.38 +
        Math.cos(u * 7 - v * 5) * 0.24 +
        Math.sin(u * 13 + v * 9) * 0.14 +
        Math.cos(u * 21 - v * 17) * 0.08;
      const dy =
        Math.sin(u * 2 - v * 4) * 0.38 +
        Math.cos(u * 5 + v * 8) * 0.24 +
        Math.cos(u * 11 - v * 13) * 0.14 +
        Math.sin(u * 19 + v * 23) * 0.08;
      const idx = (rowOff + x) * 4;
      data[idx] = Math.floor((dx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((dy * 0.5 + 0.5) * 255);
      data[idx + 2] = 242;
      data[idx + 3] = 255;
    }
  }
  wnCtx.putImageData(imgData, 0, 0);

  // 8. AAA Giant Sea Serpent PBR Albedo, Tangent-Space Normal & Wet Roughness Maps
  // UV convention on continuous body:
  //   u = 0.0 / 1.0 -> dorsal spine ridge (top)
  //   u = 0.25 / 0.75 -> muscular lateral flanks
  //   u = 0.5 -> ventral belly scutes (underside)
  const monSize = compact ? 384 : 512;
  const [monCanvas, monCtx] = makeCanvas(monSize);
  const [monBumpCanvas, monBumpCtx] = makeCanvas(monSize);
  const [monNormalCanvas, monNormalCtx] = makeCanvas(monSize);
  const [monRoughCanvas, monRoughCtx] = makeCanvas(monSize);

  const heightField = new Float32Array(monSize * monSize);
  const monAlbedoData = monCtx.createImageData(monSize, monSize);
  const monBumpData = monBumpCtx.createImageData(monSize, monSize);
  const monRoughData = monRoughCtx.createImageData(monSize, monSize);
  const aPix = monAlbedoData.data;
  const bPix = monBumpData.data;
  const rPix = monRoughData.data;
  const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0);

  // Deterministic fast 2D hash / value noise for organic skin mottling & micro-pores
  const hash2 = (ix: number, iy: number): number => {
    let n = (ix * 374761393 + iy * 668265263) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  };
  const smoothNoise = (x: number, y: number, periodX: number, periodY: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % periodX) + periodX) % periodX;
    const x1 = (x0 + 1) % periodX;
    const y0 = ((iy % periodY) + periodY) % periodY;
    const y1 = (y0 + 1) % periodY;
    const a = hash2(x0, y0);
    const b = hash2(x1, y0);
    const c = hash2(x0, y1);
    const d = hash2(x1, y1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (u: number, v: number, baseFreqX: number, baseFreqY: number): number => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < 4; o++) {
      const px = baseFreqX * freq;
      const py = baseFreqY * freq;
      sum += amp * smoothNoise(u * px, v * py, px, py);
      amp *= 0.5;
      freq *= 2;
    }
    return sum;
  };

  // Pre-generate healed biological scars & barnacle/calcification flecks (in UV space)
  const scars = [
    { u: 0.22, v: 0.18, du: 0.07, dv: 0.04, w: 0.0055 },
    { u: 0.77, v: 0.34, du: -0.06, dv: 0.055, w: 0.005 },
    { u: 0.19, v: 0.62, du: 0.05, dv: -0.035, w: 0.0045 },
    { u: 0.82, v: 0.78, du: -0.07, dv: -0.04, w: 0.006 },
    { u: 0.31, v: 0.48, du: 0.04, dv: 0.06, w: 0.004 },
  ];

  const scaleCols = 44;
  const scaleRows = 54;
  const bellyPlateRows = 48;
  const invMonSize = 1 / monSize;
  const scarMeta = scars.map((sc) => ({
    ...sc,
    len2: sc.du * sc.du + sc.dv * sc.dv,
    vMin: Math.min(sc.v, sc.v + sc.dv) - sc.w * 1.5,
    vMax: Math.max(sc.v, sc.v + sc.dv) + sc.w * 1.5,
  }));
  const activeScars: typeof scarMeta = [];

  for (let py = 0; py < monSize; py++) {
    const v = py * invMonSize;
    const rowOff = py * monSize;
    const rowF = v * scaleRows;
    const rowI = Math.floor(rowF);
    const colShift = (rowI & 1) * 0.5;
    activeScars.length = 0;
    for (let s = 0; s < scarMeta.length; s++) {
      const sc = scarMeta[s];
      if (v >= sc.vMin && v <= sc.vMax) activeScars.push(sc);
    }

    for (let px = 0; px < monSize; px++) {
      const u = px * invMonSize;
      const idx = rowOff + px;
      const p4 = idx * 4;

      // Distance from ventral belly centerline (u = 0.5)
      const bellyDist = Math.abs(u - 0.5);
      // Belly zone smoothly blends from u=[0.39..0.61]
      const bellyMask = Math.max(0, Math.min(1, (0.145 - bellyDist) / 0.045));
      const dorsalFactor = Math.cos(u * Math.PI * 2) * 0.5 + 0.5; // 1 at dorsal u=0/1, 0 at belly u=0.5

      // Organic mottled noise + dark pelagic vertical predator banding
      const nLow = fbm(u, v, 8, 8);
      const nHigh = fbm(u, v, 32, 32);
      const bandWave = Math.sin(v * Math.PI * 10 + (nLow - 0.5) * 3.2) * 0.5 + 0.5;
      const lateralLineDist = Math.min(Math.abs(u - 0.23), Math.abs(u - 0.77));
      const lateralLine = Math.exp(-(lateralLineDist * lateralLineDist) / 0.00028);

      // 1) Keeled overlapping diamond/hexagonal scales
      const colF = u * scaleCols + colShift;
      const colI = Math.floor(colF);

      // Check nearest staggered scale centers to get crisp overlapping tile relief
      let bestScaleDist = 99;
      let bestLx = 0;
      let bestLy = 0;
      let bestSeed = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = rowI + dr;
        const rShift = (rr & 1) * 0.5;
        const wr = ((rr % scaleRows) + scaleRows) % scaleRows;
        const ly = rowF - (rr + 0.5);
        const shieldW = 0.56 - Math.max(0, ly) * 0.22;
        const invShieldW = 1 / shieldW;
        const lyMetric = Math.abs(ly) * 0.92;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = colI + dc;
          const lx = colF - (cc + 0.5 - rShift + colShift);
          const d = Math.abs(lx) * invShieldW + lyMetric;
          if (d < bestScaleDist) {
            bestScaleDist = d;
            bestLx = lx;
            bestLy = ly;
            const wc = ((cc % scaleCols) + scaleCols) % scaleCols;
            bestSeed = hash2(wc, wr);
          }
        }
      }

      // Scale crown height + prominent central longitudinal keel
      const edgeFalloff = Math.max(0, Math.min(1, (0.98 - bestScaleDist) / 0.26));
      const crownDome = Math.sqrt(edgeFalloff);
      const keel =
        Math.exp(-(bestLx * bestLx) / 0.011) *
        Math.max(0, 1 - Math.abs(bestLy) * 1.45) *
        edgeFalloff;
      const scaleMicro = (nHigh - 0.5) * 0.09;
      const scaleHeight = Math.max(0, Math.min(1, crownDome * 0.68 + keel * 0.34 + scaleMicro));

      // 2) Broad overlapping ventral belly plates (gastrosteges)
      const plateCoord = v * bellyPlateRows + (nLow - 0.5) * 0.22;
      const platePhase = plateCoord - Math.floor(plateCoord);
      const plateGroove = Math.min(platePhase, 1 - platePhase);
      const bellyPlateH =
        Math.sqrt(Math.max(0, Math.min(1, plateGroove / 0.14))) * 0.72 +
        (1 - platePhase) * 0.14 +
        (nHigh - 0.5) * 0.06;

      // Blend dorsal/flank scales with ventral plates
      let h = scaleHeight * (1 - bellyMask) + bellyPlateH * bellyMask;

      // Subtle biological scars (recessed pale scar lines)
      let scarAmount = 0;
      for (let s = 0; s < activeScars.length; s++) {
        const sc = activeScars[s];
        const rx = u - sc.u;
        const ry = v - sc.v;
        const t = Math.max(0, Math.min(1, (rx * sc.du + ry * sc.dv) / sc.len2));
        const pxS = rx - sc.du * t;
        const pyS = ry - sc.dv * t;
        const distSq = pxS * pxS + pyS * pyS;
        const taper = Math.sin(t * Math.PI);
        const w = sc.w * (0.35 + 0.65 * taper);
        if (distSq < w * w) {
          const k = 1 - Math.sqrt(distSq) / w;
          scarAmount = Math.max(scarAmount, k * taper);
        }
      }
      h = Math.max(0.02, h - scarAmount * 0.38);

      heightField[idx] = h;

      // Albedo color calculation: dark abyssal slate-teal dorsal -> mottled olive-slate flanks -> pale scarred belly
      const jitter = (bestSeed - 0.5) * 14 + (nHigh - 0.5) * 16;
      const pocketDark = 0.34 + 0.66 * Math.min(1, edgeFalloff * 1.15);

      // Dorsal / flank base color
      const bandTint = (bandWave - 0.5) * 16;
      let rCol = (18 + (1 - dorsalFactor) * 24 + bandTint * 0.7 + jitter) * pocketDark;
      let gCol = (34 + (1 - dorsalFactor) * 32 + bandTint * 0.95 + jitter * 1.1) * pocketDark;
      let bCol = (38 + (1 - dorsalFactor) * 28 + bandTint * 0.85 + jitter) * pocketDark;

      // Subtle keel highlight & lateral sensory pores
      rCol += keel * 14 - lateralLine * 9;
      gCol += keel * 20 - lateralLine * 12;
      bCol += keel * 19 - lateralLine * 10;

      // Calcified mineral speckles / biological imperfections on older scales
      if (bestSeed > 0.94 && edgeFalloff > 0.45 && dorsalFactor > 0.35) {
        const speck = (bestSeed - 0.94) * 16;
        rCol += speck * 48;
        gCol += speck * 52;
        bCol += speck * 46;
      }

      // Belly scute coloration (pale weathered grey-olive / bone-slate)
      const bellyGrooveDark = 0.55 + 0.45 * Math.min(1, plateGroove / 0.12);
      const bellyR = (76 + (nLow - 0.5) * 24 + (nHigh - 0.5) * 14) * bellyGrooveDark;
      const bellyG = (90 + (nLow - 0.5) * 26 + (nHigh - 0.5) * 14) * bellyGrooveDark;
      const bellyB = (86 + (nLow - 0.5) * 22 + (nHigh - 0.5) * 12) * bellyGrooveDark;

      rCol = rCol * (1 - bellyMask) + bellyR * bellyMask;
      gCol = gCol * (1 - bellyMask) + bellyG * bellyMask;
      bCol = bCol * (1 - bellyMask) + bellyB * bellyMask;

      // Healed pale scar tissue tint
      if (scarAmount > 0.01) {
        rCol = rCol * (1 - scarAmount * 0.7) + 112 * (scarAmount * 0.7);
        gCol = gCol * (1 - scarAmount * 0.7) + 104 * (scarAmount * 0.7);
        bCol = bCol * (1 - scarAmount * 0.7) + 98 * (scarAmount * 0.7);
      }

      aPix[p4] = clampByte(rCol);
      aPix[p4 + 1] = clampByte(gCol);
      aPix[p4 + 2] = clampByte(bCol);
      aPix[p4 + 3] = 255;

      const bVal = clampByte(h * 255);
      bPix[p4] = bVal;
      bPix[p4 + 1] = bVal;
      bPix[p4 + 2] = bVal;
      bPix[p4 + 3] = 255;

      // Wet skin roughness: glossy scale crowns (~36 = 0.14 roughness), slightly matte scale pockets (~148)
      const wetCrown = (1 - edgeFalloff) * (1 - bellyMask) * 98;
      const scarMatte = scarAmount * 85;
      const roughRaw = (42 + wetCrown + scarMatte + (nHigh - 0.5) * 28 + bellyMask * 22) | 0;
      const roughVal = roughRaw < 26 ? 26 : roughRaw > 210 ? 210 : roughRaw;
      rPix[p4] = roughVal;
      rPix[p4 + 1] = roughVal;
      rPix[p4 + 2] = roughVal;
      rPix[p4 + 3] = 255;
    }
  }
  monCtx.putImageData(monAlbedoData, 0, 0);
  monBumpCtx.putImageData(monBumpData, 0, 0);
  monRoughCtx.putImageData(monRoughData, 0, 0);

  // Convert heightField -> Seamless Tangent-Space Normal Map via Sobel gradients
  const monNormalData = monNormalCtx.createImageData(monSize, monSize);
  const nPix = monNormalData.data;
  const normalStrength = 4.6;
  const monMask = monSize - 1;
  for (let py = 0; py < monSize; py++) {
    const pyU = (py - 1 + monSize) % monSize;
    const pyD = (py + 1) % monSize;
    const rowU = pyU * monSize;
    const rowC = py * monSize;
    const rowD = pyD * monSize;
    for (let px = 0; px < monSize; px++) {
      const pxL = (px - 1 + monSize) % monSize;
      const pxR = (px + 1) % monSize;
      const tl = heightField[rowU + pxL];
      const t = heightField[rowU + px];
      const tr = heightField[rowU + pxR];
      const l = heightField[rowC + pxL];
      const r = heightField[rowC + pxR];
      const bl = heightField[rowD + pxL];
      const b = heightField[rowD + px];
      const br = heightField[rowD + pxR];

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * normalStrength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * normalStrength;
      const nx = -dX;
      const ny = -dY;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1);

      const p4 = (rowC + px) * 4;
      nPix[p4] = clampByte((nx * invLen * 0.5 + 0.5) * 255);
      nPix[p4 + 1] = clampByte((ny * invLen * 0.5 + 0.5) * 255);
      nPix[p4 + 2] = clampByte((invLen * 0.5 + 0.5) * 255);
      nPix[p4 + 3] = 255;
    }
  }
  void monMask;
  monNormalCtx.putImageData(monNormalData, 0, 0);

  // 9. Realistic Reptilian Predator Eye Texture (512x512 Sclera + Fibrous Amber Iris + Vertical Slit Pupil)
  const [eyeCanvas, eyeCtx] = makeCanvas(512);
  const ecx = 256;
  const ecy = 256;

  // Dark bloodshot smoky-ochre sclera base
  const scleraGrad = eyeCtx.createRadialGradient(ecx, ecy, 60, ecx, ecy, 256);
  scleraGrad.addColorStop(0, '#5a3f18');
  scleraGrad.addColorStop(0.62, '#2d261a');
  scleraGrad.addColorStop(0.85, '#3b1815');
  scleraGrad.addColorStop(1, '#180a09');
  eyeCtx.fillStyle = scleraGrad;
  eyeCtx.fillRect(0, 0, 512, 512);

  // Fine dark blood vessels in outer sclera
  for (let i = 0; i < 42; i++) {
    const ang = (i / 42) * Math.PI * 2 + Math.sin(i * 3.1) * 0.08;
    eyeCtx.strokeStyle = i % 2 === 0 ? 'rgba(95, 18, 16, 0.55)' : 'rgba(42, 12, 10, 0.45)';
    eyeCtx.lineWidth = 1.2 + (i % 3) * 0.7;
    eyeCtx.beginPath();
    let r = 245;
    eyeCtx.moveTo(ecx + Math.cos(ang) * r, ecy + Math.sin(ang) * r);
    for (let step = 0; step < 5; step++) {
      r -= 24;
      const jitterAng = ang + Math.sin(i * 7 + step * 2.3) * 0.09;
      eyeCtx.lineTo(ecx + Math.cos(jitterAng) * r, ecy + Math.sin(jitterAng) * r);
    }
    eyeCtx.stroke();
  }

  // Iris disc with dark limbal ring
  const irisR = 138;
  const irisBase = eyeCtx.createRadialGradient(ecx, ecy, 18, ecx, ecy, irisR);
  irisBase.addColorStop(0, '#ffe07d');
  irisBase.addColorStop(0.28, '#e39a24');
  irisBase.addColorStop(0.7, '#9e4e0e');
  irisBase.addColorStop(0.92, '#3a1b08');
  irisBase.addColorStop(1, '#090706');
  eyeCtx.fillStyle = irisBase;
  eyeCtx.beginPath();
  eyeCtx.arc(ecx, ecy, irisR, 0, Math.PI * 2);
  eyeCtx.fill();

  // Intricate radial collagen fibers in the reptilian iris
  for (let i = 0; i < 180; i++) {
    const ang = (i / 180) * Math.PI * 2;
    const r0 = 24 + (i % 7) * 3;
    const r1 = irisR - 8 - ((i * 5) % 18);
    eyeCtx.strokeStyle =
      i % 3 === 0
        ? 'rgba(255, 226, 132, 0.34)'
        : i % 3 === 1
          ? 'rgba(72, 24, 6, 0.38)'
          : 'rgba(218, 134, 28, 0.28)';
    eyeCtx.lineWidth = 1 + (i % 2) * 0.8;
    eyeCtx.beginPath();
    eyeCtx.moveTo(ecx + Math.cos(ang) * r0, ecy + Math.sin(ang) * r0);
    eyeCtx.lineTo(
      ecx + Math.cos(ang + Math.sin(i) * 0.03) * r1,
      ecy + Math.sin(ang + Math.sin(i) * 0.03) * r1
    );
    eyeCtx.stroke();
  }

  // Razor-sharp vertical viper slit pupil
  eyeCtx.fillStyle = '#020203';
  eyeCtx.beginPath();
  eyeCtx.moveTo(ecx, ecy - 108);
  eyeCtx.bezierCurveTo(ecx + 32, ecy - 45, ecx + 32, ecy + 45, ecx, ecy + 108);
  eyeCtx.bezierCurveTo(ecx - 32, ecy + 45, ecx - 32, ecy - 45, ecx, ecy - 108);
  eyeCtx.closePath();
  eyeCtx.fill();

  // Subtle amber tapetum catchlight rim around slit
  eyeCtx.strokeStyle = 'rgba(255, 212, 92, 0.55)';
  eyeCtx.lineWidth = 2.2;
  eyeCtx.stroke();

  // 9. Procedural PBR Weathered Dock Timber Planks (384x384 desktop / 256x256 compact)
  const woodSize = compact ? 256 : 384;
  const invWoodSize = 1 / woodSize;
  const [woodCanvas, woodCtx] = makeCanvas(woodSize);
  const [woodBumpCanvas, woodBumpCtx] = makeCanvas(woodSize);
  const [woodRoughCanvas, woodRoughCtx] = makeCanvas(woodSize);

  const woodAlbData = woodCtx.createImageData(woodSize, woodSize);
  const woodBmpData = woodBumpCtx.createImageData(woodSize, woodSize);
  const woodRghData = woodRoughCtx.createImageData(woodSize, woodSize);
  const wA = woodAlbData.data;
  const wB = woodBmpData.data;
  const wR = woodRghData.data;

  const plankCount = 8;
  const plankPx = woodSize / plankCount;
  const invPlankCount = 1 / plankCount;
  const nailScale = woodSize / 512;
  const nailOuter = 3.4 * nailScale;
  const invNailRamp = 1 / (1.4 * nailScale);
  // Deterministic staggered end-butt joints & knot locations per plank
  const plankJoints = [0.28, 0.64, 0.14, 0.78, 0.44, 0.86, 0.35, 0.57];
  const plankKnots = [
    { u: 0.72, vLocal: 0.45, r: 0.032 },
    { u: 0.22, vLocal: 0.62, r: 0.026 },
    { u: 0.56, vLocal: 0.38, r: 0.036 },
    { u: 0.18, vLocal: 0.52, r: 0.024 },
    { u: 0.81, vLocal: 0.42, r: 0.03 },
    { u: 0.41, vLocal: 0.65, r: 0.028 },
    { u: 0.68, vLocal: 0.35, r: 0.025 },
    { u: 0.15, vLocal: 0.58, r: 0.033 },
  ];

  for (let py = 0; py < woodSize; py++) {
    const v = py * invWoodSize;
    const rowOff = py * woodSize;
    const plankIdx = Math.floor(py / plankPx);
    const localY = (py % plankPx) / plankPx; // 0..1 across plank width
    const jointU = plankJoints[plankIdx % plankCount];
    const nailTargetU1 = (jointU + 0.028) % 1;
    const nailTargetU2 = (jointU - 0.028 + 1) % 1;
    const knot = plankKnots[plankIdx % plankCount];
    const dvKnot = (localY - knot.vLocal) * invPlankCount;
    const invKnotVar = 1 / (knot.r * knot.r * 1.8);
    const invKnotCore = 1 / (knot.r * 0.58);
    const nailV = Math.min(Math.abs(localY - 0.28), Math.abs(localY - 0.72));
    const nearNailRow = nailV * plankPx < nailOuter;
    const tone0 = 0.86 + hash2(plankIdx, plankIdx * 3) * 0.26;
    const tone1 = 0.86 + hash2(plankIdx + 13, plankIdx * 3) * 0.26;

    // Longitudinal chamfer & recessed dark gap between planks
    const edgeDistY = Math.min(localY, 1 - localY);
    const seamMaskY = Math.min(1, Math.max(0, (edgeDistY - 0.028) / 0.055));

    for (let px = 0; px < woodSize; px++) {
      const u = px * invWoodSize;
      const p4 = (rowOff + px) * 4;

      // Board segment variation split at end-butt joint
      const distJoint = Math.min(Math.abs(u - jointU), 1 - Math.abs(u - jointU));
      const seamMaskX = Math.min(1, Math.max(0, (distJoint - 0.005) / 0.014));
      const boardSide = u < jointU ? 0 : 1;
      const boardSeed = plankIdx * 7 + boardSide * 3.1;
      const boardTone = boardSide === 0 ? tone0 : tone1;

      // End-butt joint nail pairs (galvanized weathered iron fasteners)
      let nailMask = 0;
      if (nearNailRow) {
        const nailDistU1 = Math.min(Math.abs(u - nailTargetU1), 1 - Math.abs(u - nailTargetU1));
        const nailDistU2 = Math.min(Math.abs(u - nailTargetU2), 1 - Math.abs(u - nailTargetU2));
        const nailU = Math.min(nailDistU1, nailDistU2);
        const nailR = Math.hypot(nailU * woodSize, nailV * plankPx);
        nailMask = Math.max(0, Math.min(1, (nailOuter - nailR) * invNailRamp));
      }

      // Growth-ring distortion around knot
      let duKnot = u - knot.u;
      if (duKnot > 0.5) duKnot -= 1;
      if (duKnot < -0.5) duKnot += 1;
      const knotDist = Math.hypot(duKnot * 0.42, dvKnot * 2.1);
      const knotInfluence = Math.exp(-(knotDist * knotDist) * invKnotVar);
      const knotCenter = Math.max(0, 1 - knotDist * invKnotCore);

      // Multi-octave wood fiber grain flowing along U with organic warp
      const warp = fbm((u + boardSeed * 0.17) % 1, v, 4, 16) * 0.48;
      const ringCoord =
        (localY + boardSeed * 0.31) * 9.5 +
        warp * 4.2 +
        knotInfluence * 3.4 +
        fbm(u, v, 16, 48) * 1.1;
      const ringWave = 0.5 + 0.5 * Math.sin(ringCoord * Math.PI * 2);
      const fineFiber = fbm(u, v, 4, 96);
      const grain = ringWave * 0.58 + fineFiber * 0.42;

      // Subtle damp water-stain & weathered algae darkening near plank joints
      const dampNoise = fbm(u, v, 6, 6);
      const dampFactor = Math.max(0, Math.min(1, (dampNoise - 0.38) * 1.8));
      const plankSeam = Math.min(seamMaskX, seamMaskY);

      // Rich weathered dock cedar/oak timber color
      let r = (138 + grain * 44 - knotCenter * 52) * boardTone;
      let g = (98 + grain * 33 - knotCenter * 42) * boardTone;
      let b = (66 + grain * 23 - knotCenter * 30) * boardTone;

      // Damp patina / mineral darkening
      r *= 1 - dampFactor * 0.22;
      g *= 1 - dampFactor * 0.18;
      b *= 1 - dampFactor * 0.16;

      // Deep dark recessed seams between planks
      const seamShade = 0.22 + 0.78 * plankSeam;
      r *= seamShade;
      g *= seamShade;
      b *= seamShade;

      // Galvanized iron nail heads
      if (nailMask > 0.01) {
        r = r * (1 - nailMask) + 84 * nailMask;
        g = g * (1 - nailMask) + 88 * nailMask;
        b = b * (1 - nailMask) + 92 * nailMask;
      }

      wA[p4] = Math.max(0, Math.min(255, Math.round(r)));
      wA[p4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
      wA[p4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
      wA[p4 + 3] = 255;

      // Bump: recessed plank gaps, carved fiber striations, chamfered edges, inset nails
      const bumpVal =
        (32 + (140 + grain * 78 - knotCenter * 24) * plankSeam) * (1 - nailMask * 0.35) +
        nailMask * 165;
      const bByte = Math.max(0, Math.min(255, Math.round(bumpVal)));
      wB[p4] = bByte;
      wB[p4 + 1] = bByte;
      wB[p4 + 2] = bByte;
      wB[p4 + 3] = 255;

      // Roughness: weathered dry fibers (~175) vs damp water-stained wood (~95) & recessed seams (~228)
      const roughVal =
        (178 - grain * 28 - dampFactor * 56) * plankSeam +
        228 * (1 - plankSeam) -
        nailMask * 70;
      const rByte = Math.max(40, Math.min(245, Math.round(roughVal)));
      wR[p4] = rByte;
      wR[p4 + 1] = rByte;
      wR[p4 + 2] = rByte;
      wR[p4 + 3] = 255;
    }
  }

  woodCtx.putImageData(woodAlbData, 0, 0);
  woodBumpCtx.putImageData(woodBmpData, 0, 0);
  woodRoughCtx.putImageData(woodRghData, 0, 0);

  const tileAlbedo = configureTexture(tileCanvas, true, 1, 1, aniso);
  const tileBump = configureTexture(bumpCanvas, false, 1, 1, aniso);
  const tileRoughness = configureTexture(roughCanvas, false, 1, 1, aniso);
  const wallAlbedo = configureTexture(wallCanvas, true, 1, 1, aniso);
  const wallBump = configureTexture(wallBumpCanvas, false, 1, 1, aniso);
  const concreteAlbedo = configureTexture(concCanvas, true, 1, 1, aniso);
  const concreteBump = configureTexture(concBumpCanvas, false, 1, 1, aniso);
  const cautionAlbedo = configureTexture(cautCanvas, true, 1, 1, aniso);
  const metalAlbedo = configureTexture(metalCanvas, true, 1, 1, aniso);
  const metalBump = configureTexture(metalBumpCanvas, false, 1, 1, aniso);
  const woodAlbedo = configureTexture(woodCanvas, true, 1, 1, aniso);
  const woodBump = configureTexture(woodBumpCanvas, false, 1, 1, aniso);
  const woodRoughness = configureTexture(woodRoughCanvas, false, 1, 1, aniso);
  const ceilingAlbedo = configureTexture(ceilCanvas, true, 4, 4, aniso);
  const waterNormal = configureTexture(wnCanvas, false, 8, 8, aniso);
  const monsterSkin = configureTexture(monCanvas, true, 1, 7, aniso);
  const monsterBump = configureTexture(monBumpCanvas, false, 1, 7, aniso);
  const monsterNormal = configureTexture(monNormalCanvas, false, 1, 7, aniso);
  const monsterRoughness = configureTexture(monRoughCanvas, false, 1, 7, aniso);
  const monsterEye = configureTexture(eyeCanvas, true, 1, 1, aniso);
  monsterEye.wrapS = THREE.ClampToEdgeWrapping;
  monsterEye.wrapT = THREE.ClampToEdgeWrapping;

  const all = [
    tileAlbedo,
    tileBump,
    tileRoughness,
    wallAlbedo,
    wallBump,
    concreteAlbedo,
    concreteBump,
    cautionAlbedo,
    metalAlbedo,
    metalBump,
    woodAlbedo,
    woodBump,
    woodRoughness,
    ceilingAlbedo,
    waterNormal,
    monsterSkin,
    monsterBump,
    monsterNormal,
    monsterRoughness,
    monsterEye,
  ];

  return {
    tileAlbedo,
    tileBump,
    tileRoughness,
    wallAlbedo,
    wallBump,
    concreteAlbedo,
    concreteBump,
    cautionAlbedo,
    metalAlbedo,
    metalBump,
    woodAlbedo,
    woodBump,
    woodRoughness,
    ceilingAlbedo,
    waterNormal,
    monsterSkin,
    monsterBump,
    monsterNormal,
    monsterRoughness,
    monsterEye,
    setAnisotropy: (targetAniso: number) => {
      const clamped = Math.min(8, Math.max(1, targetAniso));
      for (let i = 0; i < all.length; i++) {
        all[i].anisotropy = clamped;
      }
    },
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}
