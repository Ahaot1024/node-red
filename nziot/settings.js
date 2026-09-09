/**
 * NZIoT platform Node-RED settings.
 *
 * Usage:
 *   cd D:/work/IOT_new/node-red
 *   npm run build
 *   npx node-red --settings nziot/settings.js -u nziot/data
 *
 * Security model (v1, trusted internal editors):
 *  - The platform backend issues `nodeToken` values; Node-RED validates them
 *    via adminAuth.tokens against NODE_RED_TOKENS (comma separated allow-list
 *    in the environment).
 *  - The editor is normally embedded as an iframe with
 *      {url}?access_token={nodeToken}#flow/{tabId}
 *    Node-RED's editor client stores the token and sends
 *    `Authorization: Bearer` on AJAX plus an auth packet on the WebSocket.
 */

const os = require("os");
const path = require("path");

// Allowed node tokens, comma separated. Empty => editor/API unauthenticated
// (NOT recommended outside local dev).
const allowedTokens = (process.env.NODE_RED_TOKENS || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

module.exports = {
    // ------------------------------------------------------------------
    // Flow file / user dir
    // ------------------------------------------------------------------
    flowFile: "flows.json",
    flowFilePretty: true,
    userDir: path.join(__dirname, "data"),
    // Point at each platform plugin package dir (each has its own package.json
    // with a `node-red` block). Scaner treats a dir containing package.json with
    // node-red keywords as a node-red module.
    nodesDir: [path.join(__dirname, "nziot-flow-runner")],

    // ------------------------------------------------------------------
    // Security
    // ------------------------------------------------------------------
    // Editor/Admin API authentication. Custom token callback validated
    // against the platform-issued node tokens.
    adminAuth: allowedTokens.length > 0 ? {
        type: "credentials",
        users: [],
        tokens: async function (token) {
            if (allowedTokens.includes(token)) {
                // Trusted internal editor: full editor permissions.
                return { username: "platform", permissions: "*" };
            }
            return null;
        }
    } : undefined,

    // Protect runtime HTTP-In endpoints behind a separate prefix path.
    httpNodeRoot: "/node-api",

    // ------------------------------------------------------------------
    // Server
    // ------------------------------------------------------------------
    uiPort: process.env.PORT || 1880,
    // Keep the admin API at the root; reverse proxy (vite dev / nginx prod)
    // maps /nodered/* onto this instance preserving the prefix handling.
    // httpAdminRoot: "/red-admin",

    // ------------------------------------------------------------------
    // Editor trimming
    // ------------------------------------------------------------------
    editorTheme: {
        // Activate the NZIoT platform theme plugin (provides editor scripts/css
        // and merges its menu overrides)
        theme: "nziot-flow-runner",
        // Hide the user menu (login/logout) - platform owns the session
        userMenu: false,
        tours: false,
        projects: {
            enabled: false
        },
        palette: {
            // Palette manager disabled: nodes are provisioned with the image
            editable: false
        },
        menu: {
            // Flow/tab lifecycle is owned by the platform management page
            "menu-item-workspace-add": false,
            "menu-item-workspace-delete": false,
            // Clipboard library features trimmed (import/export stays for now;
            // the theme plugin also disables library menu items)
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
        modules: {
            allowInstall: false
        }
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

    // Diagnostics / telemetry off
    diagnostics: { enabled: false, ui: false },
    telemetryEnabled: false,

    runtimeState: { enabled: false, ui: false }
};
