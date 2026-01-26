import { PriceBar } from './PriceBar';

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
  // Combine all trades into unified format
  const unifiedTrades = [];
  
  // Add recent closing trades (scalps)
  closingTrades.forEach(trade => {
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
      type: 'SCALP',
      isShort: trade.intent?.includes('SHORT'),
    });
  });
  
  // Add resolution trades (held to expiry)
  resolutionTrades.forEach(trade => {
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
      type: 'RESOLUTION',
      isShort: false,
    });
  });
  
  // Add cashed out positions from trade history
  Object.values(tradeHistory).forEach(event => {
    if (event.isComplete && event.totalSells > 0) {
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
          type: 'CASHOUT',
          isShort: false,
        });
      }
    }
  });
  
  // Sort by timestamp (most recent first)
  unifiedTrades.sort((a, b) => b.timestamp - a.timestamp);
  
  // Take only the most recent 20 trades
  const recentUnified = unifiedTrades.slice(0, 20);
  
  if (recentUnified.length === 0) {
    return null;
  }
  
  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <span style={styles.title}>UNIFIED HISTORY</span>
        <div style={styles.headerRight}>
          <span style={styles.subtitle}>{recentUnified.length} recent</span>
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
      
      <div style={styles.container}>
        {recentUnified.map((trade) => {
          const timeStr = new Date(trade.timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          
          const typeColor = {
            SCALP: '#06b6d4',     // cyan
            RESOLUTION: '#8b5cf6', // purple  
            CASHOUT: '#f59e0b',    // amber
          }[trade.type];
          
          const typeBadge = {
            SCALP: '',
            RESOLUTION: ' HELD',
            CASHOUT: ' CASH',
          }[trade.type];
          
          return (
            <div key={trade.id} style={styles.row}>
              {/* Line 1: Team + Price Movement + P&L + Time */}
              <div style={styles.topLine}>
                <span style={{ 
                  ...styles.teamName, 
                  color: trade.teamColor || '#9ca3af' 
                }}>
                  {trade.team}
                  {trade.isShort && <span style={styles.shortBadge}>▼</span>}
                  <span style={{ ...styles.typeBadge, color: typeColor }}>
                    {typeBadge}
                  </span>
                </span>
                
                <div style={styles.priceMovement}>
                  {trade.entryPrice.toFixed(0)}¢ 
                  <span style={styles.arrow}>▶</span>
                  {trade.exitPrice.toFixed(0)}¢
                </div>
                
                <div style={{
                  ...styles.profit,
                  color: trade.profit >= 0 ? '#22c55e' : '#ef4444',
                }}>
                  {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                </div>
                
                <div style={styles.time}>
                  {timeStr}
                </div>
              </div>
              
              {/* Line 2: Price Bar + Shares */}
              <div style={styles.bottomLine}>
                <PriceBar
                  entry={trade.entryPrice}
                  exit={trade.exitPrice}
                  profit={trade.profit}
                  className="flex-1"
                />
                <div style={styles.shares}>
                  {trade.shares.toFixed(0)}sh
                </div>
              </div>
            </div>
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
};

export default UnifiedHistory;