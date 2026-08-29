import { Avatar, Style } from '@dicebear/core';
import pixelArtDefinition from '@dicebear/styles/pixel-art.json' with { type: 'json' };

export const MANUAL_AVATAR_SEEDS = [
  'sicau-01', 'sicau-02', 'sicau-03', 'sicau-04',
  'sicau-05', 'sicau-06', 'sicau-07', 'sicau-08',
];

export const AVATAR_THEMES = Object.freeze({
  blue: { label: '深海蓝', color: '#3b82f6', background: '#0b1d48' },
  cyan: { label: '霓虹青', color: '#2de2ff', background: '#063744' },
  purple: { label: '星云紫', color: '#8b5cf6', background: '#25134f' },
  green: { label: '矩阵绿', color: '#4ade80', background: '#0b382d' },
});

export const AVATAR_ACCESSORIES = Object.freeze({
  none: '无配件',
  glasses: '科技眼镜',
  headset: '耳机',
});

const pixelArtStyle = new Style(pixelArtDefinition);
const ACCESSORY_URLS = {
  glasses: `${import.meta.env.BASE_URL}assets/avatar/cyber-glasses.svg`,
  headset: `${import.meta.env.BASE_URL}assets/avatar/headset.svg`,
};

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = source;
  });
}

async function readBitmap(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob);
    } catch {
      // 某些浏览器对特定 JPEG 编码支持不完整，继续使用 Image 回退。
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareSelfie(fileOrBlob) {
  if (!(fileOrBlob instanceof Blob)) throw new Error('请选择有效照片');
  if (!['image/jpeg', 'image/png'].includes(fileOrBlob.type)) throw new Error('请选择 JPG 或 PNG 格式照片');
  const source = await readBitmap(fileOrBlob);
  try {
    const width = source.width;
    const height = source.height;
    if (!width || !height) throw new Error('图片尺寸无效');
    const side = Math.min(width, height);
    const sourceX = (width - side) / 2;
    const sourceY = (height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#07111f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, sourceX, sourceY, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    source.close?.();
  }
}

export function createManualAvatar(seed, backgroundColor = '#063744') {
  if (!MANUAL_AVATAR_SEEDS.includes(seed)) throw new Error('无效的基础形象');
  const avatar = new Avatar(pixelArtStyle, {
    seed,
    size: 768,
    backgroundColor: [backgroundColor.replace('#', '')],
  });
  const svg = avatar.toString();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function drawGrid(context, size, color) {
  context.save();
  context.strokeStyle = color;
  context.globalAlpha = 0.1;
  context.lineWidth = 1;
  for (let position = 0; position <= size; position += 48) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }
  context.restore();
}

function drawCircuitCorners(context, color) {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.globalAlpha = 0.8;
  context.lineWidth = 5;
  const paths = [
    [[72, 160], [72, 88], [164, 88], [190, 62]],
    [[696, 160], [696, 88], [604, 88], [578, 62]],
    [[72, 608], [72, 680], [164, 680], [190, 706]],
    [[696, 608], [696, 680], [604, 680], [578, 706]],
  ];
  paths.forEach((points) => {
    context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.stroke();
    const [x, y] = points.at(-1);
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

async function drawAccessory(context, accessory, color) {
  if (accessory === 'none') return;
  const source = ACCESSORY_URLS[accessory];
  if (!source) throw new Error('无效的头像配件');
  const image = await loadImage(source);
  const layer = document.createElement('canvas');
  layer.width = 768;
  layer.height = 768;
  const layerContext = layer.getContext('2d');
  if (accessory === 'glasses') layerContext.drawImage(image, 130, 244, 508, 152);
  else layerContext.drawImage(image, 134, 30, 500, 500);
  layerContext.globalCompositeOperation = 'source-in';
  layerContext.fillStyle = color;
  layerContext.fillRect(0, 0, 768, 768);
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 18;
  context.drawImage(layer, 0, 0);
  context.restore();
}

export async function composeAvatar({ baseImageDataUrl, theme = 'cyan', accessory = 'none' }) {
  if (typeof baseImageDataUrl !== 'string' || !baseImageDataUrl.startsWith('data:image/')) {
    throw new Error('缺少基础头像');
  }
  const themeConfig = AVATAR_THEMES[theme];
  if (!themeConfig) throw new Error('无效的头像主题');
  if (!(accessory in AVATAR_ACCESSORIES)) throw new Error('无效的头像配件');

  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(384, 340, 60, 384, 384, 530);
  gradient.addColorStop(0, themeConfig.background);
  gradient.addColorStop(0.56, '#071526');
  gradient.addColorStop(1, '#020611');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 768, 768);
  drawGrid(context, 768, themeConfig.color);

  const image = await loadImage(baseImageDataUrl);
  context.save();
  context.beginPath();
  context.arc(384, 360, 274, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, 110, 86, 548, 548);
  context.restore();

  context.save();
  context.strokeStyle = themeConfig.color;
  context.lineWidth = 9;
  context.shadowColor = themeConfig.color;
  context.shadowBlur = 28;
  context.beginPath();
  context.arc(384, 360, 282, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.42;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(384, 360, 304, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  drawCircuitCorners(context, themeConfig.color);
  await drawAccessory(context, accessory, themeConfig.color);

  const overlay = context.createLinearGradient(0, 610, 0, 768);
  overlay.addColorStop(0, 'rgba(2,6,17,0)');
  overlay.addColorStop(1, 'rgba(2,6,17,.92)');
  context.fillStyle = overlay;
  context.fillRect(0, 580, 768, 188);
  context.fillStyle = '#edfaff';
  context.font = '600 22px "Microsoft YaHei", sans-serif';
  context.fillText('SICAU · 信息工程学院', 54, 710);
  context.fillStyle = themeConfig.color;
  context.fillRect(54, 728, 240, 4);
  context.fillStyle = 'rgba(237,250,255,.62)';
  context.font = '16px ui-monospace, monospace';
  context.fillText('WELCOME / DIGITAL IDENTITY', 54, 754);
  return canvas.toDataURL('image/png');
}

export function downloadAvatar(imageDataUrl) {
  const link = document.createElement('a');
  link.href = imageDataUrl;
  link.download = `sicau-avatar-${Date.now()}.png`;
  link.click();
}
