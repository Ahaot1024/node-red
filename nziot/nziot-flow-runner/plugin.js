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
            // 平台只保留「编辑当前流程」能力：新增/删除/导入导出全部交给平台管理页
            "menu-item-workspace-add": false,
            "menu-item-workspace-delete": false,
            "menu-item-import-library": false,
            "menu-item-export-library": false
        },
        onadd: function () {
            console.log("[nziot-flow-runner] registered (node-red-theme)");
        }
    });
};
