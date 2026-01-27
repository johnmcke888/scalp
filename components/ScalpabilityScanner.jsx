'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { rankMarkets } from '@/lib/scalpability';
import { getTeamColor } from '@/lib/teamColors';

// Helper functions for table display
function formatStartTime(isoString) {
  if (!isoString) return '--';
  
  const date = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  }).toLowerCase().replace(' ', '');
  
  // Today
  if (date.toDateString() === now.toDateString()) {
    return `Today ${timeStr}`;
  }
  
  // Tomorrow  
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${timeStr}`;
  }
  
  // Within 7 days - show day name
  const daysAway = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (daysAway <= 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${timeStr}`;
  }
  
  // Further out - show date
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${monthDay} ${timeStr}`;
}

function formatFullDateTime(isoString) {
  if (!isoString) return 'Time TBD';
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { 
    weekday: 'long',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function getScalpColor(score) {
  if (score >= 70) return '#39ff14'; // Hot green
  if (score >= 50) return '#ffcc00'; // Warm yellow
  return '#888'; // Cool gray
}

function getScalpIcon(score) {
  if (score >= 70) return '🔥';
  if (score >= 50) return '⚡';
  return '❄️';
}

const ScalpabilityScanner = ({ pin }) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'live', 'hot'
  const [expandedId, setExpandedId] = useState(null);

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

  // Filter and sort markets
  function filterMarkets(markets, filter) {
    switch (filter) {
      case 'live':
        return markets.filter(m => m.event.live && !m.event.ended);
      case 'hot':
        return markets.filter(m => m.event.live && !m.event.ended && m.scalpability.score >= 65);
      case 'all':
      default:
        return markets.filter(m => !m.event.ended);
    }
  }

  function sortMarkets(markets) {
    return [...markets].sort((a, b) => {
      // Live games first
      if (a.event.live && !b.event.live) return -1;
      if (!a.event.live && b.event.live) return 1;
      
      // Among live games: sort by scalpability score (highest first)
      if (a.event.live && b.event.live) {
        return (b.scalpability.score || 0) - (a.scalpability.score || 0);
      }
      
      // Among upcoming games: sort by start time (soonest first)
      const aTime = new Date(a.event.startTime || '2099-01-01').getTime();
      const bTime = new Date(b.event.startTime || '2099-01-01').getTime();
      return aTime - bTime;
    });
  }

  // Apply filter THEN sort
  const displayedMarkets = sortMarkets(filterMarkets(markets, filter));

  // Stats - only count live games for "hot"
  const liveMarkets = markets.filter(m => m.event.live && !m.event.ended);
  const hotCount = liveMarkets.filter(m => m.scalpability.score >= 60).length;
  const liveCount = liveMarkets.length;

  // Row expansion toggle
  function toggleExpanded(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

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

      {/* Market Table */}
      {displayedMarkets.length === 0 && !loading ? (
        <div style={styles.empty}>
          {filter === 'hot' ? 'No hot opportunities right now' : 'No markets available'}
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Matchup</th>
              <th style={styles.th}>Prices</th>
              <th style={styles.th}>Scalp</th>
            </tr>
          </thead>
          <tbody>
            {displayedMarkets.map(market => {
              const { scalpability, team1, team2, event, sport } = market;
              const isLive = event.live && !event.ended;
              const isExpanded = expandedId === market.slug;
              
              return (
                <React.Fragment key={market.slug}>
                  <tr 
                    style={{
                      ...styles.td,
                      ...(isLive ? styles.rowLive : styles.rowUpcoming),
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleExpanded(market.slug)}
                  >
                    {/* Status Column */}
                    <td style={styles.td}>
                      {isLive ? (
                        <span style={styles.liveStatus}>🔴 LIVE</span>
                      ) : (
                        <span style={styles.upcomingStatus}>⏳</span>
                      )}
                    </td>
                    
                    {/* Time Column */}
                    <td style={styles.td}>
                      {isLive ? (
                        <span>
                          {event.period && event.elapsed 
                            ? `${event.period} ${event.elapsed}`
                            : event.period || '--'
                          }
                        </span>
                      ) : (
                        <span>{formatStartTime(event.startTime)}</span>
                      )}
                    </td>
                    
                    {/* Matchup Column */}
                    <td style={{...styles.td, ...(isLive ? styles.matchupLive : styles.matchupUpcoming)}}>
                      {isLive && event.homeScore !== null ? (
                        <span>
                          {team1?.name || 'Team 1'} {event.homeScore} vs {team2?.name || 'Team 2'} {event.awayScore}
                        </span>
                      ) : (
                        <span>
                          {team1?.name || 'Team 1'} vs {team2?.name || 'Team 2'}
                        </span>
                      )}
                    </td>
                    
                    {/* Prices Column */}
                    <td style={{...styles.td, ...styles.priceCell}}>
                      {typeof team1?.price === 'number' ? `${(team1.price * 100).toFixed(0)}¢` : '--'} / {typeof team2?.price === 'number' ? `${(team2.price * 100).toFixed(0)}¢` : '--'}
                    </td>
                    
                    {/* Scalp Score Column */}
                    <td style={styles.td}>
                      {isLive && scalpability.score !== null ? (
                        <span style={{...styles.scalpScore, color: getScalpColor(scalpability.score)}}>
                          {getScalpIcon(scalpability.score)} {scalpability.score}
                        </span>
                      ) : (
                        <span style={styles.scalpSkip}>--</span>
                      )}
                    </td>
                  </tr>
                  
                  {/* Expanded Row */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={styles.expandedContent}>
                        {isLive ? (
                          // Live Game Breakdown
                          <div>
                            <div style={{ marginBottom: '12px', color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>
                              Score Breakdown
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: '#888' }}>Time Left</span>
                              <div style={{ height: '8px', backgroundColor: '#1a1a1a', borderRadius: '2px' }}>
                                <div style={{ 
                                  width: `${scalpability.breakdown.timeRemaining}%`, 
                                  height: '100%', 
                                  backgroundColor: '#39ff14',
                                  borderRadius: '2px',
                                }} />
                              </div>
                              <span style={{ textAlign: 'right', fontFamily: '"SF Mono", monospace' }}>
                                {scalpability.breakdown.timeRemaining}%
                              </span>
                              
                              <span style={{ color: '#888' }}>Price Gap</span>
                              <div style={{ height: '8px', backgroundColor: '#1a1a1a', borderRadius: '2px' }}>
                                <div style={{ 
                                  width: `${scalpability.breakdown.priceUncertainty}%`, 
                                  height: '100%', 
                                  backgroundColor: '#ffcc00',
                                  borderRadius: '2px',
                                }} />
                              </div>
                              <span style={{ textAlign: 'right', fontFamily: '"SF Mono", monospace' }}>
                                {scalpability.breakdown.priceDiff ? `${(scalpability.breakdown.priceDiff * 100).toFixed(0)}¢` : '--'}
                              </span>
                              
                              {scalpability.breakdown.scoreCloseness !== null && (
                                <>
                                  <span style={{ color: '#888' }}>Score Margin</span>
                                  <div style={{ height: '8px', backgroundColor: '#1a1a1a', borderRadius: '2px' }}>
                                    <div style={{ 
                                      width: `${scalpability.breakdown.scoreCloseness}%`, 
                                      height: '100%', 
                                      backgroundColor: '#00bfff',
                                      borderRadius: '2px',
                                    }} />
                                  </div>
                                  <span style={{ textAlign: 'right', fontFamily: '"SF Mono", monospace' }}>
                                    {scalpability.breakdown.scoreDiff} pts
                                  </span>
                                </>
                              )}
                            </div>
                            
                            {scalpability.breakdown.mispricingBonus > 0 && (
                              <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#1a1a00', border: '1px solid #555500', borderRadius: '4px' }}>
                                ⚠️ Potential mispricing: +{scalpability.breakdown.mispricingBonus} bonus points
                              </div>
                            )}
                          </div>
                        ) : (
                          // Upcoming Game Info
                          <div>
                            <div style={{ marginBottom: '12px', color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>
                              Pre-Game Info
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 16px' }}>
                              <span style={{ color: '#888' }}>Start Time</span>
                              <span>{formatFullDateTime(event.startTime)}</span>
                              
                              <span style={{ color: '#888' }}>Prices</span>
                              <span style={{ fontFamily: '"SF Mono", monospace' }}>
                                {team1?.name}: {typeof team1?.price === 'number' ? `${(team1.price * 100).toFixed(0)}¢` : '--'} vs {team2?.name}: {typeof team2?.price === 'number' ? `${(team2.price * 100).toFixed(0)}¢` : '--'}
                                {typeof team1?.price === 'number' && typeof team2?.price === 'number' && (
                                  <span style={{ color: '#888', marginLeft: '8px' }}>
                                    ({Math.abs((team1.price - team2.price) * 100).toFixed(0)}¢ gap)
                                  </span>
                                )}
                              </span>
                              
                              <span style={{ color: '#888' }}>Market</span>
                              <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '11px', color: '#555' }}>
                                {market.slug?.slice(0, 40)}...
                              </span>
                            </div>
                            
                            <div style={{ marginTop: '12px', color: '#555', fontSize: '12px' }}>
                              ⏳ Scalpability score available once game is live
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  headerRight: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
    fontFamily: '"SF Mono", monospace',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    margin: 0,
  },
  refreshBtn: {
    padding: '8px 16px',
    border: '1px solid #333340',
    background: '#111114',
    color: '#9ca3af',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  statsBar: {
    display: 'flex',
    gap: 20,
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
  
  // Table styles
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: '"SF Mono", monospace',
    fontSize: 13,
    background: '#111114',
    border: '1px solid #222228',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '1px solid #333340',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    background: '#0a0b0d',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #1a1a1f',
    verticalAlign: 'middle',
    color: '#ffffff',
  },
  rowLive: {
    backgroundColor: 'rgba(255, 59, 48, 0.05)',
  },
  rowUpcoming: {
    backgroundColor: 'transparent',
  },
  rowExpanded: {
    backgroundColor: '#0a0a0a',
  },
  expandedContent: {
    padding: '16px',
    backgroundColor: '#0a0a0a',
    borderBottom: '1px solid #333340',
  },
  liveStatus: {
    color: '#ff3b30',
    fontWeight: 600,
  },
  upcomingStatus: {
    color: '#6b7280',
    fontSize: 16,
  },
  matchupLive: {
    fontFamily: '"SF Mono", monospace',
  },
  matchupUpcoming: {
    color: '#9ca3af',
  },
  priceCell: {
    fontFamily: '"SF Mono", monospace',
    fontWeight: 600,
  },
  scalpScore: {
    fontWeight: 700,
  },
  scalpSkip: {
    color: '#555',
  },
};

export default ScalpabilityScanner;