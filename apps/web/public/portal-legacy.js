
    const SHAMAL_REACT_SHELL = true;
    const state = {
      devices: [],
      tasks: [],
      session: null,
      pendingOp: null,
      hls: null,
      opsCatalog: null,
      opsCategory: "flight",
      liveTimer: null,
      activeTab: "fleet",
      activeSettingsTab: "service-accounts",
      isRefreshing: false,
      streamLoaded: false,
      fleetMap: null,
      fleetMarkers: {},
      dashFleetMap: null,
      dashFleetMarkers: {},
      zoomFleetMap: null,
      zoomFleetMarkers: {},
      apiSamples: {},
      zoomCardId: null,
      whepPc: null,
      volcSessions: { dock: null, drone: null },
      volcMod: null,
      adminViewers: [],
      adminProjects: [],
      viewerIntegration: null,
      restApiKeys: [],
      serviceAccounts: [],
      serviceAccountAvailableScopes: [],
      adminIntegration: null,
      adminIntegrationPlainKey: null,
      adminRestApiKeys: [],
      apiKeyModal: { mode: null, keyId: null, plaintext: null },
    };

    const INTEGRATION_API_ROUTES = {
      fleet: "/v1/platform/integration/fleet",
      "drone-telemetry": "/v1/platform/integration/drone-telemetry",
      "dock-telemetry": "/v1/platform/integration/dock-telemetry",
      battery: "/v1/platform/integration/battery-status",
      gps: "/v1/platform/integration/gps-location",
      online: "/v1/platform/integration/online-status",
      camera: "/v1/platform/integration/camera",
      "drone-fpv": "/v1/platform/integration/fpv",
      alerts: "/v1/platform/integration/alerts-events",
      missions: "/v1/platform/integration/media-history",
    };
    const LIVE_INTERVAL_MS = 10_000;
    const $ = (id) => document.getElementById(id);

    function isAdminPortal() {
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      return path === "/admin";
    }

    function safeReturnTo() {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
        return null;
      }
      return returnTo;
    }

    async function refreshBrowserSessionCookie() {
      if (!state.session?.apiKey || !state.session?.sessionToken) return false;
      const res = await fetch("/v1/auth/session-cookie", {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Api-Key": state.session.apiKey,
          "X-CC-Session": state.session.sessionToken,
        },
      });
      return res.ok;
    }

    async function redirectToReturnToIfReady() {
      const returnTo = safeReturnTo();
      if (!returnTo || !state.session || !isAdmin()) return false;
      const cookieReady = await refreshBrowserSessionCookie();
      if (!cookieReady) return false;
      window.location.replace(returnTo);
      return true;
    }

    function updateLoginPortalUi() {
      const title = $("loginTitle");
      const subtitle = $("loginSubtitle");
      const userInput = $("loginUser");
      if (!title || !subtitle || !userInput) return;
      if (isAdminPortal()) {
        title.textContent = "Shamal Admin";
        subtitle.textContent =
          "Administrator sign-in for fleet management, integrations, and platform settings.";
        userInput.placeholder = "Admin username";
      } else {
        title.textContent = "Shamal Platform";
        subtitle.textContent = "Sign in with your assigned account credentials.";
        userInput.placeholder = "Username";
      }
    }

    function enforcePortalSession() {
      if (!state.session) return false;
      if (isAdminPortal()) {
        if (!isAdmin()) {
          clearSession();
          updateRoleUi();
          $("loginError").textContent =
            "Administrator credentials required. User accounts sign in at the main platform.";
          return true;
        }
        return false;
      }
      if (isAdmin()) {
        window.location.replace("/admin");
        return true;
      }
      return false;
    }

    function loadSession() {
      try {
        const raw = localStorage.getItem("shamalCcSession");
        if (raw) state.session = JSON.parse(raw);
      } catch { state.session = null; }
    }

    function saveSession(session) {
      state.session = session;
      localStorage.setItem("shamalCcSession", JSON.stringify(session));
    }

    function clearSession() {
      state.session = null;
      localStorage.removeItem("shamalCcSession");
    }

    function canOperate() {
      return state.session && (state.session.role === "operator" || state.session.role === "admin");
    }

    function isViewer() {
      return state.session?.role === "viewer";
    }

    function isAdmin() {
      return state.session?.role === "admin";
    }

    const DEFAULT_VIEWER_DASHBOARD_PERMISSIONS = {
      fleetOverview: true,
      droneTelemetry: true,
      dockTelemetry: true,
      batteryStatus: true,
      gpsLocation: true,
      onlineOffline: true,
      liveCamera: true,
      droneFpv: false,
      alertsEvents: false,
      missionMediaHistory: true,
      refreshButton: true,
      getApiButtons: false,
    };

    const ADMIN_PERMISSION_GROUPS = [
      {
        containerId: "adminPermCore",
        items: [
          ["fleetOverview", "Fleet Overview / Map"],
          ["droneTelemetry", "Drone Telemetry"],
          ["dockTelemetry", "Dock Telemetry"],
          ["batteryStatus", "Battery Status"],
          ["gpsLocation", "GPS / Location"],
          ["onlineOffline", "Online / Offline"],
        ],
      },
      {
        containerId: "adminPermMedia",
        items: [
          ["liveCamera", "Live Camera"],
          ["droneFpv", "Drone FPV"],
          ["missionMediaHistory", "Mission & Media History"],
        ],
      },
      {
        containerId: "adminPermOps",
        items: [["alertsEvents", "Alerts & Events"]],
      },
      {
        containerId: "adminPermActions",
        items: [
          ["refreshButton", "Refresh Button"],
          ["getApiButtons", "Get API Buttons"],
        ],
      },
    ];

    function viewerPermissions() {
      if (!isViewer()) return null;
      return {
        ...DEFAULT_VIEWER_DASHBOARD_PERMISSIONS,
        ...(state.session?.viewerDashboardPermissions || {}),
      };
    }

    function cardAllowed(permissionKey) {
      if (!isViewer()) return true;
      const perms = viewerPermissions();
      return perms ? perms[permissionKey] === true : false;
    }

    function integrationActive() {
      const i = state.viewerIntegration;
      return Boolean(i?.enabled && i?.status === "active" && i?.hasToken);
    }

    function integrationApiBaseUrl() {
      return state.viewerIntegration?.apiBaseUrl || window.location.origin;
    }

    function buildIntegrationCurlExample(path, method = "GET") {
      const url = `${integrationApiBaseUrl()}${path}`;
      return `curl -X ${method} "${url}" \\\n  -H "Authorization: Bearer YOUR_ACCESS_KEY"`;
    }

    function buildIntegrationFetchExample(path) {
      const url = `${integrationApiBaseUrl()}${path}`;
      return `fetch("${url}", {\n  headers: {\n    Authorization: "Bearer YOUR_ACCESS_KEY"\n  }\n})`;
    }

    function canShowGetApiButtons() {
      if (!isViewer()) return true;
      if (!cardAllowed("getApiButtons")) return false;
      return integrationActive();
    }

    function applyViewerDashboardPermissions() {
      const perms = viewerPermissions();
      document.querySelectorAll(".dash-card[data-permission]").forEach((card) => {
        const key = card.dataset.permission;
        const allowed = !isViewer() || (perms && perms[key] === true);
        card.style.display = allowed ? "" : "none";
      });

      const showApi = canShowGetApiButtons();
      document.querySelectorAll(".get-api-btn[data-api-card]").forEach((btn) => {
        btn.style.display = showApi ? "" : "none";
      });
      if ($("cardZoomGetApi")) {
        $("cardZoomGetApi").style.display = showApi ? "" : "none";
      }

      if ($("refreshAll")) {
        const showRefresh = !isViewer() || cardAllowed("refreshButton");
        $("refreshAll").style.display = showRefresh ? "" : "none";
      }

      if ($("viewerClientName")) {
        if (isViewer() && state.session?.displayName && !SHAMAL_REACT_SHELL) {
          $("viewerClientName").textContent = state.session.displayName;
          $("viewerClientName").style.display = "block";
        } else {
          $("viewerClientName").style.display = "none";
        }
      }
      renderViewerProjectPicker();
    }

    function selectedProjectCode() {
      if (!isViewer()) return null;
      return state.session?.selectedProjectCode || null;
    }

    function renderViewerProjectPicker() {
      const wrap = $("viewerProjectPickerWrap");
      const sel = $("viewerProjectPicker");
      const empty = $("viewerProjectEmpty");
      if (!wrap || !sel || !empty) return;
      if (!isViewer() || !state.session) {
        wrap.style.display = "none";
        return;
      }
      wrap.style.display = "";
      const projects = state.session.assignedProjects || [];
      sel.innerHTML = "";
      for (const p of projects) {
        const o = document.createElement("option");
        o.value = p.projectCode;
        o.textContent = `${p.projectName} (${p.projectCode})`;
        sel.appendChild(o);
      }
      const fallback = state.session.fallbackProjectCode;
      const selected =
        state.session.selectedProjectCode || projects[0]?.projectCode || fallback || "";
      if (selected && projects.some((p) => p.projectCode === selected)) {
        sel.value = selected;
        state.session.selectedProjectCode = selected;
        saveSession(state.session);
      } else if (projects[0]?.projectCode) {
        sel.value = projects[0].projectCode;
        state.session.selectedProjectCode = projects[0].projectCode;
        saveSession(state.session);
      } else if (fallback) {
        state.session.selectedProjectCode = fallback;
        saveSession(state.session);
      }
      sel.style.display = projects.length > 1 ? "" : "none";
      empty.style.display = projects.length === 0 ? "" : "none";
    }

    async function syncSessionFromServer() {
      if (!state.session?.sessionToken) return;
      const res = await api("/v1/viewer/auth/me");
      if (res.data?.viewerDashboardPermissions) {
        state.session.viewerDashboardPermissions = res.data.viewerDashboardPermissions;
        saveSession(state.session);
      }
      if (res.data?.displayName) {
        state.session.displayName = res.data.displayName;
        saveSession(state.session);
      }
      if (Array.isArray(res.data?.assignedProjects)) {
        state.session.assignedProjects = res.data.assignedProjects;
      }
      if (res.data?.fallbackProjectCode) {
        state.session.fallbackProjectCode = res.data.fallbackProjectCode;
      }
      if (!state.session.selectedProjectCode) {
        state.session.selectedProjectCode =
          state.session.assignedProjects?.[0]?.projectCode ||
          state.session.fallbackProjectCode ||
          "";
      }
      saveSession(state.session);
      applyViewerDashboardPermissions();
      if (isViewer()) await loadViewerIntegration();
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        showApiToast();
      } catch (e) {
        alert("Could not copy: " + e.message);
      }
    }

    function canManageWorkspaceApi() {
      return isViewer();
    }

    async function loadViewerIntegration() {
      if (!isViewer()) return;
      try {
        const res = await api("/v1/platform/integration/profile");
        state.viewerIntegration = res.data;
      } catch {
        state.viewerIntegration = null;
      }
      applyViewerDashboardPermissions();
    }

    async function loadSettingsPage() {
      if (!canManageWorkspaceApi()) return;
      await Promise.all([loadRestApiKeys(), loadServiceAccounts()]);
    }

    function updateSettingsAccessUi() {
      const allowed = canManageWorkspaceApi();
      const content = $("settingsContent");
      const denied = $("settingsAccessDenied");
      if (content) content.style.display = allowed ? "" : "none";
      if (denied) denied.style.display = allowed ? "none" : "";
    }

    function activateSettingsTab(tabId) {
      state.activeSettingsTab = tabId;
      document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
        const active = btn.dataset.settingsTab === tabId;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      $("settingsServiceAccountsPanel")?.classList.toggle("active", tabId === "service-accounts");
      $("settingsApiKeysPanel")?.classList.toggle("active", tabId === "api-keys");
    }

    function updateNavActiveState() {
      document.querySelectorAll("#sideNav button").forEach((btn) => {
        const visible = btn.style.display !== "none";
        btn.classList.toggle("nav-active", visible && btn.dataset.tab === state.activeTab);
      });
    }

    function activateTab(tabId) {
      const section = $(tabId);
      if (!section) return;
      document.querySelectorAll("section").forEach((s) => s.classList.remove("active"));
      section.classList.add("active");
      state.activeTab = tabId;
      updateNavActiveState();
      if (tabId === "admin" && isAdmin()) {
        loadAdminViewerSettings().catch((e) => alert(e.message));
      }
      if (tabId === "settings") {
        history.replaceState(null, "", "/?tab=settings");
      } else if (tabId === "dashboard") {
        history.replaceState(null, "", isAdminPortal() ? "/admin" : "/");
      } else if (isAdminPortal()) {
        history.replaceState(
          null,
          "",
          tabId === "admin" ? "/admin" : `/admin?tab=${encodeURIComponent(tabId)}`,
        );
      } else if (window.location.pathname === "/" || window.location.pathname === "/settings") {
        history.replaceState(null, "", `/?tab=${encodeURIComponent(tabId)}`);
      }
    }

    function resolveInitialTab() {
      if (!state.session) return;
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("tab");
      if (window.location.pathname === "/settings") return "settings";
      if (requested && $(requested)) {
        if (isViewer() && !["dashboard", "settings"].includes(requested)) return "dashboard";
        if (!isViewer() && requested === "settings") return "fleet";
        if (requested === "admin" && !isAdmin()) return isViewer() ? "dashboard" : "fleet";
        return requested;
      }
      if (isAdminPortal() && isAdmin()) return "admin";
      return isViewer() ? "dashboard" : state.activeTab;
    }

    function formatRestApiKeyDate(value) {
      if (!value) return "—";
      try {
        return new Date(value).toLocaleString();
      } catch {
        return "—";
      }
    }

    function restApiKeyStatusPill(status) {
      if (status === "active") return '<span class="pill ok">ACTIVE</span>';
      if (status === "disabled") return '<span class="pill warn">DISABLED</span>';
      if (status === "expired") return '<span class="pill bad">EXPIRED</span>';
      return `<span class="pill bad">${escapeHtml((status || "unknown").toUpperCase())}</span>`;
    }

    function parseApiErrorMessage(err) {
      const raw = err?.message || String(err);
      const match = raw.match(/^\d+\s+([\s\S]+)$/);
      if (!match) return raw;
      try {
        const body = JSON.parse(match[1]);
        if (body.error === "rate_limited") {
          const retry = body.retryAfterSec ? ` Retry in ${body.retryAfterSec}s.` : "";
          return (body.message || "Reveal limit reached.") + retry;
        }
        if (body.message) return body.message;
        if (body.details?.fieldErrors?.label?.[0]) return body.details.fieldErrors.label[0];
        if (body.error === "validation_error") return "Invalid request. Check the label and try again.";
        if (body.error === "unauthorized") return "Session expired — sign in again.";
        return body.error || raw;
      } catch {
        return raw;
      }
    }

    function setRestApiKeysStatus(message, isError = true) {
      const el = $("restApiKeysStatus");
      if (!el) return;
      el.textContent = message || "";
      el.style.color = isError && message ? "#ff9a9a" : "";
    }

    function setAdminRestApiKeysStatus(message, isError = true) {
      const el = $("adminRestApiKeysStatus");
      if (!el) return;
      el.textContent = message || "";
      el.style.color = isError && message ? "#ff9a9a" : "";
    }

    function renderRestApiKeysTableRows(keys, options = {}) {
      const { viewerActions = false, adminActions = false } = options;
      if (!keys.length) {
        return `<div class="api-keys-empty">
          <p>Create your first API key</p>
          ${viewerActions ? '<button type="button" id="restApiKeysEmptyCreate">+ New Key</button>' : ""}
        </div>`;
      }
      const rows = keys
        .map((key) => {
          const primaryMark = key.isPrimary ? '<span class="primary-star" title="Primary key">★</span>' : "";
          const actionButtons = [];
          if (viewerActions || adminActions) {
            actionButtons.push(
              `<button type="button" data-api-key-rename="${escapeHtml(key.id)}">Rename</button>`,
            );
            if (key.status === "active") {
              actionButtons.push(
                `<button type="button" data-api-key-disable="${escapeHtml(key.id)}">Disable</button>`,
              );
            } else if (key.status === "disabled") {
              actionButtons.push(
                `<button type="button" data-api-key-enable="${escapeHtml(key.id)}">Enable</button>`,
              );
            }
            if (viewerActions && key.status === "active" && !key.isPrimary) {
              actionButtons.push(
                `<button type="button" data-api-key-primary="${escapeHtml(key.id)}">Set primary</button>`,
              );
            }
            if (viewerActions && key.status === "active") {
              actionButtons.push(
                `<button type="button" data-api-key-reveal="${escapeHtml(key.id)}">Reveal</button>`,
              );
            }
            actionButtons.push(
              `<button type="button" class="admin-delete-btn" data-api-key-delete="${escapeHtml(key.id)}">Delete</button>`,
            );
          }
          return `<tr>
            <td>${primaryMark}${escapeHtml(key.label)}</td>
            <td class="key-mono">${escapeHtml(key.keyMasked)}</td>
            <td>${restApiKeyStatusPill(key.status)}</td>
            <td>${key.isPrimary ? "Yes" : "—"}</td>
            <td>${escapeHtml(formatRestApiKeyDate(key.createdAt))}</td>
            <td>${escapeHtml(formatRestApiKeyDate(key.expiresAt))}</td>
            <td>${escapeHtml(formatRestApiKeyDate(key.lastUsedAt))}</td>
            <td class="actions">${actionButtons.join("")}</td>
          </tr>`;
        })
        .join("");
      return `<table class="api-keys-table admin-viewer-table">
        <thead>
          <tr>
            <th>Name</th><th>Key</th><th>Status</th><th>Primary</th><th>Created</th><th>Expires</th><th>Last used</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    }

    async function loadRestApiKeys() {
      if (!isViewer()) return;
      try {
        const res = await api("/v1/viewer/rest-api-keys");
        state.restApiKeys = res.data || [];
        setRestApiKeysStatus("");
      } catch (e) {
        state.restApiKeys = [];
        setRestApiKeysStatus(parseApiErrorMessage(e));
      }
      renderRestApiKeysTable();
    }

    async function loadAdminRestApiKeys(accountId) {
      if (!accountId || !isAdmin()) return;
      try {
        const res = await api(
          `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/rest-api-keys`,
        );
        state.adminRestApiKeys = res.data || [];
        setAdminRestApiKeysStatus("");
      } catch (e) {
        state.adminRestApiKeys = [];
        setAdminRestApiKeysStatus(parseApiErrorMessage(e));
      }
      renderAdminRestApiKeysTable();
    }

    function closeApiKeyModal() {
      const modal = $("apiKeyModal");
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      state.apiKeyModal = { mode: null, keyId: null, plaintext: null };
      $("apiKeyModalPlain").textContent = "";
      $("apiKeyModalError").textContent = "";
    }

    function openApiKeyModal(config) {
      const modal = $("apiKeyModal");
      state.apiKeyModal = {
        mode: config.mode,
        keyId: config.keyId || null,
        plaintext: config.plaintext || null,
      };
      $("apiKeyModalTitle").textContent = config.title || "API Key";
      $("apiKeyModalDesc").textContent = config.description || "";
      $("apiKeyModalWarning").style.display = config.showWarning ? "" : "none";
      $("apiKeyModalLabelWrap").style.display = config.showLabel ? "" : "none";
      $("apiKeyModalExpirationWrap").style.display = config.showExpiration ? "" : "none";
      $("apiKeyModalPlainWrap").style.display = config.showPlain ? "" : "none";
      $("apiKeyModalConfirm").textContent = config.confirmLabel || "Save";
      $("apiKeyModalConfirm").style.display = config.hideConfirm ? "none" : "";
      $("apiKeyModalLabel").value = config.labelValue || "";
      $("apiKeyModalExpiration").value = config.expirationValue || "";
      if (config.showPlain && config.plaintext) {
        $("apiKeyModalPlain").textContent = config.plaintext;
      }
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      if (config.showLabel) $("apiKeyModalLabel").focus();
    }

    function openRestApiKeyCreateModal() {
      openApiKeyModal({
        mode: "create",
        title: "Create API Key",
        description: "Choose a descriptive name and expiration for this key.",
        showLabel: true,
        showExpiration: true,
        showPlain: false,
        showWarning: false,
        confirmLabel: "Create Key",
      });
    }

    function openAdminRestApiKeyCreateModal() {
      openApiKeyModal({
        mode: "admin-create",
        title: "Create API Key",
        description: "Create a REST API key for the selected integration account.",
        showLabel: true,
        showExpiration: true,
        showPlain: false,
        showWarning: false,
        confirmLabel: "Create Key",
      });
    }

    function openRestApiKeyRenameModal(keyId, currentLabel) {
      openApiKeyModal({
        mode: "rename",
        keyId,
        title: "Rename API Key",
        description: "Update the label for this key.",
        showLabel: true,
        showPlain: false,
        showWarning: false,
        labelValue: currentLabel || "",
        confirmLabel: "Save",
      });
    }

    function openRestApiKeyRevealModal(plaintext) {
      openApiKeyModal({
        mode: "reveal",
        title: "API Key",
        description: "Copy this key now. It will not be shown again in the list.",
        showLabel: false,
        showPlain: true,
        showWarning: true,
        plaintext,
        confirmLabel: "Done",
      });
    }

    function openRestApiKeyCreatedModal(plaintext) {
      openApiKeyModal({
        mode: "created",
        title: "API Key Created",
        description: "",
        showLabel: false,
        showPlain: true,
        showWarning: true,
        plaintext,
        confirmLabel: "Done",
      });
    }

    async function submitApiKeyModal() {
      const mode = state.apiKeyModal.mode;
      const label = $("apiKeyModalLabel").value.trim();
      const expiration = $("apiKeyModalExpiration").value;
      $("apiKeyModalError").textContent = "";
      if ((mode === "create" || mode === "admin-create" || mode === "rename") && !label) {
        $("apiKeyModalError").textContent = "Name is required.";
        return;
      }
      if ((mode === "create" || mode === "admin-create") && !expiration) {
        $("apiKeyModalError").textContent = "Expiration is required.";
        return;
      }
      if (label.length > 128) {
        $("apiKeyModalError").textContent = "Name must be 128 characters or fewer.";
        return;
      }
      try {
        if (mode === "create") {
          const res = await api("/v1/viewer/rest-api-keys", {
            method: "POST",
            body: JSON.stringify({ label, expiration }),
          });
          closeApiKeyModal();
          await loadRestApiKeys();
          openRestApiKeyCreatedModal(res.data.apiKey);
          return;
        }
        if (mode === "admin-create") {
          const accountId = $("adminViewerSelect").value;
          const res = await api(
            `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/rest-api-keys`,
            { method: "POST", body: JSON.stringify({ label, expiration }) },
          );
          closeApiKeyModal();
          await loadAdminRestApiKeys(accountId);
          openRestApiKeyCreatedModal(res.data.apiKey);
          return;
        }
        if (mode === "rename") {
          const keyId = state.apiKeyModal.keyId;
          const accountId = $("adminViewerSelect")?.value;
          const isAdminRename = document.getElementById("apiKeyModal").dataset.adminRename === "1";
          if (isAdminRename && accountId) {
            await api(
              `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/rest-api-keys/${encodeURIComponent(keyId)}`,
              { method: "PATCH", body: JSON.stringify({ label }) },
            );
            closeApiKeyModal();
            await loadAdminRestApiKeys(accountId);
          } else {
            await api(`/v1/viewer/rest-api-keys/${encodeURIComponent(keyId)}`, {
              method: "PATCH",
              body: JSON.stringify({ label }),
            });
            closeApiKeyModal();
            await loadRestApiKeys();
          }
          showApiToast("Key updated");
          return;
        }
        if (mode === "created" || mode === "reveal") {
          closeApiKeyModal();
          return;
        }
      } catch (e) {
        $("apiKeyModalError").textContent = parseApiErrorMessage(e);
      }
    }

    async function patchRestApiKeyStatus(keyId, status, admin = false) {
      const accountId = $("adminViewerSelect")?.value;
      const path = admin
        ? `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/rest-api-keys/${encodeURIComponent(keyId)}`
        : `/v1/viewer/rest-api-keys/${encodeURIComponent(keyId)}`;
      await api(path, { method: "PATCH", body: JSON.stringify({ status }) });
      if (admin) await loadAdminRestApiKeys(accountId);
      else await loadRestApiKeys();
      showApiToast(status === "active" ? "Key enabled" : "Key disabled");
    }

    async function deleteRestApiKeyById(keyId, admin = false) {
      if (!confirm("Integrations using this key will stop working.")) return;
      const accountId = $("adminViewerSelect")?.value;
      const path = admin
        ? `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/rest-api-keys/${encodeURIComponent(keyId)}`
        : `/v1/viewer/rest-api-keys/${encodeURIComponent(keyId)}`;
      await api(path, { method: "DELETE" });
      if (admin) await loadAdminRestApiKeys(accountId);
      else await loadRestApiKeys();
      showApiToast("Key deleted");
    }

    async function setRestApiKeyPrimary(keyId) {
      await api(`/v1/viewer/rest-api-keys/${encodeURIComponent(keyId)}/set-primary`, {
        method: "POST",
        body: "{}",
      });
      await loadRestApiKeys();
      showApiToast("Primary key updated");
    }

    async function revealRestApiKeyById(keyId) {
      try {
        const res = await api(`/v1/viewer/rest-api-keys/${encodeURIComponent(keyId)}/reveal`, {
          method: "POST",
          body: "{}",
        });
        openRestApiKeyRevealModal(res.data.apiKey);
      } catch (e) {
        setRestApiKeysStatus(parseApiErrorMessage(e));
        showApiToast(parseApiErrorMessage(e));
      }
    }

    function wireRestApiKeysTableActions(root, admin = false) {
      if (!root) return;
      root.querySelectorAll("[data-api-key-rename]").forEach((btn) => {
        btn.onclick = () => {
          const keyId = btn.dataset.apiKeyRename;
          const keys = admin ? state.adminRestApiKeys : state.restApiKeys;
          const row = keys.find((k) => k.id === keyId);
          $("apiKeyModal").dataset.adminRename = admin ? "1" : "0";
          openRestApiKeyRenameModal(keyId, row?.label || "");
        };
      });
      root.querySelectorAll("[data-api-key-disable]").forEach((btn) => {
        btn.onclick = () => {
          patchRestApiKeyStatus(btn.dataset.apiKeyDisable, "disabled", admin).catch((e) => {
            const msg = parseApiErrorMessage(e);
            if (admin) setAdminRestApiKeysStatus(msg);
            else setRestApiKeysStatus(msg);
          });
        };
      });
      root.querySelectorAll("[data-api-key-enable]").forEach((btn) => {
        btn.onclick = () => {
          patchRestApiKeyStatus(btn.dataset.apiKeyEnable, "active", admin).catch((e) => {
            const msg = parseApiErrorMessage(e);
            if (admin) setAdminRestApiKeysStatus(msg);
            else setRestApiKeysStatus(msg);
          });
        };
      });
      root.querySelectorAll("[data-api-key-primary]").forEach((btn) => {
        btn.onclick = () => {
          setRestApiKeyPrimary(btn.dataset.apiKeyPrimary).catch((e) =>
            setRestApiKeysStatus(parseApiErrorMessage(e)),
          );
        };
      });
      root.querySelectorAll("[data-api-key-reveal]").forEach((btn) => {
        btn.onclick = () => revealRestApiKeyById(btn.dataset.apiKeyReveal);
      });
      root.querySelectorAll("[data-api-key-delete]").forEach((btn) => {
        btn.onclick = () => {
          deleteRestApiKeyById(btn.dataset.apiKeyDelete, admin).catch((e) => {
            const msg = parseApiErrorMessage(e);
            if (admin) setAdminRestApiKeysStatus(msg);
            else setRestApiKeysStatus(msg);
          });
        };
      });
    }

    function renderServiceAccountsTable() {
      const card = $("dashServiceAccountsCard");
      const wrap = $("serviceAccountsTableWrap");
      const newBtn = $("serviceAccountsNewBtn");
      if (!card || !wrap) return;
      if (!canManageWorkspaceApi()) {
        card.style.display = "none";
        if (newBtn) newBtn.style.display = "none";
        return;
      }
      card.style.display = "";
      if (newBtn) newBtn.style.display = "";
      const accounts = state.serviceAccounts || [];
      if (!accounts.length) {
        wrap.innerHTML = `<div class="api-keys-empty"><p>No service accounts yet</p><button type="button" id="serviceAccountsEmptyCreate">+ New Service Account</button></div>`;
        const emptyBtn = $("serviceAccountsEmptyCreate");
        if (emptyBtn) emptyBtn.onclick = () => openServiceAccountCreateModal();
        return;
      }
      const rows = accounts.map((acct) => {
        const actions = [
          `<button type="button" data-sa-rotate="${escapeHtml(acct.id)}">Rotate secret</button>`,
          acct.status === "active"
            ? `<button type="button" data-sa-disable="${escapeHtml(acct.id)}">Disable</button>`
            : acct.status === "disabled"
              ? `<button type="button" data-sa-enable="${escapeHtml(acct.id)}">Enable</button>`
              : "",
          `<button type="button" class="admin-delete-btn" data-sa-delete="${escapeHtml(acct.id)}">Delete</button>`,
        ].filter(Boolean).join("");
        return `<tr>
          <td>${escapeHtml(acct.name)}</td>
          <td class="key-mono">${escapeHtml(acct.client_id || acct.clientId || "—")}</td>
            <td class="key-mono">${escapeHtml((acct.scopes || []).join(", "))}</td>
            <td>${restApiKeyStatusPill(acct.status)}</td>
          <td>${escapeHtml(formatRestApiKeyDate(acct.expiresAt))}</td>
          <td class="actions">${actions}</td>
        </tr>`;
      }).join("");
      wrap.innerHTML = `<table class="api-keys-table"><thead><tr><th>Name</th><th>Client ID</th><th>Scopes</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
      wrap.querySelectorAll("[data-sa-disable]").forEach((btn) => {
        btn.onclick = () => patchServiceAccountStatus(btn.dataset.saDisable, "revoke");
      });
      wrap.querySelectorAll("[data-sa-enable]").forEach((btn) => {
        btn.onclick = () => patchServiceAccountStatus(btn.dataset.saEnable, "reactivate");
      });
      wrap.querySelectorAll("[data-sa-delete]").forEach((btn) => {
        btn.onclick = () => deleteServiceAccountById(btn.dataset.saDelete);
      });
      wrap.querySelectorAll("[data-sa-rotate]").forEach((btn) => {
        btn.onclick = () => rotateServiceAccountById(btn.dataset.saRotate);
      });
    }

    async function loadServiceAccounts() {
      if (!isViewer()) return;
      try {
        const res = await api("/v1/viewer/service-accounts");
        state.serviceAccounts = res.data || [];
        state.serviceAccountAvailableScopes = res.meta?.availableScopes || [];
        $("serviceAccountsStatus").textContent = "";
      } catch (e) {
        state.serviceAccounts = [];
        $("serviceAccountsStatus").textContent = parseApiErrorMessage(e);
      }
      renderServiceAccountsTable();
    }

    function closeServiceAccountModal() {
      $("serviceAccountModal").classList.remove("open");
      $("serviceAccountModal").setAttribute("aria-hidden", "true");
      $("serviceAccountModalError").textContent = "";
    }

    function renderServiceAccountScopeOptions() {
      const wrap = $("serviceAccountModalScopes");
      if (!wrap) return;
      const scopes = state.serviceAccountAvailableScopes || [];
      if (!scopes.length) {
        wrap.innerHTML = '<span class="small">No API scopes available for your account.</span>';
        return;
      }
      wrap.innerHTML = scopes
        .map(
          (scope) =>
            `<label class="perm-toggle-row"><span>${escapeHtml(scope)}</span><span class="perm-switch"><input type="checkbox" data-sa-scope="${escapeHtml(scope)}" /><span class="slider"></span></span></label>`,
        )
        .join("");
    }

    function readSelectedServiceAccountScopes() {
      return [...document.querySelectorAll("#serviceAccountModalScopes [data-sa-scope]")]
        .filter((el) => el.checked)
        .map((el) => el.dataset.saScope);
    }

    function openServiceAccountCreateModal() {
      $("serviceAccountModalTitle").textContent = "Create Service Account";
      $("serviceAccountModalDesc").textContent =
        "Service accounts authenticate machines, not humans. Your application exchanges client credentials at POST /v1/viewer/auth/token.";
      $("serviceAccountModalWarning").style.display = "none";
      $("serviceAccountModalFormWrap").style.display = "";
      $("serviceAccountModalPlainWrap").style.display = "none";
      $("serviceAccountModalConfirm").style.display = "";
      $("serviceAccountModalConfirm").textContent = "Create";
      $("serviceAccountModalName").value = "";
      $("serviceAccountModalDescription").value = "";
      $("serviceAccountModalExpiration").value = "";
      renderServiceAccountScopeOptions();
      $("serviceAccountModal").classList.add("open");
      $("serviceAccountModal").setAttribute("aria-hidden", "false");
    }

    function openServiceAccountCreatedModal(data) {
      $("serviceAccountModalTitle").textContent = "Service Account Created";
      $("serviceAccountModalDesc").textContent = "";
      $("serviceAccountModalWarning").style.display = "";
      $("serviceAccountModalFormWrap").style.display = "none";
      $("serviceAccountModalPlainWrap").style.display = "";
      $("serviceAccountModalClientId").textContent = data.client_id || data.clientId;
      $("serviceAccountModalClientSecret").textContent = data.client_secret || data.clientSecret;
      $("serviceAccountModalConfirm").textContent = "Done";
      $("serviceAccountModal").classList.add("open");
      $("serviceAccountModal").setAttribute("aria-hidden", "false");
    }

    async function submitServiceAccountModal() {
      $("serviceAccountModalError").textContent = "";
      if ($("serviceAccountModalPlainWrap").style.display !== "none") {
        closeServiceAccountModal();
        return;
      }
      const name = $("serviceAccountModalName").value.trim();
      const description = $("serviceAccountModalDescription").value.trim();
      const expiration = $("serviceAccountModalExpiration").value;
      const scopes = readSelectedServiceAccountScopes();
      if (!name) {
        $("serviceAccountModalError").textContent = "Name is required.";
        return;
      }
      if (!scopes.length) {
        $("serviceAccountModalError").textContent = "Select at least one scope.";
        return;
      }
      if (!expiration) {
        $("serviceAccountModalError").textContent = "Expiration is required.";
        return;
      }
      try {
        const res = await api("/v1/viewer/service-accounts", {
          method: "POST",
          body: JSON.stringify({
            name,
            description: description || undefined,
            scopes,
            expiration,
          }),
        });
        closeServiceAccountModal();
        await loadServiceAccounts();
        openServiceAccountCreatedModal(res.data);
      } catch (e) {
        $("serviceAccountModalError").textContent = parseApiErrorMessage(e);
      }
    }

    async function patchServiceAccountStatus(id, action) {
      await api(`/v1/viewer/service-accounts/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" });
      await loadServiceAccounts();
    }

    async function deleteServiceAccountById(id) {
      if (!confirm("Delete this service account? Applications using it will stop working.")) return;
      await api(`/v1/viewer/service-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadServiceAccounts();
    }

    async function rotateServiceAccountById(id) {
      if (!confirm("Rotate client secret? The previous secret and refresh tokens will stop working.")) return;
      const res = await api(`/v1/viewer/service-accounts/${encodeURIComponent(id)}/rotate-secret`, { method: "POST", body: "{}" });
      openServiceAccountCreatedModal(res.data);
      await loadServiceAccounts();
    }

    function renderRestApiKeysTable() {
      const card = $("dashApiKeysCard");
      const wrap = $("restApiKeysTableWrap");
      const newBtn = $("restApiKeysNewBtn");
      if (!card || !wrap) return;
      if (!canManageWorkspaceApi()) {
        card.style.display = "none";
        if (newBtn) newBtn.style.display = "none";
        return;
      }
      card.style.display = "";
      if (newBtn) newBtn.style.display = "";
      wrap.innerHTML = renderRestApiKeysTableRows(state.restApiKeys || [], { viewerActions: true });
      wireRestApiKeysTableActions(wrap, false);
      const emptyBtn = $("restApiKeysEmptyCreate");
      if (emptyBtn) emptyBtn.onclick = () => openRestApiKeyCreateModal();
    }

    function renderAdminRestApiKeysTable() {
      const wrap = $("adminRestApiKeysTableWrap");
      const meta = $("adminRestApiKeysMeta");
      if (!wrap) return;
      const keys = state.adminRestApiKeys || [];
      wrap.innerHTML = renderRestApiKeysTableRows(keys, { adminActions: true });
      wireRestApiKeysTableActions(wrap, true);
      if (meta) {
        meta.textContent = keys.length
          ? `${keys.length} key${keys.length === 1 ? "" : "s"} configured`
          : "No REST API keys yet";
      }
    }

    function buildAdminPermissionToggles() {
      for (const group of ADMIN_PERMISSION_GROUPS) {
        const container = $(group.containerId);
        if (!container || container.dataset.built === "1") continue;
        container.innerHTML = group.items
          .map(
            ([key, label]) => `
          <label class="perm-toggle-row">
            <span>${label}</span>
            <span class="perm-switch">
              <input type="checkbox" data-perm="${key}" />
              <span class="slider"></span>
            </span>
          </label>`,
          )
          .join("");
        container.dataset.built = "1";
      }
    }

    function readAdminPermissionForm() {
      const patch = {};
      document.querySelectorAll("#admin input[data-perm]").forEach((input) => {
        patch[input.dataset.perm] = input.checked;
      });
      return patch;
    }

    function fillAdminPermissionForm(permissions) {
      document.querySelectorAll("#admin input[data-perm]").forEach((input) => {
        input.checked = permissions[input.dataset.perm] === true;
      });
    }

    function renderAdminViewerList(viewers) {
      state.adminViewers = viewers;
      const tbody = $("adminViewerListBody");
      if (!viewers.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="small">No integration accounts yet. Create one below.</td></tr>';
        return;
      }
      tbody.innerHTML = viewers
        .map((v) => {
          const accountId = v.accountId || v.viewerId;
          const action = v.deletable
            ? `<button type="button" class="admin-delete-btn" data-delete-account="${escapeHtml(accountId)}">Delete</button>`
            : `<span class="small">.env only</span>`;
          const source = v.source === "env" ? ".env" : "Admin panel";
          return `<tr>
            <td>${escapeHtml(v.displayName)}</td>
            <td><code>${escapeHtml(accountId)}</code></td>
            <td>${source}</td>
            <td>${action}</td>
          </tr>`;
        })
        .join("");
    }

    function setAdminViewerStatus(message, type = "") {
      const el = $("adminViewerStatus");
      el.textContent = message;
      el.className = "admin-status" + (type ? ` ${type}` : "");
    }

    function setAdminSettingsStatus(message, type = "") {
      const el = $("adminSettingsStatus");
      el.textContent = message;
      el.className = "admin-status" + (type ? ` ${type}` : "");
    }

    async function loadAdminViewerSettings() {
      if (!isAdmin()) return;
      buildAdminPermissionToggles();
      const listRes = await api("/v1/platform/admin/integration-accounts");
      const viewers = listRes.data || [];
      renderAdminViewerList(viewers);
      await loadAdminProjects();

      const sel = $("adminViewerSelect");
      const prev = sel.value;
      sel.innerHTML = "";
      viewers.forEach((v) => {
        const accountId = v.accountId || v.viewerId;
        const o = document.createElement("option");
        o.value = accountId;
        o.textContent = `${v.displayName} (${accountId})`;
        sel.appendChild(o);
      });
      if (!viewers.length) {
        setAdminSettingsStatus("Create an integration account to configure dashboard cards.", "err");
        return;
      }
      const pick = prev && viewers.some((v) => (v.accountId || v.viewerId) === prev)
        ? prev
        : (viewers[0].accountId || viewers[0].viewerId);
      sel.value = pick;
      await loadAdminViewerSettingsFor(sel.value);
    }

    async function loadAdminViewerSettingsFor(accountId) {
      const res = await api(`/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/access`);
      fillAdminPermissionForm(res.data.permissions);
      setAdminSettingsStatus("");
      await loadAdminIntegrationSettings(accountId);
      await loadAdminRestApiKeys(accountId);
    }

    function setAdminIntegrationStatusMsg(message, type = "") {
      const el = $("adminIntegrationStatusMsg");
      el.textContent = message;
      el.className = "admin-status" + (type ? ` ${type}` : "");
    }

    function renderAdminIntegrationPanel(data) {
      state.adminIntegration = data;
      $("adminIntegrationEnabled").checked = data.enabled === true;
      $("adminIntegrationStatus").textContent = (data.status || "none").toUpperCase();
      $("adminIntegrationGenerated").textContent = data.generatedAt
        ? new Date(data.generatedAt).toLocaleString()
        : "—";
      $("adminIntegrationExpires").textContent = data.expiresAt
        ? new Date(data.expiresAt).toLocaleString()
        : "—";
      const scopesEl = $("adminIntegrationScopes");
      const accessItems = data.enabledDataAccess || [];
      scopesEl.innerHTML = accessItems.length
        ? accessItems.map((label) => `<span class="pill">${escapeHtml(label)}</span>`).join("")
        : "<span class='small'>No data access enabled</span>";

      if (state.adminIntegrationPlainKey) {
        $("adminIntegrationKeyWrap").style.display = "";
        $("adminIntegrationKeyReveal").textContent = state.adminIntegrationPlainKey;
        $("adminIntegrationCopyKey").style.display = "";
      } else {
        $("adminIntegrationKeyWrap").style.display = "none";
        $("adminIntegrationCopyKey").style.display = "none";
      }
    }

    async function loadAdminIntegrationSettings(accountId) {
      if (!accountId || !isAdmin()) return;
      state.adminIntegrationPlainKey = null;
      try {
        const res = await api(`/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/key`);
        renderAdminIntegrationPanel(res.data);
        setAdminIntegrationStatusMsg("");
      } catch (e) {
        setAdminIntegrationStatusMsg(e.message, "err");
      }
    }

    async function saveAdminIntegrationEnabled() {
      const accountId = $("adminViewerSelect").value;
      if (!accountId) return;
      setAdminIntegrationStatusMsg("Saving…");
      try {
        const res = await api(`/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/key`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: $("adminIntegrationEnabled").checked }),
        });
        renderAdminIntegrationPanel(res.data);
        setAdminIntegrationStatusMsg("Integration setting saved.", "ok");
      } catch (e) {
        setAdminIntegrationStatusMsg(e.message, "err");
      }
    }

    async function adminIntegrationAction(action) {
      const accountId = $("adminViewerSelect").value;
      if (!accountId) return;
      const expiration = $("adminIntegrationExpiration").value;
      if ((action === "generate" || action === "regenerate") && !expiration) {
        setAdminIntegrationStatusMsg("Select an expiration before generating a key.", "err");
        return;
      }
      if (action === "regenerate" && !confirm("Regenerate access key? The previous key will stop working immediately.")) return;
      if (action === "revoke" && !confirm("Revoke access key? Integration will stop working until a new key is generated.")) return;

      setAdminIntegrationStatusMsg("Working…");
      try {
        const path =
          action === "generate"
            ? "generate"
            : action === "regenerate"
              ? "regenerate"
              : "revoke";
        const res = await api(
          `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/key/${path}`,
          {
            method: "POST",
            body: action === "revoke" ? "{}" : JSON.stringify({ expiration }),
          },
        );
        state.adminIntegrationPlainKey = res.data.accessKey || res.data.apiKey || null;
        renderAdminIntegrationPanel(res.data);
        const msg =
          action === "revoke"
            ? "Access key revoked."
            : "Access key generated. Copy it now — it will not be shown again in full.";
        setAdminIntegrationStatusMsg(msg, "ok");
      } catch (e) {
        setAdminIntegrationStatusMsg(e.message, "err");
      }
    }

    async function saveAdminViewerSettings() {
      const accountId = $("adminViewerSelect").value;
      if (!accountId) return;
      setAdminSettingsStatus("Saving…");
      try {
        const res = await api(
          `/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}/access`,
          { method: "PATCH", body: JSON.stringify(readAdminPermissionForm()) },
        );
        fillAdminPermissionForm(res.data.permissions);
        setAdminSettingsStatus("Settings saved successfully.", "ok");
        await loadAdminIntegrationSettings(accountId);
      } catch (e) {
        setAdminSettingsStatus(e.message, "err");
      }
    }

    async function createAdminViewer() {
      const username = $("adminNewViewerUser").value.trim();
      const password = $("adminNewViewerPass").value;
      const displayName = $("adminNewViewerName").value.trim();
      if (!username || !password || !displayName) {
        setAdminViewerStatus("Username, password, and display name are required.", "err");
        return;
      }
      setAdminViewerStatus("Creating…");
      try {
        await api("/v1/platform/admin/integration-accounts", {
          method: "POST",
          body: JSON.stringify({ username, password, displayName }),
        });
        $("adminNewViewerUser").value = "";
        $("adminNewViewerPass").value = "";
        $("adminNewViewerName").value = "";
        setAdminViewerStatus(`Integration account "${username}" created successfully.`, "ok");
        await loadAdminViewerSettings();
        $("adminViewerSelect").value = username;
        await loadAdminViewerSettingsFor(username);
      } catch (e) {
        setAdminViewerStatus(e.message, "err");
      }
    }

    async function deleteAdminViewer(accountId) {
      const account = state.adminViewers.find((v) => (v.accountId || v.viewerId) === accountId);
      const label = account?.displayName || accountId;
      if (!confirm(`Delete integration account "${label}" (${accountId})? This cannot be undone.`)) return;
      setAdminViewerStatus("Deleting…");
      try {
        await api(`/v1/platform/admin/integration-accounts/${encodeURIComponent(accountId)}`, {
          method: "DELETE",
        });
        setAdminViewerStatus(`Account "${accountId}" deleted.`, "ok");
        await loadAdminViewerSettings();
      } catch (e) {
        setAdminViewerStatus(e.message, "err");
      }
    }

    function setAdminProjectStatus(message, type = "") {
      const el = $("adminProjectStatus");
      el.textContent = message;
      el.className = "admin-status" + (type ? ` ${type}` : "");
    }

    function setAdminAssignmentStatus(message, type = "") {
      const el = $("adminAssignmentStatus");
      el.textContent = message;
      el.className = "admin-status" + (type ? ` ${type}` : "");
    }

    function renderAdminProjects(projects) {
      state.adminProjects = projects;
      const tbody = $("adminProjectListBody");
      if (!projects.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="small">No FH2 projects synced yet. Click Sync from FlightHub 2.</td></tr>';
      } else {
        tbody.innerHTML = projects
          .map((p) => {
            const viewers = (p.assignedViewers || []).map((v) => v.displayName).join(", ") || "—";
            return `<tr>
              <td>${escapeHtml(p.projectName)}</td>
              <td><code>${escapeHtml(p.fh2ProjectCode)}</code></td>
              <td>${escapeHtml(p.fh2Status || "unknown")}</td>
              <td>${escapeHtml(viewers)}</td>
              <td>${p.lastSyncedAt ? new Date(p.lastSyncedAt).toLocaleString() : "—"}</td>
              <td>
                <button type="button" data-project-sync>Refresh/Sync</button>
                ${
                  p.localStatus === "active"
                    ? `<button type="button" data-project-deactivate="${escapeHtml(p.fh2ProjectId)}">Deactivate (Local)</button>`
                    : `<span class="small">Locally inactive</span>`
                }
              </td>
            </tr>`;
          })
          .join("");
      }

      const projectSel = $("adminAssignProject");
      projectSel.innerHTML = "";
      for (const p of projects) {
        const o = document.createElement("option");
        o.value = p.fh2ProjectId;
        o.textContent = `${p.projectName} (${p.fh2ProjectCode})`;
        projectSel.appendChild(o);
      }
      const viewerSel = $("adminAssignViewer");
      viewerSel.innerHTML = "";
      for (const v of state.adminViewers) {
        const accountId = v.accountId || v.viewerId;
        const o = document.createElement("option");
        o.value = accountId;
        o.textContent = `${v.displayName} (${accountId})`;
        viewerSel.appendChild(o);
      }
    }

    async function loadAdminProjects() {
      if (!isAdmin()) return;
      const res = await api("/v1/platform/admin/fh2-projects");
      renderAdminProjects(res.data?.projects || []);
      const syncMeta = $("adminProjectSyncMeta");
      const last = res.data?.sync?.lastSyncAt;
      const err = res.data?.sync?.lastSyncError;
      syncMeta.textContent = err
        ? `Last sync failed: ${err}`
        : last
          ? `Last sync: ${new Date(last).toLocaleString()}`
          : "Not synced yet";
    }

    async function syncAdminProjects() {
      setAdminProjectStatus("Syncing from FlightHub 2…");
      await api("/v1/platform/admin/fh2-projects/sync", {
        method: "POST",
        body: "{}",
      });
      setAdminProjectStatus("Projects synced from FlightHub 2.", "ok");
      await loadAdminProjects();
    }

    async function assignViewerToProject(remove = false) {
      const projectId = $("adminAssignProject").value;
      const viewerId = $("adminAssignViewer").value;
      if (!projectId || !viewerId) {
        setAdminAssignmentStatus("Select both project and viewer.", "err");
        return;
      }
      setAdminAssignmentStatus(remove ? "Removing…" : "Assigning…");
      if (remove) {
        await api(`/v1/platform/admin/fh2-projects/${encodeURIComponent(projectId)}/remove-viewer/${encodeURIComponent(viewerId)}`, {
          method: "DELETE",
        });
      } else {
        await api(`/v1/platform/admin/fh2-projects/${encodeURIComponent(projectId)}/assign-viewer`, {
          method: "POST",
          body: JSON.stringify({ viewerId }),
        });
      }
      setAdminAssignmentStatus(remove ? "Viewer removed from project." : "Viewer assigned to project.", "ok");
      await loadAdminProjects();
    }

    async function deactivateAdminProject(projectId) {
      await api(`/v1/platform/admin/fh2-projects/${encodeURIComponent(projectId)}/deactivate`, {
        method: "POST",
        body: "{}",
      });
      setAdminProjectStatus("Project deactivated.", "ok");
      await loadAdminProjects();
    }


    function primaryDrone() {
      return state.devices.find((d) => d.role === "drone");
    }

    function primaryDock() {
      return state.devices.find((d) => d.role === "gateway" || d.role === "dock");
    }

    function showApiToast(message) {
      const toast = $("apiToast");
      toast.textContent = message || "API value copied";
      toast.classList.add("show");
      setTimeout(() => {
        toast.classList.remove("show");
        toast.textContent = "API value copied";
      }, 2200);
    }

    function formatApiCopy(endpoint, sample, extraEndpoints) {
      let text = `Endpoint:\n${endpoint}`;
      if (extraEndpoints?.length) {
        for (const e of extraEndpoints) text += `\n${e}`;
      }
      if (sample !== undefined && sample !== null) {
        text += `\n\nSample Response:\n${JSON.stringify(sample, null, 2)}`;
      }
      return text;
    }

    function getApiCopyText(cardKey) {
      if (isViewer() && integrationActive()) {
        const path = INTEGRATION_API_ROUTES[cardKey];
        if (path) return buildIntegrationCurlExample(path);
      }

      const drone = primaryDrone();
      const dock = primaryDock();
      const ds = drone?.serialNumber || "{droneSerial}";
      const gs = dock?.serialNumber || "{dockSerial}";
      const s = state.apiSamples;

      switch (cardKey) {
        case "fleet":
          return formatApiCopy(
            "GET /v1/viewer/devices",
            s.devicesSample,
            ["GET /v1/viewer/fleet/summary", "GET /v1/viewer/fleet/positions"],
          );
        case "drone-telemetry":
          return formatApiCopy(`GET /v1/viewer/devices/${ds}/telemetry/latest`, s.droneTelemetry);
        case "dock-telemetry":
          return formatApiCopy(`GET /v1/viewer/docks/${gs}`, s.dockTelemetry);
        case "battery":
          return formatApiCopy(`GET /v1/viewer/devices/${ds}/telemetry/latest`, s.batterySample);
        case "gps":
          return formatApiCopy(`GET /v1/viewer/fleet/positions`, s.gpsSample);
        case "online":
          return formatApiCopy("GET /v1/viewer/fleet/summary", s.onlineSample);
        case "camera":
          return formatApiCopy(
            `GET /v1/viewer/devices/${gs}/live-stream?camera=dock`,
            s.cameraSample?.dock || s.cameraSample,
          );
        case "drone-fpv":
          return formatApiCopy(
            `GET /v1/viewer/devices/${ds}/live-stream?camera=drone`,
            s.cameraSample?.drone || s.cameraSample,
          );
        case "alerts":
          return formatApiCopy("GET /v1/viewer/events?limit=25", s.alertsSample);
        case "missions":
          return formatApiCopy(
            "GET /v1/viewer/media/recent",
            s.missionsSample,
            ["GET /v1/viewer/tasks", "GET /v1/viewer/tasks/{taskId}/media"],
          );
        default:
          return "Endpoint:\nGET /v1/viewer/capabilities";
      }
    }

    async function copyApiForCard(cardKey) {
      try {
        await navigator.clipboard.writeText(getApiCopyText(cardKey));
        showApiToast();
      } catch (e) {
        alert("Could not copy: " + e.message);
      }
    }

    function closeCardZoom() {
      $("cardZoomBackdrop").classList.remove("open");
      $("cardZoomBackdrop").setAttribute("aria-hidden", "true");
      document.body.classList.remove("zoom-open");
      state.zoomCardId = null;
      destroyZoomStreams();
      if (state.zoomFleetMap) {
        state.zoomFleetMap.remove();
        state.zoomFleetMap = null;
        state.zoomFleetMarkers = {};
      }
      if (state.dashFleetMap) {
        setTimeout(() => state.dashFleetMap.invalidateSize(), 80);
      }
    }

    function buildFleetZoomHtml() {
      const rows = state.devices
        .map((d) => {
          const pos = (state.apiSamples.positions || []).find((p) => p.serialNumber === d.serialNumber);
          const loc =
            pos?.latitude != null && pos?.longitude != null
              ? `${Number(pos.latitude).toFixed(5)}, ${Number(pos.longitude).toFixed(5)}`
              : "—";
          return `<tr>
            <td>${d.serialNumber}</td>
            <td>${d.role}</td>
            <td><span class="pill ${d.online ? "ok" : "bad"}">${d.online ? "online" : "offline"}</span></td>
            <td>${loc}</td>
            <td>${pos?.batteryPercent ?? "—"}</td>
          </tr>`;
        })
        .join("");
      return `
        <div class="dash-kpis">
          <div class="dash-kpi"><div class="small">Devices</div><div class="v">${$("dashKTotal").textContent}</div></div>
          <div class="dash-kpi"><div class="small">Online</div><div class="v">${$("dashKOnline").textContent}</div></div>
        </div>
        <div id="zoomFleetMap"></div>
        <table class="fleet-zoom-table">
          <thead><tr><th>Serial</th><th>Role</th><th>Status</th><th>Location</th><th>Battery</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='5'>No devices</td></tr>"}</tbody>
        </table>`;
    }

    function openCardZoom(cardId) {
      const card = document.querySelector(`.dash-card[data-card="${cardId}"]`);
      if (!card) return;
      state.zoomCardId = cardId;
      $("cardZoomTitle").textContent = card.querySelector(".dash-card-title").textContent;
      const body = $("cardZoomBody");

      if (cardId === "camera" || cardId === "drone-fpv") {
        body.innerHTML = "";
        body.appendChild($("zoomCameraTemplate").content.cloneNode(true));
        loadZoomStreams().catch((e) => console.warn("zoom streams", e));
      } else if (cardId === "fleet") {
        body.innerHTML = buildFleetZoomHtml();
        setTimeout(() => {
          ensureDashFleetMap("zoomFleetMap");
          if (state.apiSamples.positions) updateDashFleetMap(state.apiSamples.positions, "zoomFleetMap");
        }, 80);
      } else {
        body.innerHTML = card.querySelector(".dash-card-body").innerHTML;
      }

      $("cardZoomGetApi").onclick = (e) => {
        e.stopPropagation();
        copyApiForCard(cardId);
      };
      $("cardZoomBackdrop").classList.add("open");
      $("cardZoomBackdrop").setAttribute("aria-hidden", "false");
      document.body.classList.add("zoom-open");
    }

    function updateRoleUi() {
      const s = state.session;
      const badge = $("userBadge");
      const main = $("appMain");
      const overlay = $("loginOverlay");
      if (!s) {
        badge.textContent = "Not signed in";
        badge.className = "pill role-viewer";
        $("logoutBtn").style.display = "none";
        $("liveBadge").style.display = "none";
        if (!SHAMAL_REACT_SHELL) overlay.classList.remove("hidden");
        if (!SHAMAL_REACT_SHELL) document.body.classList.add("logged-out");
        main.style.opacity = "0";
        main.style.pointerEvents = "none";
        document.getElementById("legacy-portal-root")?.classList.remove("viewer-layout");
        $("appMain").classList.remove("viewer-no-nav");
        state.restApiKeys = [];
        state.adminRestApiKeys = [];
        renderRestApiKeysTable();
        renderServiceAccountsTable();
        updateSettingsAccessUi();
        return;
      }
      badge.textContent = s.displayName;
      badge.className = "pill";
      $("logoutBtn").style.display = "inline-block";
      if (!SHAMAL_REACT_SHELL) overlay.classList.add("hidden");
      if (!SHAMAL_REACT_SHELL) document.body.classList.remove("logged-out");
      main.style.opacity = "1";
      main.style.pointerEvents = "auto";

      const viewer = isViewer();
      const legacyHost = document.getElementById("legacy-portal-root");
      if (legacyHost) legacyHost.classList.toggle("viewer-layout", viewer);
      document.body.classList.toggle("viewer-layout", viewer);
      $("appMain").classList.remove("viewer-no-nav");
      document.querySelectorAll("[data-nav-viewer]").forEach((el) => {
        el.style.display = viewer ? "" : "none";
      });
      document.querySelectorAll("[data-nav-staff]").forEach((el) => {
        el.style.display = viewer ? "none" : "";
      });
      document.querySelectorAll("[data-nav-admin]").forEach((el) => {
        el.style.display = isAdmin() ? "" : "none";
      });
      $("headerSub").textContent = viewer
        ? "Live fleet intelligence — every asset, one screen."
        : "Fleet monitoring, live camera, operations, alerts, missions";

      applyViewerDashboardPermissions();
      updateSettingsAccessUi();

      document.querySelectorAll("#opsActionGrid .op-btn").forEach((btn) => {
        btn.disabled = !canOperate();
      });
      if ($("opsRoleNote")) {
        $("opsRoleNote").textContent = canOperate()
          ? "You may run operations (double confirmation required)."
          : "Operations are not available for your account.";
      }

      const viewerTabs = ["dashboard", "settings"];
      if (viewer && !viewerTabs.includes(state.activeTab)) {
        state.activeTab = "dashboard";
      } else if (!viewer && state.activeTab === "dashboard") {
        state.activeTab = "fleet";
      } else if (!viewer && state.activeTab === "settings") {
        state.activeTab = "fleet";
      }
      activateTab(state.activeTab);
      if (state.activeTab === "dashboard" && state.dashFleetMap) {
        setTimeout(() => state.dashFleetMap.invalidateSize(), 120);
      }
    }

    document.querySelectorAll(".get-api-btn[data-api-card]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyApiForCard(btn.dataset.apiCard);
      });
    });

    document.querySelectorAll(".dash-card[data-zoomable]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".get-api-btn")) return;
        openCardZoom(card.dataset.card);
      });
    });

    $("cardZoomClose").onclick = closeCardZoom;
    $("cardZoomBackdrop").onclick = (e) => {
      if (e.target === $("cardZoomBackdrop")) closeCardZoom();
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("cardZoomBackdrop").classList.contains("open")) closeCardZoom();
    });

    document.querySelectorAll("nav button").forEach((btn) => btn.onclick = () => {
      if (btn.style.display === "none") return;
      activateTab(btn.dataset.tab);
      if (btn.dataset.tab === "fleet" && state.fleetMap) {
        setTimeout(() => state.fleetMap.invalidateSize(), 120);
      }
      if (btn.dataset.tab === "dashboard" && state.dashFleetMap) {
        setTimeout(() => state.dashFleetMap.invalidateSize(), 120);
      }
      if (btn.dataset.tab === "admin" && isAdmin()) {
        loadAdminViewerSettings().catch((e) => alert(e.message));
      }
      if (btn.dataset.tab === "settings" && canManageWorkspaceApi()) {
        loadSettingsPage().catch((e) => alert(e.message));
      }
      if (btn.dataset.tab === "camera" && $("camDevice").value && state.session) {
        loadAllStreams();
      }
    });

    document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
      btn.onclick = () => activateSettingsTab(btn.dataset.settingsTab);
    });

    function updateLiveBadge(active, lastAt) {
      const badge = $("liveBadge");
      badge.style.display = state.session ? "inline-block" : "none";
      if (!state.session) return;
      if (active) {
        badge.className = "pill ok";
        badge.textContent = lastAt
          ? `● Live · ${lastAt.toLocaleTimeString()}`
          : "● Live";
      } else {
        badge.className = "pill warn";
        badge.textContent = "● Paused";
      }
    }

    function startLiveUpdates() {
      stopLiveUpdates();
      updateLiveBadge(true);
      state.liveTimer = setInterval(() => {
        if (document.hidden || !state.session) return;
        liveTick().catch((e) => console.warn("live tick", e));
      }, LIVE_INTERVAL_MS);
    }

    function stopLiveUpdates() {
      if (state.liveTimer) {
        clearInterval(state.liveTimer);
        state.liveTimer = null;
      }
      updateLiveBadge(false);
    }

    document.addEventListener("visibilitychange", () => {
      if (!state.session) return;
      if (document.hidden) {
        updateLiveBadge(false);
      } else {
        updateLiveBadge(true);
        liveTick().catch((e) => console.warn("live resume", e));
      }
    });

    async function liveTick() {
      if (state.isRefreshing || !state.session) return;
      state.isRefreshing = true;
      try {
        const tab = state.activeTab;
        if (tab === "fleet" || tab === "camera" || tab === "dashboard" || isViewer()) {
          await loadFleet({ silent: true });
        }
        if (tab === "ops" && !isViewer()) {
          await Promise.all([loadOpsReadiness(), loadOpsLog()]);
        }
        if (tab === "dashboard" || tab === "alerts" || (isViewer() && cardAllowed("alertsEvents"))) {
          await loadEvents();
        }
        if (tab === "dashboard" && isViewer()) {
          await refreshViewerExtras({ silent: true, skipStreams: true });
        }
        if (tab === "camera" && state.streamLoaded && $("camDevice").value) {
          await refreshCameraTelemetry();
        }
        updateLiveBadge(true, new Date());
      } finally {
        state.isRefreshing = false;
      }
    }

    async function refreshCameraTelemetry() {
      const sn = $("camDevice").value;
      if (!sn) return;
      try {
        const telem = await api(`/v1/viewer/devices/${sn}/telemetry/latest`);
        const existing = $("streamInfo").textContent;
        const prefix = existing.includes("Snapshot") ? "" : existing + "\n\n";
        $("streamInfo").textContent =
          prefix + `Telemetry @ ${new Date().toLocaleTimeString()}\n` + JSON.stringify(telem.data, null, 2);
      } catch (e) {
        console.warn("camera telemetry", e);
      }
    }

    async function api(path, opts = {}) {
      if (!state.session?.apiKey) throw new Error("Not signed in");
      let requestPath = path;
      const projectCode = selectedProjectCode();
      if (
        isViewer() &&
        projectCode &&
        path.startsWith("/v1/viewer/") &&
        !path.startsWith("/v1/viewer/auth/") &&
        !path.startsWith("/v1/platform/admin/") &&
        !path.startsWith("/v1/viewer/rest-api-keys")
      ) {
        const sep = path.includes("?") ? "&" : "?";
        requestPath = `${path}${sep}projectCode=${encodeURIComponent(projectCode)}`;
      }
      const headers = {
        "X-Api-Key": state.session.apiKey,
        "X-CC-Session": state.session.sessionToken,
        ...(opts.headers || {}),
      };
      if (opts.body != null && opts.body !== "") {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
      }
      const res = await fetch(requestPath, { ...opts, headers });
      if (res.status === 401) {
        clearSession();
        updateRoleUi();
        throw new Error("Session expired — sign in again");
      }
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.json();
    }

    const _loginBtn = $("loginBtn"); if (_loginBtn) _loginBtn.onclick = async () => {
      $("loginError").textContent = "";
      try {
        const res = await fetch("/v1/viewer/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: $("loginUser").value.trim(),
            password: $("loginPass").value,
          }),
        });
        const raw = await res.text();
        let body;
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          $("loginError").textContent =
            res.ok ? "Invalid server response" : `Login failed (${res.status})`;
          return;
        }
        if (!res.ok) {
          $("loginError").textContent = body.message || body.error || "Login failed";
          return;
        }
        if (isAdminPortal() && body.data.role !== "admin") {
          $("loginError").textContent =
            "Administrator credentials required. User accounts sign in at the main platform.";
          return;
        }
        if (!isAdminPortal() && body.data.role === "admin") {
          saveSession({
            apiKey: body.data.apiKey,
            role: body.data.role,
            displayName: body.data.displayName,
            sessionToken: body.data.sessionToken,
            username: body.data.username,
            viewerDashboardPermissions: body.data.viewerDashboardPermissions,
            assignedProjects: body.data.assignedProjects || [],
            fallbackProjectCode: body.data.fallbackProjectCode || null,
            selectedProjectCode:
              body.data.assignedProjects?.[0]?.projectCode ||
              body.data.fallbackProjectCode ||
              null,
          });
          window.location.replace("/admin");
          return;
        }
        saveSession({
          apiKey: body.data.apiKey,
          role: body.data.role,
          displayName: body.data.displayName,
          sessionToken: body.data.sessionToken,
          username: body.data.username,
          viewerDashboardPermissions: body.data.viewerDashboardPermissions,
          assignedProjects: body.data.assignedProjects || [],
          fallbackProjectCode: body.data.fallbackProjectCode || null,
          selectedProjectCode:
            body.data.assignedProjects?.[0]?.projectCode ||
            body.data.fallbackProjectCode ||
            null,
        });
        if (await redirectToReturnToIfReady()) return;
        updateRoleUi();
        startLiveUpdates();
        if (isViewer()) {
          await syncSessionFromServer();
        }
        const initialTab = resolveInitialTab();
        activateTab(initialTab);
        if (initialTab === "settings" && canManageWorkspaceApi()) {
          await loadSettingsPage();
        }
        await refreshDashboard();
      } catch (e) {
        $("loginError").textContent = e.message;
      }
    };

    $("logoutBtn").onclick = async () => {
      stopLiveUpdates();
      try {
        await fetch("/v1/auth/logout", { method: "POST", credentials: "include" });
      } catch (_) {}
      clearSession();
      destroyPlayer();
      destroyDashStreams();
      destroyZoomStreams();
      state.streamLoaded = false;
      updateRoleUi();
    };

    async function loadVolcMod() {
      if (!state.volcMod) {
        state.volcMod = await import("https://cdn.jsdelivr.net/npm/@volcengine/rtc@4.68.5/+esm");
        window.VERTC = state.volcMod.default;
      }
      return state.volcMod;
    }

    async function destroyVolcSlot(slot) {
      const session = state.volcSessions[slot];
      if (!session) return;
      session.gen += 1;
      const { engine, joined } = session;
      state.volcSessions[slot] = null;
      if (!engine) return;
      if (joined) {
        try {
          await engine.leaveRoom();
        } catch (_) {}
      }
      try {
        if (window.VERTC?.destroyEngine) window.VERTC.destroyEngine(engine);
      } catch (_) {}
    }

    async function destroyPlayer() {
      if (state.hls) {
        state.hls.destroy();
        state.hls = null;
      }
      if (state.whepPc) {
        state.whepPc.close();
        state.whepPc = null;
      }
      await destroyVolcSlot("dock");
      await destroyVolcSlot("drone");
      for (const id of ["dockPlayer", "dronePlayer"]) {
        const video = $(id);
        if (!video) continue;
        video.pause();
        video.srcObject = null;
        video.removeAttribute("src");
        video.style.display = "none";
      }
      for (const id of ["dockVolcHost", "droneVolcHost"]) {
        const host = $(id);
        if (!host) continue;
        host.innerHTML = "";
        host.style.display = "none";
      }
      for (const id of ["dockPlaceholder", "dronePlaceholder"]) {
        const el = $(id);
        if (el) el.style.display = "flex";
      }
    }

    async function playVolc(slot, volc, _video, placeholder, statusEl, hostIdOverride, sessionKeyOverride) {
      const hostId = hostIdOverride || (slot === "dock" ? "dockVolcHost" : "droneVolcHost");
      const sessionKey = sessionKeyOverride || slot;
      const host = $(hostId);
      const gen = (state.volcSessions[sessionKey]?.gen ?? 0) + 1;
      state.volcSessions[sessionKey] = { engine: null, joined: false, gen };

      placeholder.textContent = "Connecting to live camera…";
      placeholder.style.display = "flex";
      statusEl.textContent = "";
      host.innerHTML = "";
      host.style.display = "none";

      const mod = await loadVolcMod();
      if (state.volcSessions[sessionKey]?.gen !== gen) return;

      const VERTC = mod.default;
      const { StreamIndex, RoomProfileType } = mod;
      const engine = VERTC.createEngine(volc.appId, { autoPlayPolicy: 1 });
      state.volcSessions[sessionKey] = { engine, joined: false, gen };

      const attachRemote = async (userId) => {
        if (!userId || userId === volc.userId) return;
        if (state.volcSessions[sessionKey]?.gen !== gen) return;
        try {
          host.innerHTML = "";
          host.style.display = "block";
          await engine.setUserVisibility(false);
          await engine.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
            userId,
            renderDom: host,
            visible: false,
          });
          placeholder.style.display = "none";
          statusEl.textContent = "● Live";
        } catch (e) {
          console.warn(`[${slot}] attach remote`, userId, e);
        }
      };

      engine.on(VERTC.events.onUserPublishStream, (e) => {
        attachRemote(e.userId).catch(() => {});
      });

      engine.on(VERTC.events.onError, (err) => {
        if (state.volcSessions[sessionKey]?.gen !== gen) return;
        const msg = err?.message || err?.msg || "RTC connection failed";
        if (msg === "leave_room") return;
        placeholder.textContent = `Live stream error: ${msg}`;
        placeholder.style.display = "flex";
        statusEl.textContent = "";
      });

      try {
        await engine.joinRoom(
          volc.token,
          volc.roomId,
          { userId: volc.userId },
          {
            isAutoPublish: false,
            isAutoSubscribeAudio: true,
            isAutoSubscribeVideo: true,
            roomProfileType: RoomProfileType.meeting,
          },
        );
        if (state.volcSessions[sessionKey]?.gen !== gen) return;
        state.volcSessions[sessionKey].joined = true;

        setTimeout(() => {
          if (state.volcSessions[sessionKey]?.gen !== gen) return;
          if (host.style.display !== "block") {
            placeholder.textContent =
              slot === "dock"
                ? "No dock video yet — enable livestream in FH2 Dock tab, then refresh."
                : "No drone video yet — drone may be offline or FPV not publishing.";
            placeholder.style.display = "flex";
          }
        }, 15000);
      } catch (e) {
        if (state.volcSessions[sessionKey]?.gen !== gen) return;
        const msg = e?.message || String(e);
        if (msg !== "leave_room") {
          placeholder.textContent = `Could not join stream: ${msg}`;
          placeholder.style.display = "flex";
        }
        throw e;
      }
    }

    async function playWhep(url, video, placeholder, statusEl) {
      const pc = new RTCPeerConnection();
      state.whepPc = pc;
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.ontrack = (ev) => {
        video.srcObject = ev.streams[0];
        video.play().catch(() => {});
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`WHEP ${res.status}`);
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      video.style.display = "block";
      placeholder.style.display = "none";
      statusEl.textContent = "● Live";
    }

    function mountPanelPlayer(slot, data, video, placeholder, statusEl, volcHostId, volcSessionKey) {
      const playback = data.playback || { type: "none", viewerNote: data.note };
      const host = volcHostId ? $(volcHostId) : null;
      if (statusEl) statusEl.textContent = playback.viewerNote || data.note || "";
      if (video) {
        video.pause();
        video.style.display = "none";
        video.removeAttribute("src");
      }
      if (host) {
        host.innerHTML = "";
        host.style.display = "none";
      }

      if (!data.streamingSupported || playback.type === "none") {
        placeholder.textContent = playback.viewerNote || data.note || "Stream unavailable.";
        placeholder.style.display = "flex";
        return;
      }

      if (playback.type === "volc" && playback.volc) {
        playVolc(slot, playback.volc, video, placeholder, statusEl, volcHostId, volcSessionKey).catch((e) => {
          const msg = e?.message || String(e);
          if (msg !== "leave_room") {
            placeholder.textContent = `Could not start player: ${msg}`;
            placeholder.style.display = "flex";
          }
        });
        return;
      }

      if (playback.url?.startsWith("app_id=")) {
        placeholder.textContent = "Stream credentials received but player not configured.";
        placeholder.style.display = "flex";
        return;
      }

      if (playback.type === "hls" && playback.url) {
        video.style.display = "block";
        placeholder.style.display = "none";
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playback.url;
        } else if (window.Hls && Hls.isSupported()) {
          state.hls = new Hls();
          state.hls.loadSource(playback.url);
          state.hls.attachMedia(video);
        }
        statusEl.textContent = "● Live";
        return;
      }

      if (playback.type === "webrtc" && playback.url?.includes("whep")) {
        playWhep(playback.url, video, placeholder, statusEl).catch((e) => {
          placeholder.textContent = `WHEP failed: ${e.message}`;
          placeholder.style.display = "flex";
        });
        return;
      }

      if (playback.url?.startsWith("http")) {
        video.style.display = "block";
        video.src = playback.url;
        placeholder.style.display = "none";
        statusEl.textContent = "● Live";
        return;
      }

      placeholder.textContent = playback.viewerNote || "No playable stream URL.";
      placeholder.style.display = "flex";
    }

    async function loadAllStreams() {
      const sn = $("camDevice").value;
      if (!sn) return alert("Select a device first");

      const shareUrl = $("fh2ShareUrl").value.trim();
      if (shareUrl) localStorage.setItem("shamalFh2ShareUrl", shareUrl);

      const dockParams = new URLSearchParams({ camera: "dock" });
      const droneParams = new URLSearchParams({ camera: "drone" });
      if (shareUrl) {
        dockParams.set("share_url", shareUrl);
        droneParams.set("share_url", shareUrl);
      }

      const telemSn =
        state.devices.find((d) => d.serialNumber === sn)?.role === "gateway"
          ? state.devices.find((d) => d.role === "drone")?.serialNumber || sn
          : sn;

      await destroyPlayer();

      const droneDev = state.devices.find((d) => d.role === "drone");
      const dockDev = state.devices.find((d) => d.role === "gateway");
      $("dockMeta").textContent = dockDev?.online ? "online" : "offline";
      $("droneMeta").textContent = droneDev?.online ? "online" : "offline";

      try {
        const [dockRes, droneRes, telem] = await Promise.all([
          api(`/v1/viewer/devices/${encodeURIComponent(sn)}/live-stream?${dockParams}`),
          api(`/v1/viewer/devices/${encodeURIComponent(sn)}/live-stream?${droneParams}`),
          api(`/v1/viewer/devices/${encodeURIComponent(telemSn)}/telemetry/latest`),
        ]);

        state.streamLoaded = true;
        mountPanelPlayer("dock", dockRes.data, $("dockPlayer"), $("dockPlaceholder"), $("dockStatus"));
        mountPanelPlayer("drone", droneRes.data, $("dronePlayer"), $("dronePlaceholder"), $("droneStatus"));

        $("streamInfo").textContent = JSON.stringify(
          { dock: dockRes.data, drone: droneRes.data, telemetry: telem.data, telemetryMeta: telem.meta },
          null,
          2,
        );
      } catch (e) {
        $("streamInfo").textContent = "Stream error: " + e.message;
      }
    }

    async function destroyZoomStreams() {
      await destroyVolcSlot("zoom_dock");
      await destroyVolcSlot("zoom_drone");
      for (const id of ["zoomDockPlayer", "zoomDronePlayer"]) {
        const video = $(id);
        if (!video) continue;
        video.pause();
        video.srcObject = null;
        video.removeAttribute("src");
        video.style.display = "none";
      }
      for (const id of ["zoomDockVolcHost", "zoomDroneVolcHost"]) {
        const host = $(id);
        if (!host) continue;
        host.innerHTML = "";
        host.style.display = "none";
      }
    }

    async function loadZoomStreams() {
      const dock = primaryDock();
      const sn = dock?.serialNumber || $("camDevice").value || state.devices[0]?.serialNumber;
      if (!sn) return;

      const dockParams = new URLSearchParams({ camera: "dock" });
      const droneParams = new URLSearchParams({ camera: "drone" });
      const telemSn = primaryDrone()?.serialNumber || sn;

      await destroyZoomStreams();

      const droneDev = primaryDrone();
      const dockDev = primaryDock();
      if ($("zoomDockMeta")) $("zoomDockMeta").textContent = dockDev?.online ? "online" : "offline";
      if ($("zoomDroneMeta")) $("zoomDroneMeta").textContent = droneDev?.online ? "online" : "offline";

      try {
        const [dockRes, droneRes] = await Promise.all([
          api(`/v1/viewer/devices/${encodeURIComponent(sn)}/live-stream?${dockParams}`),
          api(`/v1/viewer/devices/${encodeURIComponent(sn)}/live-stream?${droneParams}`),
        ]);
        state.apiSamples.cameraSample = { dock: dockRes.data, drone: droneRes.data };
        mountPanelPlayer(
          "dock",
          dockRes.data,
          $("zoomDockPlayer"),
          $("zoomDockPlaceholder"),
          $("zoomDockStatus"),
          "zoomDockVolcHost",
          "zoom_dock",
        );
        mountPanelPlayer(
          "drone",
          droneRes.data,
          $("zoomDronePlayer"),
          $("zoomDronePlaceholder"),
          $("zoomDroneStatus"),
          "zoomDroneVolcHost",
          "zoom_drone",
        );
      } catch (e) {
        if ($("zoomDockPlaceholder")) {
          $("zoomDockPlaceholder").textContent = "Stream error: " + e.message;
          $("zoomDockPlaceholder").style.display = "flex";
        }
      }
    }

    async function destroyDashStreams() {
      await destroyVolcSlot("dash_dock");
      await destroyVolcSlot("dash_drone");
      for (const id of ["dashDockPlayer", "dashDronePlayer"]) {
        const video = $(id);
        if (!video) continue;
        video.pause();
        video.srcObject = null;
        video.removeAttribute("src");
        video.style.display = "none";
      }
      for (const id of ["dashDockVolcHost", "dashDroneVolcHost"]) {
        const host = $(id);
        if (!host) continue;
        host.innerHTML = "";
        host.style.display = "none";
      }
    }

    async function loadDashStreams() {
      if (!isViewer() && state.activeTab !== "dashboard") return;
      const dock = primaryDock();
      const sn = dock?.serialNumber || state.devices[0]?.serialNumber;
      if (!sn) return;

      const wantDock = cardAllowed("liveCamera");
      const wantDrone = cardAllowed("droneFpv");
      if (!wantDock && !wantDrone) return;

      const dockParams = new URLSearchParams({ camera: "dock" });
      const droneParams = new URLSearchParams({ camera: "drone" });

      await destroyDashStreams();

      const droneDev = primaryDrone();
      const dockDev = primaryDock();
      if ($("dashDockMeta")) $("dashDockMeta").textContent = dockDev?.online ? "online" : "offline";
      if ($("dashDroneMeta")) $("dashDroneMeta").textContent = droneDev?.online ? "online" : "offline";

      try {
        const fetches = [];
        if (wantDock && $("dashDockPlayer")) {
          fetches.push(
            api(`/v1/viewer/devices/${encodeURIComponent(sn)}/live-stream?${dockParams}`).then(
              (r) => ({ slot: "dock", data: r.data }),
            ),
          );
        }
        if (wantDrone && $("dashDronePlayer")) {
          fetches.push(
            api(`/v1/viewer/devices/${encodeURIComponent(sn)}/live-stream?${droneParams}`).then(
              (r) => ({ slot: "drone", data: r.data }),
            ),
          );
        }
        const results = await Promise.all(fetches);
        const dockRes = results.find((r) => r.slot === "dock");
        const droneRes = results.find((r) => r.slot === "drone");
        state.apiSamples.cameraSample = {
          dock: dockRes?.data,
          drone: droneRes?.data,
        };

        if (wantDock && dockRes && $("dashDockPlayer")) {
          mountPanelPlayer(
            "dock",
            dockRes.data,
            $("dashDockPlayer"),
            $("dashDockPlaceholder"),
            $("dashDockStatus") || { textContent: "" },
            "dashDockVolcHost",
            "dash_dock",
          );
        }
        if (wantDrone && droneRes && $("dashDronePlayer")) {
          mountPanelPlayer(
            "drone",
            droneRes.data,
            $("dashDronePlayer"),
            $("dashDronePlaceholder"),
            $("dashDroneStatus") || { textContent: "" },
            "dashDroneVolcHost",
            "dash_drone",
          );
          if ($("dashDronePlaceholder") && !droneRes.data?.streamingSupported) {
            $("dashDronePlaceholder").textContent =
              droneRes.data?.playback?.viewerNote || "Drone FPV unavailable.";
            $("dashDronePlaceholder").style.display = "flex";
          }
        }
      } catch (e) {
        if (wantDock && $("dashDockPlaceholder")) {
          $("dashDockPlaceholder").textContent = "Stream error: " + e.message;
          $("dashDockPlaceholder").style.display = "flex";
        }
      }
    }

    function ensureFleetMap() {
      if (state.fleetMap || !window.L) return;
      state.fleetMap = L.map("fleetMap", { zoomControl: true });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Esri",
        maxZoom: 19,
      }).addTo(state.fleetMap);
      state.fleetMap.setView([22.3, 39.1], 6);
    }

    function updateFleetMap(positions) {
      ensureFleetMap();
      if (!state.fleetMap) return;
      const bounds = [];
      for (const p of positions) {
        if (p.latitude == null || p.longitude == null) continue;
        bounds.push([p.latitude, p.longitude]);
        const isDrone = p.role === "drone";
        const color = isDrone ? "#20c997" : "#4ea2ff";
        const stale = p.freshness !== "live";
        const label = `${p.callsign || p.serialNumber} (${p.role})`;
        const popup = `<strong>${label}</strong><br>Online: ${p.online}<br>Battery: ${p.batteryPercent ?? "—"}%<br>Alt: ${p.altitudeM ?? "—"} m<br>GPS: ${p.freshness}${stale ? " (cached)" : ""}`;
        let marker = state.fleetMarkers[p.serialNumber];
        if (!marker) {
          marker = L.circleMarker([p.latitude, p.longitude], {
            radius: isDrone ? 9 : 7,
            color,
            fillColor: color,
            fillOpacity: stale ? 0.45 : 0.85,
            weight: stale ? 2 : 3,
            dashArray: stale ? "4 4" : null,
          }).addTo(state.fleetMap);
          marker.bindPopup(popup);
          state.fleetMarkers[p.serialNumber] = marker;
        } else {
          marker.setLatLng([p.latitude, p.longitude]);
          marker.setStyle({ dashArray: stale ? "4 4" : null, fillOpacity: stale ? 0.45 : 0.85 });
          marker.setPopupContent(popup);
        }
      }
      if (bounds.length === 1) state.fleetMap.setView(bounds[0], 17);
      else if (bounds.length > 1) state.fleetMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }

    function ensureDashFleetMap(containerId = "dashFleetMap") {
      const mapKey = containerId === "zoomFleetMap" ? "zoomFleetMap" : "dashFleetMap";
      if (state[mapKey] || !window.L || !$(containerId)) return;
      state[mapKey] = L.map(containerId, { zoomControl: true });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Esri",
        maxZoom: 19,
      }).addTo(state[mapKey]);
      state[mapKey].setView([22.3, 39.1], 6);
    }

    function updateDashFleetMap(positions, containerId = "dashFleetMap") {
      const mapKey = containerId === "zoomFleetMap" ? "zoomFleetMap" : "dashFleetMap";
      const markersKey = containerId === "zoomFleetMap" ? "zoomFleetMarkers" : "dashFleetMarkers";
      ensureDashFleetMap(containerId);
      const map = state[mapKey];
      if (!map) return;
      const bounds = [];
      for (const p of positions) {
        if (p.latitude == null || p.longitude == null) continue;
        bounds.push([p.latitude, p.longitude]);
        const isDrone = p.role === "drone";
        const color = isDrone ? "#20c997" : "#4ea2ff";
        const stale = p.freshness !== "live";
        const label = `${p.callsign || p.serialNumber} (${p.role})`;
        const popup = `<strong>${label}</strong><br>Online: ${p.online}<br>Battery: ${p.batteryPercent ?? "—"}%<br>Alt: ${p.altitudeM ?? "—"} m`;
        let marker = state[markersKey][p.serialNumber];
        if (!marker) {
          marker = L.circleMarker([p.latitude, p.longitude], {
            radius: isDrone ? 8 : 6,
            color,
            fillColor: color,
            fillOpacity: stale ? 0.45 : 0.85,
            weight: stale ? 2 : 3,
            dashArray: stale ? "4 4" : null,
          }).addTo(map);
          marker.bindPopup(popup);
          state[markersKey][p.serialNumber] = marker;
        } else {
          marker.setLatLng([p.latitude, p.longitude]);
          marker.setStyle({ dashArray: stale ? "4 4" : null, fillOpacity: stale ? 0.45 : 0.85 });
          marker.setPopupContent(popup);
        }
      }
      if (bounds.length === 1) map.setView(bounds[0], containerId === "zoomFleetMap" ? 17 : 16);
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
    }

    function renderMetricList(el, rows) {
      el.innerHTML = rows
        .map(([k, v]) => `<div class="dash-metric"><span>${k}</span><strong>${v}</strong></div>`)
        .join("");
    }

    function renderViewerDashboardCards(sum, positions) {
      if (!isViewer() && state.activeTab !== "dashboard") return;

      if (cardAllowed("fleetOverview")) {
        $("dashKTotal").textContent = sum.data.totalDevices;
        $("dashKOnline").textContent = `${sum.data.online}/${sum.data.offline}`;
        ensureDashFleetMap();
        updateDashFleetMap(positions);
      }

      state.apiSamples.devicesSample = state.devices[0] || state.devices;
      state.apiSamples.onlineSample = {
        totalDevices: sum.data.totalDevices,
        drones: sum.data.drones,
        docks: sum.data.docks,
        online: sum.data.online,
        offline: sum.data.offline,
      };
      state.apiSamples.positions = positions;

      const dronePos = positions.find((p) => p.role === "drone");
      const dockPos = positions.find((p) => p.role === "gateway" || p.role === "dock");
      const droneDev = primaryDrone();
      const dockDev = primaryDock();

      if (cardAllowed("droneTelemetry") && $("dashDroneTelem")) {
        renderMetricList($("dashDroneTelem"), [
          ["Serial", droneDev?.serialNumber || "—"],
          ["Model", droneDev?.modelName || "—"],
          ["Online", droneDev?.online ? "yes" : "no"],
          ["Altitude", dronePos?.altitudeM != null ? `${dronePos.altitudeM} m` : "—"],
          ["GPS", dronePos?.freshness || "—"],
        ]);
      }

      if (cardAllowed("dockTelemetry") && $("dashDockTelem")) {
        renderMetricList($("dashDockTelem"), [
          ["Serial", dockDev?.serialNumber || "—"],
          ["Model", dockDev?.modelName || "—"],
          ["Online", dockDev?.online ? "yes" : "no"],
          ["Linked drone", state.apiSamples.dockTelemetry?.linkedDroneSerialNumber || "—"],
          ["GPS", dockPos?.freshness || "—"],
        ]);
      }

      if (cardAllowed("batteryStatus") && $("dashBattery")) {
        const battery = dronePos?.batteryPercent;
        $("dashBattery").innerHTML = battery != null
          ? `<div class="dash-kpi"><div class="small">Drone battery</div><div class="v">${battery}%</div></div>`
          : "<span class='small'>No battery data yet.</span>";
        state.apiSamples.batterySample = {
          serial: droneDev?.serialNumber,
          batteryPercent: battery,
          online: droneDev?.online,
        };
      }

      if (cardAllowed("gpsLocation") && $("dashGps")) {
        const gpsRows = positions
          .filter((p) => p.latitude != null && p.longitude != null)
          .map((p) => [
            p.serialNumber.slice(-6),
            `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)} (${p.freshness})`,
          ]);
        renderMetricList(
          $("dashGps"),
          gpsRows.length ? gpsRows : [["GPS", "No coordinates yet"]],
        );
        state.apiSamples.gpsSample = positions.find((p) => p.latitude != null) || positions[0];
      }

      if (cardAllowed("onlineOffline") && $("dashOnline")) {
        const onlineRows = state.devices.map((d) => [
          d.serialNumber.slice(-8),
          `<span class="pill ${d.online ? "ok" : "bad"}">${d.online ? "online" : "offline"}</span>`,
        ]);
        $("dashOnline").innerHTML = onlineRows
          .map(([k, v]) => `<div class="dash-metric"><span>${k}</span><span>${v}</span></div>`)
          .join("");
      }
    }

    function escapeHtml(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderMissionsDashboard(bundles, meta) {
      const el = $("dashMissions");
      if (!el) return;
      if (!bundles?.length) {
        el.innerHTML = "<span class='small'>No recent missions in FlightHub.</span>";
        return;
      }

      const blocks = bundles.map((bundle) => {
        const task = bundle.task || {};
        const title = task.folderLabel || task.name || task.id;
        const status = task.mediaUploadStatus || task.status || "—";
        let body = "";
        if (bundle.media?.length) {
          body =
            '<ul class="dash-media-list">' +
            bundle.media
              .map((m) => {
                const type = m.mediaType === "video" ? "video" : "photo";
                return `<li><span class="pill ok">${type}</span><span>${escapeHtml(m.name)}</span></li>`;
              })
              .join("") +
            "</ul>";
        } else {
          const folderHint = task.folderId
            ? `FlightHub folder #${task.folderId}`
            : "FlightHub media library";
          body = `<p class="dash-media-note">${folderHint} — ${bundle.mediaError?.includes("219021") ? "enable <strong>Task Management</strong> on the Organization Key to load photo names via API." : "no files returned yet."}</p>`;
        }
        return `<div class="dash-mission-block"><div class="dash-mission-head"><strong>${escapeHtml(title)}</strong><span class="small">${escapeHtml(status)}</span></div>${body}</div>`;
      });

      if (meta?.mediaApiBlocked) {
        blocks.push(
          `<p class="dash-media-note">Media file names exist in FlightHub but the OpenAPI media endpoint returned 219021. Regenerate the Organization Key with Task Management permission.</p>`,
        );
      }

      el.innerHTML = blocks.join("");
    }

    async function loadMissionMediaSummary() {
      const res = await api("/v1/viewer/media/recent?task_limit=4&media_per_task=6");
      state.apiSamples.missionsSample = res.data?.[0] || res.data;
      renderMissionsDashboard(res.data || [], res.meta || {});
    }

    async function refreshViewerExtras(opts = {}) {
      if (!isViewer() && state.activeTab !== "dashboard") return;

      const drone = primaryDrone();
      const dock = primaryDock();
      const fetches = [];

      if (cardAllowed("droneTelemetry") && drone) {
        fetches.push(
          api(`/v1/viewer/devices/${drone.serialNumber}/telemetry/latest`).then((r) => {
            state.apiSamples.droneTelemetry = r.data;
            if ($("dashDroneTelem") && r.data) {
              const t = r.data.telemetry || r.data;
              renderMetricList($("dashDroneTelem"), [
                ["Serial", r.data.serialNumber || drone.serialNumber],
                ["Model", r.data.modelName || drone.modelName || "—"],
                ["Battery", t.batteryPercent != null ? `${t.batteryPercent}%` : "—"],
                ["Altitude", t.altitudeM != null ? `${t.altitudeM} m` : "—"],
                ["GPS sats", t.gpsSatellites ?? "—"],
                ["Freshness", r.meta?.freshness || "—"],
              ]);
            }
          }),
        );
      }

      if (cardAllowed("dockTelemetry") && dock) {
        fetches.push(
          api(`/v1/viewer/docks/${dock.serialNumber}`).then((r) => {
            state.apiSamples.dockTelemetry = r.data;
            if ($("dashDockTelem") && r.data) {
              renderMetricList($("dashDockTelem"), [
                ["Serial", dock.serialNumber],
                ["Model", dock.modelName || "—"],
                ["Online", dock.online ? "yes" : "no"],
                ["Linked drone", r.data.linkedDroneSerialNumber || "—"],
                ["Mode", r.data.stateSummary?.modeCode ?? "—"],
              ]);
            }
          }),
        );
      }

      if (cardAllowed("missionMediaHistory")) {
        fetches.push(
          loadMissionMediaSummary().catch(() => {
            if ($("dashMissions")) $("dashMissions").textContent = "Could not load mission media.";
          }),
        );
      }

      await Promise.all(fetches);
      if (!opts.skipStreams && (cardAllowed("liveCamera") || cardAllowed("droneFpv"))) {
        await loadDashStreams();
      }
    }

    function updateTelemetryBanner(positions) {
      const banner = $("fleetTelemetryBanner");
      const liveCount = positions.filter((p) => p.freshness === "live").length;
      const cachedCount = positions.filter((p) => p.freshness === "cached").length;
      if (liveCount > 0) {
        banner.style.display = "block";
        banner.className = "telemetry-banner ok";
        banner.textContent = `Live GPS telemetry from FlightHub for ${liveCount} device(s).`;
        return;
      }
      if (cachedCount > 0) {
        banner.style.display = "block";
        banner.className = "telemetry-banner warn";
        banner.textContent =
          "FlightHub device-state API returned 403 — showing last cached GPS. Enable Device Management on the Organization Key in FlightHub Sync for live coordinates.";
        return;
      }
      banner.style.display = "block";
      banner.className = "telemetry-banner warn";
      banner.textContent =
        "No GPS coordinates yet. Device shows online but FlightHub OpenAPI denied device state (403). Enable Device Management + Livestream permissions on your Organization Key.";
    }

    function fillDeviceSelectors() {
      const drone = state.devices.find((d) => d.role === "drone");
      const defaultSn = drone?.serialNumber ?? state.devices[0]?.serialNumber;

      for (const id of ["camDevice", "opsDevice"]) {
        const sel = $(id);
        const prev = sel.value;
        sel.innerHTML = "";
        state.devices.forEach((d) => {
          const o = document.createElement("option");
          o.value = d.serialNumber;
          o.textContent = `${d.serialNumber} (${d.role})`;
          sel.appendChild(o);
        });
        const pick = prev && [...sel.options].some((o) => o.value === prev) ? prev : defaultSn;
        if (pick) sel.value = pick;
      }
    }

    $("camDevice").onchange = () => {
      if (state.activeTab === "camera" && state.session) loadAllStreams();
    };

    async function loadFleet(opts = {}) {
      const [sum, devices, positionsRes] = await Promise.all([
        api("/v1/viewer/fleet/summary"),
        api("/v1/viewer/devices"),
        api("/v1/viewer/fleet/positions"),
      ]);
      state.devices = devices.data || [];
      const positions = positionsRes.data || [];
      fillDeviceSelectors();
      $("kTotal").textContent = sum.data.totalDevices;
      $("kDrones").textContent = sum.data.drones;
      $("kDocks").textContent = sum.data.docks;
      $("kStatus").textContent = `${sum.data.online}/${sum.data.offline}`;
      const now = new Date();
      $("fleetStatus").textContent = opts.silent
        ? `Source: ${sum.meta.source} • auto-updated ${now.toLocaleTimeString()}`
        : `Source: ${sum.meta.source} • refreshed ${now.toLocaleTimeString()}`;

      updateTelemetryBanner(positions);
      updateFleetMap(positions);

      const posBySn = Object.fromEntries(positions.map((p) => [p.serialNumber, p]));
      const tbody = document.querySelector("#fleetTable tbody");
      tbody.innerHTML = "";
      state.devices.forEach((d) => {
        const p = posBySn[d.serialNumber] || {};
        const lat = p.latitude;
        const lng = p.longitude;
        const loc =
          lat != null && lng != null
            ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}${p.freshness === "cached" ? " *" : ""}`
            : "—";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d.serialNumber}</td>
          <td>${d.role}</td>
          <td>${d.modelName || "-"}</td>
          <td><span class="pill ${d.online ? "ok" : "bad"}">${String(d.online)}</span></td>
          <td>${loc}</td>
          <td>${p.batteryPercent ?? "-"}</td>
          <td>${p.altitudeM ?? "-"}</td>
          <td><span class="pill ${p.freshness === "live" ? "ok" : p.freshness === "cached" ? "warn" : "bad"}">${p.freshness || "—"}</span></td>`;
        tbody.appendChild(tr);
      });

      renderViewerDashboardCards(sum, positions);
      if (isViewer()) {
        await refreshViewerExtras({ silent: opts.silent, skipStreams: true });
      }
    }

    $("loadStream").onclick = () => loadAllStreams();

    $("snapshotBtn").onclick = async () => {
      const sn = $("camDevice").value;
      const telem = await api(`/v1/viewer/devices/${sn}/telemetry/latest`);
      $("streamInfo").textContent =
        `Snapshot at ${new Date().toISOString()}\n` + JSON.stringify(telem.data, null, 2);
    };

    function openConfirmModal(opDef) {
      state.pendingOp = opDef;
      const risk = opDef.risk || "medium";
      $("confirmTitle").innerHTML = `Authorize: ${opDef.label}<span class="risk-badge risk-${risk}">${risk}</span>`;
      $("confirmBody").textContent =
        `Device: ${$("opsDevice").value}\nAction: ${opDef.label}\nCategory: ${opDef.category}\nFH2: ${opDef.fh2Capability || "—"}\n\n${opDef.description || ""}`;
      if (risk === "critical") {
        $("confirmBody").textContent += "\n\n⚠ CRITICAL: This action may immediately affect aircraft or mission safety.";
      }
      $("confirmText").value = "";
      $("confirmCheck").checked = false;
      $("confirmStep1").style.display = "block";
      $("confirmStep2").style.display = "none";
      $("confirmModal").classList.add("open");
    }

    function closeConfirmModal() {
      $("confirmModal").classList.remove("open");
      state.pendingOp = null;
    }

    $("confirmCancel").onclick = closeConfirmModal;
    $("confirmBack").onclick = () => {
      $("confirmStep2").style.display = "none";
      $("confirmStep1").style.display = "block";
    };
    $("confirmNext").onclick = () => {
      $("confirmStep1").style.display = "none";
      $("confirmStep2").style.display = "block";
    };

    $("confirmExecute").onclick = async () => {
      if (!$("confirmCheck").checked) {
        alert("Check the authorization box to continue.");
        return;
      }
      if ($("confirmText").value.trim() !== "CONFIRM") {
        alert('Type CONFIRM exactly to authorize this operation.');
        return;
      }
      const pending = state.pendingOp;
      if (!pending) return;
      closeConfirmModal();
      try {
        const body = {
          deviceSn: $("opsDevice").value,
          safetyConfirm: true,
          missionId: $("missionId").value || undefined,
          note: `CC double-confirm by ${state.session.displayName}`,
        };
        const res = await api(`/v1/platform/ops/${pending.path}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        $("opsResult").textContent = JSON.stringify(res.data, null, 2);
        await loadOpsLog();
        await loadEvents();
        await loadOpsReadiness();
      } catch (e) {
        $("opsResult").textContent = "Error: " + e.message;
      }
    };

    async function loadOpsCatalog() {
      const res = await api("/v1/platform/ops/catalog");
      state.opsCatalog = res.data;
      renderOpsCategoryTabs();
      renderOpsActions();
    }

    function renderOpsCategoryTabs() {
      const tabs = $("opsCategoryTabs");
      tabs.innerHTML = "";
      if (!state.opsCatalog?.categories) return;
      for (const cat of state.opsCatalog.categories) {
        const b = document.createElement("button");
        b.textContent = cat.label;
        b.title = cat.hint;
        if (cat.id === state.opsCategory) b.classList.add("active");
        b.onclick = () => {
          state.opsCategory = cat.id;
          renderOpsCategoryTabs();
          renderOpsActions();
        };
        tabs.appendChild(b);
      }
    }

    function renderOpsActions() {
      const grid = $("opsActionGrid");
      grid.innerHTML = "";
      if (!state.opsCatalog?.operations) return;
      const ops = state.opsCatalog.operations.filter((o) => o.category === state.opsCategory);
      for (const op of ops) {
        const btn = document.createElement("button");
        btn.className = `op-btn${op.risk === "critical" ? " critical-op" : ""}`;
        btn.disabled = !canOperate();
        btn.innerHTML = `<span class="risk risk-${op.risk}">${op.risk}</span><span class="op-title">${op.label}</span><span class="op-desc">${op.description}</span>`;
        btn.onclick = () => {
          if (!canOperate()) {
            alert("Operations are not available for your account. Sign in with an operator or admin account.");
            return;
          }
          if (op.requiresMissionId && !$("missionId").value.trim()) {
            alert("Enter a mission / task UUID in the sidebar before starting a mission.");
            return;
          }
          openConfirmModal(op);
        };
        grid.appendChild(btn);
      }
    }

    function updateOpsHud(data, meta) {
      const t = data?.telemetry;
      $("opsHudBattery").textContent = t?.batteryPercent != null ? `${t.batteryPercent}%` : "—";
      $("opsHudAlt").textContent = t?.altitudeM != null ? `${t.altitudeM} m` : "—";
      $("opsHudSpeed").textContent = t?.horizontalSpeedMs != null ? `${t.horizontalSpeedMs} m/s` : "—";
      $("opsHudGps").textContent = t?.gpsSatellites != null ? String(t.gpsSatellites) : "—";
      $("opsHudMode").textContent = data?.modeCode ?? "—";
      $("opsHudRtk").textContent = t?.rtkFixed === true ? "Fixed" : t?.rtkFixed === false ? "No" : "—";
      const metaEl = $("opsMetaNote");
      if (meta?.note) {
        metaEl.textContent = meta.note;
        metaEl.style.display = "block";
      } else {
        metaEl.textContent = "";
        metaEl.style.display = "none";
      }
      if (meta?.freshness === "cached") {
        metaEl.textContent = (metaEl.textContent ? metaEl.textContent + " " : "") + "(Telemetry cached — enable Device Management on org key for live GPS.)";
        metaEl.style.display = "block";
      }
      const dot = $("opsReadyDot");
      dot.className = "readiness-dot";
      if (data?.online === false) {
        dot.classList.add("offline");
        $("opsReadyText").textContent = "Offline in FlightHub";
      } else if (data?.commandReady) {
        dot.classList.add("ready");
        $("opsReadyText").textContent = `Command ready • ${data.role || "device"} • mode ${data.modeCode}`;
      } else {
        $("opsReadyText").textContent = `Not command-ready • mode ${data?.modeCode ?? "unknown"}`;
      }
    }

    async function loadOpsReadiness() {
      const sn = $("opsDevice").value;
      if (!sn || !state.session) return;
      try {
        const res = await api(`/v1/platform/ops/readiness/${encodeURIComponent(sn)}`);
        updateOpsHud(res.data, res.meta);
      } catch (e) {
        $("opsReadyText").textContent = "Readiness check failed: " + e.message;
      }
    }

    $("opsDevice").onchange = loadOpsReadiness;
    $("opsRefreshReady").onclick = loadOpsReadiness;

    async function loadOpsLog() {
      const res = await api("/v1/platform/ops/log?limit=20");
      const tbody = document.querySelector("#opsTable tbody");
      tbody.innerHTML = "";
      for (const r of res.data) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.id.slice(0, 8)}...</td><td>${r.action}</td><td><span class="risk risk-${r.risk || "medium"}">${r.risk || "—"}</span></td><td><span class="pill ${r.status === "blocked" ? "warn" : "ok"}">${r.status}</span></td><td>${(r.reason || "-").slice(0, 80)}</td><td>${new Date(r.createdAt).toLocaleTimeString()}</td>`;
        tbody.appendChild(tr);
      }
    }

    function renderDashAlerts(events) {
      const tbody = document.querySelector("#dashAlertsTable tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      for (const e of (events || []).slice(0, 8)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${e.type}</td><td>${e.source}</td><td>${new Date(e.receivedAt).toLocaleString()}</td>`;
        tbody.appendChild(tr);
      }
      if (!events?.length) {
        tbody.innerHTML = "<tr><td colspan='3' class='small'>No recent events</td></tr>";
      }
    }

    async function loadEvents() {
      const needDashAlerts =
        (isViewer() && cardAllowed("alertsEvents")) ||
        state.activeTab === "dashboard" ||
        state.activeTab === "alerts";
      if (isViewer() && !cardAllowed("alertsEvents") && state.activeTab !== "alerts") {
        return;
      }
      const res = await api("/v1/viewer/events?limit=25");
      state.apiSamples.alertsSample = (res.data || []).slice(0, 2);
      if (!isViewer() || state.activeTab === "alerts") {
        renderEventsTable(res.data || []);
      }
      if (needDashAlerts) {
        renderDashAlerts(res.data || []);
      }
    }

    function renderEventsTable(events) {
      const tbody = document.querySelector("#eventsTable tbody");
      tbody.innerHTML = "";
      for (const e of events) {
        const ackCell = e.acknowledged
          ? "Yes"
          : canOperate()
            ? `<button data-ack="${e.id}">Ack</button>`
            : "—";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${e.type}</td><td>${e.source}</td><td><small>${JSON.stringify(e.payload).slice(0, 120)}</small></td><td>${new Date(e.receivedAt).toLocaleString()}</td><td>${ackCell}</td>`;
        tbody.appendChild(tr);
      }
      document.querySelectorAll("[data-ack]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Acknowledge this event?")) return;
          await api(`/v1/viewer/events/${b.dataset.ack}/ack`, { method: "POST" });
          await loadEvents();
        };
      });
    }
    $("refreshEvents").onclick = loadEvents;

    async function loadTasks() {
      const res = await api("/v1/viewer/tasks");
      state.tasks = res.data || [];
      $("taskInfo").textContent = JSON.stringify(res, null, 2);
      const sel = $("taskSelect");
      sel.innerHTML = "";
      for (const t of state.tasks) {
        const o = document.createElement("option");
        o.value = t.id;
        o.textContent = `${t.id} • ${t.name || t.status || "task"}`;
        sel.appendChild(o);
      }
    }
    $("loadTasks").onclick = loadTasks;

    $("loadMedia").onclick = async () => {
      const id = $("taskSelect").value;
      if (!id) return alert("Load tasks first");
      const res = await api(`/v1/viewer/tasks/${id}/media`);
      $("mediaInfo").textContent = JSON.stringify(res, null, 2);
    };
    $("loadTrack").onclick = async () => {
      const id = $("taskSelect").value;
      if (!id) return alert("Load tasks first");
      const headers = {
        "X-Api-Key": state.session.apiKey,
        "X-CC-Session": state.session.sessionToken,
      };
      const [geo, kml] = await Promise.all([
        fetch(`/v1/viewer/tasks/${id}/trajectory.geojson`, { headers }).then((r) => r.text()),
        fetch(`/v1/viewer/tasks/${id}/trajectory.kml`, { headers }).then((r) => r.text()),
      ]);
      $("trackInfo").textContent = `GeoJSON:\n${geo.slice(0, 1200)}\n\nKML:\n${kml.slice(0, 1200)}`;
    };

    async function loadFh2Links() {
      try {
        const res = await api("/v1/viewer/capabilities");
        const url = res.data?.fh2CockpitUrl;
        if (url) {
          $("openFh2Cockpit").href = url;
          $("openFh2Cockpit").style.display = "inline-block";
        }
      } catch (_) {}
    }

    async function refreshDashboard() {
      if (isViewer()) {
        await syncSessionFromServer();
        if (!selectedProjectCode()) {
          renderViewerProjectPicker();
          return;
        }
      }
      await loadFleet();
      if (isViewer()) {
        applyViewerDashboardPermissions();
        await refreshViewerExtras();
        if (cardAllowed("alertsEvents")) {
          await loadEvents();
        }
        updateLiveBadge(true, new Date());
        return;
      }
      if (state.session) {
        try {
          await Promise.all([loadOpsCatalog(), loadFh2Links()]);
        } catch (e) {
          console.warn("ops catalog", e);
        }
      }
      await loadOpsLog();
      await loadEvents();
      if (state.activeTab === "ops") {
        await loadOpsReadiness();
      }
      if (state.activeTab === "admin" && isAdmin()) {
        await loadAdminViewerSettings();
      }
      updateLiveBadge(true, new Date());
    }

    $("refreshAll").onclick = async () => {
      try {
        await refreshDashboard();
      } catch (e) {
        alert("Refresh failed: " + e.message);
      }
    };

    $("adminViewerSelect").onchange = () => {
      loadAdminViewerSettingsFor($("adminViewerSelect").value).catch((e) => {
        setAdminSettingsStatus(e.message, "err");
      });
    };
    $("adminSaveViewerSettings").onclick = () => {
      saveAdminViewerSettings().catch((e) => {
        setAdminSettingsStatus(e.message, "err");
      });
    };
    $("adminCreateViewer").onclick = () => {
      createAdminViewer().catch((e) => setAdminViewerStatus(e.message, "err"));
    };
    $("adminViewerListBody").onclick = (e) => {
      const btn = e.target.closest("[data-delete-account]");
      if (!btn) return;
      deleteAdminViewer(btn.dataset.deleteAccount).catch((err) => setAdminViewerStatus(err.message, "err"));
    };
    $("adminSyncProjects").onclick = () => {
      syncAdminProjects().catch((e) => setAdminProjectStatus(e.message, "err"));
    };
    $("adminAssignViewerBtn").onclick = () => {
      assignViewerToProject(false).catch((e) => setAdminAssignmentStatus(e.message, "err"));
    };
    $("adminRemoveViewerBtn").onclick = () => {
      assignViewerToProject(true).catch((e) => setAdminAssignmentStatus(e.message, "err"));
    };
    $("adminProjectListBody").onclick = (e) => {
      const syncBtn = e.target.closest("[data-project-sync]");
      if (syncBtn) {
        syncAdminProjects().catch((err) => setAdminProjectStatus(err.message, "err"));
        return;
      }
      const deactivateBtn = e.target.closest("[data-project-deactivate]");
      if (deactivateBtn) {
        deactivateAdminProject(deactivateBtn.dataset.projectDeactivate).catch((err) =>
          setAdminProjectStatus(err.message, "err"),
        );
        return;
      }
    };
    $("viewerProjectPicker").onchange = () => {
      if (!state.session) return;
      state.session.selectedProjectCode = $("viewerProjectPicker").value;
      saveSession(state.session);
      refreshDashboard().catch((e) => alert(e.message));
    };
    $("adminIntegrationEnabled").onchange = () => {
      saveAdminIntegrationEnabled().catch((e) => setAdminIntegrationStatusMsg(e.message, "err"));
    };
    $("adminIntegrationGenerate").onclick = () => {
      adminIntegrationAction("generate").catch((e) => setAdminIntegrationStatusMsg(e.message, "err"));
    };
    $("adminIntegrationRegenerate").onclick = () => {
      adminIntegrationAction("regenerate").catch((e) => setAdminIntegrationStatusMsg(e.message, "err"));
    };
    $("adminIntegrationRevoke").onclick = () => {
      adminIntegrationAction("revoke").catch((e) => setAdminIntegrationStatusMsg(e.message, "err"));
    };
    $("adminIntegrationCopyKey").onclick = () => {
      if (state.adminIntegrationPlainKey) copyText(state.adminIntegrationPlainKey);
    };
    $("restApiKeysNewBtn").onclick = () => openRestApiKeyCreateModal();
    $("serviceAccountsNewBtn").onclick = () => openServiceAccountCreateModal();
    $("serviceAccountModalCancel").onclick = () => closeServiceAccountModal();
    $("serviceAccountModalConfirm").onclick = () => submitServiceAccountModal();
    $("serviceAccountModalCopyBtn").onclick = () => {
      copyText($("serviceAccountModalClientSecret").textContent);
    };
    $("serviceAccountModal").onclick = (e) => {
      if (e.target === $("serviceAccountModal")) closeServiceAccountModal();
    };
    $("adminRestApiKeysNewBtn").onclick = () => openAdminRestApiKeyCreateModal();
    $("apiKeyModalCancel").onclick = () => closeApiKeyModal();
    $("apiKeyModalConfirm").onclick = () => submitApiKeyModal();
    $("apiKeyModalCopyBtn").onclick = () => {
      const text = $("apiKeyModalPlain").textContent;
      if (text) copyText(text);
    };
    $("apiKeyModal").onclick = (e) => {
      if (e.target === $("apiKeyModal")) closeApiKeyModal();
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("apiKeyModal").classList.contains("open")) closeApiKeyModal();
    });


    window.shamalLegacy = {
      activateTab,
      activateSettingsTab,
      state,
      updateRoleUi,
      isViewer,
      isAdmin,
      canOperate,
      loadAdminViewerSettings: () => loadAdminViewerSettings().catch((e) => alert(e.message)),
      refreshDashboard: () => refreshDashboard().catch((e) => alert(e.message)),
      logout: () => {
        const btn = $("logoutBtn");
        if (btn) btn.click();
        else {
          clearSession();
          updateRoleUi();
        }
      },
    };
    window.dispatchEvent(new CustomEvent("shamal-legacy-ready"));

    loadSession();
    if (typeof updateLoginPortalUi === "function") updateLoginPortalUi();
    const savedShare = localStorage.getItem("shamalFh2ShareUrl");
    if (savedShare) $("fh2ShareUrl").value = savedShare;
    redirectToReturnToIfReady().then((redirected) => {
      if (redirected) return;
      if (SHAMAL_REACT_SHELL) { updateRoleUi(); }
      else if (!enforcePortalSession()) {
        updateRoleUi();
      }
      if (state.session) {
        const initialTab = resolveInitialTab();
        if (initialTab !== state.activeTab) activateTab(initialTab);
        else if (initialTab === "admin" && isAdmin()) {
          loadAdminViewerSettings().catch((e) => alert(e.message));
        }
        activateSettingsTab(state.activeSettingsTab || "service-accounts");
        startLiveUpdates();
        if (isViewer()) {
          syncSessionFromServer()
            .then(async () => {
              if (state.activeTab === "settings" && canManageWorkspaceApi()) {
                await loadSettingsPage();
              }
              await refreshDashboard();
            })
            .catch((e) => alert(e.message));
        } else {
          refreshDashboard().catch((e) => alert(e.message));
        }
      }
    });
  