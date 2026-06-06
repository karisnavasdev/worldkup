function buildWalletSummary(events) {
  const wallets = {};

  for (const event of events) {
    if (!event.address) continue;
    const key = event.address;
    if (!wallets[key]) {
      wallets[key] = {
        address: key,
        walletType: event.walletType || "phantom",
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        connectCount: 0,
        disconnectCount: 0,
        accountChanges: 0,
        ips: new Set(),
        userAgents: new Set(),
        sessions: new Set(),
      };
    }

    const w = wallets[key];
    w.lastSeen = event.timestamp;
    w.walletType = event.walletType || w.walletType;
    if (event.ip) w.ips.add(event.ip);
    if (event.userAgent) w.userAgents.add(event.userAgent);
    if (event.sessionId) w.sessions.add(event.sessionId);

    if (event.action === "connect") w.connectCount += 1;
    if (event.action === "disconnect") w.disconnectCount += 1;
    if (event.action === "account_change") w.accountChanges += 1;
  }

  return Object.values(wallets)
    .map((w) => ({
      ...w,
      ips: [...w.ips],
      userAgents: [...w.userAgents],
      sessions: [...w.sessions],
    }))
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

function buildStats(events) {
  const wallets = buildWalletSummary(events);
  return {
    totalEvents: events.length,
    uniqueWallets: wallets.length,
    uniqueIps: new Set(events.map((e) => e.ip).filter(Boolean)).size,
    connects: events.filter((e) => e.action === "connect").length,
    disconnects: events.filter((e) => e.action === "disconnect").length,
  };
}

module.exports = { buildWalletSummary, buildStats };
