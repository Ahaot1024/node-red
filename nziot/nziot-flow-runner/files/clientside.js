/**
 * NZIoT flow runner - editor side script.
 *
 * Pin the editor to the flow given by URL hash `#flow/<id>`:
 * hide every other workspace tab, sidebar explorer items, disable
 * search/add/delete actions. Expose postMessage bridge to parent.
 */
(function () {
    if (typeof RED === "undefined") return;

    var TARGET_FLOW_ID = null;
    var pinning = false;
    var parentOrigin = "*";
    try {
        if (window.parent && window.parent !== window) {
            parentOrigin = window.parent.origin || "*";
        }
    } catch (e) {
        parentOrigin = "*";
    }

    function extractTargetFlow() {
        var m = /^#flow\/([^/?#]+)/.exec(window.location.hash || "");
        return m ? decodeURIComponent(m[1]) : null;
    }

    function toParent(payload) {
        try { window.parent.postMessage(payload, parentOrigin); } catch (e) {}
    }

    // ---------------------------------------------------------------
    // Flow pinning — workspace level
    // ---------------------------------------------------------------
    function hideOtherWorkspaces() {
        if (!TARGET_FLOW_ID) return;
        RED.nodes.eachWorkspace(function (ws) {
            if (ws.id !== TARGET_FLOW_ID && !RED.workspaces.isHidden(ws.id)) {
                RED.workspaces.hide(ws.id);
            }
        });
        var active = RED.workspaces.active();
        if (active !== TARGET_FLOW_ID && RED.nodes.workspace(TARGET_FLOW_ID)) {
            RED.workspaces.show(TARGET_FLOW_ID, true);
        }
    }

    // ---------------------------------------------------------------
    // Flow pinning — explorer sidebar
    // ---------------------------------------------------------------
    function hideExplorerItems() {
        if (!TARGET_FLOW_ID) return;

        // 方法 1：通过 treeList jQuery data 精确匹配 ID
        $(".red-ui-info-outline .red-ui-treeList-container").each(function () {
            var $el = $(this);
            var itemData = $el.data("treelistItem");
            if (!itemData) return;

            // 顶层分组（depth 0）：流程列表、子流程、全局配置
            // id 为 "__subflow__" 或 "__global__" 的分组直接隐藏
            if (itemData.id === "__subflow__" || itemData.id === "__global__") {
                $el.hide();
                return;
            }

            // 流程条目：只显示目标流程
            if (itemData.id && itemData.id !== TARGET_FLOW_ID) {
                // 检查是不是一个 flow tab（有 icon 属性表示是 outliner 添加的 flow 条目）
                if (itemData.icon || (itemData.element && itemData.element.hasClass && itemData.element.hasClass("red-ui-info-outline-item-flow"))) {
                    $el.hide();
                }
            }
        });

        // 方法 2（兜底）：通过 DOM 结构隐藏
        // 如果方法 1 的 jQuery data 不可用，遍历 outline 里 flow 标签文本
        var root = document.querySelector(".red-ui-info-outline .red-ui-treeList");
        if (!root) return;
        var topContainers = root.querySelectorAll(":scope > .red-ui-treeList-container");
        topContainers.forEach(function (topItem, idx) {
            if (idx === 0) {
                // 第一个 = 流程列表分组
                var childrenWrap = topItem.querySelector(".red-ui-treeList-children");
                if (!childrenWrap) return;
                var flowItems = childrenWrap.querySelectorAll(":scope > .red-ui-treeList-container");
                flowItems.forEach(function (flowItem) {
                    var isTarget = false;
                    try {
                        var data = $(flowItem).data("treelistItem");
                        if (data && data.id === TARGET_FLOW_ID) isTarget = true;
                    } catch (e) {}
                    flowItem.style.display = isTarget ? "" : "none";
                });
            } else {
                // 子流程 / 全局配置 → 隐藏
                topItem.style.display = "none";
            }
        });
    }

    // ---------------------------------------------------------------
    // Inject CSS to hide fixed UI elements
    // ---------------------------------------------------------------
    function hideChrome() {
        if (document.getElementById("nziot-pin-css")) return;
        var css = document.createElement("style");
        css.id = "nziot-pin-css";
        css.textContent = [
            // Workspace tab bar
            ".red-ui-tabs-add{display:none !important}",
            "#red-ui-workspace-tabs{display:none !important}",
            "#red-ui-workspace-tabs-shade{display:none !important}",
            // Explorer search box
            ".red-ui-info-outline > .red-ui-info-toolbar{display:none !important}",
            ".red-ui-info-outline > .red-ui-palette-search{display:none !important}",
            // Footer search button (搜索流程)
            "#red-ui-view-searchtools-search{display:none !important}",
            // Search toolbar popover
            ".red-ui-view-searchtools-counter{display:none !important}",
            // Hamburger menu
            "#red-ui-header-button-sidemenu{display:none !important}",
            // Search dialog when opened
            "#red-ui-search{display:none !important}",
            ""
        ].join("\n");
        document.head.appendChild(css);
    }

    function enforcePin() {
        if (!pinning || !TARGET_FLOW_ID) return;
        hideOtherWorkspaces();
        hideExplorerItems();
        var active = RED.workspaces.active();
        if (active && active !== TARGET_FLOW_ID) {
            var ws = RED.nodes.workspace(active);
            var sf = RED.nodes.subflow(active);
            if (ws && ws.type === "tab" && !sf) {
                RED.workspaces.show(TARGET_FLOW_ID, true);
            }
        }
    }

    // ---------------------------------------------------------------
    // Block dangerous actions (remove first, then add noop)
    // ---------------------------------------------------------------
    function blockDangerousActions() {
        if (!pinning) return;
        var blocked = [
            "core:add-flow",
            "core:remove-flow",
            "core:search",
            "core:search-flows",
            "core:show-config-tab",
            "core:create-subflow",
            "core:convert-to-subflow",
            "core:show-import-dialog",
            "core:show-export-dialog",
            "core:new-project",
            "core:open-project",
            "core:show-action-list"
        ];
        blocked.forEach(function (action) {
            try {
                RED.actions.remove(action);
            } catch (e) {}
            try {
                RED.actions.add(action, function () {
                    console.log("[nziot] blocked action: " + action);
                });
            } catch (e) {}
        });

        // Also override Ctrl+F at the DOM level to prevent browser/NR search
        document.addEventListener("keydown", function (evt) {
            if (!pinning) return;
            // Block Ctrl+F (search)
            if ((evt.ctrlKey || evt.metaKey) && evt.key === "f") {
                evt.preventDefault();
                evt.stopPropagation();
            }
        }, true); // useCapture = true to intercept before Node-RED
    }

    // ---------------------------------------------------------------
    // postMessage bridge
    // ---------------------------------------------------------------
    function onParentMessage(event) {
        if (event.source !== window.parent) return;
        if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
        var data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "nziot:deploy") {
            if (RED.user && !RED.user.hasPermission("flows.write")) {
                toParent({ type: "nziot:deploy-result", ok: false, error: "no permission" });
                return;
            }
            RED.actions.invoke("core:deploy-flows");
        } else if (data.type === "nziot:reload") {
            window.location.reload();
        } else if (data.type === "nziot:request-state") {
            toParent({
                type: "nziot:ready",
                flowId: TARGET_FLOW_ID,
                dirty: RED.nodes.dirty(),
                revision: RED.nodes.version()
            });
        }
    }

    function wireBridge() {
        window.addEventListener("message", onParentMessage);

        RED.events.on("workspace:dirty", function (state) {
            toParent({ type: "nziot:dirty", dirty: !!(state && state.dirty) });
        });

        RED.events.on("deploy", function () {
            toParent({
                type: "nziot:deploy-result",
                ok: true,
                revision: RED.nodes.version()
            });
        });

        $(document).ajaxComplete(function (evt, xhr, settings) {
            if (settings && settings.type === "POST" && /\/flows(\?|$)/.test(settings.url || "")) {
                if (xhr.status >= 400) {
                    var errDetail = "";
                    try {
                        errDetail = (xhr.responseJSON && xhr.responseJSON.message) || xhr.responseText || ("HTTP " + xhr.status);
                    } catch (e) {
                        errDetail = "HTTP " + xhr.status;
                    }
                    toParent({ type: "nziot:deploy-result", ok: false, error: String(errDetail).slice(0, 300) });
                }
            }
        });

        RED.events.on("flows:loaded", function () {
            if (!TARGET_FLOW_ID) {
                TARGET_FLOW_ID = extractTargetFlow();
                pinning = !!TARGET_FLOW_ID;
            }
            hideChrome();
            hideOtherWorkspaces();
            blockDangerousActions();
            setTimeout(function () {
                hideExplorerItems();
                startExplorerObserver();
            }, 300);
            toParent({
                type: "nziot:ready",
                flowId: TARGET_FLOW_ID,
                dirty: RED.nodes.dirty(),
                revision: RED.nodes.version()
            });
        });

        RED.events.on("flows:add", function () { setTimeout(hideExplorerItems, 100); });
        RED.events.on("flows:remove", function () { setTimeout(hideExplorerItems, 100); });
        RED.events.on("flows:reorder", function () { setTimeout(hideExplorerItems, 100); });
        RED.events.on("sidebar:open", function () { setTimeout(hideExplorerItems, 200); });
        RED.events.on("workspace:change", function () { enforcePin(); });
    }

    function startExplorerObserver() {
        if (!pinning) return;
        var root = document.querySelector(".red-ui-info-outline .red-ui-treeList");
        if (!root) {
            setTimeout(startExplorerObserver, 1000);
            return;
        }
        var debounceTimer;
        var observer = new MutationObserver(function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(hideExplorerItems, 50);
        });
        observer.observe(root, { childList: true, subtree: true });
    }

    // Bootstrapping
    TARGET_FLOW_ID = extractTargetFlow();
    pinning = !!TARGET_FLOW_ID;
    wireBridge();
})();
