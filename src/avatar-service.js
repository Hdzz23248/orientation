const REQUEST_TIMEOUT = 35_000;

export async function getAvatarServiceHealth() {
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    return {
      available: response.ok && data.ok === true,
      configured: response.ok && data.configured === true,
    };
  } catch {
    return { available: false, configured: false };
  }
}

export async function generateAnimeAvatar(imageDataUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, consent: true }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.imageDataUrl) {
      const error = new Error(data.message || 'AI 头像生成失败');
      error.code = data.code || 'AVATAR_REQUEST_FAILED';
      throw error;
    }
    return data.imageDataUrl;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('AI 生成超时，请重试或使用简单捏脸');
      timeoutError.code = 'BAIDU_TIMEOUT';
      throw timeoutError;
    }
    if (error instanceof TypeError) {
      const networkError = new Error('头像服务暂时无法连接，请使用简单捏脸');
      networkError.code = 'NETWORK_ERROR';
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
