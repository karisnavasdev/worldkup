(function () {
  const login = document.getElementById("login");
  const app = document.getElementById("app");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const statsEl = document.getElementById("stats");
  const walletsBody = document.getElementById("wallets-body");
  const eventsBody = document.getElementById("events-body");
  const dialog = document.getElementById("detail-dialog");
  const detailContent = document.getElementById("detail-content");

  let cache = { wallets: [], events: [] };

  function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  }

  function shortAddr(addr) {
    if (!addr || addr.length < 12) return addr || "—";
    return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
  }

  function showLogin() {
    login.classList.remove("hidden");
    app.classList.add("hidden");
  }

  function showApp() {
    login.classList.add("hidden");
    app.classList.remove("hidden");
    loginError.classList.add("hidden");
  }

  function renderStats(stats) {
    const items = [
      ["Total Events", stats.totalEvents],
      ["Unique Wallets", stats.uniqueWallets],
      ["Unique IPs", stats.uniqueIps],
      ["Connects", stats.connects],
      ["Disconnects", stats.disconnects],
    ];

    statsEl.innerHTML = items
      .map(
        ([label, value]) =>
          `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`
      )
      .join("");
  }

  function renderWallets(wallets) {
    if (!wallets.length) {
      walletsBody.innerHTML = `<tr><td colspan="8" class="empty">No wallet connections yet.</td></tr>`;
      return;
    }

    walletsBody.innerHTML = wallets
      .map(
        (w, i) => `
      <tr>
        <td class="mono-cell">${w.address}</td>
        <td>${w.walletType}</td>
        <td>${w.connectCount}</td>
        <td>${w.disconnectCount}</td>
        <td>${w.ips.length}</td>
        <td>${fmtTime(w.firstSeen)}</td>
        <td>${fmtTime(w.lastSeen)}</td>
        <td><button type="button" class="link-btn" data-wallet-idx="${i}">Details</button></td>
      </tr>`
      )
      .join("");

    walletsBody.querySelectorAll("[data-wallet-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openWalletDetail(cache.wallets[Number(btn.dataset.walletIdx)]);
      });
    });
  }

  function renderEvents(events) {
    if (!events.length) {
      eventsBody.innerHTML = `<tr><td colspan="6" class="empty">No history recorded yet.</td></tr>`;
      return;
    }

    eventsBody.innerHTML = events
      .slice(0, 200)
      .map(
        (e) => `
      <tr>
        <td>${fmtTime(e.timestamp)}</td>
        <td class="action-${e.action}">${e.action}</td>
        <td class="mono-cell">${shortAddr(e.address)}</td>
        <td class="mono-cell">${e.ip || "—"}</td>
        <td class="mono-cell">${shortAddr(e.sessionId)}</td>
        <td class="mono-cell">${e.userAgent || "—"}</td>
      </tr>`
      )
      .join("");
  }

  function openWalletDetail(wallet) {
    const walletEvents = cache.events.filter((e) => e.address === wallet.address);

    detailContent.innerHTML = `
      <div class="detail-row"><label>Full Address</label><p>${wallet.address}</p></div>
      <div class="detail-row"><label>Wallet Type</label><p>${wallet.walletType}</p></div>
      <div class="detail-row"><label>Connect / Disconnect / Account Changes</label><p>${wallet.connectCount} / ${wallet.disconnectCount} / ${wallet.accountChanges}</p></div>
      <div class="detail-row"><label>First Seen</label><p>${fmtTime(wallet.firstSeen)}</p></div>
      <div class="detail-row"><label>Last Seen</label><p>${fmtTime(wallet.lastSeen)}</p></div>
      <div class="detail-row"><label>IP Addresses</label><ul class="detail-list">${wallet.ips.map((ip) => `<li>${ip}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div class="detail-row"><label>Sessions</label><ul class="detail-list">${wallet.sessions.map((s) => `<li>${s}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div class="detail-row"><label>User Agents</label><ul class="detail-list">${wallet.userAgents.map((ua) => `<li>${ua}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div class="detail-row"><label>Recent Events (${Math.min(walletEvents.length, 10)})</label><ul class="detail-list">${walletEvents
        .slice(0, 10)
        .map((e) => `<li>${fmtTime(e.timestamp)} · ${e.action} · ${e.ip || "no ip"}</li>`)
        .join("") || "<li>—</li>"}</ul></div>
    `;

    dialog.showModal();
  }

  async function loadData() {
    const res = await fetch("/api/admin/wallets", { credentials: "include" });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showLogin();
      return;
    }

    showApp();
    cache = { wallets: data.wallets, events: data.events };
    renderStats(data.stats);
    renderWallets(data.wallets);
    renderEvents(data.events);
  }

  async function checkSession() {
    const res = await fetch("/api/admin/check", { credentials: "include" });
    const data = await res.json();
    if (data.allowed) {
      await loadData();
    } else {
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");

    const password = document.getElementById("password").value;
    const res = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      loginError.textContent = "Incorrect password.";
      loginError.classList.remove("hidden");
      return;
    }

    document.getElementById("password").value = "";
    await loadData();
  });

  document.getElementById("refresh-btn").addEventListener("click", loadData);
  document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    showLogin();
  });

  checkSession();
})();
