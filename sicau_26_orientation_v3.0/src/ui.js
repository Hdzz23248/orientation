import { ANIMATION } from './config.js';
import { aggregateRecords, formatLocation } from './utils.js';

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function createCitySearch(cities, { onSelect, onInputState }) {
  const input = document.querySelector('#city-search');
  const options = document.querySelector('#city-options');
  const clearButton = document.querySelector('#clear-search');
  let selected = null;
  let matches = [];
  let activeIndex = -1;

  function closeOptions() {
    options.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  function renderOptions() {
    options.replaceChildren();
    matches.forEach((city, index) => {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.dataset.index = String(index);
      const name = document.createElement('strong');
      name.textContent = city.city;
      const province = document.createElement('span');
      province.textContent = city.province;
      item.append(name, province);
      item.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        choose(city);
      });
      options.append(item);
    });
    options.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(matches.length > 0));
  }

  function choose(city) {
    selected = city;
    input.value = `${city.city} · ${city.province}`;
    closeOptions();
    onSelect(city);
  }

  function search() {
    const query = normalize(input.value);
    selected = null;
    onSelect(null);
    onInputState(Boolean(query));
    if (!query) {
      matches = [];
      closeOptions();
      return;
    }
    matches = cities
      .map((city) => {
        const cityName = normalize(city.city);
        const province = normalize(city.province);
        const pinyin = normalize(city.pinyin);
        const initials = normalize(city.initials);
        let score = 9;
        if (cityName === query || pinyin === query || initials === query) score = 0;
        else if (cityName.startsWith(query) || pinyin.startsWith(query) || initials.startsWith(query)) score = 1;
        else if (province.startsWith(query)) score = 2;
        else if (cityName.includes(query) || pinyin.includes(query) || initials.includes(query) || province.includes(query)) score = 3;
        return { city, score };
      })
      .filter((item) => item.score < 9)
      .sort((a, b) => a.score - b.score || a.city.city.length - b.city.city.length)
      .slice(0, 9)
      .map((item) => item.city);
    renderOptions();
  }

  input.addEventListener('input', search);
  input.addEventListener('focus', () => { if (matches.length && !selected) renderOptions(); });
  input.addEventListener('blur', () => window.setTimeout(closeOptions, 120));
  input.addEventListener('keydown', (event) => {
    if (!matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = event.key === 'ArrowDown'
        ? (activeIndex + 1) % matches.length
        : (activeIndex - 1 + matches.length) % matches.length;
      [...options.children].forEach((element, index) => {
        element.classList.toggle('is-active', index === activeIndex);
        element.setAttribute('aria-selected', String(index === activeIndex));
      });
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(matches[activeIndex]);
    } else if (event.key === 'Escape') closeOptions();
  });
  clearButton.addEventListener('click', () => reset(true));

  function reset(focus = false) {
    selected = null;
    matches = [];
    input.value = '';
    closeOptions();
    onSelect(null);
    onInputState(false);
    if (focus) input.focus();
  }

  return {
    getSelected: () => selected,
    reset,
    setDisabled(disabled) { input.disabled = disabled; clearButton.disabled = disabled; },
  };
}

function animateNumber(element, target) {
  const from = Number(element.dataset.value || 0);
  element.dataset.value = String(target);
  if (from === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = String(target);
    return;
  }
  const started = performance.now();
  function tick(now) {
    const progress = Math.min((now - started) / ANIMATION.numberDuration, 1);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = String(Math.round(from + (target - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function aggregateByProvince(records) {
  const grouped = new Map();
  records.forEach((record) => {
    const current = grouped.get(record.province);
    if (current) {
      current.count += 1;
    } else {
      grouped.set(record.province, { province: record.province, count: 1 });
    }
  });
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

function renderRanking(list, items, nameKey) {
  list.replaceChildren();
  const max = items[0]?.count || 1;
  items.forEach((item, index) => {
    const row = document.createElement('li');
    const head = document.createElement('div');
    const label = document.createElement('span');
    if (index < 3) {
      const medal = document.createElement('em');
      medal.className = `rank-medal rank-medal--${['gold', 'silver', 'bronze'][index]}`;
      medal.textContent = String(index + 1);
      label.append(medal, ` ${item[nameKey]}`);
    } else {
      label.textContent = `${index + 1}. ${item[nameKey]}`;
    }
    const count = document.createElement('strong');
    count.textContent = String(item.count);
    head.append(label, count);
    const track = document.createElement('i');
    const bar = document.createElement('b');
    bar.style.width = `${Math.max(14, (item.count / max) * 100)}%`;
    track.append(bar);
    row.append(head, track);
    list.append(row);
  });
  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'ranking-empty';
    empty.textContent = '第一条轨迹，等待你点亮';
    list.append(empty);
  }
}

function refreshRankingMore() {
  const section = document.querySelector('#ranking-section');
  const cityList = document.querySelector('#city-ranking');
  const provinceList = document.querySelector('#province-ranking');
  const active = cityList.hidden ? provinceList : cityList;
  const hasMore = active.scrollHeight - active.scrollTop - active.clientHeight > 2;
  section.classList.toggle('has-more', hasMore);
}

export function updateStatistics(records) {
  const groups = aggregateRecords(records).sort((a, b) => b.count - a.count || new Date(b.latestAt) - new Date(a.latestAt));
  const provinceGroups = aggregateByProvince(records);
  animateNumber(document.querySelector('#total-count'), records.length);
  animateNumber(document.querySelector('#province-count'), new Set(records.map((item) => item.province)).size);
  animateNumber(document.querySelector('#city-count'), groups.length);
  document.querySelector('#record-badge').textContent = `本机记录 ${records.length} 条`;
  document.querySelector('#admin-record-count').textContent = String(records.length);
  document.querySelector('#latest-city').textContent = records.length ? formatLocation(records.at(-1)) : '等待第一束光';

  renderRanking(document.querySelector('#city-ranking'), groups, 'city');
  renderRanking(document.querySelector('#province-ranking'), provinceGroups, 'province');
  refreshRankingMore();
}

export function initRankingTabs() {
  const tabs = [...document.querySelectorAll('.ranking-tab')];
  const title = document.querySelector('#ranking-title');
  const lists = {
    city: document.querySelector('#city-ranking'),
    province: document.querySelector('#province-ranking'),
  };
  const labels = { city: '生源城市排行', province: '生源省份排行' };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.ranking;
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      Object.entries(lists).forEach(([key, list]) => {
        list.hidden = key !== type;
      });
      title.textContent = labels[type];
      refreshRankingMore();
    });
  });

  Object.values(lists).forEach((list) => {
    list.addEventListener('scroll', refreshRankingMore, { passive: true });
  });

  refreshRankingMore();
}

export function createResultController({ onFinish, onAi, onManual, onDownload }) {
  const card = document.querySelector('#result-card');
  const countdown = document.querySelector('#result-countdown');
  const avatarCountdown = document.querySelector('#result-avatar-countdown');
  const avatarSummary = document.querySelector('#result-avatar-summary');
  const avatarImage = document.querySelector('#result-avatar-image');
  const choiceActions = document.querySelector('#result-choice-actions');
  const completeActions = document.querySelector('#result-complete-actions');
  let timer = null;
  let interval = null;
  let concealTimer = null;
  let activeAvatar = null;

  function stopTimers() {
    window.clearTimeout(timer);
    window.clearInterval(interval);
    window.clearTimeout(concealTimer);
    timer = null;
    interval = null;
  }

  function conceal() {
    stopTimers();
    card.classList.remove('is-visible');
    concealTimer = window.setTimeout(() => { card.hidden = true; }, 220);
  }

  function finish() {
    if (card.hidden) return;
    conceal();
    onFinish();
  }

  function enterAvatar(callback) {
    stopTimers();
    conceal();
    callback();
  }

  document.querySelector('#finish-btn').addEventListener('click', finish);
  document.querySelector('#result-avatar-finish-btn').addEventListener('click', finish);
  document.querySelector('#result-ai-btn').addEventListener('click', () => enterAvatar(onAi));
  document.querySelector('#result-manual-btn').addEventListener('click', () => enterAvatar(onManual));
  document.querySelector('#result-download-btn').addEventListener('click', () => {
    if (activeAvatar) onDownload(activeAvatar.imageDataUrl);
  });

  return {
    show(record, avatar = null) {
      stopTimers();
      activeAvatar = avatar;
      document.querySelector('#result-origin').textContent = formatLocation(record);
      document.querySelector('#result-distance').textContent = String(record.distanceKm);
      document.querySelector('#result-message').textContent = `跨越约 ${record.distanceKm} 公里，从【${formatLocation(record)}】奔赴川农信工。以代码为翼，以科技为光，开启全新逐梦之旅。`;
      avatarSummary.hidden = !avatar;
      choiceActions.hidden = Boolean(avatar);
      completeActions.hidden = !avatar;
      if (avatar) avatarImage.src = avatar.imageDataUrl;
      else avatarImage.removeAttribute('src');
      let remaining = Math.ceil(ANIMATION.resultDuration / 1_000);
      countdown.textContent = String(remaining);
      avatarCountdown.textContent = String(remaining);
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add('is-visible'));
      interval = window.setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        countdown.textContent = String(remaining);
        avatarCountdown.textContent = String(remaining);
      }, 1_000);
      timer = window.setTimeout(finish, ANIMATION.resultDuration);
    },
    hide: finish,
    conceal,
    reset() {
      stopTimers();
      activeAvatar = null;
      avatarImage.removeAttribute('src');
      card.hidden = true;
      card.classList.remove('is-visible');
    },
    isVisible: () => !card.hidden,
  };
}

export function showToast(message, kind = 'info') {
  const region = document.querySelector('#toast-region');
  const toast = document.createElement('div');
  toast.className = `toast toast--${kind}`;
  toast.textContent = message;
  region.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 250);
  }, 2_600);
}

export function triggerArrivalBurst() {
  const burst = document.querySelector('#arrival-burst');
  burst.replaceChildren();
  for (let index = 0; index < 12; index += 1) {
    const particle = document.createElement('i');
    particle.style.setProperty('--angle', `${index * 30}deg`);
    particle.style.setProperty('--distance', `${38 + (index % 3) * 12}px`);
    burst.append(particle);
  }
  burst.classList.remove('is-active');
  requestAnimationFrame(() => burst.classList.add('is-active'));
  window.setTimeout(() => burst.classList.remove('is-active'), ANIMATION.burstDuration);
}
