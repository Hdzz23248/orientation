import 'dotenv/config';
import express from 'express';
import { createAnimeAvatar } from './baidu-avatar.js';

const app = express();
const configuredPort = Number(process.env.AVATAR_SERVER_PORT || 3001);
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65_536
  ? configuredPort
  : 3001;

app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    provider: 'baidu-selfie-anime',
    configured: Boolean(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY),
  });
});

app.post('/api/avatar', async (request, response) => {
  const { imageDataUrl, consent } = request.body || {};
  if (consent !== true) {
    return response.status(400).json({
      code: 'CONSENT_REQUIRED',
      message: '请先确认照片上传说明',
    });
  }
  if (typeof imageDataUrl !== 'string') {
    return response.status(400).json({
      code: 'INVALID_IMAGE',
      message: '没有收到有效照片',
    });
  }

  try {
    const result = await createAnimeAvatar(imageDataUrl);
    return response.json(result);
  } catch (error) {
    const notConfigured = error.message === 'BAIDU_NOT_CONFIGURED';
    const invalidImage = error.message === 'INVALID_IMAGE_DATA' || error.message === 'IMAGE_TOO_LARGE';
    const timedOut = error.name === 'AbortError';
    console.error('[avatar-api]', notConfigured ? 'not configured' : invalidImage ? 'invalid image' : timedOut ? 'timeout' : 'provider request failed');
    return response.status(notConfigured ? 503 : invalidImage ? 400 : timedOut ? 504 : 502).json({
      code: notConfigured
        ? 'BAIDU_NOT_CONFIGURED'
        : invalidImage
          ? 'INVALID_IMAGE'
          : timedOut
            ? 'BAIDU_TIMEOUT'
            : 'BAIDU_REQUEST_FAILED',
      message: notConfigured
        ? 'AI 服务尚未配置，请使用简单捏脸'
        : invalidImage
          ? '照片格式或大小不符合要求'
          : timedOut
            ? 'AI 生成超时，请重试或使用简单捏脸'
            : 'AI 生成失败，请换一张正面清晰自拍，或使用简单捏脸',
    });
  }
});

app.use((error, _request, response, _next) => {
  const tooLarge = error?.type === 'entity.too.large';
  console.error('[avatar-api]', tooLarge ? 'request too large' : 'invalid request');
  response.status(tooLarge ? 413 : 400).json({
    code: tooLarge ? 'IMAGE_TOO_LARGE' : 'INVALID_REQUEST',
    message: tooLarge ? '照片数据过大，请重新选择' : '请求格式无效',
  });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Avatar API: http://127.0.0.1:${port}`);
});
