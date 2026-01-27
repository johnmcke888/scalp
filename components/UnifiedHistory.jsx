import { useState } from 'react';
import { PriceBar } from './PriceBar';
import TradeBar from './TradeBar';
import PriceScaleLegend from './PriceScaleLegend';
import { exportUnifiedTradeHistory } from '@/lib/csvExport';

/**
 * UnifiedHistory Component - Merges all trade types into a single chronological view
 * Combines: Recent trades (scalps), Position resolutions (held to expiry), Cashed out positions
 */
export const UnifiedHistory = ({ 
  closingTrades = [], 
  resolutionTrades = [], 
  tradeHistory = {},
  onRefresh,
  refreshing = false 
}) => {
  
  // Combine all trades into unified format, avoiding duplicates
  const unifiedTrades = [];
  const seenMarketSlugs = new Set(); // Track markets to avoid HELD duplicates
  
  // PRIORITY 1: Add resolution trades (held to expiry) - these are definitive outcomes
  resolutionTrades.forEach(trade => {
    const slug = trade.marketSlug || trade.id;
    unifiedTrades.push({
      id: trade.id,
      timestamp: trade.timestamp,
      team: trade.team,
      league: trade.league,
      teamColor: trade.teamColor,
      entryPrice: (trade.originalPrice || 0) * 100, // Convert to cents
      exitPrice: trade.won ? 100 : 0, // 100¢ if won, 0¢ if lost
      profit: trade.realizedPnl || 0,
      shares: trade.shares,
      // Removed type field - clean display without suffixes
      marketSlug: slug,
    });
    // Track this market so we don't add duplicate scalp entries
    if (slug) seenMarketSlugs.add(slug);
  });
  
  // PRIORITY 2: Add cashed out positions from trade history (grouped complete events)
  Object.values(tradeHistory).forEach(event => {
    if (event.isComplete && event.totalSells > 0 && !seenMarketSlugs.has(event.slug)) {
      // Find the latest trade for this event
      const latestTrade = event.trades[event.trades.length - 1];
      if (latestTrade && latestTrade.side === 'SELL') {
        unifiedTrades.push({
          id: `${event.slug}-cashout`,
          timestamp: latestTrade.timestamp,
          team: latestTrade.team,
          league: latestTrade.league,
          teamColor: latestTrade.teamColor,
          entryPrice: event.avgBuyPrice * 100, // Convert to cents
          exitPrice: event.avgSellPrice * 100, // Convert to cents
          profit: event.realizedPnl || event.netPnl || 0,
          shares: event.totalBuyShares,
          // Removed type field - clean display without suffixes
          marketSlug: event.slug,
        });
        // Track this market so we don't add individual scalp entries
        seenMarketSlugs.add(event.slug);
      }
    }
  });
  
  // PRIORITY 3: Add individual closing trades (scalps) - only if not already covered above
  closingTrades.forEach(trade => {
    const slug = trade.marketSlug || trade.id;
    if (!seenMarketSlugs.has(slug)) {
      unifiedTrades.push({
        id: trade.id,
        timestamp: trade.timestamp,
        team: trade.team,
        league: trade.league,
        teamColor: trade.teamColor,
        entryPrice: (trade.originalPrice || 0) * 100, // Convert to cents
        exitPrice: trade.price * 100, // Convert to cents
        profit: trade.realizedPnl || 0,
        shares: trade.shares,
        // Removed type field - clean display without suffixes
        marketSlug: slug,
      });
    }
  });
  
  // Sort by time (newest first)
  const filteredTrades = unifiedTrades.sort((a, b) => b.timestamp - a.timestamp);
  
  // Take only the most recent/filtered 20 trades
  const recentUnified = filteredTrades.slice(0, 20);
  
  if (recentUnified.length === 0) {
    return null;
  }
  
  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <span style={styles.title}>UNIFIED HISTORY</span>
        <div style={styles.headerRight}>
          <span style={styles.subtitle}>{recentUnified.length} of {unifiedTrades.length}</span>
          <button
            onClick={() => exportUnifiedTradeHistory(unifiedTrades)}
            style={styles.exportBtn}
            title="Export all trades to CSV"
            disabled={unifiedTrades.length === 0}
          >
            ⬇ CSV
          </button>
          <button 
            onClick={onRefresh}
            disabled={refreshing}
            style={styles.refreshBtn}
            title="Refresh history"
          >
            {refreshing ? '⟳' : '↻'}
          </button>
        </div>
      </div>

      
      {/* Price scale legend */}
      <PriceScaleLegend />
      
      <div style={styles.container}>
        {recentUnified.map((trade) => {
          // Clean team names without any suffixes (removed HELD/CASH badges per user requirement)
          const teamDisplayName = trade.team;
          
          return (
            <TradeBar
              key={trade.id}
              teamName={teamDisplayName}
              buyPrice={trade.entryPrice / 100} // Convert cents to 0-1 scale
              sellPrice={trade.exitPrice / 100} // Convert cents to 0-1 scale
              pnl={trade.profit}
            />
          );
        })}
      </div>
    </section>
  );
};

const styles = {
  section: {
    marginBottom: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: '1px solid #374151',
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    color: '#f9fafb',
    letterSpacing: '0.5px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid #374151',
    color: '#9ca3af',
    padding: '2px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
  },
  exportBtn: {
    background: '#10b981',
    border: '1px solid #059669',
    color: '#f9fafb',
    padding: '2px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 10,
    lineHeight: 1,
    marginRight: 6,
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    padding: 8,
    border: '1px solid #374151',
    borderRadius: 6,
    backgroundColor: '#1f2937',
  },
  topLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  teamName: {
    fontWeight: 600,
    fontSize: 13,
    flex: '1 1 auto',
    minWidth: 0,
  },
  shortBadge: {
    fontSize: 10,
    color: '#ef4444',
    marginLeft: 4,
  },
  typeBadge: {
    fontSize: 9,
    marginLeft: 4,
    opacity: 0.8,
  },
  priceMovement: {
    fontSize: 12,
    color: '#d1d5db',
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  arrow: {
    color: '#6b7280',
    fontSize: 10,
  },
  profit: {
    fontWeight: 600,
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 60,
    textAlign: 'right',
  },
  time: {
    fontSize: 10,
    color: '#6b7280',
    minWidth: 80,
    textAlign: 'right',
  },
  bottomLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  shares: {
    fontSize: 10,
    color: '#9ca3af',
    minWidth: 40,
    textAlign: 'right',
  },
  
  // Filter and sort controls
  controls: {
    display: 'flex',
    gap: 16,
    marginBottom: 12,
    padding: '8px 0',
    borderBottom: '1px solid #374151',
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  controlLabel: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  select: {
    background: '#1f2937',
    border: '1px solid #374151',
    color: '#f9fafb',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    outline: 'none',
    cursor: 'pointer',
  },
  sortOrderBtn: {
    background: '#374151',
    border: '1px solid #4b5563',
    color: '#f9fafb',
    padding: '4px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 10,
    lineHeight: 1,
    marginLeft: 4,
  },
};

export default UnifiedHistory;