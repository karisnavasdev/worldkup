import { VersionedTransaction } from "https://esm.sh/@solana/web3.js@1.98.0";

const TOKEN_MINT = "4yBfVtYnWnrJRQhzjS3ZWzMPntCu77dDv6GY3iW4pump";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_DECIMALS = 6;
const SLIPPAGE_BPS = 300;
const PUMP_URL = `https://pump.fun/coin/${TOKEN_MINT}`;
const RPC_URL = "https://api.mainnet-beta.solana.com";
const JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP = "https://lite-api.jup.ag/swap/v1/swap";

let panel = null;
let quoteTimer = null;
let state = {
  address: null,
  solBalance: 0,
  tokenBalance: 0,
  amount: "",
  quote: null,
  loading: false,
};

function getWalletAddress() {
  if (window.WorldKupWallet?.getAddress) return window.WorldKupWallet.getAddress();
  try {
    const saved = JSON.parse(localStorage.getItem("worldkup_wallet") || "null");
    return saved?.address || null;
  } catch {
    return null;
  }
}

function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatSol(lamports) {
  return (lamports / 1e9).toFixed(4);
}

function formatToken(amount) {
  return (amount / 10 ** TOKEN_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "RPC error");
  return data.result;
}

async function fetchBalances(address) {
  const [solResult, tokenResult] = await Promise.all([
    rpc("getBalance", [address]),
    rpc("getTokenAccountsByOwner", [
      address,
      { mint: TOKEN_MINT },
      { encoding: "jsonParsed" },
    ]),
  ]);

  state.solBalance = solResult?.value || 0;
  const accounts = tokenResult?.value || [];
  state.tokenBalance = accounts.reduce((sum, acc) => {
    const amount = Number(acc.account?.data?.parsed?.info?.tokenAmount?.amount || 0);
    return sum + amount;
  }, 0);
}

async function fetchQuote() {
  const solAmount = parseFloat(state.amount);
  if (!solAmount || solAmount <= 0) {
    state.quote = null;
    return;
  }

  const lamports = Math.floor(solAmount * 1e9);
  if (lamports <= 0) {
    state.quote = null;
    return;
  }

  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: TOKEN_MINT,
    amount: String(lamports),
    slippageBps: String(SLIPPAGE_BPS),
  });

  const res = await fetch(`${JUPITER_QUOTE}?${params}`);
  if (!res.ok) throw new Error("Could not fetch swap quote");
  state.quote = await res.json();
}

function setStatus(message, type) {
  if (!panel?.statusEl) return;
  panel.statusEl.textContent = message;
  panel.statusEl.className = `wk-buy-status show ${type || "info"}`;
}

function clearStatus() {
  if (!panel?.statusEl) return;
  panel.statusEl.className = "wk-buy-status";
  panel.statusEl.textContent = "";
}

function scheduleQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(async () => {
    try {
      await fetchQuote();
      render();
    } catch {
      state.quote = null;
      render();
    }
  }, 400);
}

function render() {
  if (!panel) return;

  const connected = Boolean(state.address);

  if (!connected) {
    panel.connectView.hidden = false;
    panel.swapView.hidden = true;
    return;
  }

  panel.connectView.hidden = true;
  panel.swapView.hidden = false;
  panel.walletAddr.textContent = shortAddress(state.address);
  panel.solBalance.textContent = `${formatSol(state.solBalance)} SOL`;
  panel.tokenBalance.textContent = `${formatToken(state.tokenBalance)} $WORLDKUP`;

  if (state.quote?.outAmount) {
    panel.estimateValue.textContent = `~${formatToken(Number(state.quote.outAmount))} $WORLDKUP`;
    const impact = state.quote.priceImpactPct ? Number(state.quote.priceImpactPct) : 0;
    panel.estimateMeta.textContent = `Price impact: ${impact.toFixed(2)}% · Slippage: ${SLIPPAGE_BPS / 100}%`;
  } else {
    panel.estimateValue.textContent = "Enter SOL amount";
    panel.estimateMeta.textContent = "Quote updates automatically";
  }

  const amount = parseFloat(state.amount);
  const canBuy = !state.loading && amount > 0 && state.quote && state.address;
  panel.submitBtn.disabled = !canBuy;
  panel.submitBtn.classList.toggle("loading", state.loading);
  panel.submitBtn.textContent = state.loading ? "SWAPPING..." : "BUY $WORLDKUP";
}

async function refreshWallet() {
  state.address = getWalletAddress();
  if (!state.address) {
    state.solBalance = 0;
    state.tokenBalance = 0;
    state.quote = null;
    render();
    return;
  }

  try {
    await fetchBalances(state.address);
    if (state.amount) await fetchQuote();
  } catch (err) {
    setStatus(err.message || "Failed to load balances", "error");
  }
  render();
}

function getPhantomProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

async function executeSwap() {
  if (!state.address || !state.quote) return;

  const provider = getPhantomProvider();
  if (!provider) {
    setStatus("Phantom wallet not found", "error");
    return;
  }

  state.loading = true;
  render();
  setStatus("Building swap transaction...", "info");

  try {
    const swapRes = await fetch(JUPITER_SWAP, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: state.quote,
        userPublicKey: state.address,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });

    if (!swapRes.ok) throw new Error("Swap build failed");
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) throw new Error("No transaction returned");

    setStatus("Approve the swap in Phantom...", "info");

    const txBuf = Uint8Array.from(atob(swapData.swapTransaction), (c) => c.charCodeAt(0));
    const transaction = VersionedTransaction.deserialize(txBuf);
    const result = await provider.signAndSendTransaction(transaction);
    const signature = result?.signature || result;

    setStatus("Swap sent! Confirming...", "info");

    await new Promise((resolve) => setTimeout(resolve, 3000));
    await fetchBalances(state.address);

    const sigStr =
      typeof signature === "string"
        ? signature
        : signature?.toString?.() || "confirmed";

    setStatus(
      `Success! Bought $WORLDKUP. Tx: ${sigStr.slice(0, 8)}...`,
      "success"
    );
    state.amount = "";
    panel.amountInput.value = "";
    state.quote = null;
  } catch (err) {
    if (err?.code === 4001) {
      setStatus("Swap cancelled in wallet", "error");
    } else {
      setStatus(err?.message || "Swap failed", "error");
    }
  } finally {
    state.loading = false;
    render();
  }
}

function buildPanel() {
  const el = document.createElement("div");
  el.className = "wk-buy-panel";
  el.id = "wk-buy-panel";
  el.innerHTML = `
    <div class="wk-buy-header">
      <span class="wk-buy-badge">✦ Instant Swap ✦</span>
      <h3 class="wk-buy-title">BUY $WORLDKUP</h3>
      <p class="wk-buy-subtitle">Swap SOL directly on-site after connecting Phantom</p>
    </div>
    <div class="wk-buy-connect-prompt" data-connect-view>
      <p>Connect your Phantom wallet to swap SOL for $WORLDKUP without leaving the site.</p>
      <button type="button" class="wk-buy-connect-btn" data-connect-btn>👛 Connect Wallet</button>
    </div>
    <div data-swap-view hidden>
      <div class="wk-buy-wallet-row">
        <span class="wk-buy-wallet-label">Connected</span>
        <span class="wk-buy-wallet-addr" data-wallet-addr></span>
      </div>
      <div class="wk-buy-balances">
        <div class="wk-buy-balance">
          <span class="wk-buy-balance-label">SOL Balance</span>
          <span class="wk-buy-balance-value" data-sol-balance>0 SOL</span>
        </div>
        <div class="wk-buy-balance">
          <span class="wk-buy-balance-label">Your $WORLDKUP</span>
          <span class="wk-buy-balance-value token" data-token-balance>0 $WORLDKUP</span>
        </div>
      </div>
      <div class="wk-buy-field">
        <label class="wk-buy-field-label">You pay</label>
        <div class="wk-buy-input-wrap">
          <input type="number" class="wk-buy-input" data-amount-input placeholder="0.0" min="0" step="any" inputmode="decimal" />
          <span class="wk-buy-input-suffix">SOL</span>
        </div>
        <div class="wk-buy-quick-amounts">
          <button type="button" class="wk-buy-quick-btn" data-quick="0.1">0.1 SOL</button>
          <button type="button" class="wk-buy-quick-btn" data-quick="0.5">0.5 SOL</button>
          <button type="button" class="wk-buy-quick-btn" data-quick="1">1 SOL</button>
          <button type="button" class="wk-buy-quick-btn" data-quick="max">MAX</button>
        </div>
      </div>
      <div class="wk-buy-estimate">
        <div class="wk-buy-estimate-row">
          <span class="wk-buy-estimate-label">You receive</span>
          <span class="wk-buy-estimate-value" data-estimate-value>Enter SOL amount</span>
        </div>
        <div class="wk-buy-estimate-meta" data-estimate-meta>Quote updates automatically</div>
      </div>
      <button type="button" class="wk-buy-submit" data-submit-btn disabled>BUY $WORLDKUP</button>
      <div class="wk-buy-footer">
        <a href="${PUMP_URL}" target="_blank" rel="noopener noreferrer">Or buy on pump.fun →</a>
      </div>
    </div>
    <div class="wk-buy-status" data-status></div>
  `;

  panel = {
    root: el,
    connectView: el.querySelector("[data-connect-view]"),
    swapView: el.querySelector("[data-swap-view]"),
    connectBtn: el.querySelector("[data-connect-btn]"),
    walletAddr: el.querySelector("[data-wallet-addr]"),
    solBalance: el.querySelector("[data-sol-balance]"),
    tokenBalance: el.querySelector("[data-token-balance]"),
    amountInput: el.querySelector("[data-amount-input]"),
    estimateValue: el.querySelector("[data-estimate-value]"),
    estimateMeta: el.querySelector("[data-estimate-meta]"),
    submitBtn: el.querySelector("[data-submit-btn]"),
    statusEl: el.querySelector("[data-status]"),
  };

  panel.connectBtn.addEventListener("click", async () => {
    if (window.WorldKupWallet?.connect) {
      await window.WorldKupWallet.connect();
    } else {
      const provider = getPhantomProvider();
      if (!provider) {
        setStatus("Install Phantom wallet first", "error");
        window.open("https://phantom.app/", "_blank");
        return;
      }
      await provider.connect();
    }
    await refreshWallet();
  });

  panel.amountInput.addEventListener("input", (e) => {
    state.amount = e.target.value;
    scheduleQuote();
    render();
  });

  el.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const quick = btn.dataset.quick;
      let value = quick;
      if (quick === "max") {
        const reserve = 0.01;
        const maxSol = Math.max(0, state.solBalance / 1e9 - reserve);
        value = maxSol > 0 ? maxSol.toFixed(4) : "0";
      }
      state.amount = value;
      panel.amountInput.value = value;
      scheduleQuote();
      render();
    });
  });

  panel.submitBtn.addEventListener("click", executeSwap);

  return el;
}

function injectPanel() {
  const buySection = document.getElementById("buy");
  if (!buySection || buySection.querySelector("#wk-buy-panel")) return false;

  const panelEl = buildPanel();
  const container = buySection.querySelector(".max-w-7xl");
  if (container) {
    const heading = container.querySelector(".text-center.max-w-2xl");
    if (heading) {
      heading.insertAdjacentElement("afterend", panelEl);
    } else {
      container.prepend(panelEl);
    }
  } else {
    buySection.prepend(panelEl);
  }
  return true;
}

function init() {
  const tryInit = () => {
    if (!injectPanel()) return false;
    refreshWallet();
    return true;
  };

  window.addEventListener("worldkup-wallet-change", () => {
    clearStatus();
    refreshWallet();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "worldkup_wallet") refreshWallet();
  });

  if (tryInit()) return;

  const observer = new MutationObserver(() => {
    if (tryInit()) observer.disconnect();
  });
  observer.observe(document.getElementById("root"), {
    childList: true,
    subtree: true,
  });

  setTimeout(tryInit, 2000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
