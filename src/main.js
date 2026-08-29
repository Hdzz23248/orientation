import './styles.css';
import cities from './data/cities.json';
import { createAvatarController } from './avatar-controller.js';
import { downloadAvatar } from './avatar-image.js';
import { ANIMATION, APP_STATES, CAMPUS, COPY, ROUTE_COLORS } from './config.js';
import { createMapChart } from './map-chart.js';
import { createTree } from './tree.js';
import {
  appendRecord,
  clearRecords,
  exportRecords,
  getStorageWarning,
  importRecords,
  loadRecords,
  saveRecords,
  undoLastRecord,
} from './storage.js';
import {
  createCitySearch,
  createResultController,
  initRankingTabs,
  showToast,
  triggerArrivalBurst,
  updateStatistics,
} from './ui.js';
import { calculateDistanceKm, createRecordId, formatLocation, wait } from './utils.js';

const elements = {
  generateButton: document.querySelector('#generate-btn'),
  generateText: document.querySelector('#generate-btn-text'),
  selectedCard: document.querySelector('#selected-city'),
  selectedName: document.querySelector('#selected-city-name'),
  selectedCoord: document.querySelector('#selected-city-coord'),
  status: document.querySelector('#status-text'),
  adminOverlay: document.querySelector('#admin-overlay'),
};

let appState = APP_STATES.IDLE;
let selectedCity = null;
let records = loadRecords();
let flowToken = 0;
let activeRecord = null;
let activeAvatar = null;
let chart;
let tree;
let avatarController;

function setStatus(text) {
  elements.status.textContent = text;
}

function setState(nextState) {
  appState = nextState;
  document.body.dataset.state = nextState;
  const locked = nextState === APP_STATES.ANIMATING
    || nextState === APP_STATES.RESULT
    || nextState === APP_STATES.AVATAR;
  citySearch.setDisabled(locked);
  elements.generateButton.disabled = locked || !selectedCity;
  elements.generateText.textContent = nextState === APP_STATES.ANIMATING ? '轨迹生成中…' : '生成我的求学轨迹';
  elements.generateButton.classList.toggle('is-loading', nextState === APP_STATES.ANIMATING);
}

function updateSelectedCity(city) {
  selectedCity = city;
  chart?.setSelected(city);
  elements.selectedCard.classList.toggle('is-empty', !city);
  elements.selectedName.textContent = city ? `${city.city} · ${city.province}` : '等待选择生源城市';
  elements.selectedCoord.textContent = city
    ? `E ${city.longitude.toFixed(3)}°  /  N ${city.latitude.toFixed(3)}°`
    : '请选择搜索候选项';
  if (appState === APP_STATES.IDLE || appState === APP_STATES.SELECTING) {
    setState(city ? APP_STATES.SELECTING : APP_STATES.IDLE);
    setStatus(city ? COPY.selected(city) : COPY.idle);
  }
}

const citySearch = createCitySearch(cities, {
  onSelect: updateSelectedCity,
  onInputState: (hasInput) => {
    if (!hasInput && appState === APP_STATES.SELECTING && !selectedCity) {
      setState(APP_STATES.IDLE);
      setStatus(COPY.idle);
    }
  },
});

function refreshData() {
  records = loadRecords();
  chart?.updateHistory(records);
  tree?.updateRecords(records);
  updateStatistics(records);
  document.querySelector('#undo-btn').disabled = records.length === 0;
  document.querySelector('#export-btn').disabled = records.length === 0;
  document.querySelector('#clear-records-btn').disabled = records.length === 0;
}

function finishResult() {
  flowToken += 1;
  resultController.reset();
  avatarController?.reset();
  chart.clearCurrent();
  citySearch.reset();
  selectedCity = null;
  activeRecord = null;
  activeAvatar = null;
  setState(APP_STATES.IDLE);
  setStatus(COPY.idle);
}

function openAvatar(mode) {
  if (!activeRecord || appState !== APP_STATES.RESULT) return;
  setState(APP_STATES.AVATAR);
  setStatus(`数字形象创建中 · ${activeRecord.city} → 川农信工`);
  avatarController.open({
    origin: formatLocation(activeRecord),
    campus: CAMPUS.name,
    mode,
  }).catch(() => {
    showToast('数字形象面板加载失败，已返回打卡结果', 'error');
    avatarController.reset();
    setState(APP_STATES.RESULT);
    resultController.show(activeRecord);
  });
}

const resultController = createResultController({
  onFinish: finishResult,
  onAi: () => openAvatar('ai'),
  onManual: () => openAvatar('manual'),
  onDownload: downloadAvatar,
});

avatarController = createAvatarController({
  onComplete: (avatar) => {
    if (!activeRecord) return;
    activeAvatar = avatar;
    tree.bindAvatar(activeRecord.id, avatar.imageDataUrl);
    setState(APP_STATES.RESULT);
    setStatus(`数字形象已抵达 · ${activeRecord.city} → 川农信工`);
    resultController.show(activeRecord, avatar);
  },
  onCancel: () => {
    if (!activeRecord) return;
    activeAvatar = null;
    setState(APP_STATES.RESULT);
    setStatus(COPY.complete(activeRecord));
    resultController.show(activeRecord);
  },
});

async function generateRoute() {
  if (appState !== APP_STATES.SELECTING || !selectedCity) {
    showToast('请先从候选列表中选择城市', 'warning');
    return;
  }
  const city = selectedCity;
  const token = ++flowToken;
  activeAvatar = null;
  const record = {
    id: createRecordId(),
    province: city.province,
    city: city.city,
    longitude: city.longitude,
    latitude: city.latitude,
    distanceKm: calculateDistanceKm(city.latitude, city.longitude, CAMPUS.latitude, CAMPUS.longitude),
    createdAt: new Date().toISOString(),
    colorIndex: records.length % ROUTE_COLORS.length,
  };

  setState(APP_STATES.ANIMATING);
  setStatus(COPY.animating(city));
  chart.setCurrent(record);
  chart.setSelected(null);

  try {
    await wait(ANIMATION.originDelay + ANIMATION.flightDuration);
    if (token !== flowToken) return;
    chart.setBurst(true);
    triggerArrivalBurst();
    await wait(520);
    if (token !== flowToken) return;
    records = appendRecord(record);
    chart.updateHistory(records);
    updateStatistics(records);
    tree.updateRecords(records);
    chart.setBurst(false);
    activeRecord = record;
    setState(APP_STATES.RESULT);
    setStatus(COPY.complete(record));
    resultController.show(record);
  } catch (error) {
    console.error(error);
    chart.clearCurrent();
    setState(APP_STATES.SELECTING);
    setStatus(COPY.selected(city));
    showToast(`轨迹生成失败：${error.message}`, 'error');
  }
}

elements.generateButton.addEventListener('click', generateRoute);

// 5×7 点阵 LED 字库：每个字符 7 行、每行 5 位，'1' 表示该颗粒点亮
const LED_FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};
const LED_COLON = ['00', '11', '11', '00', '11', '11', '00'];

function buildLedGlyph(rows, isColon = false) {
  const glyph = document.createElement('span');
  glyph.className = 'led-glyph' + (isColon ? ' led-glyph--colon' : '');
  glyph.style.gridTemplateColumns = `repeat(${rows[0].length}, var(--led-dot))`;
  for (const row of rows) {
    for (const ch of row) {
      const dot = document.createElement('i');
      dot.className = 'led-dot' + (ch === '1' ? ' is-on' : '');
      glyph.appendChild(dot);
    }
  }
  return glyph;
}

function greetingForHour(hour) {
  if (hour >= 6 && hour < 9) return 'console.log("☀️ 早安，信工新同学");';
  if (hour >= 9 && hour < 12) return 'git commit -m "早安，新同学"';
  if (hour >= 12 && hour < 14) return '// 午间小憩，下午继续debug';
  if (hour >= 14 && hour < 18) return 'echo "🌤️ 下午好 · 欢迎加入信工";';
  if (hour >= 18) return "return '🌙 晚上好 · 信工网络欢迎你';";
  return '⚠️ sleep() · 明天再debug';
}

function initClock() {
  const clock = document.querySelector('#current-time');
  const date = document.querySelector('#current-date');
  const pad = (n) => String(n).padStart(2, '0');

  const render = () => {
    const now = new Date();
    clock.setAttribute('datetime', now.toISOString());
    clock.setAttribute('aria-label', now.toLocaleString('zh-CN'));
    const glyphs = [];
    for (const ch of `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`) {
      glyphs.push(ch === ':' ? buildLedGlyph(LED_COLON, true) : buildLedGlyph(LED_FONT[ch]));
    }
    clock.replaceChildren(...glyphs);
    date.textContent = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
  };

  render();
  return window.setInterval(render, 1_000);
}

function initGreeting() {
  const greeting = document.querySelector('#greeting');
  let timer = null;

  function typeNext() {
    const fullText = greetingForHour(new Date().getHours());
    let index = 0;
    // 立即重置到可见状态（不走 0.8s 过渡），再从头逐字打字
    greeting.style.transition = 'none';
    greeting.classList.remove('is-fading');
    greeting.textContent = '';
    void greeting.offsetWidth;
    greeting.style.transition = '';

    const typeChar = () => {
      index += 1;
      greeting.textContent = fullText.slice(0, index);
      if (index < fullText.length) {
        timer = setTimeout(typeChar, 80 + Math.random() * 40);
      } else {
        // 输出完成后等待 6 秒再淡出
        timer = setTimeout(() => {
          greeting.classList.add('is-fading');
          timer = setTimeout(typeNext, 800);
        }, 6000);
      }
    };

    timer = setTimeout(typeChar, 80 + Math.random() * 40);
  }

  typeNext();
  return () => clearTimeout(timer);
}

function initFullscreen() {
  const button = document.querySelector('#fullscreen-btn');
  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      showToast('浏览器未允许全屏，请按 F11 尝试', 'warning');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    button.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    button.title = active ? '退出全屏' : '进入全屏';
    window.setTimeout(() => chart?.resize(), 100);
  });
}

function initAdmin() {
  const close = () => { elements.adminOverlay.hidden = true; };
  const open = () => {
    if (appState === APP_STATES.ANIMATING || appState === APP_STATES.RESULT || appState === APP_STATES.AVATAR) {
      showToast('请先完成当前新生的打卡流程', 'warning');
      return;
    }
    elements.adminOverlay.hidden = false;
    document.querySelector('#admin-record-count').textContent = String(records.length);
    document.querySelector('#admin-close').focus();
  };
  let clickCount = 0;
  let resetClicks;
  document.querySelector('#version-trigger').addEventListener('click', () => {
    clickCount += 1;
    window.clearTimeout(resetClicks);
    if (clickCount >= 5) {
      clickCount = 0;
      open();
      return;
    }
    resetClicks = window.setTimeout(() => { clickCount = 0; }, 2_000);
  });
  document.querySelector('#admin-close').addEventListener('click', close);
  elements.adminOverlay.addEventListener('pointerdown', (event) => {
    if (event.target === elements.adminOverlay) close();
  });
  document.querySelector('#undo-btn').addEventListener('click', () => {
    const { removed } = undoLastRecord();
    refreshData();
    showToast(removed ? `已撤销：${removed.province}${removed.city}` : '没有可撤销的记录');
  });
  document.querySelector('#export-btn').addEventListener('click', () => {
    exportRecords(records);
    showToast(`已导出 ${records.length} 条记录`, 'success');
  });
  document.querySelector('#import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      const imported = await importRecords(file);
      if (!window.confirm(`将用导入文件中的 ${imported.length} 条记录覆盖当前 ${records.length} 条记录。是否继续？`)) return;
      saveRecords(imported);
      refreshData();
      showToast(`已恢复 ${imported.length} 条记录`, 'success');
    } catch (error) {
      showToast(`导入失败：${error.message}`, 'error');
    }
  });
  document.querySelector('#clear-records-btn').addEventListener('click', () => {
    if (!window.confirm(`即将删除当前浏览器中的 ${records.length} 条打卡记录，且无法撤销。确认清空？`)) return;
    clearRecords();
    refreshData();
    showToast('全部本地记录已清空', 'success');
  });
  return { close };
}

function initRankingToggle() {
  const button = document.querySelector('#ranking-toggle');
  const section = document.querySelector('#ranking-section');
  button.addEventListener('click', () => {
    const open = section.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? '收起排行' : '查看排行';
    window.setTimeout(() => chart.resize(), 100);
  });
}

function initAmbientCanvas() {
  const canvas = document.querySelector('#ambient-canvas');
  const context = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 极客蓝 / 电光青
  const COLORS = [
    { r: 61, g: 123, b: 255 }, // #3D7BFF 极客蓝
    { r: 75, g: 230, b: 255 }, // #4BE6FF 电光青
  ];

  let particles = [];
  let binary = [];
  let frame;

  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // 粒子 150~200 个，缓慢向上飘动
    const count = Math.min(200, Math.max(150, Math.round((innerWidth * innerHeight) / 16_000)));
    particles = Array.from({ length: count }, () => {
      const color = COLORS[Math.random() < 0.5 ? 0 : 1];
      return {
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -(Math.random() * 0.24 + 0.05),
        size: Math.random() * 1.6 + 0.7,
        color,
        alpha: Math.random() * 0.35 + 0.3,
      };
    });

    // 二进制雨：0/1 随机飘落，低透明度
    const binaryCount = Math.min(140, Math.max(90, Math.round(innerWidth / 16)));
    binary = Array.from({ length: binaryCount }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      speed: Math.random() * 0.55 + 0.2,
      char: Math.random() < 0.5 ? '0' : '1',
      alpha: Math.random() * 0.22 + 0.42,
    }));
  }

  function draw() {
    context.clearRect(0, 0, innerWidth, innerHeight);

    // 近距粒子连线：半透明细线
    const linkDist = 140;
    const linkDist2 = linkDist * linkDist;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist2) {
          const t = 1 - Math.sqrt(d2) / linkDist;
          context.strokeStyle = `rgba(130, 210, 255, ${(t * 0.42).toFixed(3)})`;
          context.lineWidth = 0.8;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
    }

    // 粒子（光晕 + 核心）
    particles.forEach((p) => {
      context.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${(p.alpha * 0.18).toFixed(3)})`;
      context.beginPath();
      context.arc(p.x, p.y, p.size * 2.8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.alpha})`;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    });

    // 二进制代码雨（叠加在粒子上层，低透明度）
    context.font = '14px ui-monospace, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    binary.forEach((d) => {
      context.fillStyle = `rgba(110, 225, 245, ${d.alpha})`;
      context.fillText(d.char, d.x, d.y);
    });

    if (!reduceMotion) {
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -2) {
          p.y = innerHeight + 2;
          p.x = Math.random() * innerWidth;
        }
        if (p.x < -2) p.x = innerWidth + 2;
        else if (p.x > innerWidth + 2) p.x = -2;
      });
      binary.forEach((d) => {
        d.y += d.speed;
        if (d.y > innerHeight + 14) {
          d.y = -14;
          d.x = Math.random() * innerWidth;
          d.char = Math.random() < 0.5 ? '0' : '1';
        }
      });
      frame = requestAnimationFrame(draw);
    }
  }

  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
  };
}

chart = createMapChart(document.querySelector('#map-chart'));
tree = createTree(document.querySelector('#tree-stage'));
document.querySelector('#map-loading').classList.add('is-hidden');
refreshData();
setState(APP_STATES.IDLE);

const storageWarning = getStorageWarning();
if (storageWarning) {
  const warning = document.querySelector('#storage-warning');
  warning.hidden = false;
  warning.textContent = storageWarning;
  showToast('已安全忽略损坏的本地数据', 'warning');
}

const clockTimer = initClock();
const stopGreeting = initGreeting();
const stopAmbient = initAmbientCanvas();
const admin = initAdmin();
initFullscreen();
initRankingToggle();
initRankingTabs();

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!elements.adminOverlay.hidden) admin.close();
  else if (avatarController.isOpen()) avatarController.cancel();
  else if (resultController.isVisible()) resultController.hide();
});

window.addEventListener('beforeunload', () => {
  window.clearInterval(clockTimer);
  stopGreeting();
  resultController.reset();
  avatarController.reset();
  stopAmbient();
  tree.dispose();
  chart.dispose();
}, { once: true });
