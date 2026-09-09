# Node-RED 本地启动（NZIoT 定制版）

## 前置条件

- Node.js ≥ 22.9（本机已装 v22.22.3，通过 nvm 切换：`nvm use 22.22.3`）
- 已克隆 fork：`D:/work/IOT_new/node-red`（Ahaot1024/node-red）

## 构建与启动

```bash
cd D:/work/IOT_new/node-red
npm install          # 首次
npm run build        # 构建编辑器前端资源

# 启动（PowerShell）
$env:NODE_RED_TOKENS="test-token-123"        # 允许的 nodeToken，逗号分隔
$env:NODE_RED_CREDENTIAL_SECRET="nziot-dev-secret"
D:\myapp\nvm\nvm\v22.22.3\node.exe packages\node_modules\node-red\red.js --settings nziot/settings.js -u nziot/data

# 启动（Git Bash）
NODE_RED_TOKENS=test-token-123 NODE_RED_CREDENTIAL_SECRET=nziot-dev-secret \
  /d/myapp/nvm/nvm/v22.22.3/node.exe packages/node_modules/node-red/red.js \
  --settings nziot/settings.js -u nziot/data
```

- 服务地址：http://127.0.0.1:1880/
- 流程数据：`nziot/data/flows.json`（凭据 `nziot/data/flows_cred.json`）

## NZIoT 定制内容

| 文件 | 作用 |
|---|---|
| `nziot/settings.js` | 平台定制配置：token 鉴权、裁剪编辑器、锁 palette、关 Projects/tours |
| `nziot/nziot-flow-runner/` | 平台编辑器主题插件（node-red-theme） |
| `nziot/nziot-flow-runner/plugin.js` | 运行时注册：scripts/css/菜单裁剪 |
| `nziot/nziot-flow-runner/files/clientside.js` | 编辑器内脚本：钉定目标流程 tab + postMessage 桥 |
| `nziot/nziot-flow-runner/files/theme.css` | 主题 CSS（预留品牌定制） |

### 插件生效方式

插件按 Node-RED 标准约定从 **userDir/node_modules** 加载（本地开发目录为 `nziot/data/node_modules/nziot-flow-runner`）。修改 `nziot/nziot-flow-runner/` 源码后需要同步到 data 目录：

```bash
cp -r nziot/nziot-flow-runner/* nziot/data/node_modules/nziot-flow-runner/
```

（生产镜像中直接把插件目录放到 userDir/node_modules，无需此步。）

`settings.js` 中 `editorTheme.theme: "nziot-flow-runner"` 激活主题插件：编辑器 HTML 会注入 `theme/scripts/clientside.js` 与 `theme/css/theme.css`。

## 鉴权（v1）

- 平台后端在 `/iot/node/tab/page` 返回 `nodeToken`
- Node-RED 侧 `adminAuth.tokens` 回调对照 `NODE_RED_TOKENS` 白名单校验
- 前端 iframe 地址：`{url}?access_token={nodeToken}#flow/{tabId}`
- Node-RED 编辑器读取 `access_token` 存入 localStorage → AJAX 自动带 `Authorization: Bearer` → WebSocket 连接后发 auth 包

验证：

```bash
curl -o /dev/null -w "%{http_code}" http://127.0.0.1:1880/flows                              # 401
curl -o /dev/null -w "%{http_code}" -H "Authorization: Bearer wrong" http://127.0.0.1:1880/flows  # 401
curl -o /dev/null -w "%{http_code}" -H "Authorization: Bearer test-token-123" http://127.0.0.1:1880/flows  # 200
```

## postMessage 桥协议

父页面（`views/flow/red/editor.vue`）↔ iframe（clientside.js）：

| 方向 | type | 说明 |
|---|---|---|
| 子→父 | `nziot:ready` | flows 加载完成；附 flowId/dirty/revision |
| 子→父 | `nziot:dirty` | dirty 状态变化 |
| 子→父 | `nziot:deploy-result` | 部署结果 `{ok, revision?/error?}` |
| 父→子 | `nziot:deploy` | 触发原生 Deploy（保留 409 冲突处理） |
| 父→子 | `nziot:reload` | 重载编辑器 |
| 父→子 | `nziot:request-state` | 请求上报当前状态 |

子端校验 `event.source === window.parent` 与 origin；父端同样校验。

## 已裁剪的编辑器能力

- 菜单：新增/删除流程 tab、导入/导出库（theme.menu）
- 添加 tab 按钮、workspace tabs 条（clientside.js 注入 CSS）
- palette 安装/上传/更新（externalModules）
- Projects、欢迎导览、用户菜单、诊断/遥测
- 非 target 流程 tab 自动隐藏；切换到其它 tab 会被弹回

## 已知限制（v1）

- 共享 runtime：任何持 token 用户都能通过 API 拿到全部流程 JSON（UI 隐藏≠隔离）
- `?access_token=` 是 Node-RED deprecated 机制，token 可能进 URL/日志
- 静态 token 白名单无过期/撤销；重启更换 `NODE_RED_TOKENS` 即全量生效
- 授权记录 id 缺失：平台授权弹窗暂无「移除授权」按钮
