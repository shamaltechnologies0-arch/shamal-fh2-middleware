(() => {
  const AUTH_LABEL = {
    none: "Public",
    apiKey: "X-Api-Key",
    bearer: "Bearer token",
    session: "Session",
    oauth: "OAuth 2.0",
  };

  const LANGS = [
    { id: "curl", label: "cURL" },
    { id: "js", label: "JavaScript" },
    { id: "ts", label: "TypeScript" },
    { id: "py", label: "Python" },
  ];

  const state = {
    spec: null,
    catalog: { groups: [], operations: [] },
    query: "",
    selectedKey: "",
    lang: localStorage.getItem("shamalDocsLang") || "curl",
    density: localStorage.getItem("shamalDocsDensity") || "guide",
    theme: localStorage.getItem("shamalDocsTheme") || "dark",
    auth: {
      apiKey: sessionStorage.getItem("shamalDocsApiKey") || "",
      bearer: sessionStorage.getItem("shamalDocsBearer") || "",
    },
    pathValues: {},
    queryValues: {},
    bodyText: "",
    sending: false,
    response: null,
  };

  const els = {
    html: document.documentElement,
    body: document.body,
    search: document.getElementById("docs-search"),
    nav: document.getElementById("endpoint-nav"),
    main: document.getElementById("main"),
    replay: document.getElementById("replay"),
    themeToggle: document.querySelector("[data-theme-toggle]"),
    navToggle: document.querySelector("[data-nav-toggle]"),
    navClose: document.querySelector("[data-nav-close]"),
  };

  function operationKey(method, path) {
    return `${method.toUpperCase()} ${path}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pathParams(path) {
    return [...String(path).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  }

  function currentOp() {
    return state.catalog.operations.find(
      (op) => operationKey(op.method, op.path) === state.selectedKey,
    );
  }

  function findSpecOp(method, path) {
    const item = state.spec?.paths?.[path];
    if (!item) return null;
    return item[method.toLowerCase()] || null;
  }

  function groupById(id) {
    return state.catalog.groups.find((group) => group.id === id);
  }

  function matchesQuery(op) {
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      op.method,
      op.path,
      op.summary,
      op.description || "",
      groupById(op.group)?.label || "",
      AUTH_LABEL[op.auth] || op.auth,
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((token) => haystack.includes(token));
  }

  function applyTheme() {
    els.html.setAttribute("data-theme", state.theme);
    localStorage.setItem("shamalDocsTheme", state.theme);
    if (els.themeToggle) {
      els.themeToggle.setAttribute(
        "aria-label",
        state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      );
    }
  }

  function applyDensity() {
    els.body.dataset.density = state.density;
    localStorage.setItem("shamalDocsDensity", state.density);
    document.querySelectorAll("[data-density]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.density === state.density);
    });
  }

  function hydrateAuthFromSession() {
    try {
      const raw = localStorage.getItem("shamalCcSession");
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!state.auth.apiKey && session.apiKey) state.auth.apiKey = session.apiKey;
    } catch {
      /* ignore malformed session */
    }
  }

  function persistAuth() {
    sessionStorage.setItem("shamalDocsApiKey", state.auth.apiKey);
    sessionStorage.setItem("shamalDocsBearer", state.auth.bearer);
  }

  function origin() {
    return window.location.origin;
  }

  function filledPath(path) {
    return path.replace(/\{([^}]+)\}/g, (_, name) => {
      const value = state.pathValues[name];
      return encodeURIComponent(value && value.trim() ? value.trim() : `{${name}}`);
    });
  }

  function withQuery(path) {
    const specOp = currentOp() ? findSpecOp(currentOp().method, currentOp().path) : null;
    const querySchema = specOp?.parameters?.filter((p) => p.in === "query") || [];
    const qs = new URLSearchParams();
    for (const param of querySchema) {
      const value = state.queryValues[param.name];
      if (value) qs.set(param.name, value);
    }
    const extra = qs.toString();
    return extra ? `${path}?${extra}` : path;
  }

  function defaultBody(op) {
    if (op.method === "GET" || op.method === "DELETE") return "";
    if (op.path === "/v1/auth/token") {
      return "grant_type=client_credentials&client_id=&client_secret=";
    }
    if (op.path === "/v1/auth/login") {
      return JSON.stringify({ username: "", password: "" }, null, 2);
    }
    if (op.path === "/v1/api-keys") {
      return JSON.stringify({ label: "Integration key" }, null, 2);
    }
    if (op.path === "/v1/service-accounts") {
      return JSON.stringify({ name: "CAFM connector", scopes: ["read"] }, null, 2);
    }
    return "{}";
  }

  function authHeaders(op) {
    const headers = { Accept: "application/json" };
    if (op.auth === "apiKey" && state.auth.apiKey) headers["X-Api-Key"] = state.auth.apiKey;
    if (op.auth === "session" && state.auth.apiKey) headers["X-Api-Key"] = state.auth.apiKey;
    if (op.auth === "bearer" && state.auth.bearer) {
      headers.Authorization = `Bearer ${state.auth.bearer}`;
    }
    return headers;
  }

  function sampleHeaders(op) {
    if (op.auth === "apiKey") return { "X-Api-Key": state.auth.apiKey || "YOUR_API_KEY" };
    if (op.auth === "session") return { "X-Api-Key": state.auth.apiKey || "YOUR_API_KEY" };
    if (op.auth === "bearer") {
      return { Authorization: `Bearer ${state.auth.bearer || "shm_live_…"}` };
    }
    return {};
  }

  function sampleUrl(op) {
    return `${origin()}${withQuery(filledPath(op.path))}`;
  }

  function headerLines(headers, prefix, quote) {
    return Object.entries(headers)
      .map(([key, value]) => `${prefix}${key}: ${quote}${value}${quote}`)
      .join("\n");
  }

  function generateSample(op) {
    const url = sampleUrl(op);
    const headers = sampleHeaders(op);
    const body = state.bodyText;
    if (state.lang === "curl") {
      const headerFlags = Object.entries(headers)
        .map(([key, value]) => `  -H '${key}: ${value}'`)
        .join(" \\\n");
      const bodyFlag =
        op.method !== "GET" && op.method !== "DELETE" && body
          ? ` \\\n  -d '${body.replace(/'/g, "'\\''")}'`
          : "";
      return `curl -sS -X ${op.method} '${url}'${headerFlags ? ` \\\n${headerFlags}` : ""}${bodyFlag}`;
    }
    if (state.lang === "py") {
      const headerObj = JSON.stringify(headers, null, 2);
      const bodyArg =
        op.method !== "GET" && body
          ? op.path === "/v1/auth/token"
            ? `, data="""${body}"""`
            : `, json=${body || "{}"}`
          : "";
      return `import requests\n\nresponse = requests.request(\n    "${op.method}",\n    "${url}",\n    headers=${headerObj}${bodyArg}\n)\nprint(response.status_code)\nprint(response.text)`;
    }
    const headerObj = JSON.stringify(headers, null, 2);
    const init = [
      `method: "${op.method}"`,
      `headers: ${headerObj}`,
    ];
    if (op.method !== "GET" && op.method !== "DELETE" && body) {
      init.push(`body: ${op.path === "/v1/auth/token" ? JSON.stringify(body) : body}`);
    }
    const snippet = `const response = await fetch("${url}", {\n  ${init.join(",\n  ")}\n});\nconst payload = await response.json();\nconsole.log(response.status, payload);`;
    if (state.lang === "ts") {
      return `const apiKey = process.env.SHAMAL_API_KEY ?? "${state.auth.apiKey || "YOUR_API_KEY"}";\n\n${snippet}`;
    }
    return snippet;
  }

  function closeNav() {
    document.body.classList.remove("nav-open");
    if (els.navClose) els.navClose.hidden = true;
  }

  function openNav() {
    document.body.classList.add("nav-open");
    if (els.navClose) els.navClose.hidden = false;
  }

  function selectOp(op, pushHash = true) {
    state.selectedKey = operationKey(op.method, op.path);
    state.response = null;
    state.pathValues = Object.fromEntries(pathParams(op.path).map((name) => [name, state.pathValues[name] || ""]));
    state.bodyText = defaultBody(op);
    if (pushHash) {
      history.replaceState(null, "", `#${op.method}-${op.path}`);
    }
    closeNav();
    render();
  }

  function syncFromHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!hash) {
      state.selectedKey = "";
      render();
      return;
    }
    const match = state.catalog.operations.find(
      (op) => `${op.method}-${op.path}` === hash || operationKey(op.method, op.path) === hash,
    );
    if (match) selectOp(match, false);
    else {
      state.selectedKey = "";
      render();
    }
  }

  function renderNav() {
    const groups = state.catalog.groups
      .map((group) => ({
        ...group,
        operations: state.catalog.operations.filter(
          (op) => op.group === group.id && matchesQuery(op),
        ),
      }))
      .filter((group) => group.operations.length > 0);

    if (!groups.length) {
      els.nav.innerHTML = `<p class="empty-note">No endpoints match that search.</p>`;
      return;
    }

    els.nav.innerHTML = groups
      .map(
        (group) => `
        <section class="nav-group">
          <h2>${escapeHtml(group.label)}</h2>
          ${group.operations
            .map((op) => {
              const key = operationKey(op.method, op.path);
              const active = key === state.selectedKey ? " is-active" : "";
              return `<button class="nav-item${active}" type="button" data-op="${escapeHtml(key)}" aria-current="${key === state.selectedKey ? "true" : "false"}">
                <span class="method ${op.method.toLowerCase()}">${op.method}</span>
                <span>
                  <span class="path">${escapeHtml(op.path)}</span>
                  <span class="summary">${escapeHtml(op.summary)}</span>
                </span>
              </button>`;
            })
            .join("")}
        </section>`,
      )
      .join("");
  }

  function specParameters(op) {
    const specOp = findSpecOp(op.method, op.path);
    const listed = specOp?.parameters || [];
    const fromPath = pathParams(op.path).map((name) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    const merged = [...fromPath];
    for (const param of listed) {
      if (!merged.some((item) => item.name === param.name && item.in === param.in)) {
        merged.push(param);
      }
    }
    return merged;
  }

  function renderGuide() {
    return `
      <section class="hero">
        <h1>Shamal Platform API</h1>
        <p>External documentation for client developers. These routes match what Command Center already shows: overview, live map, live view, telemetry, events, media, and API credentials.</p>
        <div class="chips">
          <span class="chip">OAS 3.1 · v2.3.0</span>
          <span class="chip">Server · / Same origin</span>
          <span class="chip">No vendor credentials required</span>
        </div>
      </section>
      <div class="card-grid guide-copy">
        <article class="card">
          <h3>REST API key</h3>
          <p>Send <code>X-Api-Key</code> on resource routes such as devices, docks, fleet, tasks, and events. Create keys in Command Center → API &amp; Integrations.</p>
        </article>
        <article class="card">
          <h3>Service accounts</h3>
          <p>Use <code>POST /v1/auth/token</code> with client credentials, then call the API with <code>Authorization: Bearer</code>.</p>
        </article>
        <article class="card">
          <h3>Overview data</h3>
          <p>Command Center overview widgets use <code>/v1/platform/integration/*</code> with a Bearer integration access key.</p>
        </article>
      </div>
      <article class="card guide-copy">
        <h3>First successful call</h3>
        <ol>
          <li>Confirm the service with <code>GET /health</code>.</li>
          <li>List devices with <code>GET /v1/devices</code> and copy a <code>serialNumber</code>.</li>
          <li>Load live map pins with <code>GET /v1/fleet/positions</code> or telemetry with <code>/v1/devices/{sn}/telemetry/latest</code>.</li>
        </ol>
      </article>
    `;
  }

  function renderEndpoint(op) {
    const params = specParameters(op);
    const specOp = findSpecOp(op.method, op.path);
    const description = op.description || specOp?.description || "";
    const rows = params
      .map(
        (param) => `<tr>
          <td><span class="param-name">${escapeHtml(param.name)}</span></td>
          <td>${escapeHtml(param.in || "path")}</td>
          <td>${escapeHtml(param.schema?.type || "string")}</td>
          <td>${escapeHtml(param.description || (param.required ? "Required" : "Optional"))}</td>
        </tr>`,
      )
      .join("");

    return `
      <div class="endpoint-head">
        <span class="method ${op.method.toLowerCase()}">${op.method}</span>
        <span class="endpoint-path">${escapeHtml(op.path)}</span>
        <span class="auth-pill">${escapeHtml(AUTH_LABEL[op.auth] || op.auth)}</span>
      </div>
      <p>${escapeHtml(op.summary)}</p>
      ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
      <h2 class="section-title">Request parameters</h2>
      ${
        rows
          ? `<table class="param-table">
              <thead><tr><th>Param</th><th>In</th><th>Type</th><th>Description</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : `<p class="empty-note">No path or query parameters. Send headers only.</p>`
      }
    `;
  }

  function renderMain() {
    const op = currentOp();
    els.main.innerHTML = op ? renderEndpoint(op) : renderGuide();
  }

  function renderReplay() {
    const op =
      currentOp() ||
      state.catalog.operations.find((item) => item.path === "/health") ||
      state.catalog.operations[0];
    if (!op) {
      els.replay.innerHTML = "";
      return;
    }
    const params = pathParams(op.path);
    const specQuery = (findSpecOp(op.method, op.path)?.parameters || []).filter((p) => p.in === "query");
    const status = state.response
      ? `<div class="response-status ${state.response.ok ? "ok" : "err"}">${escapeHtml(state.response.label)}</div>`
      : "";
    const responseBody = state.response
      ? `<pre class="code-block">${escapeHtml(state.response.body)}</pre>`
      : `<p class="empty-note">Run a request to inspect a live response from this origin.</p>`;

    els.replay.innerHTML = `
      <div class="replay-card">
        <div class="lang-tabs">
          ${LANGS.map(
            (lang) =>
              `<button type="button" data-lang="${lang.id}" class="${state.lang === lang.id ? "is-active" : ""}">${lang.label}</button>`,
          ).join("")}
        </div>
        <pre class="code-block">${escapeHtml(generateSample(op))}</pre>
        <div class="actions">
          <button class="ghost-btn" type="button" data-copy>Copy</button>
        </div>
        <h2 class="section-title">Authorize</h2>
        <div class="field">
          <label for="auth-key">REST API key</label>
          <input id="auth-key" type="password" autocomplete="off" value="${escapeHtml(state.auth.apiKey)}" placeholder="X-Api-Key" />
        </div>
        <div class="field">
          <label for="auth-bearer">Integration access key</label>
          <input id="auth-bearer" type="password" autocomplete="off" value="${escapeHtml(state.auth.bearer)}" placeholder="shm_live_…" />
        </div>
        ${params
          .map(
            (name) => `<div class="field">
              <label for="path-${escapeHtml(name)}">${escapeHtml(name)}</label>
              <input id="path-${escapeHtml(name)}" data-path-param="${escapeHtml(name)}" value="${escapeHtml(state.pathValues[name] || "")}" placeholder="${escapeHtml(name)}" />
            </div>`,
          )
          .join("")}
        ${specQuery
          .map(
            (param) => `<div class="field">
              <label for="query-${escapeHtml(param.name)}">${escapeHtml(param.name)}</label>
              <input id="query-${escapeHtml(param.name)}" data-query-param="${escapeHtml(param.name)}" value="${escapeHtml(state.queryValues[param.name] || "")}" placeholder="${escapeHtml(param.description || param.name)}" />
            </div>`,
          )
          .join("")}
        ${
          op.method !== "GET" && op.method !== "DELETE"
            ? `<div class="field">
                <label for="req-body">Request body</label>
                <textarea id="req-body">${escapeHtml(state.bodyText)}</textarea>
              </div>`
            : ""
        }
        <div class="actions">
          <button class="primary-btn" type="button" data-run ${state.sending ? "disabled" : ""}>${state.sending ? "Sending…" : "Run request"}</button>
        </div>
        ${status}
        ${responseBody}
      </div>
    `;
  }

  function render() {
    renderNav();
    renderMain();
    renderReplay();
  }

  async function runRequest() {
    const op = currentOp();
    if (!op || state.sending) return;
    persistAuth();
    const url = withQuery(filledPath(op.path));
    if (url.includes("%7B") || url.includes("{")) {
      state.response = { ok: false, label: "Missing path parameter", body: "Fill required path fields before running." };
      renderReplay();
      return;
    }
    state.sending = true;
    renderReplay();
    try {
      const headers = authHeaders(op);
      const init = { method: op.method, headers, credentials: "include" };
      if (op.method !== "GET" && op.method !== "DELETE" && state.bodyText) {
        if (op.path === "/v1/auth/token") {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
          init.body = state.bodyText;
        } else {
          headers["Content-Type"] = "application/json";
          init.body = state.bodyText;
        }
      }
      if (op.path.endsWith("/telemetry/stream")) {
        state.response = {
          ok: true,
          label: "SSE endpoint",
          body: "This is a Server-Sent Events stream. Subscribe with EventSource instead of a one-shot JSON request.",
        };
      } else {
        const res = await fetch(url, init);
        const text = await res.text();
        let pretty = text;
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* keep raw */
        }
        state.response = {
          ok: res.ok,
          label: `Response ${res.status} ${res.statusText}`.trim(),
          body: pretty || "(empty)",
        };
      }
    } catch (err) {
      state.response = {
        ok: false,
        label: "Request failed",
        body: err instanceof Error ? err.message : String(err),
      };
    } finally {
      state.sending = false;
      renderReplay();
    }
  }

  async function init() {
    applyTheme();
    applyDensity();
    hydrateAuthFromSession();
    const res = await fetch("/docs/json", { headers: { Accept: "application/json" } });
    if (!res.ok) {
      els.main.innerHTML = `<p class="empty-note">Unable to load API catalog (${res.status}).</p>`;
      return;
    }
    state.spec = await res.json();
    state.catalog = state.spec["x-docsCatalog"] || { groups: [], operations: [] };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
  }

  els.search?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderNav();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
      event.preventDefault();
      els.search?.focus();
    }
    if (event.key === "Escape") closeNav();
  });

  els.themeToggle?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
  });

  document.querySelectorAll("[data-density]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.density = btn.dataset.density;
      applyDensity();
      render();
    });
  });

  els.navToggle?.addEventListener("click", openNav);
  els.navClose?.addEventListener("click", closeNav);

  els.nav?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-op]");
    if (!btn) return;
    const op = state.catalog.operations.find((item) => operationKey(item.method, item.path) === btn.dataset.op);
    if (op) selectOp(op);
  });

  els.replay?.addEventListener("click", async (event) => {
    const langBtn = event.target.closest("[data-lang]");
    if (langBtn) {
      state.lang = langBtn.dataset.lang;
      localStorage.setItem("shamalDocsLang", state.lang);
      renderReplay();
      return;
    }
    if (event.target.closest("[data-copy]")) {
      const op = currentOp() || state.catalog.operations[0];
      if (op) await navigator.clipboard.writeText(generateSample(op));
      return;
    }
    if (event.target.closest("[data-run]")) {
      await runRequest();
    }
  });

  els.replay?.addEventListener("input", (event) => {
    const target = event.target;
    if (target.id === "auth-key") state.auth.apiKey = target.value;
    if (target.id === "auth-bearer") state.auth.bearer = target.value;
    if (target.id === "req-body") state.bodyText = target.value;
    if (target.dataset.pathParam) state.pathValues[target.dataset.pathParam] = target.value;
    if (target.dataset.queryParam) state.queryValues[target.dataset.queryParam] = target.value;
    persistAuth();
  });

  init();
})();
