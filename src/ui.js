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

export function updateStatistics(records) {
  const groups = aggregateRecords(records).sort((a, b) => b.count - a.count || new Date(b.latestAt) - new Date(a.latestAt));
  animateNumber(document.querySelector('#total-count'), records.length);
  animateNumber(document.querySelector('#province-count'), new Set(records.map((item) => item.province)).size);
  animateNumber(document.querySelector('#city-count'), groups.length);
  document.querySelector('#record-badge').textContent = `本机记录 ${records.length} 条`;
  document.querySelector('#admin-record-count').textContent = String(records.length);
  document.querySelector('#latest-city').textContent = records.length ? formatLocation(records.at(-1)) : '等待第一束光';

  const ranking = document.querySelector('#city-ranking');
  ranking.replaceChildren();
  const max = groups[0]?.count || 1;
  groups.slice(0, 5).forEach((item, index) => {
    const row = document.createElement('li');
    const head = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${item.city}`;
    const count = document.createElement('strong');
    count.textContent = String(item.count);
    head.append(label, count);
    const track = document.createElement('i');
    const bar = document.createElement('b');
    bar.style.width = `${Math.max(14, (item.count / max) * 100)}%`;
    track.append(bar);
    row.append(head, track);
    ranking.append(row);
  });
  if (!groups.length) {
    const empty = document.createElement('li');
    empty.className = 'ranking-empty';
    empty.textContent = '第一条轨迹，等待你点亮';
    ranking.append(empty);
  }
}

export function createResultController(onFinish) {
  const card = document.querySelector('#result-card');
  const countdown = document.querySelector('#result-countdown');
  let timer = null;
  let interval = null;

  function hide() {
    if (card.hidden) return;
    window.clearTimeout(timer);
    window.clearInterval(interval);
    card.classList.remove('is-visible');
    window.setTimeout(() => { card.hidden = true; }, 220);
    onFinish();
  }

  document.querySelector('#finish-btn').addEventListener('click', hide);

  return {
    show(record) {
      document.querySelector('#result-origin').textContent = formatLocation(record);
      document.querySelector('#result-distance').textContent = String(record.distanceKm);
      document.querySelector('#result-message').textContent = `跨越约 ${record.distanceKm} 公里，从【${formatLocation(record)}】奔赴川农信工。以代码为翼，以科技为光，开启全新逐梦之旅。`;
      let remaining = Math.ceil(ANIMATION.resultDuration / 1_000);
      countdown.textContent = String(remaining);
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add('is-visible'));
      interval = window.setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        countdown.textContent = String(remaining);
      }, 1_000);
      timer = window.setTimeout(hide, ANIMATION.resultDuration);
    },
    hide,
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
