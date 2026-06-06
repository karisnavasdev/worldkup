(function () {
  const STORAGE_KEY = "worldkup_wallet";
  const SESSION_KEY = "worldkup_session_id";

  let state = loadState();
  let ui = null;

  function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.type === "phantom" && saved?.address) return saved;
      return { type: null, address: null };
    } catch {
      return { type: null, address: null };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function shortAddress(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }

  function getPhantomProvider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solana?.isPhantom) return window.solana;
    return null;
  }

  async function logWalletEvent(action, extra) {
    try {
      await fetch("/api/wallet/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          address: state.address || extra?.address || "",
          previousAddress: extra?.previousAddress || "",
          walletType: "phantom",
          sessionId: getSessionId(),
          pageUrl: window.location.href,
          referrer: document.referrer,
        }),
      });
    } catch {
      /* server may be offline in static-only mode */
    }
  }

  function toast(message, isError) {
    if (!ui?.toastEl) return;
    ui.toastEl.textContent = message;
    ui.toastEl.classList.toggle("error", Boolean(isError));
    ui.toastEl.classList.add("show");
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => ui.toastEl.classList.remove("show"), 3500);
  }

  function updateButton() {
    if (!ui?.btn) return;
    if (state.address) {
      ui.btn.textContent = shortAddress(state.address);
      ui.btn.classList.add("connected");
      ui.btn.title = `Phantom: ${state.address}\nClick to disconnect`;
    } else {
      ui.btn.innerHTML = '<span aria-hidden="true">👛</span> Connect';
      ui.btn.classList.remove("connected");
      ui.btn.title = "Connect Phantom wallet";
    }
  }

  async function connectPhantom() {
    const provider = getPhantomProvider();
    if (!provider) {
      toast("Phantom not found. Install the browser extension.", true);
      window.open("https://phantom.app/", "_blank");
      return;
    }

    try {
      const resp = await provider.connect();
      state = {
        type: "phantom",
        address: resp.publicKey.toString(),
      };
      saveState();
      updateButton();
      await logWalletEvent("connect");
      toast("Phantom connected");
    } catch (err) {
      if (err?.code !== 4001) toast(err?.message || "Phantom connection failed", true);
    }
  }

  async function disconnect() {
    const previousAddress = state.address;
    const provider = getPhantomProvider();
    try {
      await provider?.disconnect?.();
    } catch {
      /* ignore */
    }

    state = { type: null, address: null };
    saveState();
    updateButton();
    await logWalletEvent("disconnect", { address: previousAddress, previousAddress });
    toast("Wallet disconnected");
  }

  async function handleButtonClick() {
    if (state.address) {
      await disconnect();
      return;
    }
    await connectPhantom();
  }

  async function tryAutoReconnect() {
    if (state.type !== "phantom" || !state.address) return;

    const provider = getPhantomProvider();
    if (!provider) return;

    try {
      if (provider.isConnected && provider.publicKey) {
        state.address = provider.publicKey.toString();
        saveState();
        return;
      }
      const resp = await provider.connect({ onlyIfTrusted: true });
      state.address = resp.publicKey.toString();
      saveState();
      await logWalletEvent("connect");
    } catch {
      state = { type: null, address: null };
      saveState();
    }
  }

  function bindProviderEvents() {
    const phantom = getPhantomProvider();
    phantom?.on?.("accountChanged", async (key) => {
      const previousAddress = state.address;
      if (!key) {
        state = { type: null, address: null };
        await logWalletEvent("disconnect", { address: previousAddress, previousAddress });
      } else {
        state = { type: "phantom", address: key.toString() };
        await logWalletEvent("account_change", {
          address: key.toString(),
          previousAddress,
        });
      }
      saveState();
      updateButton();
    });

    phantom?.on?.("disconnect", async () => {
      const previousAddress = state.address;
      state = { type: null, address: null };
      saveState();
      updateButton();
      await logWalletEvent("disconnect", { address: previousAddress, previousAddress });
    });
  }

  function buildUI() {
    const slot = document.createElement("div");
    slot.className = "wk-wallet-slot";
    slot.innerHTML = `
      <button type="button" class="wk-wallet-btn" aria-label="Connect Phantom wallet">
        <span aria-hidden="true">👛</span> Connect
      </button>
    `;

    const toastEl = document.createElement("div");
    toastEl.className = "wk-wallet-toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);

    ui = {
      slot,
      btn: slot.querySelector(".wk-wallet-btn"),
      toastEl,
      toastTimer: null,
    };

    ui.btn.addEventListener("click", handleButtonClick);
    return slot;
  }

  function injectAdminLink() {
    const nav = document.querySelector("header nav");
    if (!nav || nav.querySelector(".wk-admin-link")) return false;

    const link = document.createElement("a");
    link.href = "/admin";
    link.className = "wk-admin-link hover:text-yellow-400 transition-colors uppercase";
    link.textContent = "Admin";
    nav.appendChild(link);
    return true;
  }

  function injectIntoHeader(slot) {
    const headerRow = document.querySelector("header > div.max-w-7xl");
    if (!headerRow || headerRow.querySelector(".wk-wallet-btn")) return false;

    headerRow.appendChild(slot);
    return true;
  }

  function tryInjectAll(slot) {
    const walletOk = injectIntoHeader(slot);
    const adminOk = injectAdminLink();
    return walletOk || adminOk;
  }

  function init() {
    const slot = buildUI();
    bindProviderEvents();

    const finishInject = () => {
      updateButton();
      tryAutoReconnect().then(updateButton);
    };

    if (tryInjectAll(slot)) {
      finishInject();
      return;
    }

    const observer = new MutationObserver(() => {
      if (tryInjectAll(slot)) {
        observer.disconnect();
        finishInject();
      }
    });
    observer.observe(document.getElementById("root"), {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      tryInjectAll(slot);
      finishInject();
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
