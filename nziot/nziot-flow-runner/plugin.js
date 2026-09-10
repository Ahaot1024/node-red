/**
 * NZIoT platform editor plugin (runtime side registration).
 *
 * Registers as a `node-red-theme` plugin so the editor:
 *  - loads our editor-side script (files/clientside.js) and css (files/theme.css);
 *  - merges our `menu` overrides on top of settings.js editorTheme.menu
 *    (theme plugin menu entries win over settings values, see
 *    @node-red/editor-api/lib/editor/theme.js loadThemePlugin()).
 */
module.exports = function (RED) {
    RED.plugins.registerPlugin("nziot-flow-runner", {
        type: "node-red-theme",
        scripts: [
            "files/clientside.js"
        ],
        css: [
            "files/theme.css"
        ],
        menu: {
            "menu-item-workspace-add": false,
            "menu-item-workspace-delete": false,
            "menu-item-workspace-edit": false,
            "menu-item-workspace": false,
            "menu-item-subflow": false,
            "menu-item-subflow-create": false,
            "menu-item-subflow-convert": false,
            "menu-item-import-library": false,
            "menu-item-export-library": false,
            "menu-item-search": false,
            "menu-item-config-nodes": false,
            "menu-item-action-list": false
        },
        onadd: function () {
            console.log("[nziot-flow-runner] registered (node-red-theme)");
        }
    });
};
