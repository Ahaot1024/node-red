/**
 * NZIoT flow runner - editor side script.
 *
 * Loaded as a theme script. Behaviour:
 *  1. Pin the editor to the flow given by the URL hash `#flow/<id>`:
 *     hide every other workspace tab and all non-target flows in the
 *     sidebar explorer, disable search/subflows/global-config sections.
 *  2. Expose a minimal postMessage bridge to the parent page.
 *
 * NOTE: this is UI-level only. It does not prevent a determined user from
 * reaching other flows through devtools.
 */
(function () {
    if (typeof RED === "undefined") {
        return;
    }

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
        try {
            window.parent.postMessage(payload, parentOrigin);
        } catch (e) {
            /* ignore */
        }
    }

    // ---------------------------------------------------------------
    // Flow pinning — workspace level
    // ---------------------------------------------------------------
    function hideOtherWorkspaces() {
        if (!TARGET_FLOW_ID) return;
        var hidden = 0;
        RED.nodes.eachWorkspace(function (ws) {
            if (ws.id !== TARGET_FLOW_ID && !RED.workspaces.isHidden(ws.id)) {
                RED.workspaces.hide(ws.id);
                hidden++;
            }
        });
        if (hidden > 0) {
            console.log("[nziot] hidden " + hidden + " non-target workspace tab(s)");
        }
        var active = RED.workspaces.active();
        if (active !== TARGET_FLOW_ID) {
            if (RED.nodes.workspace(TARGET_FLOW_ID)) {
                RED.workspaces.show(TARGET_FLOW_ID, true);
            }
        }
    }

    // ---------------------------------------------------------------
    // Flow pinning — explorer sidebar (outline)
    // ---------------------------------------------------------------

    /**
     * 扫描 EXPLORER 侧边栏 treeList DOM，隐藏非目标流程条目。
     * treeList 结构：
     *   <div class="red-ui-treeList-container" (each top-level item)>
     *     <div class="red-ui-treeList-label">
     *       <div class="red-ui-info-outline-item red-ui-info-outline-item-flow">
     *         <div class="red-ui-info-outline-item-label">流程名</div>
     *       </div>
     *     </div>
     *     <div class="red-ui-treeList-children"> (子节点) </div>
     *   </div>
     *
     * 顶层有 3 个分组：流程列表、子流程(__subflow__)、全局配置(__global__)
     * 流程列表下面每个 flow 也是 .red-ui-treeList-container。
     */
    function hideExplorerItems() {
        if (!TARGET_FLOW_ID) return;
        // 查找 outline 根容器
        var root = document.querySelector(".red-ui-info-outline .red-ui-treeList");
        if (!root) return;

        // 顶层 3 个分组 container（流程、子流程、全局配置）
        var topContainers = root.querySelectorAll(":scope > .red-ui-treeList-container");
        topContainers.forEach(function (topItem, idx) {
            if (idx === 0) {
                // 第一个分组 = 流程列表 → 隐藏其中非目标 flow
                var childrenWrap = topItem.querySelector(".red-ui-treeList-children");
                if (!childrenWrap) return;
                var flowItems = childrenWrap.querySelectorAll(
                    ":scope > .red-ui-treeList-container"
                );
                flowItems.forEach(function (flowItem) {
                    // 判断这个条目是否是目标流程
                    // 方法：用 RED.sidebar.info.outliner 的 objects 映射不可访问，
                    // 所以查看 item 的 label 文字 + 用 treeList select 事件里的 id
                    // 更可靠的方法：检查 treeList 的 data-id 属性
                    var isTarget = false;

                    // treeList widget 会在 container 上存 jQuery data
                    try {
                        var $item = $(flowItem);
                        var itemData = $item.data("treelistItem");
                        if (itemData && itemData.id === TARGET_FLOW_ID) {
                            isTarget = true;
                        }
                    } catch (e) { /* fallback below */ }

                    flowItem.style.display = isTarget ? "" : "none";
                });
            } else {
                // 子流程 和 全局配置分组 → 全部隐藏
                topItem.style.display = "none";
            }
        });
    }

    /**
     * 注入 CSS 隐藏固定 UI 元素
     */
    function hideChrome() {
        if (document.getElementById("nziot-pin-css")) return;
        var css = document.createElement("style");
        css.id = "nziot-pin-css";
        css.textContent = [
            // 隐藏工作区 tab 栏和添加按钮
            ".red-ui-tabs-add{display:none !important}",
            "#red-ui-workspace-tabs{display:none !important}",
            "#red-ui-workspace-tabs-shade{display:none !important}",
            // 隐藏 EXPLORER 搜索框（查找流程）
            ".red-ui-info-outline > .red-ui-info-toolbar{display:none !important}",
            // 隐藏右键上下文菜单中的 flow 操作项（删除/复制/启用等其他 flow 的菜单）
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
    // Block actions that could create/delete flows or expose others
    // ---------------------------------------------------------------
    function blockDangerousActions() {
        if (!pinning) return;
        var blocked = [
            "core:add-flow",
            "core:remove-flow",
            "core:search",
            "core:show-config-tab",
            "core:create-subflow",
            "core:convert-to-subflow",
            "core:show-import-dialog",
            "core:show-export-dialog",
            "core:new-project",
            "core:open-project"
        ];
        blocked.forEach(function (action) {
            try {
                // 用空函数覆盖原有 action handler
                RED.actions.add(action, function () {
                    console.log("[nziot] blocked action: " + action);
                });
            } catch (e) {
                // 部分 action 可能不存在，忽略
            }
        });
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
            // 延迟执行，等 treeList DOM 渲染完成
            setTimeout(function () {
                hideExplorerItems();
                startExplorerObserver();
            }, 500);
            toParent({
                type: "nziot:ready",
                flowId: TARGET_FLOW_ID,
                dirty: RED.nodes.dirty(),
                revision: RED.nodes.version()
            });
        });

        // 监听各种可能导致 explorer 列表变化的事件
        RED.events.on("flows:add", function () { setTimeout(hideExplorerItems, 100); });
        RED.events.on("flows:remove", function () { setTimeout(hideExplorerItems, 100); });
        RED.events.on("flows:reorder", function () { setTimeout(hideExplorerItems, 100); });
        RED.events.on("sidebar:open", function () { setTimeout(hideExplorerItems, 200); });
        RED.events.on("workspace:change", function () {
            enforcePin();
        });
    }

    /** MutationObserver 监听 explorer 列表 DOM 变化，及时隐藏新增的条目 */
    function startExplorerObserver() {
        if (!pinning) return;
        var root = document.querySelector(".red-ui-info-outline .red-ui-treeList");
        if (!root) {
            // 可能还没渲染，再等一下
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
