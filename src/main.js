import './styles.css';
import cities from './data/cities.json';
import { createAvatarController } from './avatar-controller.js';
import { downloadAvatar } from './avatar-image.js';
import { ANIMATION, APP_STATES, CAMPUS, COPY, ROUTE_COLORS } from './config.js';
import { createMapChart } from './map-chart.js';
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
    chart.addDestinationAvatar(avatar.imageDataUrl);
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

function initClock() {
  const time = document.querySelector('#current-time');
  const render = () => {
    time.textContent = new Intl.DateTimeFormat('zh-CN', {
      hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date()).replaceAll('/', '.');
  };
  render();
  return window.setInterval(render, 1_000);
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
  let particles = [];
  let frame;
  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(70, Math.floor((innerWidth * innerHeight) / 28_000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      size: Math.random() * 1.4 + 0.35,
      speed: Math.random() * 0.08 + 0.025,
      alpha: Math.random() * 0.35 + 0.08,
    }));
  }
  function draw() {
    context.clearRect(0, 0, innerWidth, innerHeight);
    particles.forEach((particle) => {
      context.fillStyle = `rgba(69, 210, 255, ${particle.alpha})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
      if (!reduceMotion) {
        particle.y -= particle.speed;
        if (particle.y < -2) particle.y = innerHeight + 2;
      }
    });
    if (!reduceMotion) frame = requestAnimationFrame(draw);
  }
  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });
  return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
}

chart = createMapChart(document.querySelector('#map-chart'));
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
const stopAmbient = initAmbientCanvas();
const admin = initAdmin();
initFullscreen();
initRankingToggle();

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!elements.adminOverlay.hidden) admin.close();
  else if (avatarController.isOpen()) avatarController.cancel();
  else if (resultController.isVisible()) resultController.hide();
});

window.addEventListener('beforeunload', () => {
  window.clearInterval(clockTimer);
  resultController.reset();
  avatarController.reset();
  stopAmbient();
  chart.dispose();
}, { once: true });
