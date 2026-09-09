/**
 * NZIoT flow runner - editor side script.
 *
 * Loaded as a theme script (before main.js finishes editor init; scripts from
 * editorTheme.page.scripts are injected after the editor bundles but our DOM-ready
 * registration makes it effective at startup).
 *
 * Behaviour:
 *  1. Pin the editor to the flow given by the URL hash `#flow/<id>`:
 *     hide every other workspace tab, disable add/delete affordances, and bounce
 *     the user back if some UI switches to another workspace.
 *  2. Expose a minimal postMessage bridge to the parent page:
 *       child -> parent: {type:"nziot:ready"} | {type:"nziot:dirty",dirty}
 *                      | {type:"nziot:deploy-result",ok,rev?,error?}
 *       parent -> child: {type:"nziot:deploy"} | {type:"nziot:reload"}
 *     The parent origin is captured once at startup (window.parent.origin);
 *     every message is validated against it.
 *
 * NOTE: this is UI-level only. It does not prevent a determined user from
 * reaching other flows through devtools - that is a deployment concern
 * (shared runtime = trusted editors), not an editor concern.
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
        // cross-origin parent - keep "*"; messages are still typed-namespaced
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
    // Flow pinning
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
        // If current active is not the target (or nothing active), jump to target
        var active = RED.workspaces.active();
        if (active !== TARGET_FLOW_ID) {
            if (RED.nodes.workspace(TARGET_FLOW_ID)) {
                RED.workspaces.show(TARGET_FLOW_ID, true);
            }
        }
    }

    function enforcePin() {
        if (!pinning || !TARGET_FLOW_ID) return;
        hideOtherWorkspaces();
        var active = RED.workspaces.active();
        if (active && active !== TARGET_FLOW_ID) {
            // Some remaining UI switched away; bounce back. Allow transient
            // subflow workspaces (editing a subflow shows a temp tab).
            var ws = RED.nodes.workspace(active);
            var sf = RED.nodes.subflow(active);
            if (ws && ws.type === "tab" && !sf) {
                RED.workspaces.show(TARGET_FLOW_ID, true);
            }
        }
    }

    function hideChrome() {
        // Hide the tab add button and workspace tabs strip (visual-only;
        // actions are also blocked by theme menu overrides + keymap)
        var css = document.createElement("style");
        css.id = "nziot-pin-css";
        css.textContent =
            ".red-ui-tabs-add{display:none !important}" +
            "#red-ui-workspace-tabs{display:none !important}" +
            "#red-ui-workspace-tabs-shade{display:none !important}";
        document.head.appendChild(css);
    }

    // ---------------------------------------------------------------
    // postMessage bridge
    // ---------------------------------------------------------------
    function onParentMessage(event) {
        // Only accept messages from the parent window
        if (event.source !== window.parent) return;
        if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
        var data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "nziot:deploy") {
            if (RED.user && !RED.user.hasPermission("flows.write")) {
                toParent({ type: "nziot:deploy-result", ok: false, error: "no permission" });
                return;
            }
            // Native deploy path: keeps revision conflict handling (409) intact
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

        // dirty state transitions (single global event per transition)
        RED.events.on("workspace:dirty", function (state) {
            toParent({ type: "nziot:dirty", dirty: !!(state && state.dirty) });
        });

        // deploy success -> report; failures are surfaced via jQuery ajax events
        RED.events.on("deploy", function () {
            toParent({
                type: "nziot:deploy-result",
                ok: true,
                revision: RED.nodes.version()
            });
        });

        $(document).ajaxComplete(function (evt, xhr, settings) {
            // Detect failed deploys: POST flows returning non-2xx
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

        // Initial report once flows are loaded
        RED.events.on("flows:loaded", function () {
            if (!TARGET_FLOW_ID) {
                TARGET_FLOW_ID = extractTargetFlow();
            }
            hideChrome();
            hideOtherWorkspaces();
            toParent({
                type: "nziot:ready",
                flowId: TARGET_FLOW_ID,
                dirty: RED.nodes.dirty(),
                revision: RED.nodes.version()
            });
        });

        // Keep the pin enforced on any workspace switch
        RED.events.on("workspace:change", function () {
            enforcePin();
        });
        RED.events.on("flows:reorder", function () {
            enforcePin();
        });
    }

    // Bootstrapping: theme scripts load before main.js registers its DOM-ready;
    // RED.events exists at this point, so wire immediately.
    TARGET_FLOW_ID = extractTargetFlow();
    pinning = !!TARGET_FLOW_ID;
    wireBridge();
})();
