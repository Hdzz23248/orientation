import * as echarts from 'echarts/core';
import { EffectScatterChart, LinesChart, ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import chinaGeoJSON from './data/china.json';
import {
  ANIMATION,
  AVATAR_LIFETIME,
  CAMPUS,
  MAX_DESTINATION_AVATARS,
  ROUTE_COLORS,
} from './config.js';
import { aggregateRecords, debounce, prefersReducedMotion } from './utils.js';

const CAMPUS_COORDS = [CAMPUS.longitude, CAMPUS.latitude];

echarts.use([LinesChart, EffectScatterChart, ScatterChart, GeoComponent, TooltipComponent, CanvasRenderer]);
const DEMO_POINTS = [
  [116.4, 39.9], [121.47, 31.23], [113.28, 23.12], [87.62, 43.79],
  [126.64, 45.75], [91.13, 29.66], [108.95, 34.26], [104.06, 30.66],
];

export function createMapChart(container) {
  echarts.registerMap('china-welcome', chinaGeoJSON);
  const chart = echarts.init(container, null, { renderer: 'canvas' });
  let records = [];
  let currentRecord = null;
  let destinationAvatars = [];
  let destinationAvatarTimer = null;
  let bursting = false;
  const reducedMotion = prefersReducedMotion();

  function historySeries() {
    const grouped = aggregateRecords(records);
    return [
      {
        id: 'history-routes',
        name: '历史轨迹',
        type: 'lines',
        coordinateSystem: 'geo',
        silent: true,
        zlevel: 2,
        progressive: 300,
        effect: {
          show: grouped.length > 0 && !reducedMotion,
          period: 7,
          trailLength: 0.12,
          symbol: 'circle',
          symbolSize: 2.5,
          color: '#6ee7ff',
        },
        lineStyle: { curveness: 0.22, opacity: 0.25, width: 1 },
        data: grouped.map((item) => ({
          name: item.city,
          coords: [[item.longitude, item.latitude], CAMPUS_COORDS],
          count: item.count,
          lineStyle: {
            color: ROUTE_COLORS[item.colorIndex % ROUTE_COLORS.length],
            width: Math.min(1 + item.count * 0.16, 2.8),
            opacity: Math.min(0.2 + item.count * 0.035, 0.58),
          },
        })),
      },
      {
        id: 'history-origins',
        name: '生源城市',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        rippleEffect: { scale: 2.5, brushType: 'stroke', period: 5 },
        symbolSize: (value) => Math.min(5.5 + Math.sqrt(value[2]) * 2, 15),
        itemStyle: { color: '#58dcff', shadowBlur: 10, shadowColor: '#2de2ff' },
        emphasis: { scale: 1.35 },
        data: grouped.map((item) => ({
          name: item.city,
          province: item.province,
          count: item.count,
          value: [item.longitude, item.latitude, item.count],
        })),
      },
    ];
  }

  function currentSeries() {
    const hasCurrent = Boolean(currentRecord);
    return [
      {
        id: 'current-route',
        name: '当前轨迹',
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 5,
        silent: true,
        effect: {
          show: hasCurrent,
          period: reducedMotion ? 5 : ANIMATION.flightDuration / 1_000,
          trailLength: reducedMotion ? 0 : 0.42,
          symbol: 'circle',
          symbolSize: 7,
          color: '#fff',
        },
        lineStyle: { color: '#2de2ff', width: 2.6, opacity: 0.95, curveness: 0.26, shadowBlur: 14, shadowColor: '#2de2ff' },
        data: hasCurrent ? [{ coords: [[currentRecord.longitude, currentRecord.latitude], CAMPUS_COORDS] }] : [],
      },
      {
        id: 'current-origin',
        name: '当前生源地',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 6,
        rippleEffect: { scale: 4, period: 1.6, brushType: 'stroke' },
        symbolSize: 11,
        itemStyle: { color: '#2de2ff', shadowBlur: 22, shadowColor: '#2de2ff' },
        label: {
          show: hasCurrent,
          formatter: (params) => params.name,
          position: 'top',
          color: '#dffaff',
          fontSize: 12,
          backgroundColor: 'rgba(3, 10, 22, .76)',
          borderColor: 'rgba(45, 226, 255, .38)',
          borderWidth: 1,
          borderRadius: 5,
          padding: [4, 7],
        },
        data: hasCurrent ? [{ name: currentRecord.city, value: [currentRecord.longitude, currentRecord.latitude] }] : [],
      },
    ];
  }

  function campusSeries() {
    return {
      id: 'campus-point',
      name: '雅安校区',
      type: 'effectScatter',
      coordinateSystem: 'geo',
      zlevel: 7,
      rippleEffect: { scale: bursting ? 8 : 4, period: bursting ? 0.7 : 2.8, brushType: 'stroke' },
      symbolSize: bursting ? 19 : 13,
      itemStyle: { color: '#f6fdff', shadowBlur: bursting ? 38 : 20, shadowColor: '#2de2ff' },
      label: {
        show: true,
        formatter: '川农信工 · 雅安',
        position: 'right',
        distance: 8,
        color: '#edfaff',
        fontWeight: 700,
        fontSize: 12,
        textShadowBlur: 8,
        textShadowColor: '#2de2ff',
      },
      data: [{ name: CAMPUS.name, value: CAMPUS_COORDS }],
    };
  }

  function demoSeries() {
    return {
      id: 'demo-origins',
      name: '背景星点',
      type: 'scatter',
      coordinateSystem: 'geo',
      zlevel: 1,
      silent: true,
      symbolSize: 3,
      itemStyle: { color: '#2de2ff', opacity: records.length ? 0 : 0.28, shadowBlur: 8, shadowColor: '#2de2ff' },
      data: records.length ? [] : DEMO_POINTS.map((coords) => ({ value: coords })),
    };
  }

  function destinationAvatarSeries() {
    const avatarById = new Map(destinationAvatars.map((avatar) => [avatar.id, avatar]));
    return {
      id: 'destination-avatar',
      name: '数字形象汇聚',
      type: 'scatter',
      coordinateSystem: 'geo',
      silent: true,
      zlevel: 20,
      symbol: (_value, params) => {
        const avatar = avatarById.get(params.data.avatarId);
        return avatar ? `image://${avatar.imageDataUrl}` : 'circle';
      },
      data: createDestinationAvatarData(),
    };
  }

  function avatarSymbolSize() {
    const count = destinationAvatars.length;
    const baseSize = count <= 4 ? 52 : count <= 12 ? 42 : count <= 30 ? 32 : count <= 60 ? 25 : 20;
    return Math.max(18, Math.min(baseSize, container.clientWidth * 0.065));
  }

  function avatarSymbolOffset(index) {
    if (index === 0) return [0, -42];
    const maxRadius = Math.min(175, Math.max(88, container.clientWidth * 0.22));
    const radius = Math.min(maxRadius, 45 + Math.sqrt(index) * 15);
    const angle = index * 2.399963 - Math.PI / 2;
    return [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius - 25)];
  }

  function createDestinationAvatarData() {
    const now = Date.now();
    const size = avatarSymbolSize();
    return [...destinationAvatars].reverse().map((avatar, index) => ({
      id: avatar.id,
      avatarId: avatar.id,
      name: '信工数字形象',
      value: CAMPUS_COORDS,
      symbolSize: size,
      symbolOffset: avatarSymbolOffset(index),
      itemStyle: {
        opacity: Math.max(0, (avatar.expiresAt - now) / AVATAR_LIFETIME),
        shadowBlur: 12,
        shadowColor: 'rgba(45, 226, 255, .5)',
      },
    }));
  }

  function stopDestinationAvatarTimer() {
    window.clearInterval(destinationAvatarTimer);
    destinationAvatarTimer = null;
  }

  function syncDestinationAvatars() {
    const now = Date.now();
    destinationAvatars = destinationAvatars.filter((avatar) => avatar.expiresAt > now);
    if (!destinationAvatars.length) stopDestinationAvatarTimer();
    chart.setOption({
      series: [{ id: 'destination-avatar', data: createDestinationAvatarData() }],
    });
  }

  function startDestinationAvatarTimer() {
    if (destinationAvatarTimer) return;
    destinationAvatarTimer = window.setInterval(syncDestinationAvatars, 10_000);
  }

  function clearDestinationAvatars() {
    stopDestinationAvatarTimer();
    destinationAvatars = [];
    render();
  }

  function addDestinationAvatar(imageDataUrl) {
    const now = Date.now();
    destinationAvatars.push({
      id: globalThis.crypto?.randomUUID?.() ?? `avatar-${now}-${Math.random().toString(16).slice(2)}`,
      imageDataUrl,
      createdAt: now,
      expiresAt: now + AVATAR_LIFETIME,
    });
    if (destinationAvatars.length > MAX_DESTINATION_AVATARS) {
      destinationAvatars.splice(0, destinationAvatars.length - MAX_DESTINATION_AVATARS);
    }
    startDestinationAvatarTimer();
    render();
  }

  function render() {
    chart.setOption({
      animationDurationUpdate: reducedMotion ? 0 : 450,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        confine: true,
        borderWidth: 1,
        borderColor: 'rgba(45,226,255,.35)',
        backgroundColor: 'rgba(3,12,24,.92)',
        textStyle: { color: '#edfaff' },
        formatter(params) {
          if (params.seriesId === 'history-origins') return `${params.data.province} · ${params.name}<br/>累计 ${params.data.count} 人`;
          if (params.seriesType === 'map') return params.name || '';
          if (params.seriesId === 'campus-point') return `${CAMPUS.name}<br/>信息工程学院`;
          return params.name || '';
        },
      },
      geo: {
        map: 'china-welcome',
        roam: false,
        silent: false,
        left: '4%',
        right: '5%',
        top: '7%',
        bottom: '5%',
        aspectScale: 0.86,
        itemStyle: {
          areaColor: '#081729',
          borderColor: 'rgba(69, 206, 244, .48)',
          borderWidth: 0.8,
          shadowBlur: 7,
          shadowColor: 'rgba(20, 133, 190, .2)',
        },
        emphasis: {
          disabled: false,
          itemStyle: { areaColor: '#0d2941', borderColor: '#56ddff', borderWidth: 1.2 },
          label: { show: true, color: '#dffaff', fontSize: 11 },
        },
        select: { disabled: true },
        regions: [{ name: '南海诸岛', itemStyle: { opacity: 0.45 } }],
      },
      series: [...historySeries(), ...currentSeries(), campusSeries(), demoSeries(), destinationAvatarSeries()],
    }, { replaceMerge: ['series'] });
  }

  render();
  const resize = debounce(() => chart.resize(), ANIMATION.resizeDebounce);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener('resize', resize, { passive: true });

  return {
    updateHistory(nextRecords) { records = [...nextRecords]; render(); },
    setCurrent(record) { currentRecord = record; render(); },
    clearCurrent() { currentRecord = null; bursting = false; render(); },
    setBurst(active) { bursting = active; render(); },
    addDestinationAvatar,
    clearDestinationAvatars,
    getDestinationAvatarCount: () => destinationAvatars.length,
    resize: () => chart.resize(),
    dispose() { stopDestinationAvatarTimer(); observer.disconnect(); window.removeEventListener('resize', resize); resize.cancel(); chart.dispose(); },
  };
}
