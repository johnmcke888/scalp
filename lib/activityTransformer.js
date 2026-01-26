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
      const realizedPnl = trade.realizedPnl?.value
        ? parseFloat(trade.realizedPnl.value)
        : null;
      const costBasis = trade.costBasis?.value
        ? parseFloat(trade.costBasis.value)
        : null;
      const originalPrice = trade.originalPrice?.value
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
 * @param {Object} groupedEvents - Object keyed by marketSlug from groupTradesByEvent
 * @returns {Object} Performance metrics
 */
export function calculatePerformanceMetrics(groupedEvents) {
  const events = Object.values(groupedEvents);
  const closedEvents = events.filter(e => e.isComplete);
  const winners = closedEvents.filter(e => e.realizedPnl > 0);
  const losers = closedEvents.filter(e => e.realizedPnl < 0);

  const totalRealizedPnl = closedEvents.reduce((sum, e) => sum + e.realizedPnl, 0);
  const totalBuyCost = closedEvents.reduce((sum, e) => sum + e.totalBuyCost, 0);

  // Find best and worst trades with their event info
  let biggestWin = 0;
  let biggestWinEvent = null;
  let biggestLoss = 0;
  let biggestLossEvent = null;

  for (const event of closedEvents) {
    if (event.realizedPnl > biggestWin) {
      biggestWin = event.realizedPnl;
      biggestWinEvent = event;
    }
    if (event.realizedPnl < biggestLoss) {
      biggestLoss = event.realizedPnl;
      biggestLossEvent = event;
    }
  }

  return {
    totalEvents: closedEvents.length,
    openEvents: events.length - closedEvents.length,
    winners: winners.length,
    losers: losers.length,
    winRate: closedEvents.length > 0 ? (winners.length / closedEvents.length * 100) : 0,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
    totalBuyCost: Math.round(totalBuyCost * 100) / 100,
    roi: totalBuyCost > 0 ? (totalRealizedPnl / totalBuyCost * 100) : 0,
    biggestWin: Math.round(biggestWin * 100) / 100,
    biggestWinEvent,
    biggestLoss: Math.round(biggestLoss * 100) / 100,
    biggestLossEvent,
    avgWin: winners.length > 0
      ? Math.round(winners.reduce((s, e) => s + e.realizedPnl, 0) / winners.length * 100) / 100
      : 0,
    avgLoss: losers.length > 0
      ? Math.round(losers.reduce((s, e) => s + e.realizedPnl, 0) / losers.length * 100) / 100
      : 0,
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
