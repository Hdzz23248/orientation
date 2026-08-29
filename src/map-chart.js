import * as echarts from 'echarts/core';
import { EffectScatterChart, LinesChart, ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import chinaGeoJSON from './data/china.json';
import {
  ANIMATION,
  CAMPUS,
  ROUTE_COLORS,
} from './config.js';
import { aggregateRecords, debounce, prefersReducedMotion } from './utils.js';

const CAMPUS_COORDS = [CAMPUS.longitude, CAMPUS.latitude];
const DEFAULT_MAP_CENTER = [104, 35.8];

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
  let selectedCity = null;
  let selectedColor = { r: 255, g: 179, b: 0 };
  let bursting = false;
  let focusCity = null;
  let focusStage = 'overview';
  let focusTimer = null;
  let focusToken = 0;
  const reducedMotion = prefersReducedMotion();

  function historySeries() {
    if (focusStage !== 'overview') return [];
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
            width: Math.min(0.7 + item.count * 0.1, 1.6),
            opacity: Math.min(0.07 + item.count * 0.015, 0.2),
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
    const hasCurrent = Boolean(currentRecord) && ['focused', 'overview'].includes(focusStage);
    const showCurrentOrigin = hasCurrent && !selectedCity;
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
        lineStyle: { color: '#2de2ff', width: 1.6, opacity: 0.48, curveness: 0.26, shadowBlur: 6, shadowColor: '#2de2ff' },
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
        data: showCurrentOrigin ? [{ name: currentRecord.city, value: [currentRecord.longitude, currentRecord.latitude] }] : [],
      },
    ];
  }

  function selectedSeries() {
    const hasSelected = Boolean(selectedCity) && (focusStage === 'focused' || focusStage === 'overview');
    const color = `rgb(${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b})`;
    const border = `rgba(${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b}, 0.55)`;
    const value = hasSelected ? [{ value: [selectedCity.longitude, selectedCity.latitude] }] : [];

    return [
      {
        id: 'selected-origin',
        name: '已选生源地',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 6,
        rippleEffect: { scale: 7, period: 2, brushType: 'stroke' },
        symbolSize: 12,
        itemStyle: { color, shadowBlur: 24, shadowColor: color },
        data: value,
      },
      {
        id: 'selected-arrow',
        name: '你的家乡',
        type: 'scatter',
        coordinateSystem: 'geo',
        zlevel: 8,
        silent: true,
        symbol: 'path://M-8,-16 L8,-16 L0,0 Z',
        symbolSize: 22,
        itemStyle: { color, shadowBlur: 8, shadowColor: color },
        label: {
          show: hasSelected,
          formatter: '你的家乡',
          position: 'top',
          distance: 2,
          color: '#eaf7ff',
          fontWeight: 700,
          fontSize: 14,
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
          textShadowBlur: 10,
          textShadowColor: color,
          backgroundColor: 'rgba(3, 10, 22, .8)',
          borderColor: border,
          borderWidth: 1,
          borderRadius: 6,
          padding: [5, 10],
        },
        data: value,
      },
    ];
  }

  function campusSeries() {
    const visible = focusStage === 'focused' || focusStage === 'overview';
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
      data: visible ? [{ name: CAMPUS.name, value: CAMPUS_COORDS }] : [],
    };
  }

  function demoSeries() {
    if (focusStage !== 'overview') {
      return { id: 'demo-origins', name: '鑳屾櫙鏄熺偣', type: 'scatter', data: [] };
    }
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

  function focusViewport() {
    if (!focusCity || !['zooming', 'focused', 'clearing'].includes(focusStage)) {
      return { center: DEFAULT_MAP_CENTER, zoom: 1 };
    }
    const center = [
      (focusCity.longitude + CAMPUS.longitude) / 2,
      (focusCity.latitude + CAMPUS.latitude) / 2,
    ];
    const span = Math.max(
      Math.abs(focusCity.longitude - CAMPUS.longitude),
      Math.abs(focusCity.latitude - CAMPUS.latitude) * 1.15,
      1.8,
    );
    return { center, zoom: Math.min(5.2, Math.max(1.15, 10 / span)) };
  }

  function render() {
    const viewport = focusViewport();
    chart.setOption({
      animationDurationUpdate: reducedMotion ? 0 : (focusCity ? 850 : 450),
      animationEasingUpdate: 'cubicInOut',
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
        center: viewport.center,
        zoom: viewport.zoom,
        roam: false,
        silent: false,
        left: '1%',
        right: '1%',
        top: '2%',
        bottom: '2%',
        aspectScale: 0.98,
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
      series: [...historySeries(), ...currentSeries(), ...selectedSeries(), campusSeries(), demoSeries()],
    }, { replaceMerge: ['series'] });
  }

  function startFocusSequence(city) {
    window.clearTimeout(focusTimer);
    const token = ++focusToken;
    focusCity = city;
    focusStage = 'hidden';
    render();

    focusTimer = window.setTimeout(() => {
      if (token !== focusToken) return;
      focusStage = 'zooming';
      render();

      focusTimer = window.setTimeout(() => {
        if (token !== focusToken) return;
        focusStage = 'focused';
        render();
      }, 850);
    }, 100);
  }

  function completeFocusSequence(city) {
    window.clearTimeout(focusTimer);
    const token = ++focusToken;
    if (city) focusCity = city;
    focusStage = 'clearing';
    render();

    focusTimer = window.setTimeout(() => {
      if (token !== focusToken) return;
      focusStage = 'restoring';
      render();
      focusTimer = window.setTimeout(() => {
        if (token !== focusToken) return;
        focusStage = 'overview';
        focusCity = null;
        render();
      }, 850);
    }, 120);
  }

  function cancelFocusSequence() {
    window.clearTimeout(focusTimer);
    focusToken += 1;
    focusTimer = null;
    focusStage = 'overview';
    focusCity = null;
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
    setSelected(city) {
      cancelFocusSequence();
      selectedCity = city;
      if (city) {
        selectedColor = {
          r: Math.floor(Math.random() * 256),
          g: Math.floor(Math.random() * 256),
          b: Math.floor(Math.random() * 256),
        };
        startFocusSequence(city);
        return;
      }
      render();
    },
    clearSelected() {
      cancelFocusSequence();
      selectedCity = null;
      render();
    },
    clearSelectedMarker() { cancelFocusSequence(); selectedCity = null; render(); },
    revealHistory() { cancelFocusSequence(); render(); },
    completeFocus() { completeFocusSequence(); },
    setBurst(active) { bursting = active; render(); },
    resize: () => chart.resize(),
    dispose() { cancelFocusSequence(); observer.disconnect(); window.removeEventListener('resize', resize); resize.cancel(); chart.dispose(); },
  };
}
