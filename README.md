# 四川农业大学信息工程学院迎新生源轨迹系统

面向迎新现场大屏的全国新生生源轨迹可视化前端。项目使用 Vite、原生 HTML/CSS/JavaScript 和 Apache ECharts；地图、城市数据、ECharts 与校方标识均已本地化，首次安装依赖并完成构建后可断网运行。

## 环境要求

- Node.js 20.19+ 或 22.12+（推荐 Node.js 22/24 LTS）
- npm 10+
- Chrome、Edge 或 Firefox 的较新版本

## 安装与启动

```bash
npm install
npm run dev
```

开发服务默认地址以终端输出为准，通常为 `http://127.0.0.1:5173`。

生产构建和预览：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Ubuntu 也可运行：

```bash
chmod +x start.sh
./start.sh
```

正式使用请通过本地 HTTP 服务访问，不支持直接双击 `dist/index.html`。

## 现场操作

- 在左侧输入中文城市名、省份名、城市全拼或拼音首字母，从候选列表中选择城市，再点击“生成我的求学轨迹”。
- 点击右上角全屏按钮进入或退出浏览器全屏；也可使用浏览器的 F11。
- 连续点击顶部 `V1.0` 版本号 5 次打开隐藏管理面板。
- 管理面板支持撤销最后一条、导出 JSON、导入 JSON 覆盖和清空记录。

## 数据备份与恢复

打卡记录保存在浏览器 `localStorage` 的 `sicau-welcome-origin-records-v1` 键中，不包含姓名、学号、手机号等个人信息。清理浏览器站点数据会删除记录，因此活动期间建议定时在管理面板中“导出 JSON 备份”。恢复时选择导出的 JSON 文件，验证通过并二次确认后会覆盖当前记录；非法文件不会修改现有数据。

## 断网运行

运行时不会请求 CDN、地图 API、在线字体或官网图片。完成 `npm install` 与 `npm run build` 后，断开网络仍可使用 `npm run preview -- --host 127.0.0.1 --port 4173` 启动。依赖未安装的全新电脑仍需先准备项目的 `node_modules` 或在联网时执行安装。

## 本地素材来源

- 四川农业大学标识：四川农业大学官网 `https://www.sicau.edu.cn/theme/images/logo.png`
- 信息工程学院标识：学院官网 `https://xxgc.sicau.edu.cn/dfiles/14355/wp-content/uploads/2017/04/logo.png`
- 学院及雅安校区信息：四川农业大学、信息工程学院官网
- 中国省级边界：阿里云 DataV Atlas `100000_full.json`（仅在开发制作阶段下载，运行时使用 `src/data/china.json`）
- 城市坐标：DataV 全国地级行政区中心点与公开城市坐标数据整理；仅用于全国尺度直线飞线展示

所有距离均使用 Haversine 公式计算大圆直线距离，不代表公路或铁路里程。
