# 四川农业大学信息工程学院迎新互动打卡系统

面向迎新现场大屏的全国新生生源轨迹与个人数字形象系统。项目使用 Vite、原生 HTML/CSS/JavaScript、Apache ECharts，以及一个仅监听本机的 Node.js + Express 头像代理服务。

核心功能包括：

- 全国生源城市搜索、动态飞线、历史轨迹聚合与统计；
- 中文、拼音全拼和拼音首字母检索；
- 百度人像动漫化 AI 头像；
- 完全离线的 DiceBear Pixel Art 简单捏脸；
- 蓝、青、紫、绿四种科技主题和本地 SVG 科技配件；
- 768×768 PNG 科技头像合成、地图终点绑定和下载；
- 本地记录持久化、撤销、导入、导出与清空。

头像和自拍只存在于当前浏览器内存中，不写入 `localStorage`，也不会加入历史轨迹记录。每个最终合成头像从绑定时起拥有 1 小时生命周期，并在地图终点独立渐隐；页面刷新会立即清除所有头像。

## 环境要求

- Node.js 22.12+（推荐 Node.js 22 或 24 LTS）
- npm 10+
- Chrome、Edge 或 Firefox 的较新版本

摄像头功能通常需要通过 `localhost`、`127.0.0.1` 或 HTTPS 页面访问。

## 安装和配置

```bash
# 1. 安装依赖
npm install

# 2. 创建本地配置
cp .env.example .env

# 3. 编辑 .env，填写百度 API Key 和 Secret Key

# 4. 同时启动 Vite 和本地头像 API
npm run dev
```

启动后：

```text
前端：http://127.0.0.1:5173
头像服务：http://127.0.0.1:3001
健康检查：http://127.0.0.1:3001/api/health
```

Ubuntu 也可执行：

```bash
chmod +x start.sh
./start.sh
```

## 百度 AI 配置

在百度 AI 开放平台创建应用并启用“人像动漫化”接口，然后把凭据写入本机 `.env`：

```env
BAIDU_API_KEY=控制台中的APIKey
BAIDU_SECRET_KEY=控制台中的SecretKey
AVATAR_SERVER_PORT=3001
```

请保持默认端口 `3001`，它与 Vite 开发代理配置一致。`.env` 已被 `.gitignore` 排除，禁止提交真实密钥；不要使用 `VITE_BAIDU_API_KEY` 或其他 `VITE_` 前缀保存密钥，因为这类变量会进入浏览器构建。

检查配置状态：

```bash
curl http://127.0.0.1:3001/api/health
```

配置正确时返回：

```json
{
  "ok": true,
  "provider": "baidu-selfie-anime",
  "configured": true
}
```

如果 `configured` 为 `false`，请检查 `.env` 后重新启动 `npm run dev`。

未配置密钥时，Express 服务仍会启动。用户点击 AI 模式会看到明确提示，并可切换到不上传照片、不产生 API 费用的简单捏脸模式。

## 开发、构建与预览

```bash
# 同时运行前端和本地 API
npm run dev

# 仅执行前端生产构建
npm run build

# 仅预览静态前端
npm run preview -- --host 127.0.0.1 --port 4173
```

`vite preview` 不会启动 Express，因此只能检查静态界面和简单捏脸，不能使用 AI 生成功能。迎新现场需要 AI 时请使用 `npm run dev`。

正式运行需要本地 HTTP 服务，不支持直接双击 `dist/index.html`。

## 现场操作

1. 搜索并选择生源城市，点击“生成我的求学轨迹”。
2. 轨迹抵达雅安后，可选择“生成 AI 数字形象”“简单捏脸”或“直接完成”。
3. AI 模式需要用户主动选择照片并确认上传说明，系统不会自动调用接口。
4. 完成头像后可切换主题和配件、绑定地图终点，并下载正方形 PNG。
5. 点击右上角全屏按钮进入或退出全屏，也可使用浏览器 F11。
6. 连续点击顶部 `V1.0` 五次打开隐藏管理面板。

结果页未操作 20 秒后自动复位。复位、取消或完成时会停止摄像头，并立即清除自拍和 AI 基础头像。已经绑定的最终合成头像只保留在地图内存中：最多同时显示 100 个，每个头像从绑定开始在 1 小时内线性渐隐；超过 100 个时会优先移除最早加入的头像。

## 数据备份与恢复

生源记录保存在浏览器 `localStorage` 的 `sicau-welcome-origin-records-v1` 键中，只包含省份、城市、坐标、距离和时间。清理浏览器站点数据会删除记录，活动期间建议定时在管理面板中导出 JSON。

导入操作会先校验文件，再由工作人员确认是否覆盖。非法文件不会修改现有记录。

## 网络与隐私边界

- 地图、ECharts、校方标识、城市数据、DiceBear 和配件全部本地化；简单捏脸可断网使用。
- AI 模式需要访问百度 AI 服务；浏览器只请求本机 `/api`，百度密钥和令牌不会进入前端。
- 自拍会在浏览器内裁成 1024×1024 并压缩后发送，不会保存到统计记录。
- 服务端不会打印 Base64 照片、密钥、令牌或请求正文。
- 百度令牌仅缓存在 Express 进程内存中，令牌失效时最多自动刷新并重试一次。

## 本地素材与参考

- 四川农业大学标识：`https://www.sicau.edu.cn/theme/images/logo.png`
- 信息工程学院标识：`https://xxgc.sicau.edu.cn/dfiles/14355/wp-content/uploads/2017/04/logo.png`
- 中国省级边界：阿里云 DataV Atlas `100000_full.json`
- 百度人像动漫化：`https://ai.baidu.com/ai-doc/IMAGEPROCESS/Mk4i6olx5`
- 百度鉴权机制：`https://ai.baidu.com/ai-doc/REFERENCE/Ck3dwjhhu`
- DiceBear Pixel Art：`https://www.dicebear.com/styles/pixel-art/`，风格采用 CC0 1.0 许可

所有距离均使用 Haversine 公式计算大圆直线距离，不代表公路或铁路里程。
