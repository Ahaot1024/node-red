# Node-RED 本地启动（NZIoT 定制版）

## 前置条件

- Node.js ≥ 22.9（本机已装 v22.22.3，通过 nvm 切换：`nvm use 22.22.3`）
- 已克隆 fork：`D:/work/IOT_new/node-red`（Ahaot1024/node-red）

## 构建与启动

```bash
cd D:/work/IOT_new/node-red
npm install          # 首次
npm run build        # 构建编辑器前端资源

# 启动（Git Bash）
NODE_RED_CREDENTIAL_SECRET=nziot-dev-secret \
  /d/myapp/nvm/nvm/v22.22.3/node.exe packages/node_modules/node-red/red.js \
  --settings nziot/settings.js -u nziot/data
```

服务地址：http://127.0.0.1:1880/

## 鉴权机制

1. 后端 `/iot/node/tab/page` 接口的 `nodeToken` 字段返回平台 accessToken
2. 前端 iframe 拼接 `?access_token={accessToken}#flow/{tabId}`
3. Node-RED 编辑器读取 access_token，后续请求自动带 `Authorization: Bearer`
4. Node-RED `adminAuth.tokens` 回调拿着 accessToken 调平台接口 `GET /iot/dashboard/overview`
5. 平台返回 `errcode===0` 放行；`errcode===401` 拒绝

用户退出平台后 accessToken 失效，Node-RED 也自动拒绝，无需额外撤销。

校验结果缓存 60 秒，避免每个请求都调一次后端。

## 服务器部署（Docker）

### 第 1 步：拉代码 + 启动

```bash
cd /home/root/app
git clone https://github.com/Ahaot1024/node-red.git
cd node-red
docker compose up -d --build
```

等 3～5 分钟，看到 `Started flows` 就是成功：

```bash
docker compose logs -f    # 看日志，Ctrl+C 退出
```

### 第 2 步：Nginx 加反代

把 `deploy/nginx-nodered.conf` 的内容加到你 Nginx 的 `server {}` 块中，然后：

```bash
nginx -t && nginx -s reload
```

### 第 3 步：验证

浏览器打开 `http://192.168.3.96/nodered/`，应该看到 Node-RED 编辑器。

### 以后更新

```bash
cd /home/root/app/node-red
git pull
docker compose up -d --build    # 自动重建+重启，流程数据不丢
```

## NZIoT 定制内容

| 文件 | 作用 |
|---|---|
| `nziot/settings.js` | 平台定制配置：调平台接口鉴权、裁剪编辑器、锁 palette |
| `nziot/nziot-flow-runner/plugin.js` | node-red-theme 插件：注入编辑器脚本/CSS + 菜单覆盖 |
| `nziot/nziot-flow-runner/files/clientside.js` | 编辑器内脚本：钉定目标流程 tab + postMessage 桥 |
| `nziot/nziot-flow-runner/files/theme.css` | 主题 CSS（预留品牌定制） |
| `Dockerfile` | Docker 镜像构建 |
| `docker-compose.yml` | 一键启动 |
| `deploy/nginx-nodered.conf` | Nginx 反代配置 |

## postMessage 桥协议

| 方向 | type | 说明 |
|---|---|---|
| 子→父 | `nziot:ready` | flows 加载完成 |
| 子→父 | `nziot:dirty` | dirty 状态变化 |
| 子→父 | `nziot:deploy-result` | 部署结果 `{ok, revision?, error?}` |
| 父→子 | `nziot:deploy` | 触发原生 Deploy |
| 父→子 | `nziot:reload` | 重载编辑器 |

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NZIOT_PLATFORM_API` | `http://192.168.3.96:19092` | 平台后端地址（校验 accessToken 用） |
| `NODE_RED_CREDENTIAL_SECRET` | `nziot-v1-dev-secret` | 凭据加密密钥（定了就别改） |
| `NODE_RED_LOG_LEVEL` | `info` | 日志级别 |
| `PORT` | `1880` | Node-RED 监听端口 |
