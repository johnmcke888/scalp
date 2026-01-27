'use client';

import { useState, useEffect, useCallback } from 'react';
import { rankMarkets } from '@/lib/scalpability';
import { getTeamColor } from '@/lib/teamColors';

const ScalpabilityScanner = ({ pin }) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'live', 'hot'
  const [expandedMarket, setExpandedMarket] = useState(null);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/markets?pin=${encodeURIComponent(pin)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      const ranked = rankMarkets(data.markets || []);
      setMarkets(ranked);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch markets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pin]);

  // Initial fetch
  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchMarkets, 30000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  // Filter markets
  const filteredMarkets = markets.filter(m => {
    if (filter === 'live') return m.event.live && !m.event.ended;
    if (filter === 'hot') return m.scalpability.score >= 60;
    return !m.event.ended; // 'all' excludes ended games
  });

  // Stats
  const hotCount = markets.filter(m => m.scalpability.score >= 60).length;
  const liveCount = markets.filter(m => m.event.live && !m.event.ended).length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>🔥 SCALPABILITY SCANNER</h2>
          <span style={styles.subtitle}>
            Find the best opportunities
          </span>
        </div>
        <div style={styles.headerRight}>
          <button 
            style={styles.refreshBtn} 
            onClick={fetchMarkets}
            disabled={loading}
          >
            {loading ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{markets.length}</span>
          <span style={styles.statLabel}>Markets</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statValue, color: '#39ff14' }}>{hotCount}</span>
          <span style={styles.statLabel}>Hot 🔥</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statValue, color: '#22d3ee' }}>{liveCount}</span>
          <span style={styles.statLabel}>Live</span>
        </div>
        {lastUpdated && (
          <div style={styles.stat}>
            <span style={styles.statLabel}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        {[
          { key: 'all', label: 'All' },
          { key: 'live', label: '● Live' },
          { key: 'hot', label: '🔥 Hot Only' },
        ].map(f => (
          <button
            key={f.key}
            style={{
              ...styles.filterBtn,
              ...(filter === f.key ? styles.filterBtnActive : {}),
            }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {/* Market List */}
      <div style={styles.marketList}>
        {filteredMarkets.length === 0 && !loading && (
          <div style={styles.empty}>
            {filter === 'hot' ? 'No hot opportunities right now' : 'No markets available'}
          </div>
        )}

        {filteredMarkets.map(market => {
          const { scalpability, team1, team2, event, sport } = market;
          const isExpanded = expandedMarket === market.slug;
          
          // Score bar color
          let scoreColor = '#4b5563'; // gray
          if (scalpability.score >= 75) scoreColor = '#39ff14'; // hot green
          else if (scalpability.score >= 50) scoreColor = '#f59e0b'; // warm orange
          else if (scalpability.score >= 25) scoreColor = '#3b82f6'; // cool blue

          return (
            <div
              key={market.slug}
              style={styles.marketCard}
              onClick={() => setExpandedMarket(isExpanded ? null : market.slug)}
            >
              {/* Score Badge */}
              <div style={styles.scoreBadgeContainer}>
                <div style={{
                  ...styles.scoreBadge,
                  background: scoreColor,
                  boxShadow: scalpability.score >= 75 ? `0 0 20px ${scoreColor}` : 'none',
                }}>
                  {scalpability.score}
                </div>
                <span style={{ ...styles.ratingLabel, color: scoreColor }}>
                  {scalpability.rating}
                </span>
              </div>

              {/* Market Info */}
              <div style={styles.marketInfo}>
                <div style={styles.marketTitle}>{market.title}</div>
                
                {/* Teams and Prices */}
                <div style={styles.teamsRow}>
                  <div style={styles.teamBox}>
                    <span style={{ 
                      ...styles.teamName, 
                      color: team1?.color || getTeamColor(team1?.name) 
                    }}>
                      {team1?.name || 'Team 1'}
                    </span>
                    <span style={styles.teamPrice}>
                      {team1?.price ? `${(team1.price * 100).toFixed(0)}¢` : '--'}
                    </span>
                  </div>
                  <span style={styles.vs}>vs</span>
                  <div style={styles.teamBox}>
                    <span style={{ 
                      ...styles.teamName, 
                      color: team2?.color || getTeamColor(team2?.name) 
                    }}>
                      {team2?.name || 'Team 2'}
                    </span>
                    <span style={styles.teamPrice}>
                      {team2?.price ? `${(team2.price * 100).toFixed(0)}¢` : '--'}
                    </span>
                  </div>
                </div>

                {/* Live Score */}
                {event.score && (
                  <div style={styles.liveScore}>
                    {event.live && <span style={styles.liveIndicator}>● LIVE</span>}
                    <span style={styles.scoreValue}>{event.score}</span>
                    {event.period && (
                      <span style={styles.period}>{event.period}</span>
                    )}
                  </div>
                )}

                {/* Reason */}
                <div style={styles.reason}>{scalpability.reason}</div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div style={styles.expandedSection}>
                  <div style={styles.breakdownTitle}>Score Breakdown</div>
                  <div style={styles.breakdownGrid}>
                    <div style={styles.breakdownItem}>
                      <span style={styles.breakdownLabel}>Time Left</span>
                      <div style={styles.breakdownBar}>
                        <div style={{
                          ...styles.breakdownFill,
                          width: `${scalpability.breakdown.timeRemaining}%`,
                          background: '#3b82f6',
                        }} />
                      </div>
                      <span style={styles.breakdownValue}>
                        {scalpability.breakdown.timeRemaining}%
                      </span>
                    </div>
                    <div style={styles.breakdownItem}>
                      <span style={styles.breakdownLabel}>Price Uncertainty</span>
                      <div style={styles.breakdownBar}>
                        <div style={{
                          ...styles.breakdownFill,
                          width: `${scalpability.breakdown.priceUncertainty}%`,
                          background: '#a855f7',
                        }} />
                      </div>
                      <span style={styles.breakdownValue}>
                        {scalpability.breakdown.priceUncertainty}%
                      </span>
                    </div>
                    <div style={styles.breakdownItem}>
                      <span style={styles.breakdownLabel}>Score Closeness</span>
                      <div style={styles.breakdownBar}>
                        <div style={{
                          ...styles.breakdownFill,
                          width: `${scalpability.breakdown.scoreCloseness}%`,
                          background: '#22d3ee',
                        }} />
                      </div>
                      <span style={styles.breakdownValue}>
                        {scalpability.breakdown.scoreCloseness}%
                      </span>
                    </div>
                    {scalpability.breakdown.mispricingBonus > 0 && (
                      <div style={styles.mispricingAlert}>
                        ⚠️ Potential mispricing detected (+{scalpability.breakdown.mispricingBonus} bonus)
                      </div>
                    )}
                  </div>
                  
                  {/* Action Button */}
                  <a
                    href={`https://polymarket.us/event/${market.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.tradeBtn}
                    onClick={e => e.stopPropagation()}
                  >
                    OPEN IN POLYMARKET →
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: {
    marginBottom: 32,
    paddingBottom: 24,
    borderBottom: '1px solid #222228',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {},
  headerRight: {},
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  refreshBtn: {
    padding: '8px 16px',
    border: '1px solid #333340',
    background: 'transparent',
    color: '#9ca3af',
    fontFamily: '"SF Mono", monospace',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 6,
  },
  statsBar: {
    display: 'flex',
    gap: 24,
    padding: '12px 16px',
    background: '#0a0b0d',
    borderRadius: 8,
    marginBottom: 12,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  filterBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    padding: '8px 16px',
    border: '1px solid #333340',
    background: 'transparent',
    color: '#6b7280',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  filterBtnActive: {
    background: '#1a1a1f',
    color: '#ffffff',
    borderColor: '#39ff14',
  },
  error: {
    padding: '12px 16px',
    background: 'rgba(255, 59, 48, 0.15)',
    border: '1px solid #ff3b30',
    color: '#ff3b30',
    fontSize: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#4b5563',
    fontSize: 13,
  },
  marketList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  marketCard: {
    display: 'flex',
    gap: 16,
    padding: 16,
    background: '#111114',
    border: '1px solid #222228',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
    flexWrap: 'wrap',
  },
  scoreBadgeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minWidth: 50,
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    color: '#000000',
  },
  ratingLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
  },
  marketInfo: {
    flex: 1,
    minWidth: 0,
  },
  marketTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: '#9ca3af',
    marginBottom: 8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  teamsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  teamBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  teamName: {
    fontSize: 14,
    fontWeight: 600,
  },
  teamPrice: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    color: '#ffffff',
  },
  vs: {
    fontSize: 11,
    color: '#4b5563',
  },
  liveScore: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  liveIndicator: {
    fontSize: 10,
    fontWeight: 600,
    color: '#39ff14',
    animation: 'pulse 2s infinite',
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    color: '#ffffff',
    letterSpacing: 2,
  },
  period: {
    fontSize: 11,
    color: '#6b7280',
    background: '#1a1a1f',
    padding: '2px 6px',
    borderRadius: 4,
  },
  reason: {
    fontSize: 11,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  expandedSection: {
    width: '100%',
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid #222228',
  },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  breakdownGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 16,
  },
  breakdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#9ca3af',
    width: 120,
    flexShrink: 0,
  },
  breakdownBar: {
    flex: 1,
    height: 8,
    background: '#1a1a1f',
    borderRadius: 4,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  breakdownValue: {
    fontSize: 12,
    fontFamily: '"SF Mono", monospace',
    color: '#ffffff',
    width: 40,
    textAlign: 'right',
  },
  mispricingAlert: {
    padding: '8px 12px',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 6,
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 8,
  },
  tradeBtn: {
    display: 'block',
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(57, 255, 20, 0.15)',
    border: '1px solid rgba(57, 255, 20, 0.4)',
    color: '#39ff14',
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
    borderRadius: 6,
    fontFamily: '"SF Mono", monospace',
  },
};

export default ScalpabilityScanner;