/**
 * NZIoT platform Node-RED settings.
 *
 * Usage:
 *   cd D:/work/IOT_new/node-red
 *   npm run build
 *   npx node-red --settings nziot/settings.js -u nziot/data
 *
 * 鉴权机制：
 *  - 后端在 /iot/node/tab/page 接口的 nodeToken 字段中返回平台 accessToken
 *  - 前端 iframe 拼接 ?access_token={accessToken}#flow/{tabId}
 *  - Node-RED 编辑器读取 access_token 并在后续请求中带 Authorization: Bearer
 *  - Node-RED adminAuth.tokens 回调拿着 accessToken 去调平台接口校验身份
 *  - 平台返回 errcode===0 则放行；errcode===401 则拒绝
 */

const path = require("path");

// 平台校验接口地址。
// - 开发/测试环境直连后端: http://192.168.3.96:19092
// - 生产环境 Node-RED 和平台在同一台 Nginx 后面，可用: http://127.0.0.1:端口 或内网地址
// - 也可通过环境变量覆盖
const PLATFORM_API_BASE = process.env.NZIOT_PLATFORM_API || "http://192.168.3.96:19092";

// ---- token 校验结果短期缓存（避免每个请求都调一次后端） ----
const tokenCache = new Map(); // token -> { result, expireAt }
const CACHE_TTL = 60 * 1000;  // 缓存 60 秒

async function verifyPlatformToken(token) {
    // 1. 查缓存
    const cached = tokenCache.get(token);
    if (cached && cached.expireAt > Date.now()) {
        return cached.result;
    }

    // 2. 调平台接口校验（用 accessToken 请求头，和平台前端 axios 拦截器一致）
    try {
        const response = await fetch(PLATFORM_API_BASE + "/iot/dashboard/overview", {
            headers: { "accessToken": token }
        });
        const body = await response.json();

        if (body && body.errcode === 0) {
            // 校验通过
            const result = { username: "platform-user", permissions: "*" };
            tokenCache.set(token, { result, expireAt: Date.now() + CACHE_TTL });
            return result;
        }

        // errcode !== 0（包括 401 "请先登录"）=> 拒绝
        console.log("[nziot] token rejected:", body.errcode, body.message);
        tokenCache.set(token, { result: null, expireAt: Date.now() + 10000 });
        return null;
    } catch (err) {
        console.error("[nziot] token verify error:", err.message);
        // 网络错误不缓存，下次重试
        return null;
    }
}

module.exports = {
    // ------------------------------------------------------------------
    // Flow file / user dir
    // ------------------------------------------------------------------
    flowFile: "flows.json",
    flowFilePretty: true,
    userDir: path.join(__dirname, "data"),
    nodesDir: [path.join(__dirname, "nziot-flow-runner")],

    // ------------------------------------------------------------------
    // Security（调平台接口校验 accessToken）
    // ------------------------------------------------------------------
    adminAuth: {
        type: "credentials",
        users: [],
        tokens: verifyPlatformToken
    },

    // Protect runtime HTTP-In endpoints behind a separate prefix path.
    httpNodeRoot: "/node-api",

    // ------------------------------------------------------------------
    // Server
    // ------------------------------------------------------------------
    uiPort: process.env.PORT || 1880,

    // ------------------------------------------------------------------
    // Editor trimming
    // ------------------------------------------------------------------
    editorTheme: {
        theme: "nziot-flow-runner",
        userMenu: false,
        tours: false,
        projects: { enabled: false },
        palette: { editable: false },
        menu: {
            "menu-item-workspace-add": false,
            "menu-item-workspace-delete": false,
            "menu-item-import-library": false,
            "menu-item-export-library": false
        }
    },

    // ------------------------------------------------------------------
    // Runtime hardening (v1)
    // ------------------------------------------------------------------
    externalModules: {
        autoInstall: false,
        palette: {
            allowInstall: false,
            allowUpload: false,
            allowUpdate: false
        },
        modules: { allowInstall: false }
    },

    // Stable credential secret - do NOT change once flows hold credentials.
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || "nziot-v1-dev-secret",

    logging: {
        console: {
            level: process.env.NODE_RED_LOG_LEVEL || "info",
            metrics: false,
            audit: false
        }
    },

    diagnostics: { enabled: false, ui: false },
    telemetryEnabled: false,
    runtimeState: { enabled: false, ui: false }
};
