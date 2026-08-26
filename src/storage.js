import { MAX_IMPORT_RECORDS, STORAGE_BACKUP_PREFIX, STORAGE_KEY } from './config.js';

let storageWarning = '';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length < 100;
}

export function isValidRecord(record) {
  return Boolean(record)
    && typeof record === 'object'
    && isNonEmptyString(record.province)
    && isNonEmptyString(record.city)
    && Number.isFinite(record.longitude)
    && Number.isFinite(record.latitude)
    && record.longitude >= 70 && record.longitude <= 140
    && record.latitude >= 0 && record.latitude <= 60
    && Number.isFinite(record.distanceKm)
    && record.distanceKm >= 0
    && !Number.isNaN(Date.parse(record.createdAt));
}

export function loadRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('记录顶层不是数组');
    const valid = parsed.filter(isValidRecord);
    if (valid.length !== parsed.length) storageWarning = `已忽略 ${parsed.length - valid.length} 条无效本地记录。`;
    return valid;
  } catch (error) {
    try {
      localStorage.setItem(`${STORAGE_BACKUP_PREFIX}${Date.now()}`, raw);
    } catch {
      // 即使备份失败，也要让主界面可继续使用。
    }
    storageWarning = `检测到损坏的本地数据，已安全忽略。${error.message}`;
    return [];
  }
}

export function saveRecords(records) {
  if (!Array.isArray(records) || records.some((record) => !isValidRecord(record))) {
    throw new Error('拒绝保存无效记录');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return records;
}

export function appendRecord(record) {
  if (!isValidRecord(record)) throw new Error('记录字段不完整');
  const records = loadRecords();
  records.push(record);
  return saveRecords(records);
}

export function undoLastRecord() {
  const records = loadRecords();
  const removed = records.pop() ?? null;
  saveRecords(records);
  return { records, removed };
}

export function clearRecords() {
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

export function exportRecords(records = loadRecords()) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sicau-welcome-records-${date}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function importRecords(file) {
  if (!(file instanceof File)) throw new Error('请选择 JSON 文件');
  if (file.size > 12 * 1024 * 1024) throw new Error('文件过大，无法导入');
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('JSON 顶层必须是数组');
  if (parsed.length > MAX_IMPORT_RECORDS) throw new Error(`记录数量不能超过 ${MAX_IMPORT_RECORDS} 条`);
  const invalidIndex = parsed.findIndex((record) => !isValidRecord(record));
  if (invalidIndex >= 0) throw new Error(`第 ${invalidIndex + 1} 条记录字段无效`);
  return parsed.map((record, index) => ({
    ...record,
    id: isNonEmptyString(record.id) ? record.id : `import-${Date.now()}-${index}`,
    colorIndex: Number.isInteger(record.colorIndex) ? record.colorIndex : index % 5,
  }));
}

export function getStorageWarning() {
  return storageWarning;
}
