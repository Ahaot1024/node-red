/**
 * NZIoT flow runner - editor side script.
 *
 * Pin the editor to the flow given by URL hash `#flow/<id>`:
 * hide every other workspace tab, sidebar explorer items, config-node
 * categories, and disable search/add/delete actions.
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
    // Workspace pinning
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
    // Explorer sidebar: hide every flow except TARGET, plus subflow /
    // global-config groups. Uses RED.nodes.eachWorkspace to get IDs,
    // then hides the matching treeList containers.
    // ---------------------------------------------------------------
    function hideExplorerItems() {
        if (!TARGET_FLOW_ID) return;

        var otherIds = {};
        RED.nodes.eachWorkspace(function (ws) {
            if (ws.id !== TARGET_FLOW_ID) otherIds[ws.id] = true;
        });
        RED.nodes.eachSubflow(function (sf) {
            otherIds[sf.id] = true;
        });
        otherIds["__subflow__"] = true;
        otherIds["__global__"] = true;

        $(".red-ui-info-outline .red-ui-editableList-item-content").each(function () {
            var $el = $(this);
            var item = $el.data("data");
            if (!item) return;
            if (otherIds[item.id]) {
                $el.closest("li").hide();
            }
        });

        // 子流程 / 全局配置 分组（depth 0，id 固定）
        $(".red-ui-info-outline .red-ui-treeList-label").each(function () {
            var $label = $(this);
            var $li = $label.closest("li");
            var item = $label.parent().data("data") || $li.data("data");
            if (item && (item.id === "__subflow__" || item.id === "__global__")) {
                $li.hide();
            }
        });
    }

    // ---------------------------------------------------------------
    // Config-node sidebar: hide categories that belong to other flows
    // ---------------------------------------------------------------
    function hideConfigSidebar() {
        if (!TARGET_FLOW_ID) return;
        var targetCat = TARGET_FLOW_ID.replace(/\./g, "-");
        $(".red-ui-sidebar-config-category").each(function () {
            var id = (this.id || "").replace("red-ui-sidebar-config-category-", "");
            if (id && id !== targetCat && id !== "global") {
                $(this).hide();
            }
        });
        // 全局配置节点分类也隐藏（平台不暴露）
        $("#red-ui-sidebar-config-category-global").hide();
    }

    // ---------------------------------------------------------------
    // Inject CSS
    // ---------------------------------------------------------------
    function hideChrome() {
        if (document.getElementById("nziot-pin-css")) return;
        var css = document.createElement("style");
        css.id = "nziot-pin-css";
        css.textContent = [
            // Workspace tab strip + add button
            ".red-ui-tabs-add{display:none !important}",
            "#red-ui-workspace-tabs{display:none !important}",
            "#red-ui-workspace-tabs-shade{display:none !important}",
            // Flow dropdown (caret-down next to deploy)
            ".red-ui-tabs-menu{display:none !important}",
            "#red-ui-workspace .red-ui-tab-button.red-ui-tabs-menu{display:none !important}",
            // Explorer search box
            ".red-ui-info-outline > .red-ui-info-toolbar{display:none !important}",
            ".red-ui-info-outline > .red-ui-palette-search{display:none !important}",
            // Footer search
            "#red-ui-view-searchtools-search{display:none !important}",
            ".red-ui-view-searchtools-counter{display:none !important}",
            // Search dialog
            "#red-ui-search{display:none !important}",
            // Hamburger menu
            "#red-ui-header-button-sidemenu{display:none !important}",
            ""
        ].join("\n");
        document.head.appendChild(css);
    }

    function enforcePin() {
        if (!pinning || !TARGET_FLOW_ID) return;
        hideOtherWorkspaces();
        hideExplorerItems();
        hideConfigSidebar();
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
    // Block dangerous actions
    // ---------------------------------------------------------------
    function blockDangerousActions() {
        if (!pinning) return;
        var blocked = [
            "core:add-flow",
            "core:remove-flow",
            "core:search",
            "core:search-flows",
            "core:list-flows",
            "core:list-subflows",
            "core:list-hidden-flows",
            "core:list-modified-nodes",
            "core:show-config-tab",
            "core:create-subflow",
            "core:convert-to-subflow",
            "core:show-import-dialog",
            "core:show-export-dialog",
            "core:new-project",
            "core:open-project",
            "core:show-action-list",
            "core:hide-flow",
            "core:hide-other-flows",
            "core:hide-all-flows",
            "core:show-all-flows"
        ];
        blocked.forEach(function (action) {
            try { RED.actions.remove(action); } catch (e) {}
            try {
                RED.actions.add(action, function () {
                    console.log("[nziot] blocked action: " + action);
                });
            } catch (e) {}
        });

        document.addEventListener("keydown", function (evt) {
            if (!pinning) return;
            if ((evt.ctrlKey || evt.metaKey) && (evt.key === "f" || evt.key === "F")) {
                evt.preventDefault();
                evt.stopPropagation();
            }
        }, true);
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
            if (xhr.status === 401) {
                toParent({ type: "nziot:auth-expired" });
                return;
            }
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
                hideConfigSidebar();
                startObservers();
            }, 400);
            toParent({
                type: "nziot:ready",
                flowId: TARGET_FLOW_ID,
                dirty: RED.nodes.dirty(),
                revision: RED.nodes.version()
            });
        });

        RED.events.on("flows:add", function () { setTimeout(enforcePin, 100); });
        RED.events.on("flows:remove", function () { setTimeout(enforcePin, 100); });
        RED.events.on("flows:reorder", function () { setTimeout(enforcePin, 100); });
        RED.events.on("sidebar:open", function () { setTimeout(enforcePin, 200); });
        RED.events.on("workspace:change", function () { enforcePin(); });
    }

    function startObservers() {
        if (!pinning) return;
        function watch(sel, fn) {
            var el = document.querySelector(sel);
            if (!el) {
                setTimeout(function () { watch(sel, fn); }, 800);
                return;
            }
            var t;
            var obs = new MutationObserver(function () {
                clearTimeout(t);
                t = setTimeout(fn, 50);
            });
            obs.observe(el, { childList: true, subtree: true });
        }
        watch(".red-ui-info-outline .red-ui-treeList", hideExplorerItems);
        watch("#red-ui-sidebar-node-config", hideConfigSidebar);
    }

    TARGET_FLOW_ID = extractTargetFlow();
    pinning = !!TARGET_FLOW_ID;
    wireBridge();

    // 登录页出现时（token 失效）立刻通知父页面，不等 flows:loaded
    if (document.getElementById("node-dialog-login") ||
        document.getElementById("node-dialog-login-fields")) {
        toParent({ type: "nziot:auth-expired" });
    }
})();
