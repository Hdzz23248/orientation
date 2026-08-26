import { generateAnimeAvatar, getAvatarServiceHealth } from './avatar-service.js';
import {
  AVATAR_ACCESSORIES,
  AVATAR_THEMES,
  MANUAL_AVATAR_SEEDS,
  composeAvatar,
  createManualAvatar,
  prepareSelfie,
} from './avatar-image.js';

export function createAvatarController({ onComplete, onCancel }) {
  const elements = {
    modal: document.querySelector('#avatar-modal'),
    title: document.querySelector('#avatar-title'),
    subtitle: document.querySelector('#avatar-subtitle'),
    close: document.querySelector('#avatar-close'),
    cancel: document.querySelector('#avatar-cancel'),
    preview: document.querySelector('#avatar-preview-image'),
    placeholder: document.querySelector('#avatar-placeholder'),
    video: document.querySelector('#avatar-video'),
    generating: document.querySelector('#avatar-generating'),
    camera: document.querySelector('#avatar-camera-btn'),
    file: document.querySelector('#avatar-file'),
    fileLabel: document.querySelector('label[for="avatar-file"]'),
    takePhoto: document.querySelector('#avatar-take-photo'),
    consentWrap: document.querySelector('#avatar-consent-wrap'),
    consent: document.querySelector('#avatar-consent'),
    error: document.querySelector('#avatar-error'),
    errorActions: document.querySelector('#avatar-error-actions'),
    retry: document.querySelector('#avatar-retry'),
    useManual: document.querySelector('#avatar-use-manual'),
    composeError: document.querySelector('#avatar-compose-error'),
    generate: document.querySelector('#avatar-generate'),
    complete: document.querySelector('#avatar-complete'),
    manualSection: document.querySelector('#manual-avatar-section'),
    manualGrid: document.querySelector('#manual-avatar-grid'),
    themeOptions: document.querySelector('#avatar-theme-options'),
    accessoryOptions: document.querySelector('#avatar-accessory-options'),
  };

  let stage = 'capture';
  let mode = 'ai';
  let source = null;
  let stream = null;
  let selfieDataUrl = null;
  let baseImageDataUrl = null;
  let composedImageDataUrl = null;
  let theme = 'cyan';
  let accessory = 'none';
  let seed = MANUAL_AVATAR_SEEDS[0];
  let busy = false;
  let serviceReady = false;
  let composeToken = 0;
  let session = null;

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    elements.video.srcObject = null;
    elements.video.hidden = true;
    elements.takePhoto.hidden = true;
  }

  function showError(message, withActions = false) {
    elements.error.textContent = message;
    elements.error.hidden = false;
    elements.errorActions.hidden = !withActions;
  }

  function clearError() {
    elements.error.textContent = '';
    elements.error.hidden = true;
    elements.errorActions.hidden = true;
    elements.composeError.hidden = true;
    elements.composeError.textContent = '';
  }

  function showPreview(sourceUrl) {
    elements.preview.src = sourceUrl;
    elements.preview.hidden = false;
    elements.placeholder.hidden = true;
    elements.video.hidden = true;
  }

  function showStage(nextStage) {
    stage = nextStage;
    document.querySelectorAll('[data-avatar-stage]').forEach((section) => {
      section.hidden = section.dataset.avatarStage !== nextStage;
    });
    const editing = nextStage === 'editing';
    elements.generate.hidden = editing;
    elements.complete.hidden = !editing;
    elements.manualSection.hidden = source !== 'manual';
    elements.title.textContent = editing ? '定制你的信工数字形象' : '创建你的 AI 数字形象';
    elements.subtitle.textContent = editing
      ? `${session?.origin || '你的家乡'} → ${session?.campus || '川农信工 · 雅安'}`
      : '照片仅用于本次生成，完成或退出后自动清除';
  }

  function setBusy(active, message = '正在生成数字形象') {
    busy = active;
    elements.generating.hidden = !active;
    elements.generating.querySelector('strong').textContent = message;
    elements.close.disabled = active;
    elements.cancel.disabled = active;
    elements.camera.disabled = active || !serviceReady;
    elements.file.disabled = active || !serviceReady;
    elements.fileLabel.classList.toggle('is-disabled', active || !serviceReady);
    elements.retry.disabled = active;
    elements.useManual.disabled = active;
    elements.consent.disabled = active;
    elements.generate.disabled = active || !selfieDataUrl || !elements.consent.checked;
    elements.complete.disabled = active || !composedImageDataUrl;
  }

  async function updateComposition() {
    const token = ++composeToken;
    composedImageDataUrl = null;
    setBusy(true, '正在装配科技形象');
    clearError();
    try {
      if (source === 'manual') {
        baseImageDataUrl = createManualAvatar(seed, AVATAR_THEMES[theme].background);
      }
      const result = await composeAvatar({ baseImageDataUrl, theme, accessory });
      if (token !== composeToken) return;
      composedImageDataUrl = result;
      showPreview(result);
    } catch {
      if (token !== composeToken) return;
      elements.composeError.textContent = '头像合成失败，请重新选择基础形象';
      elements.composeError.hidden = false;
    } finally {
      if (token === composeToken) setBusy(false);
    }
  }

  async function switchToManual() {
    stopCamera();
    selfieDataUrl = null;
    elements.consent.checked = false;
    source = 'manual';
    mode = 'manual';
    showStage('editing');
    updateOptionStates();
    await updateComposition();
  }

  async function startCamera() {
    clearError();
    if (!serviceReady) {
      showError('AI 服务尚未配置或无法连接，请使用简单捏脸。', true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showError('当前浏览器不支持摄像头，请选择本地照片。');
      return;
    }
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      elements.video.srcObject = stream;
      elements.video.hidden = false;
      elements.preview.hidden = true;
      elements.placeholder.hidden = true;
      elements.takePhoto.hidden = false;
      await elements.video.play();
    } catch {
      stopCamera();
      elements.placeholder.hidden = false;
      showError('无法使用摄像头，请检查权限或选择本地照片。');
    }
  }

  async function usePhoto(blob) {
    clearError();
    setBusy(true, '正在裁剪压缩照片');
    try {
      selfieDataUrl = await prepareSelfie(blob);
      showPreview(selfieDataUrl);
      elements.consentWrap.hidden = false;
      elements.consent.checked = false;
    } catch (error) {
      selfieDataUrl = null;
      elements.consentWrap.hidden = true;
      elements.placeholder.hidden = false;
      elements.preview.hidden = true;
      showError(error.message || '图片读取失败，请重新选择照片');
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    if (!stream || !elements.video.videoWidth) {
      showError('摄像头画面尚未准备好，请稍后重试。');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = elements.video.videoWidth;
    canvas.height = elements.video.videoHeight;
    canvas.getContext('2d').drawImage(elements.video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    stopCamera();
    if (blob) await usePhoto(blob);
  }

  async function generateWithAi() {
    if (busy || !selfieDataUrl || !elements.consent.checked) return;
    clearError();
    setBusy(true);
    try {
      baseImageDataUrl = await generateAnimeAvatar(selfieDataUrl);
      selfieDataUrl = null;
      elements.consent.checked = false;
      elements.consentWrap.hidden = true;
      source = 'baidu';
      showStage('editing');
      updateOptionStates();
      await updateComposition();
    } catch (error) {
      showError(error.message || 'AI 生成失败，请重试或使用简单捏脸', true);
    } finally {
      setBusy(false);
    }
  }

  function updateOptionStates() {
    elements.manualGrid.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.seed === seed);
      button.setAttribute('aria-pressed', String(button.dataset.seed === seed));
    });
    elements.themeOptions.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.theme === theme);
      button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
    });
    elements.accessoryOptions.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.accessory === accessory);
      button.setAttribute('aria-pressed', String(button.dataset.accessory === accessory));
    });
  }

  function buildOptions() {
    MANUAL_AVATAR_SEEDS.forEach((avatarSeed, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.seed = avatarSeed;
      button.setAttribute('aria-label', `基础形象 ${index + 1}`);
      const image = document.createElement('img');
      image.alt = '';
      image.src = createManualAvatar(avatarSeed, AVATAR_THEMES.cyan.background);
      button.append(image);
      button.addEventListener('click', () => {
        if (busy) return;
        seed = avatarSeed;
        updateOptionStates();
        updateComposition();
      });
      elements.manualGrid.append(button);
    });

    Object.entries(AVATAR_THEMES).forEach(([value, option]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.theme = value;
      const color = document.createElement('i');
      color.style.backgroundColor = option.color;
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(color, label);
      button.addEventListener('click', () => {
        if (busy || theme === value) return;
        theme = value;
        updateOptionStates();
        updateComposition();
      });
      elements.themeOptions.append(button);
    });

    Object.entries(AVATAR_ACCESSORIES).forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.accessory = value;
      button.textContent = label;
      button.addEventListener('click', () => {
        if (busy || accessory === value) return;
        accessory = value;
        updateOptionStates();
        updateComposition();
      });
      elements.accessoryOptions.append(button);
    });
  }

  function reset() {
    stopCamera();
    composeToken += 1;
    stage = 'capture';
    mode = 'ai';
    source = null;
    selfieDataUrl = null;
    baseImageDataUrl = null;
    composedImageDataUrl = null;
    theme = 'cyan';
    accessory = 'none';
    seed = MANUAL_AVATAR_SEEDS[0];
    busy = false;
    serviceReady = false;
    session = null;
    elements.file.value = '';
    elements.consent.checked = false;
    elements.consentWrap.hidden = true;
    elements.preview.removeAttribute('src');
    elements.preview.hidden = true;
    elements.placeholder.hidden = false;
    elements.generating.hidden = true;
    elements.modal.hidden = true;
    document.body.classList.remove('avatar-modal-open');
    clearError();
    setBusy(false);
    updateOptionStates();
  }

  function cancel() {
    if (busy || elements.modal.hidden) return;
    reset();
    onCancel?.();
  }

  async function open(nextSession) {
    reset();
    session = nextSession;
    mode = nextSession.mode;
    elements.modal.hidden = false;
    document.body.classList.add('avatar-modal-open');
    if (mode === 'manual') {
      await switchToManual();
      return;
    }
    showStage('capture');
    setBusy(true, '正在连接本地头像服务');
    const health = await getAvatarServiceHealth();
    serviceReady = health.available && health.configured;
    setBusy(false);
    if (!health.available) showError('本地头像服务无法连接，请确认使用 npm run dev 启动，或改用简单捏脸。', true);
    else if (!health.configured) showError('AI 服务尚未配置，请联系现场工作人员或使用简单捏脸。', true);
  }

  elements.camera.addEventListener('click', startCamera);
  elements.takePhoto.addEventListener('click', takePhoto);
  elements.file.addEventListener('change', async () => {
    const [file] = elements.file.files;
    elements.file.value = '';
    if (file) await usePhoto(file);
  });
  elements.consent.addEventListener('change', () => setBusy(false));
  elements.generate.addEventListener('click', generateWithAi);
  elements.retry.addEventListener('click', () => {
    clearError();
    if (selfieDataUrl) generateWithAi();
  });
  elements.useManual.addEventListener('click', switchToManual);
  elements.complete.addEventListener('click', () => {
    if (busy || !composedImageDataUrl) return;
    const result = { source, imageDataUrl: composedImageDataUrl, theme, accessory };
    reset();
    onComplete?.(result);
  });
  elements.close.addEventListener('click', cancel);
  elements.cancel.addEventListener('click', cancel);
  elements.modal.addEventListener('pointerdown', (event) => {
    if (event.target === elements.modal) cancel();
  });

  buildOptions();
  updateOptionStates();
  reset();

  return {
    open,
    reset() {
      reset();
    },
    cancel,
    isOpen: () => !elements.modal.hidden,
    getStage: () => stage,
  };
}
