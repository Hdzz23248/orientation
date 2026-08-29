export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const radius = 6371;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function debounce(callback, delay = 100) {
  let timer;
  const wrapped = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
  wrapped.cancel = () => window.clearTimeout(timer);
  return wrapped;
}

export function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function formatLocation(item) {
  return item.province === item.city ? item.city : `${item.province}${item.city}`;
}

export function aggregateRecords(records) {
  const grouped = new Map();
  records.forEach((record) => {
    const key = `${record.province}::${record.city}`;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      if (new Date(record.createdAt) > new Date(current.latestAt)) current.latestAt = record.createdAt;
    } else {
      grouped.set(key, { ...record, count: 1, latestAt: record.createdAt });
    }
  });
  return [...grouped.values()];
}

export function createRecordId() {
  return globalThis.crypto?.randomUUID?.() ?? `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
