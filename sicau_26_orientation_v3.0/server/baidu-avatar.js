const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const ANIME_URL = 'https://aip.baidubce.com/rest/2.0/image-process/v1/selfie_anime';

let tokenCache = null;

function requireCredentials() {
  if (!process.env.BAIDU_API_KEY || !process.env.BAIDU_SECRET_KEY) {
    throw new Error('BAIDU_NOT_CONFIGURED');
  }
}

async function readJson(response, fallbackMessage) {
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

async function getAccessToken() {
  requireCredentials();

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const query = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.BAIDU_API_KEY,
    client_secret: process.env.BAIDU_SECRET_KEY,
  });

  const response = await fetch(`${TOKEN_URL}?${query}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  const data = await readJson(response, 'BAIDU_AUTH_FAILED');

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'BAIDU_AUTH_FAILED');
  }

  const expiresInSeconds = Number(data.expires_in || 2_592_000);
  const safetySeconds = 3_600;
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, expiresInSeconds - safetySeconds) * 1_000,
  };
  return tokenCache.value;
}

function extractBase64(imageDataUrl) {
  const match = imageDataUrl.match(/^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('INVALID_IMAGE_DATA');
  if (match[1].length > 10 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
  return match[1];
}

export async function createAnimeAvatar(imageDataUrl, canRefreshToken = true) {
  const accessToken = await getAccessToken();
  const image = extractBase64(imageDataUrl);
  const body = new URLSearchParams({ image, type: 'anime' });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${ANIME_URL}?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const data = await readJson(response, 'BAIDU_GENERATION_FAILED');

    if (canRefreshToken && (data.error_code === 110 || data.error_code === 111)) {
      tokenCache = null;
      return createAnimeAvatar(imageDataUrl, false);
    }
    if (!response.ok || data.error_code || !data.image) {
      throw new Error(data.error_msg || 'BAIDU_GENERATION_FAILED');
    }
    return {
      imageDataUrl: `data:image/png;base64,${data.image}`,
      logId: data.log_id,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function clearTokenCacheForTests() {
  tokenCache = null;
}
