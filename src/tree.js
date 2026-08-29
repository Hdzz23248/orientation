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

  function makeBranch(record) {
    const rnd = mulberry32(hashString(record.id));
    return {
      id: record.id,
      city: record.city,
      attachT: 0.08 + rnd() * 0.8,
      side: rnd() < 0.5 ? -1 : 1,
      angle: Math.PI / 6 + rnd() * (Math.PI / 6), // 30°~60°
      lengthFactor: 0.58 + rnd() * 0.42,
      curve: 0.2 + rnd() * 0.4,
      phase: rnd() * Math.PI * 2,
      tipColor: TIP_DOT_COLORS[Math.floor(rnd() * TIP_DOT_COLORS.length)],
      tipSize: 6 + rnd() * 2, // 半径 6~8px → 直径 12~16px
      alpha: 0.65 + rnd() * 0.35,
      growth: 1,
      avatar: null,
      image: null,
    };
  }

  function updateRecords(records) {
    const byId = new Map(branches.map((branch) => [branch.id, branch]));
    const animateNew = initialized && !reducedMotion;
    initialized = true;
    branches = records.map((record) => {
      const existing = byId.get(record.id);
      if (existing) return existing;
      const branch = makeBranch(record);
      branch.growth = animateNew ? 0 : 1;
      return branch;
    });
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

    drawOrbit(now);
    drawTrunk();
    drawStream(now);
    branches.forEach((branch) => drawBranch(branch, now));
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

  return {
    updateRecords,
    bindAvatar,
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      frame = null;
      observer.disconnect();
      canvas.remove();
    },
  };
}
