/**
 * Activity Transformer Utility
 * Transforms raw Polymarket activities API response into normalized trade objects
 * and groups them by event for display in the trade history section.
 */

/**
 * Transform raw API response into normalized trade objects
 * @param {Object} apiResponse - Raw response from /api/activities
 * @returns {Array} Array of normalized trade objects
 */
export function transformActivities(apiResponse) {
  const activities = apiResponse?.data?.activities || [];

  return activities
    .filter(activity => activity.type === 'ACTIVITY_TYPE_TRADE' && activity.trade)
    .map(activity => {
      const trade = activity.trade;
      const aggressor = trade.aggressor || {};
      const metadata = aggressor.marketMetadata || {};
      const team = metadata.team || {};

      // Parse side from ORDER_SIDE_BUY/ORDER_SIDE_SELL
      const rawSide = aggressor.side || '';
      const side = rawSide.replace('ORDER_SIDE_', '');

      // Parse intent from ORDER_INTENT_BUY_LONG, etc.
      const rawIntent = aggressor.intent || '';
      const intent = rawIntent.replace('ORDER_INTENT_', '');

      // Parse price - use avgPx if available, otherwise use trade price
      const priceValue = aggressor.avgPx?.value || trade.price?.value || '0';
      const price = parseFloat(priceValue) || 0;

      // Parse shares/quantity
      const shares = parseFloat(trade.qty || '0') || 0;

      // Parse timestamp
      const createTime = trade.createTime || '';
      const timestamp = createTime ? new Date(createTime).getTime() : Date.now();

      // Parse optional P&L fields (only present on closing trades)
      // Use != null check instead of truthy to handle numeric 0 values correctly
      const realizedPnl = trade.realizedPnl?.value != null
        ? parseFloat(trade.realizedPnl.value)
        : null;
      const costBasis = trade.costBasis?.value != null
        ? parseFloat(trade.costBasis.value)
        : null;
      const originalPrice = trade.originalPrice?.value != null
        ? parseFloat(trade.originalPrice.value)
        : null;

      return {
        id: trade.id,
        marketSlug: trade.marketSlug || metadata.slug || '',
        title: metadata.title || '',
        team: metadata.outcome || team.name || '',
        league: (team.league || '').toUpperCase(),
        teamColor: team.colorPrimary || null,
        side,
        intent,
        price,
        shares,
        timestamp,
        timeISO: createTime,
        realizedPnl,
        costBasis,
        originalPrice,
      };
    })
    .filter(trade => trade.marketSlug && trade.shares > 0);
}

/**
 * Group trades by event (marketSlug) and calculate aggregate stats
 * @param {Array} trades - Array of normalized trade objects
 * @returns {Object} Object keyed by marketSlug with aggregated event data
 */
export function groupTradesByEvent(trades) {
  const grouped = {};

  for (const trade of trades) {
    const slug = trade.marketSlug;

    if (!grouped[slug]) {
      grouped[slug] = {
        slug,
        title: trade.title,
        league: trade.league,
        trades: [],
        totalBuys: 0,
        totalSells: 0,
        totalBuyShares: 0,
        totalSellShares: 0,
        totalBuyCost: 0,
        totalSellProceeds: 0,
        realizedPnl: 0,
        firstTradeTime: trade.timestamp,
        lastTradeTime: trade.timestamp,
      };
    }

    const event = grouped[slug];
    event.trades.push(trade);

    // Update timestamps
    if (trade.timestamp < event.firstTradeTime) {
      event.firstTradeTime = trade.timestamp;
    }
    if (trade.timestamp > event.lastTradeTime) {
      event.lastTradeTime = trade.timestamp;
    }

    // Update title if not set
    if (!event.title && trade.title) {
      event.title = trade.title;
    }
    if (!event.league && trade.league) {
      event.league = trade.league;
    }

    // Aggregate based on side
    const isBuy = trade.side === 'BUY';
    const tradeValue = trade.price * trade.shares;

    if (isBuy) {
      event.totalBuys++;
      event.totalBuyShares += trade.shares;
      event.totalBuyCost += tradeValue;
    } else {
      event.totalSells++;
      event.totalSellShares += trade.shares;
      event.totalSellProceeds += tradeValue;
    }

    // Sum realized P&L from API (if available)
    if (trade.realizedPnl !== null) {
      event.realizedPnl += trade.realizedPnl;
    }
  }

  // Calculate derived stats for each event
  for (const event of Object.values(grouped)) {
    // Sort trades by timestamp (oldest first for display)
    event.trades.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate weighted averages
    event.avgBuyPrice = event.totalBuyShares > 0
      ? event.totalBuyCost / event.totalBuyShares
      : 0;
    event.avgSellPrice = event.totalSellShares > 0
      ? event.totalSellProceeds / event.totalSellShares
      : 0;

    // Calculate net P&L (simplified: proceeds - cost)
    event.netPnl = event.totalSellProceeds - event.totalBuyCost;

    // Determine if position is complete (all shares sold)
    // Using a small tolerance for floating point comparison
    event.isComplete = Math.abs(event.totalBuyShares - event.totalSellShares) < 0.01;

    // Round numerical values for display
    event.totalBuyCost = Math.round(event.totalBuyCost * 100) / 100;
    event.totalSellProceeds = Math.round(event.totalSellProceeds * 100) / 100;
    event.netPnl = Math.round(event.netPnl * 100) / 100;
    event.realizedPnl = Math.round(event.realizedPnl * 100) / 100;
    event.avgBuyPrice = Math.round(event.avgBuyPrice * 1000) / 1000;
    event.avgSellPrice = Math.round(event.avgSellPrice * 1000) / 1000;
  }

  return grouped;
}

/**
 * Calculate overall performance metrics from grouped events
 * FIXED: Now sums realizedPnl from ALL closing trades, not just complete events
 * @param {Object} groupedEvents - Object keyed by marketSlug from groupTradesByEvent
 * @returns {Object} Performance metrics
 */
export function calculatePerformanceMetrics(groupedEvents) {
  const events = Object.values(groupedEvents);

  // Get ALL closing trades (trades with realizedPnl) from ALL events
  // This correctly handles partial closes - we count each closing trade, not just complete events
  const allClosingTrades = events.flatMap(e =>
    e.trades.filter(t => t.realizedPnl !== null && t.realizedPnl !== undefined)
  );

  // Sum realizedPnl from ALL closing trades
  const totalRealizedPnl = allClosingTrades.reduce((sum, t) => sum + t.realizedPnl, 0);

  // Sum costBasis from all closing trades for accurate ROI calculation
  const totalCostBasis = allClosingTrades.reduce((sum, t) => sum + (t.costBasis || 0), 0);

  // Count wins/losses by individual closing trades, not events
  const winningTrades = allClosingTrades.filter(t => t.realizedPnl > 0);
  const losingTrades = allClosingTrades.filter(t => t.realizedPnl < 0);

  // Find best and worst individual trades
  let biggestWin = 0;
  let biggestWinTrade = null;
  let biggestLoss = 0;
  let biggestLossTrade = null;

  for (const trade of allClosingTrades) {
    if (trade.realizedPnl > biggestWin) {
      biggestWin = trade.realizedPnl;
      biggestWinTrade = trade;
    }
    if (trade.realizedPnl < biggestLoss) {
      biggestLoss = trade.realizedPnl;
      biggestLossTrade = trade;
    }
  }

  // Track complete vs open events for display
  const completeEvents = events.filter(e => e.isComplete);
  const openEvents = events.filter(e => !e.isComplete);

  return {
    // Trade-level stats (for accurate P&L)
    totalTrades: allClosingTrades.length,
    winners: winningTrades.length,
    losers: losingTrades.length,
    winRate: allClosingTrades.length > 0 ? (winningTrades.length / allClosingTrades.length * 100) : 0,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    roi: totalCostBasis > 0 ? (totalRealizedPnl / totalCostBasis * 100) : 0,

    // Event-level stats (for context)
    totalEvents: events.length,
    completeEvents: completeEvents.length,
    openEvents: openEvents.length,

    // Best/worst trades
    biggestWin: Math.round(biggestWin * 100) / 100,
    biggestWinTrade,
    biggestLoss: Math.round(biggestLoss * 100) / 100,
    biggestLossTrade,

    // Averages
    avgWin: winningTrades.length > 0
      ? Math.round(winningTrades.reduce((s, t) => s + t.realizedPnl, 0) / winningTrades.length * 100) / 100
      : 0,
    avgLoss: losingTrades.length > 0
      ? Math.round(losingTrades.reduce((s, t) => s + t.realizedPnl, 0) / losingTrades.length * 100) / 100
      : 0,

    // Legacy fields for backwards compatibility
    totalBuyCost: Math.round(totalCostBasis * 100) / 100,
  };
}

/**
 * Get all closing trades (trades with realizedPnl) sorted by time
 * @param {Array} trades - Array of normalized trade objects from transformActivities
 * @returns {Array} Array of closing trades with P&L
 */
export function getClosingTrades(trades) {
  return trades
    .filter(t => t.realizedPnl !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}
