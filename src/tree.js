import { prefersReducedMotion } from './utils.js';

// 主色调：极客蓝 + 电光青 + 星空白
const TIP_LINE_COLOR = { r: 0, g: 255, b: 136 }; // #00FF88 枝条末端
const BASE_COLOR = { r: 214, g: 242, b: 255 }; // 枝条近树干端（白/淡蓝）
const CYAN = { r: 0, g: 212, b: 255 }; // #00D4FF 极客蓝（青）
const BLUE_PURPLE = { r: 108, g: 92, b: 246 }; // 树干底部蓝紫
const TIP_DOT_COLORS = [
  { r: 59, g: 130, b: 246 }, // 蓝
  { r: 0, g: 212, b: 255 }, // 极客蓝
  { r: 45, g: 226, b: 255 }, // 青
  { r: 139, g: 92, b: 246 }, // 紫
  { r: 167, g: 139, b: 250 }, // 淡紫
  { r: 255, g: 255, b: 255 }, // 白
];

const GROW_DURATION = 720; // 单根枝条生长时长（毫秒）

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function displayProvinceName(name) {
  return String(name || '').replace(/(特别行政区|自治区|省)$/u, '');
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTree(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'tree-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const context = canvas.getContext('2d');
  const reducedMotion = prefersReducedMotion();

  let branches = [];
  let width = 0;
  let height = 0;
  let frame = null;
  let lastTime = performance.now();
  let initialized = false;
  let networkGroups = [];
  let networkProvinces = [];
  let hoveredProvince = null;
  let hoverAnchor = null;
  let hitRegions = [];
  let networkZoom = 1;
  let networkPanX = 0;
  let networkPanY = 0;
  let campusHoverProgress = 0;

  // 树干自然弯曲：固定侧弯（-1..1）
  const trunkSway = (Math.random() - 0.5) * 2;
  let trunkBaseX = 0;
  let trunkBaseY = 0;
  let trunkTopX = 0;
  let trunkTopY = 0;
  let trunkC1X = 0;
  let trunkC1Y = 0;
  let trunkC2X = 0;
  let trunkC2Y = 0;
  let trunkBaseWidth = 0;
  let trunkGeometry = [];

  // 树干表面向上流动的数据光点
  const streamParticles = Array.from({ length: 32 }, () => ({
    s: Math.random(),
    speed: 0.0006 + Math.random() * 0.0014,
    offset: (Math.random() - 0.5) * 2,
    size: 0.8 + Math.random() * 1.4,
    alpha: 0.3 + Math.random() * 0.5,
  }));

  // 树冠周围缓慢环绕的零星粒子
  const orbitParticles = Array.from({ length: 26 }, () => ({
    angle: Math.random() * Math.PI * 2,
    speed: 0.001 + Math.random() * 0.0025,
    rx: 0.3 + Math.random() * 0.45,
    ry: 0.3 + Math.random() * 0.45,
    size: 0.6 + Math.random() * 1.2,
    alpha: 0.2 + Math.random() * 0.4,
    color: TIP_DOT_COLORS[Math.floor(Math.random() * TIP_DOT_COLORS.length)],
  }));

  function computeTrunk() {
    trunkBaseX = width / 2;
    trunkBaseY = height - height * 0.02;
    trunkTopY = trunkBaseY - height * 0.46; // 树干更高，撑满盒子
    // 自然弯曲：三次贝塞尔，顶部明显侧弯 + 中部反向微弯形成 S 形
    trunkC1X = trunkBaseX + trunkSway * width * 0.05;
    trunkC1Y = trunkBaseY - height * 0.15;
    trunkC2X = trunkBaseX - trunkSway * width * 0.1;
    trunkC2Y = trunkBaseY - height * 0.31;
    trunkTopX = trunkBaseX + trunkSway * width * 0.12;
    trunkBaseWidth = Math.max(20, width * 0.03);

    const segments = 20;
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      points.push({ t, ...trunkPoint(t) });
    }
    trunkGeometry = points.map((p, i) => {
      const q = points[Math.min(i + 1, segments)];
      const r = points[Math.max(i - 1, 0)];
      const dx = q.x - r.x;
      const dy = q.y - r.y;
      const len = Math.hypot(dx, dy) || 1;
      return {
        x: p.x,
        y: p.y,
        nx: -dy / len,
        ny: dx / len,
        halfWidth: trunkBaseWidth * (1 - p.t * 0.6) / 2,
      };
    });
  }

  function trunkPoint(t) {
    const u = 1 - t;
    return {
      x: u * u * u * trunkBaseX + 3 * u * u * t * trunkC1X + 3 * u * t * t * trunkC2X + t * t * t * trunkTopX,
      y: u * u * u * trunkBaseY + 3 * u * u * t * trunkC1Y + 3 * u * t * t * trunkC2Y + t * t * t * trunkTopY,
    };
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    computeTrunk();
  }

  function makeBranch(record, layout = {}) {
    const rnd = mulberry32(hashString(record.id));
    return {
      id: record.id,
      province: record.province,
      city: record.city,
      attachT: layout.attachT ?? 0.2,
      side: layout.side ?? (rnd() < 0.5 ? -1 : 1),
      angle: Math.PI / 6 + rnd() * (Math.PI / 6), // 30°~60°
      lengthFactor: layout.lengthFactor ?? 0.68,
      curve: layout.curve ?? 0.12,
      phase: rnd() * Math.PI * 2,
      tipColor: TIP_DOT_COLORS[Math.floor(rnd() * TIP_DOT_COLORS.length)],
      tipSize: 6 + rnd() * 2, // 半径 6~8px → 直径 12~16px
      alpha: 0.65 + rnd() * 0.35,
      growth: 1,
      avatar: null,
      image: null,
    };
  }

  function branchLayout(index, total) {
    const side = index % 2 === 0 ? -1 : 1;
    const rank = Math.floor(index / 2);
    const sideCount = side < 0 ? Math.ceil(total / 2) : Math.floor(total / 2);
    const progress = sideCount <= 1 ? 0.45 : rank / (sideCount - 1);
    return {
      side,
      attachT: 0.2 + progress * 0.58,
      angle: 0.58 + progress * 0.22,
      lengthFactor: 0.78 - progress * 0.2,
      curve: 0.1 + progress * 0.06,
    };
  }

  function updateRecords(records) {
    const byId = new Map(branches.map((branch) => [branch.id, branch]));
    const animateNew = initialized && !reducedMotion;
    initialized = true;
    branches = records.map((record, index) => {
      const existing = byId.get(record.id);
      const layout = branchLayout(index, records.length);
      if (existing) {
        Object.assign(existing, layout);
        return existing;
      }
      const branch = makeBranch(record);
      Object.assign(branch, layout);
      branch.growth = animateNew ? 0 : 1;
      return branch;
    });

    const groups = new Map();
    branches.forEach((branch) => {
      const key = `${branch.province}::${branch.city}`;
      if (!groups.has(key)) groups.set(key, { key, province: branch.province, city: branch.city, records: [] });
      groups.get(key).records.push(branch);
    });
    networkGroups = [...groups.values()];
    const provinces = new Map();
    networkGroups.forEach((group) => {
      if (!provinces.has(group.province)) provinces.set(group.province, []);
      provinces.get(group.province).push(group);
    });
    networkProvinces = [...provinces.entries()].map(([name, groups]) => ({
      name,
      groups,
      reveal: 0,
      countReveal: 0,
      displayedCount: 0,
    }));
  }

  function bindAvatar(recordId, imageDataUrl) {
    const branch = branches.find((item) => item.id === recordId);
    if (!branch) return;
    const image = new Image();
    image.onload = () => {
      branch.avatar = imageDataUrl;
      branch.image = image;
    };
    image.src = imageDataUrl;
  }

  function branchPoints(branch) {
    const attach = trunkPoint(branch.attachT);
    const dirX = branch.side * Math.sin(branch.angle);
    const dirY = -Math.cos(branch.angle);
    const baseLength = Math.min(width, height) * 0.72;
    const length = baseLength * branch.lengthFactor;
    const fullTipX = clamp(attach.x + dirX * length, width * 0.05, width * 0.95);
    const fullTipY = clamp(attach.y + dirY * length, height * 0.04, height * 0.88);

    const growth = branch.growth;
    const tipX = attach.x + (fullTipX - attach.x) * growth;
    const tipY = attach.y + (fullTipY - attach.y) * growth;

    const midX = (attach.x + tipX) / 2;
    const midY = (attach.y + tipY) / 2;
    const dx = tipX - attach.x;
    const dy = tipY - attach.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bend = branch.curve * len * branch.side;

    return {
      ax: attach.x,
      ay: attach.y,
      cx: midX + nx * bend,
      cy: midY + ny * bend,
      tx: tipX,
      ty: tipY,
    };
  }

  function drawTrunk() {
    context.save();
    context.lineJoin = 'round';
    const gradient = context.createLinearGradient(0, trunkTopY, 0, trunkBaseY);
    gradient.addColorStop(0, rgba(CYAN, 0.8)); // 顶部青
    gradient.addColorStop(1, rgba(BLUE_PURPLE, 0.9)); // 底部蓝紫

    context.shadowBlur = 22;
    context.shadowColor = rgba(CYAN, 0.4);
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(trunkGeometry[0].x + trunkGeometry[0].nx * trunkGeometry[0].halfWidth, trunkGeometry[0].y + trunkGeometry[0].ny * trunkGeometry[0].halfWidth);
    for (const p of trunkGeometry) {
      context.lineTo(p.x + p.nx * p.halfWidth, p.y + p.ny * p.halfWidth);
    }
    for (let i = trunkGeometry.length - 1; i >= 0; i -= 1) {
      const p = trunkGeometry[i];
      context.lineTo(p.x - p.nx * p.halfWidth, p.y - p.ny * p.halfWidth);
    }
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawStream(now) {
    streamParticles.forEach((p) => {
      if (!reducedMotion) {
        p.s += p.speed;
        if (p.s > 1) {
          p.s = 0;
          p.offset = (Math.random() - 0.5) * 2;
        }
      }
      const pt = trunkPoint(p.s);
      const halfWidth = trunkBaseWidth * (1 - p.s * 0.6) / 2;
      context.fillStyle = rgba(CYAN, p.alpha);
      context.beginPath();
      context.arc(pt.x + p.offset * halfWidth, pt.y, p.size, 0, Math.PI * 2);
      context.fill();
    });
  }

  function drawOrbit(now) {
    const cx = width / 2;
    const cy = height * 0.38;
    const rx = width * 0.4;
    const ry = height * 0.32;
    orbitParticles.forEach((p) => {
      if (!reducedMotion) p.angle += p.speed;
      const x = cx + Math.cos(p.angle) * rx * p.rx;
      const y = cy + Math.sin(p.angle) * ry * p.ry;
      context.fillStyle = rgba(p.color, p.alpha);
      context.beginPath();
      context.arc(x, y, p.size, 0, Math.PI * 2);
      context.fill();
    });
  }

  function drawBranch(branch, now) {
    if (branch.growth <= 0) return;
    const { ax, ay, cx, cy, tx, ty } = branchPoints(branch);
    const growth = branch.growth;

    context.save();
    context.lineCap = 'round';

    // 发光描边（宽而淡的光晕）
    context.strokeStyle = rgba(TIP_LINE_COLOR, 0.08 + 0.1 * growth);
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(ax, ay);
    context.quadraticCurveTo(cx, cy, tx, ty);
    context.stroke();

    // 主枝条：渐变（近树干白/淡蓝 → 末端 #00FF88）
    const gradient = context.createLinearGradient(ax, ay, tx, ty);
    gradient.addColorStop(0, rgba(BASE_COLOR, 0.82 * branch.alpha));
    gradient.addColorStop(1, rgba(TIP_LINE_COLOR, 0.95 * branch.alpha));
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(1.2, 2.2 * (1 - growth * 0.4));
    context.beginPath();
    context.moveTo(ax, ay);
    context.quadraticCurveTo(cx, cy, tx, ty);
    context.stroke();

    context.restore();

    drawTip(branch, tx, ty, now);
  }

  function drawTip(branch, x, y, now) {
    const breath = 0.5 + 0.5 * Math.sin(now * 0.0016 + branch.phase);
    let labelOffset;

    if (branch.image) {
      const radius = Math.max(15, width * 0.028) * (1 + 0.05 * breath);
      labelOffset = radius + 6;
      context.save();
      context.shadowBlur = 16;
      context.shadowColor = rgba(branch.tipColor, 0.7);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = '#071120';
      context.fill();
      context.clip();
      context.drawImage(branch.image, x - radius, y - radius, radius * 2, radius * 2);
      context.restore();
      context.save();
      context.strokeStyle = rgba(branch.tipColor, 0.9);
      context.lineWidth = 1.6;
      context.shadowBlur = 10;
      context.shadowColor = rgba(branch.tipColor, 0.7);
      context.beginPath();
      context.arc(x, y, radius + 1.5, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    } else {
      // 呼吸光点：大小与亮度缓慢脉动
      const radius = branch.tipSize * (0.85 + 0.3 * breath);
      labelOffset = radius + 9;
      context.save();
      context.fillStyle = rgba(branch.tipColor, 0.15 * (0.5 + breath));
      context.beginPath();
      context.arc(x, y, radius * 2.4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = rgba(branch.tipColor, 0.55 * (0.5 + breath));
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgba(255, 255, 255, ${0.8 + 0.2 * breath})`;
      context.beginPath();
      context.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    drawLabel(branch, x, y - labelOffset);
  }

  function drawLabel(branch, x, y) {
    if (!branch.city) return;
    context.save();
    context.font = '12px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.shadowBlur = 6;
    context.shadowColor = rgba(branch.tipColor, 0.85);
    context.fillStyle = rgba(branch.tipColor, 0.95);
    context.fillText(branch.city, x, y);
    context.restore();
  }

  function drawCenterBall(cx, cy, now) {
    const coreR = 13 + campusHoverProgress * 4;
    const outerR = coreR + 24;
    const breath = 0.5 + 0.5 * Math.sin(now * 0.0018);

    context.save();

    // 外层光晕（呼吸脉动，蓝色）
    const halo = context.createRadialGradient(cx, cy, coreR * 0.4, cx, cy, outerR + 14);
    halo.addColorStop(0, `rgba(90, 150, 255, ${0.32 + breath * 0.14})`);
    halo.addColorStop(0.5, `rgba(45, 110, 255, ${0.16 + breath * 0.08})`);
    halo.addColorStop(1, 'rgba(45, 110, 255, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(cx, cy, outerR + 14, 0, Math.PI * 2);
    context.fill();

    // 球体核心（蓝色径向渐变 + 强发光）
    const core = context.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.35, 0, cx, cy, coreR);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.3, '#dbe9ff');
    core.addColorStop(0.65, '#4a8dff');
    core.addColorStop(1, '#1246a6');
    context.shadowBlur = 30;
    context.shadowColor = 'rgba(61, 123, 255, 0.95)';
    context.fillStyle = core;
    context.beginPath();
    context.arc(cx, cy, coreR, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }

  function drawNetwork(now) {
    const provinceCount = networkProvinces.length;
    const maxCities = networkProvinces.reduce((max, province) => Math.max(max, province.groups.length), 0);
    const focusedProvince = networkProvinces.find((province) => province.name === hoveredProvince);
    const crowdZoom = clamp(
      1 - Math.max(0, maxCities - 3) * 0.045 - Math.max(0, provinceCount - 10) * 0.018,
      0.58,
      1,
    );
    const campusFocused = hoveredProvince === '__campus__';
    campusHoverProgress += ((campusFocused ? 1 : 0) - campusHoverProgress) * 0.14;
    const targetZoom = clamp(crowdZoom * (campusFocused ? 1.12 : focusedProvince ? 1.22 : 1), 0.7, 1.25);
    const focusAngle = focusedProvince?.angle ?? 0;
    const baseRadius = Math.min(width, height) * 0.32;
    const graphScale = 1.5;
    const provinceNodeRadius = clamp(11 - Math.max(0, provinceCount - 12) * 0.1, 7.5, 11);
    const focusRadiusFactor = focusedProvince?.radiusFactor ?? 1;
    const targetPanX = focusedProvince && hoverAnchor
      ? (hoverAnchor.x - width / 2) / graphScale - Math.cos(focusAngle) * baseRadius * focusRadiusFactor * targetZoom
      : 0;
    const targetPanY = focusedProvince && hoverAnchor
      ? (hoverAnchor.y - height / 2) / graphScale - Math.sin(focusAngle) * baseRadius * focusRadiusFactor * targetZoom
      : 0;
    networkZoom += (targetZoom - networkZoom) * 0.12;
    networkPanX += (targetPanX - networkPanX) * 0.12;
    networkPanY += (targetPanY - networkPanY) * 0.12;
    const centerX = width / 2 + networkPanX;
    const centerY = height / 2 + networkPanY;
    const provinceRadius = Math.min(width, height) * 0.32 * networkZoom;
    const projectPoint = (x, y) => ({
      x: width / 2 + (x - width / 2) * graphScale,
      y: height / 2 + (y - height / 2) * graphScale,
    });
    const positions = new Map();
    const cityPositions = new Map();
    hitRegions = [];
    const projectedCenter = projectPoint(centerX, centerY);
    hitRegions.push({ name: '__campus__', x: projectedCenter.x, y: projectedCenter.y, radius: 42 * graphScale });

    context.save();
    context.translate(width / 2, height / 2);
    context.scale(graphScale, graphScale);
    context.translate(-width / 2, -height / 2);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    networkProvinces.forEach((province, provinceIndex) => {
      const baseAngle = -Math.PI / 2 + (Math.PI * 2 * provinceIndex) / Math.max(1, provinceCount);
      const jitter = Math.min(0.12, (Math.PI * 2 / Math.max(1, provinceCount)) * 0.18);
      const angle = baseAngle + Math.sin((provinceIndex + 1) * 2.17) * jitter;
      const radius = provinceRadius * (0.92 + Math.sin((provinceIndex + 1) * 1.63) * 0.07);
      province.angle = angle;
      province.radiusFactor = radius / provinceRadius;
      positions.set(province.name, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        angle,
        side: Math.cos(angle) >= 0 ? 1 : -1,
      });
      const provincePoint = projectPoint(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      hitRegions.push({ name: province.name, x: provincePoint.x, y: provincePoint.y, radius: (provinceNodeRadius + 10) * graphScale });
    });

    // Draw links first so nodes remain crisp and readable above the network.
    networkProvinces.forEach((province) => {
      const provincePosition = positions.get(province.name);
      const targetReveal = hoveredProvince === province.name ? 1 : 0;
      province.reveal += (targetReveal - province.reveal) * 0.16;
      const citySpread = (0.04 + Math.min(0.2, 0.16 + province.groups.length * 0.012)) * province.reveal + 0.025;
      const expandedRadius = provinceRadius + Math.min(110, Math.min(width, height) * 0.18);
      const currentCityRadius = provinceRadius + 18 + (expandedRadius - provinceRadius - 18) * province.reveal;
      province.groups.forEach((group, cityIndex) => {
        const cityAngle = provincePosition.angle + (cityIndex - (province.groups.length - 1) / 2) * citySpread;
        const citySide = Math.cos(cityAngle) >= 0 ? 1 : -1;
        let cityX = centerX + Math.cos(cityAngle) * currentCityRadius;
        let cityY = centerY + Math.sin(cityAngle) * currentCityRadius;
        const screenPoint = projectPoint(cityX, cityY);
        // 按文字实际宽度动态预留文字侧边距，避免城市名超出盒子
        context.font = '400 10px "PingFang SC", "Microsoft YaHei", sans-serif';
        const sideMargin = (14 + context.measureText(`${group.city} · ${group.records.length}`).width) * graphScale + 12;
        const minX = citySide < 0 ? sideMargin : 18;
        const maxX = citySide > 0 ? width - sideMargin : width - 18;
        screenPoint.x = clamp(screenPoint.x, minX, maxX);
        screenPoint.y = clamp(screenPoint.y, 20, height - 20);
        cityX = width / 2 + (screenPoint.x - width / 2) / graphScale;
        cityY = height / 2 + (screenPoint.y - height / 2) / graphScale;
        cityPositions.set(group.key, { x: cityX, y: cityY, side: citySide });
        const representative = group.records.find((record) => record.image) || group.records[group.records.length - 1];
        const growth = representative?.growth ?? 1;
        const alpha = clamp(growth, 0, 1);
        context.strokeStyle = `rgba(86, 221, 255, ${0.16 + alpha * 0.28})`;
        context.lineWidth = 0.9;
        context.beginPath();
        context.moveTo(cityX, cityY);
        context.bezierCurveTo((cityX + provincePosition.x) / 2, cityY, (cityX + provincePosition.x) / 2, provincePosition.y, provincePosition.x, provincePosition.y);
        context.stroke();

      });
      const representative = province.groups.at(-1)?.records.at(-1);
      const alpha = clamp(representative?.growth ?? 1, 0, 1);
      context.strokeStyle = `rgba(45, 226, 255, ${0.2 + alpha * 0.3})`;
      context.lineWidth = 1.1;
      context.beginPath();
      context.moveTo(provincePosition.x, provincePosition.y);
      context.lineTo(centerX, centerY);
      context.stroke();
    });

    // Province and city nodes.
    networkProvinces.forEach((province) => {
      const provincePosition = positions.get(province.name);
      const isHovered = hoveredProvince === province.name;
      context.fillStyle = isHovered ? 'rgba(45, 226, 255, 0.32)' : 'rgba(45, 226, 255, 0.14)';
      context.shadowBlur = isHovered ? 18 : 0;
      context.shadowColor = '#2de2ff';
      context.beginPath();
      context.arc(provincePosition.x, provincePosition.y, provinceNodeRadius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = '#2de2ff';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = '#dffaff';
      context.font = '500 10px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.textAlign = provincePosition.side < 0 ? 'left' : 'right';
      context.textBaseline = 'middle';
      const provinceTotal = province.groups.reduce((total, group) => total + group.records.length, 0);
      province.countReveal += ((campusFocused ? 1 : 0) - province.countReveal) * 0.14;
      province.displayedCount += (provinceTotal - province.displayedCount) * 0.16;
      const provinceLabel = displayProvinceName(province.name);
      const labelX = provincePosition.x + Math.cos(provincePosition.angle) * (provinceNodeRadius + 7);
      const labelY = provincePosition.y + Math.sin(provincePosition.angle) * (provinceNodeRadius + 7);
      context.fillText(
        provinceLabel,
        labelX,
        labelY,
      );
      if (province.countReveal > 0.01) {
        context.save();
        context.globalAlpha = province.countReveal;
        context.fillStyle = '#9dffd2';
        context.font = '400 10px "PingFang SC", "Microsoft YaHei", sans-serif';
        context.textAlign = provincePosition.side < 0 ? 'left' : 'right';
        const labelWidth = context.measureText(provinceLabel).width;
        context.fillText(
          `${Math.round(province.displayedCount)}`,
          labelX + (provincePosition.side < 0 ? labelWidth + 4 : -labelWidth - 4),
          labelY,
        );
        context.restore();
      }

      province.groups.forEach((group, cityIndex) => {
        if (province.reveal < 0.08) return;
        const cityPosition = cityPositions.get(group.key);
        const cityX = cityPosition.x;
        const cityY = cityPosition.y;
        const representative = group.records.find((record) => record.image) || group.records[group.records.length - 1];
        const pulse = 0.7 + Math.sin(now * 0.002 + cityIndex) * 0.12;
        const radius = representative?.image ? 13 : 7;
        context.fillStyle = representative?.image ? '#071120' : 'rgba(0, 255, 136, 0.72)';
        context.shadowBlur = 12;
        context.shadowColor = '#00ff88';
        context.beginPath();
        context.arc(cityX, cityY, radius * pulse, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        if (representative?.image) {
          context.save();
          context.beginPath();
          context.arc(cityX, cityY, radius * pulse, 0, Math.PI * 2);
          context.clip();
          context.drawImage(representative.image, cityX - radius, cityY - radius, radius * 2, radius * 2);
          context.restore();
        }
        context.fillStyle = '#9dffd2';
        context.font = '400 10px "PingFang SC", "Microsoft YaHei", sans-serif';
        context.textAlign = cityPosition.side < 0 ? 'right' : 'left';
        context.textBaseline = 'middle';
        const labelAlpha = clamp((province.reveal - 0.08) / 0.42, 0, 1);
        if (labelAlpha > 0) {
          context.save();
          context.globalAlpha = labelAlpha;
          context.fillText(`${group.city} · ${group.records.length}`, cityX + (cityPosition.side < 0 ? -14 : 14), cityY);
          context.restore();
        }
      });
    });

    // 四周省份按逆时针依次向中心发射携带 0/1 的光点
    const travelDuration = 5000;
    const inwardProvinces = networkProvinces.slice().sort((a, b) => (b.angle - a.angle));
    context.save();
    context.lineCap = 'round';
    inwardProvinces.forEach((province, i) => {
      const position = positions.get(province.name);
      if (!position) return;
      const phase = i / Math.max(1, inwardProvinces.length);
      const t = ((now / travelDuration) + phase) % 1;
      const fromX = position.x;
      const fromY = position.y;
      const dotX = fromX + (centerX - fromX) * t;
      const dotY = fromY + (centerY - fromY) * t;
      // 拖尾
      const trailT = Math.max(0, t - 0.14);
      context.strokeStyle = 'rgba(90, 170, 255, 0.32)';
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(fromX + (centerX - fromX) * trailT, fromY + (centerY - fromY) * trailT);
      context.lineTo(dotX, dotY);
      context.stroke();
      // 随机携带 0 或 1 的光球
      const cycle = Math.floor(now / travelDuration + phase);
      const bit = hashString(`${i}-${cycle}`) % 2 === 0 ? '0' : '1';
      context.shadowBlur = 10;
      context.shadowColor = 'rgba(90, 170, 255, 0.9)';
      context.fillStyle = 'rgba(210, 240, 255, 0.95)';
      context.font = '700 8px ui-monospace, SFMono-Regular, Consolas, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(bit, dotX, dotY);
    });
    context.shadowBlur = 0;
    context.restore();

    // 目的地：关系网络中心的蓝色光球
    drawCenterBall(centerX, centerY, now);
    context.fillStyle = '#edfaff';
    context.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText('川农信工 · 雅安', centerX, centerY + 56);
    context.restore();
  }

  function draw(now) {
    context.clearRect(0, 0, width, height);
    const delta = Math.min(50, now - lastTime);
    lastTime = now;

    if (!reducedMotion) {
      branches.forEach((branch) => {
        if (branch.growth < 1) {
          branch.growth = Math.min(1, branch.growth + delta / GROW_DURATION);
        }
      });
    }

    drawNetwork(now);
  }

  function loop(now) {
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (frame) return;
    frame = requestAnimationFrame(loop);
  }

  resize();
  start();
  const observer = new ResizeObserver(() => resize());
  observer.observe(container);

  function updateHover(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitRegions.find((region) => Math.hypot(region.x - x, region.y - y) <= region.radius);
    const next = hit?.name || null;
    if (next !== hoveredProvince) {
      hoveredProvince = next;
      hoverAnchor = hit ? { x: hit.x, y: hit.y } : null;
      canvas.style.cursor = next ? 'pointer' : 'default';
    }
  }

  canvas.addEventListener('pointermove', updateHover, { passive: true });
  canvas.addEventListener('pointerleave', () => {
    hoveredProvince = null;
    hoverAnchor = null;
    canvas.style.cursor = 'default';
  });

  return {
    updateRecords,
    bindAvatar,
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      frame = null;
      observer.disconnect();
      canvas.removeEventListener('pointermove', updateHover);
      canvas.remove();
    },
  };
}
