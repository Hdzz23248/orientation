export const CAMPUS = Object.freeze({
  name: '川农信工 · 雅安校区',
  longitude: 102.995025,
  latitude: 29.978648,
  address: '四川省雅安市雨城区新康路 46 号，四川农业大学第四教学楼',
});

export const STORAGE_KEY = 'sicau-welcome-origin-records-v1';
export const STORAGE_BACKUP_PREFIX = `${STORAGE_KEY}-damaged-`;
export const MAX_IMPORT_RECORDS = 20_000;

export const APP_STATES = Object.freeze({
  IDLE: 'idle',
  SELECTING: 'selecting',
  ANIMATING: 'animating',
  RESULT: 'result',
  AVATAR: 'avatar',
});

export const ANIMATION = Object.freeze({
  originDelay: 360,
  flightDuration: 2_750,
  burstDuration: 820,
  resultDuration: 20_000,
  resizeDebounce: 90,
  numberDuration: 520,
});

export const AVATAR_LIFETIME = 60 * 60 * 1_000;
export const MAX_DESTINATION_AVATARS = 100;

export const ROUTE_COLORS = ['#2de2ff', '#3b82f6', '#8b5cf6', '#4ade80', '#38bdf8'];

export const COPY = Object.freeze({
  idle: '五湖四海萌新，齐聚信工山海',
  selected: (city) => `已选择：${city.province}${city.city}`,
  animating: (city) => `轨迹计算中 · ${city.city.replace(/市$/, '')} → 川农信工`,
  complete: (record) => `欢迎来自${record.province}${record.city}的新同学`,
});
