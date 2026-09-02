# Docker 自动部署手册

推送代码到 `lyh` 分支后，GitHub Actions 会自动完成：**构建镜像 → 传到你的服务器 → 加载并重启容器**。一次 push，一行命令都不用上服务器。

## 部署架构

```
你 push 代码 (lyh)
      │
      ▼
GitHub Actions (云端)
  docker build  orientation:latest   ← 在云端构建，不占服务器资源
  docker save | gzip → orientation.tar.gz
  scp 传到服务器 /opt/orientation/
      │
      ▼
你的 Linux 服务器 (SSH)
  docker load ← 读入镜像
  写入百度密钥到 /opt/orientation/.env（来自 GitHub Secrets，不进镜像）
  重启 orientation 容器（--restart unless-stopped，开机自启）
  健康检查 http://127.0.0.1:3001/api/health
```

一个容器同时托管**前端页面 + /api（动漫化代理）**，访问服务器一个端口即可。

---

## 一、服务器一次性初始化（只需做一次）

在服务器上以你的部署用户（SSH 登录用户）执行：

```bash
# 1. 准备部署目录（workflow 依赖此目录，需对当前用户可写）
sudo mkdir -p /opt/orientation
sudo chown -R "$USER" /opt/orientation

# 2. 确认当前用户能执行 docker
docker version
id -nG | grep -q docker && echo "OK 在 docker 组" || echo "需运行: sudo usermod -aG docker $USER 并重新登录"

# 3.（推荐直接用 root 或已加 docker 组的用户做 SERVER_USER）
```

在**云服务商控制台 / 服务器防火墙**放行对外端口（默认 `3001`，若改了 `APP_PORT` 则放行对应端口），并确认该用户允许 SSH 登录。

> 服务器国内访问外网情况不影响部署——镜像在 GitHub 云端构建，只通过网络传一个 tar 到服务器，服务器无需访问 Docker Hub / GitHub。

## 二、配置 GitHub Actions Secrets

进仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加：

| Secret 名称 | 值 | 必需 |
|---|---|---|
| `SERVER_HOST` | 服务器公网 IP 或域名 | ✅ |
| `SERVER_USER` | SSH 登录用户名（需能跑 docker） | ✅ |
| `SERVER_SSH_KEY` | SSH **私钥**内容（PEM 格式，一整段，含首尾 `BEGIN/END` 行） | ✅ |
| `SERVER_SSH_PORT` | SSH 端口（默认 22） | 可选 |
| `APP_PORT` | 对外映射端口（默认 3001） | 可选 |
| `BAIDU_API_KEY` | 百度智能云 API Key | 可选* |
| `BAIDU_SECRET_KEY` | 百度智能云 Secret Key | 可选* |

\* 不填时线上「人物动漫化」会显示未配置并引导用简单捏脸；其余功能全部正常。填了才有动漫化。

**SSH 私钥怎么准备**（服务器上执行）：

```bash
# 若服务器已有 ~/.ssh/id_ed25519 等现成密钥对也可直接复用
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_deploy -C "github-actions"
cat ~/.ssh/id_deploy.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

把 `~/.ssh/id_deploy`（私钥）整段内容填进 `SERVER_SSH_KEY`。

> 这是 Git 公开仓库也没关系：Secrets 是加密存储的，不会出现在 workflow 日志里；私钥只用于 SSH 连接你的服务器。

## 三、部署与验证

1. push 到 `lyh`（默认）即自动触发；也可以到 **Actions → Deploy Docker to Server → Run workflow** 手动触发。
2. 在 Actions 页查看绿色即成功。
3. 验证：
   - 首页：`http://<你的服务器IP>:3001`
   - 头像服务：`http://<你的服务器IP>:3001/api/health` 应返回 `{"ok":true,...,"configured":true/false}`
   - 到「后台 → 生成 150 条演示数据」可看到统计/排行/树形图联动。

## 四、日常运维

```bash
docker ps                     # 容器状态
docker logs -f orientation    # 实时日志
docker restart orientation    # 重启（更新镜像不需要手动重启）
docker images                 # 查看历史镜像（自动清理旧的）
```

- **改完代码发版**：直接 push `lyh`，或手动 Run workflow。
- **换百度密钥**：改仓库 Secret 后手动跑一次 workflow 即可生效。
- **回滚**：手动跑一次更早提交的 workflow 不现实，最简单是从 git 回到上个提交再 push（或保留旧镜像手工 `docker run`）。

## 五、（可选）域名 + HTTPS

容器在 `:3001` 提供服务后，可在服务器上用 Nginx 反代到 80/443：

```nginx
server {
  listen 80;
  server_name your.domain.com;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

再配 certbot 申请 HTTPS 即可。之后浏览器（尤其调用摄像头拍照的 getUserMedia）需要 https 或 localhost 环境，HTTPS 是现场体验的必要项。

## 常见问题

- **Action 一直红、日志停在 scp/load**：多半是 `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` 不对，或服务器防火墙没放行 22 端口。
- **`/opt/orientation` 无法创建**：没做第一步的 `mkdir + chown`，或 `SERVER_USER` 权限不足。
- **部署成功但页面打不开**：云服务商安全组 / 服务器防火墙没放行 `APP_PORT`。
- **本地试构建**：装 Docker 后执行 `docker build -t orientation-test .` 可自测 Dockerfile。
