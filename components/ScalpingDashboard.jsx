'use client';

import { useState, useEffect } from 'react';

const ScalpingDashboard = ({ pin }) => {
  const [positions, setPositions] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('scalper-positions-v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [history, setHistory] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('scalper-history-v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [newPos, setNewPos] = useState({ market: '', side: '', cost: '', shares: '' });
  const [closing, setClosing] = useState(null);
  const [closeForm, setCloseForm] = useState({ proceeds: '', fee: '' });
  const [priceEdits, setPriceEdits] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [balance, setBalance] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('scalper-positions-v2', JSON.stringify(positions));
    }
  }, [positions]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('scalper-history-v2', JSON.stringify(history));
    }
  }, [history]);

  const fetchPrices = async (slugs) => {
    if (!slugs || slugs.length === 0) return {};

    try {
      const res = await fetch(`/api/prices?slugs=${encodeURIComponent(slugs.join(','))}&pin=${encodeURIComponent(pin)}`);
      if (!res.ok) {
        console.error('Failed to fetch prices');
        return {};
      }
      const data = await res.json();
      return data.prices || {};
    } catch (err) {
      console.error('Price fetch error:', err);
      return {};
    }
  };

  const syncPositions = async () => {
    setSyncing(true);
    setSyncError(null);

    try {
      const res = await fetch(`/api/positions?pin=${encodeURIComponent(pin)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API error: ${res.status}`);
      }

      const data = await res.json();

      // Transform Polymarket positions to our format
      // Polymarket returns { positions: { slug: positionData, ... } }
      const transformPositions = (data) => {
        if (!data.positions || typeof data.positions !== 'object') {
          return [];
        }

        return Object.entries(data.positions).map(([slug, pos]) => {
          // Use Math.abs because negative values are internal CLOB accounting
          // Polymarket US has no short selling - all positions are longs
          const shares = Math.abs(parseFloat(pos.netPosition));
          const cost = parseFloat(pos.cost?.value || 0);
          const currentValue = parseFloat(pos.cashValue?.value || 0);

          return {
            id: slug,
            market: pos.marketMetadata?.title || slug,
            side: pos.marketMetadata?.outcome || 'Unknown',
            shares: shares,
            cost: cost,
            entryPrice: shares > 0 ? cost / shares : 0,
            currentPrice: shares > 0 ? currentValue / shares : 0,
            currentValue: currentValue,
            marketPrice: null, // Price from market API
            openedAt: pos.updateTime || new Date().toISOString(),
            synced: true, // Mark as synced from API
            source: 'api',
          };
        }).filter(p => p.shares > 0); // Only include positions with shares
      };

      const transformed = transformPositions(data);

      // Fetch market prices for all synced positions
      const slugs = transformed.map(p => p.id);
      const prices = await fetchPrices(slugs);

      // Update positions with market price data
      // Match position's side (e.g., "Minutemen") to get the correct price
      const withPrices = transformed.map(p => {
        const priceData = prices[p.id];
        if (priceData && priceData.sides) {
          const sidePrice = priceData.sides[p.side];
          if (sidePrice !== null && sidePrice !== undefined) {
            return {
              ...p,
              marketPrice: sidePrice,
              currentPrice: sidePrice,
            };
          }
        }
        return p;
      });

      // Merge with existing manual positions (keep manual ones, update synced ones)
      setPositions(prev => {
        const manual = prev.filter(p => !p.synced);
        return [...withPrices, ...manual];
      });
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const syncBalance = async () => {
    try {
      const res = await fetch(`/api/balance?pin=${encodeURIComponent(pin)}`);
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance || data.cash || data.available || null);
      }
    } catch {
      // Ignore balance errors
    }
  };

  const syncAll = async () => {
    await Promise.all([syncPositions(), syncBalance()]);
    setLastSynced(new Date());
  };

  const addPosition = () => {
    const cost = parseFloat(newPos.cost);
    const shares = parseFloat(newPos.shares);
    if (!newPos.market.trim() || !newPos.side.trim() || isNaN(cost) || isNaN(shares) || shares === 0) return;

    const pos = {
      id: Date.now(),
      market: newPos.market.trim(),
      side: newPos.side.trim(),
      cost,
      shares,
      entryPrice: cost / shares,
      currentPrice: cost / shares,
      openedAt: new Date().toISOString(),
      synced: false, // Manual position
    };
    setPositions([pos, ...positions]);
    setNewPos({ market: '', side: '', cost: '', shares: '' });
  };

  const updateCurrentPrice = (id, price) => {
    const p = parseFloat(price);
    if (isNaN(p)) return;
    setPositions(positions.map(pos => pos.id === id ? { ...pos, currentPrice: p } : pos));
  };

  const closePosition = () => {
    if (!closing) return;
    const proceeds = parseFloat(closeForm.proceeds) || 0;
    const fee = parseFloat(closeForm.fee) || 0;
    const netProceeds = proceeds - fee;

    const trade = {
      ...closing,
      closedAt: new Date().toISOString(),
      grossProceeds: proceeds,
      fee,
      netProceeds,
      realizedPnL: netProceeds - closing.cost,
      resolved: false,
      won: null,
      hindsightValue: null,
      hindsightDiff: null,
    };

    setHistory([trade, ...history]);
    setPositions(positions.filter(p => p.id !== closing.id));
    setClosing(null);
    setCloseForm({ proceeds: '', fee: '' });
  };

  const markResolved = (id, won) => {
    setHistory(history.map(t => {
      if (t.id !== id) return t;
      const hindsightValue = won ? t.shares : 0;
      return {
        ...t,
        resolved: true,
        won,
        hindsightValue,
        hindsightDiff: hindsightValue - t.netProceeds,
      };
    }));
  };

  const totalUnrealized = positions.reduce((sum, p) => {
    const price = p.marketPrice !== null ? p.marketPrice : p.currentPrice;
    return sum + (p.shares * price - p.cost);
  }, 0);
  const totalRealized = history.reduce((sum, t) => sum + t.realizedPnL, 0);
  const resolvedTrades = history.filter(t => t.resolved);
  const totalHindsight = resolvedTrades.reduce((sum, t) => sum + t.hindsightDiff, 0);

  const fmt = (n, showSign = false) => {
    const num = parseFloat(n) || 0;
    const sign = showSign && num > 0 ? '+' : '';
    return sign + num.toFixed(2);
  };

  const pct = (pnl, cost) => {
    if (!cost) return '0.0';
    const p = (pnl / cost) * 100;
    return (p > 0 ? '+' : '') + p.toFixed(1);
  };

  const formatTimeAgo = (date) => {
    if (!date) return null;
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const [timeAgo, setTimeAgo] = useState(null);

  // Update time ago every second
  useEffect(() => {
    if (!lastSynced) return;
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastSynced));
    }, 1000);
    setTimeAgo(formatTimeAgo(lastSynced));
    return () => clearInterval(interval);
  }, [lastSynced]);

  return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.headerTop}>
            <h1 style={s.title}>scalper</h1>
            <div style={s.headerRight}>
              {timeAgo && (
                <span style={s.lastUpdated}>{timeAgo}</span>
              )}
              <button
                style={s.syncBtn}
                onClick={syncAll}
                disabled={syncing}
              >
                {syncing ? 'syncing...' : 'sync'}
              </button>
            </div>
          </div>
          {syncError && <div style={s.syncError}>{syncError}</div>}
          <div style={s.heroSection}>
            <div style={{ ...s.heroPnL, color: totalUnrealized >= 0 ? '#080' : '#a00' }}>
              {totalUnrealized >= 0 ? '+' : ''}{fmt(totalUnrealized)}
            </div>
            <div style={s.heroLabel}>unrealized P&L</div>
          </div>
          <div style={s.statsRow}>
            {balance !== null && (
              <>
                <span style={s.statItem}>cash: <b>${fmt(balance)}</b></span>
                <span style={s.statDot}>·</span>
              </>
            )}
            <span style={s.statItem}>realized: <b style={{ color: totalRealized >= 0 ? '#080' : '#a00' }}>${fmt(totalRealized, true)}</b></span>
            <span style={s.statDot}>·</span>
            <span style={s.statItem}>hindsight: <b style={{ color: totalHindsight <= 0 ? '#080' : '#a00' }}>
              {totalHindsight <= 0 ? '↑' : '↓'}${fmt(Math.abs(totalHindsight))}
            </b></span>
          </div>
        </header>

        {/* New Position */}
        <section style={s.section}>
          <div style={s.sectionHead}>log buy</div>
          <div style={s.inputRow}>
            <input
              style={{ ...s.input, flex: 2 }}
              placeholder="market (e.g. Lakers v Celtics)"
              value={newPos.market}
              onChange={e => setNewPos({ ...newPos, market: e.target.value })}
            />
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="side (e.g. Lakers)"
              value={newPos.side}
              onChange={e => setNewPos({ ...newPos, side: e.target.value })}
            />
            <input
              style={{ ...s.input, width: 90 }}
              placeholder="cost $"
              type="number"
              step="0.01"
              value={newPos.cost}
              onChange={e => setNewPos({ ...newPos, cost: e.target.value })}
            />
            <input
              style={{ ...s.input, width: 70 }}
              placeholder="shares"
              type="number"
              step="1"
              value={newPos.shares}
              onChange={e => setNewPos({ ...newPos, shares: e.target.value })}
            />
            <button style={s.btn} onClick={addPosition}>+</button>
          </div>
        </section>

        {/* Open Positions */}
        <section style={s.section}>
          <div style={s.sectionHead}>open positions ({positions.length})</div>
          {positions.length === 0 ? (
            <div style={s.empty}>no open positions</div>
          ) : (
            <div style={s.positionCards}>
              {positions.map(p => {
                // Use marketPrice from API or fall back to currentPrice
                const price = p.marketPrice !== null ? p.marketPrice : p.currentPrice;
                const value = p.shares * price;
                const pnl = value - p.cost;

                return (
                  <div key={p.id} style={s.positionCard}>
                    <div style={s.cardHeader}>
                      <div style={s.cardTitle}>
                        {p.market}
                        {p.synced && <span style={s.syncedBadge}>api</span>}
                      </div>
                      <button
                        style={s.cashOutBtn}
                        onClick={() => {
                          const estimatedProceeds = (p.shares * price).toFixed(2);
                          setClosing(p);
                          setCloseForm({ proceeds: estimatedProceeds, fee: '' });
                        }}
                      >
                        CASH OUT
                      </button>
                    </div>
                    <div style={s.cardSubtitle}>
                      {p.side} · {p.shares} shares @ {(p.entryPrice * 100).toFixed(1)}¢
                    </div>
                    <div style={s.cardHeroSection}>
                      <div style={{ ...s.cardHeroPnL, color: pnl >= 0 ? '#080' : '#a00' }}>
                        {pnl >= 0 ? '+' : '-'}${fmt(Math.abs(pnl))}
                      </div>
                      <div style={{ ...s.cardHeroPct, color: pnl >= 0 ? '#080' : '#a00' }}>
                        ({pct(pnl, p.cost)}%)
                      </div>
                    </div>
                    <div style={s.cardFooterStats}>
                      <span>price: {(price * 100).toFixed(1)}¢</span>
                      <span style={s.footerDot}>·</span>
                      <span>value: ${fmt(value)}</span>
                      <span style={s.footerDot}>·</span>
                      <span>cost: ${fmt(p.cost)}</span>
                    </div>
                    {!p.synced && (
                      <div style={s.cardManualPrice}>
                        <span style={s.metricLabel}>current ¢:</span>
                        <input
                          style={s.priceInput}
                          type="number"
                          step="0.1"
                          value={priceEdits[p.id] !== undefined ? priceEdits[p.id] : (p.currentPrice * 100).toFixed(1)}
                          onChange={e => setPriceEdits({ ...priceEdits, [p.id]: e.target.value })}
                          onBlur={e => {
                            const cents = parseFloat(e.target.value);
                            if (!isNaN(cents)) {
                              updateCurrentPrice(p.id, cents / 100);
                            }
                            setPriceEdits({ ...priceEdits, [p.id]: undefined });
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Close Modal */}
        {closing && (() => {
          const price = closing.marketPrice !== null ? closing.marketPrice : closing.currentPrice;
          const estimatedValue = closing.shares * price;
          const estimatedPnl = estimatedValue - closing.cost;
          return (
            <div style={s.overlay} onClick={() => setClosing(null)}>
              <div style={s.modal} onClick={e => e.stopPropagation()}>
                <div style={s.modalTitle}>Cash Out</div>
                <div style={s.modalSub}>{closing.market}</div>
                <div style={s.modalInfo}>
                  <div>{closing.side} · {closing.shares} shares @ {(closing.entryPrice * 100).toFixed(1)}¢</div>
                  <div style={s.modalInfoRow}>
                    <span>Cost: ${fmt(closing.cost)}</span>
                    <span style={{ color: estimatedPnl >= 0 ? '#080' : '#a00', fontWeight: 600 }}>
                      Est. P&L: {estimatedPnl >= 0 ? '+' : ''}${fmt(estimatedPnl)}
                    </span>
                  </div>
                </div>
                <div style={s.modalRow}>
                  <label style={s.modalLabel}>actual proceeds $ (pre-filled from market price)</label>
                  <input
                    style={s.modalInput}
                    type="number"
                    step="0.01"
                    value={closeForm.proceeds}
                    onChange={e => setCloseForm({ ...closeForm, proceeds: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') closePosition();
                    }}
                    autoFocus
                  />
                </div>
                <div style={s.modalRow}>
                  <label style={s.modalLabel}>fee $ (optional)</label>
                  <input
                    style={s.modalInput}
                    type="number"
                    step="0.01"
                    value={closeForm.fee}
                    onChange={e => setCloseForm({ ...closeForm, fee: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') closePosition();
                    }}
                  />
                </div>
                <div style={s.modalActions}>
                  <button style={s.btnCancel} onClick={() => setClosing(null)}>cancel</button>
                  <button style={s.btnConfirm} onClick={closePosition}>confirm</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* History */}
        <section style={s.section}>
          <div style={s.sectionHead}>history ({history.length})</div>
          {history.length === 0 ? (
            <div style={s.empty}>no closed trades</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>market</th>
                  <th style={s.th}>side</th>
                  <th style={s.thR}>cost</th>
                  <th style={s.thR}>proceeds</th>
                  <th style={s.thR}>p&l</th>
                  <th style={s.th}>hindsight</th>
                </tr>
              </thead>
              <tbody>
                {history.map(t => (
                  <tr key={t.id} style={s.tr}>
                    <td style={s.td}>{t.market}</td>
                    <td style={s.td}>{t.side}</td>
                    <td style={s.tdR}>${fmt(t.cost)}</td>
                    <td style={s.tdR}>${fmt(t.netProceeds)}</td>
                    <td style={{ ...s.tdR, color: t.realizedPnL >= 0 ? '#080' : '#a00', fontWeight: 600 }}>
                      ${fmt(t.realizedPnL, true)}
                    </td>
                    <td style={s.td}>
                      {!t.resolved ? (
                        <span style={s.hindsightBtns}>
                          <button style={s.btnTiny} onClick={() => markResolved(t.id, true)} title="would have won">✓</button>
                          <button style={{ ...s.btnTiny, borderColor: '#a00', color: '#a00' }} onClick={() => markResolved(t.id, false)} title="would have lost">✗</button>
                        </span>
                      ) : (
                        <span style={{ color: t.hindsightDiff <= 0 ? '#080' : '#a00' }}>
                          {t.hindsightDiff <= 0
                            ? `saved $${fmt(Math.abs(t.hindsightDiff))}`
                            : `left $${fmt(t.hindsightDiff)}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer style={s.footer}>
          v0.4 · data in localStorage · tap sync to fetch from polymarket
        </footer>
      </div>
    </div>
  );
};

const s = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f0',
    fontFamily: '"IBM Plex Mono", "SF Mono", "Consolas", monospace',
    fontSize: 13,
    color: '#222',
    padding: 16,
  },
  container: {
    maxWidth: 600,
    margin: '0 auto',
  },
  header: {
    borderBottom: '2px solid #222',
    paddingBottom: 16,
    marginBottom: 24,
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  lastUpdated: {
    fontSize: 11,
    color: '#999',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 400,
    letterSpacing: 2,
  },
  syncBtn: {
    padding: '10px 20px',
    border: '1px solid #222',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    minHeight: 44,
  },
  syncError: {
    marginTop: 8,
    padding: '8px 12px',
    background: '#fee',
    border: '1px solid #a00',
    color: '#a00',
    fontSize: 11,
  },
  heroSection: {
    textAlign: 'center',
    padding: '20px 0',
  },
  heroPnL: {
    fontSize: 42,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    fontSize: 12,
    color: '#666',
  },
  statItem: {
    whiteSpace: 'nowrap',
  },
  statDot: {
    color: '#999',
    margin: '0 4px',
  },
  syncedBadge: {
    marginLeft: 6,
    padding: '2px 5px',
    background: '#e0e0d8',
    fontSize: 9,
    color: '#888',
    verticalAlign: 'middle',
  },
  section: {
    marginBottom: 32,
  },
  sectionHead: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#666',
    marginBottom: 12,
    borderBottom: '1px solid #ccc',
    paddingBottom: 4,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  input: {
    padding: '12px 10px',
    border: '1px solid #999',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    outline: 'none',
    minHeight: 44,
  },
  btn: {
    padding: '12px 20px',
    border: '1px solid #222',
    background: '#222',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 44,
  },
  btnSmall: {
    padding: '8px 14px',
    border: '1px solid #666',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    minHeight: 44,
  },
  btnTiny: {
    padding: '8px 12px',
    border: '1px solid #080',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 12,
    color: '#080',
    cursor: 'pointer',
    minHeight: 44,
  },
  btnCancel: {
    padding: '12px 20px',
    border: '1px solid #999',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 44,
    flex: 1,
  },
  btnConfirm: {
    padding: '12px 20px',
    border: '1px solid #222',
    background: '#222',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 44,
    flex: 1,
  },
  // Position cards
  positionCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  positionCard: {
    border: '1px solid #ccc',
    background: '#fff',
    padding: 16,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.3,
    flex: 1,
  },
  cashOutBtn: {
    padding: '10px 16px',
    border: '1px solid #222',
    background: '#222',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
    whiteSpace: 'nowrap',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  cardHeroSection: {
    textAlign: 'center',
    padding: '16px 0',
  },
  cardHeroPnL: {
    fontSize: 36,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: -1,
    lineHeight: 1,
  },
  cardHeroPct: {
    fontSize: 16,
    fontWeight: 500,
    marginTop: 4,
    fontVariantNumeric: 'tabular-nums',
  },
  cardFooterStats: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    fontSize: 11,
    color: '#888',
    paddingTop: 12,
    borderTop: '1px solid #eee',
  },
  footerDot: {
    color: '#ccc',
    margin: '0 4px',
  },
  cardMetrics: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  metricGroup: {
    display: 'flex',
    gap: 6,
    alignItems: 'baseline',
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  pnlValue: {
    fontSize: 16,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  cardSpread: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #eee',
  },
  cardManualPrice: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #eee',
  },
  // Table styles (for history)
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '8px 6px',
    borderBottom: '1px solid #999',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
    fontWeight: 500,
  },
  thR: {
    textAlign: 'right',
    padding: '8px 6px',
    borderBottom: '1px solid #999',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
    fontWeight: 500,
  },
  tr: {
    borderBottom: '1px solid #ddd',
  },
  td: {
    padding: '10px 6px',
    verticalAlign: 'middle',
  },
  tdR: {
    padding: '10px 6px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  priceInput: {
    width: 70,
    padding: '8px 10px',
    border: '1px solid #ccc',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    textAlign: 'right',
    minHeight: 40,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: '#fff',
    border: '2px solid #222',
    padding: 24,
    width: 360,
    maxWidth: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
  },
  modalInfo: {
    fontSize: 12,
    background: '#f0f0e8',
    padding: 12,
    marginBottom: 20,
  },
  modalInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalRow: {
    marginBottom: 16,
  },
  modalLabel: {
    display: 'block',
    fontSize: 11,
    color: '#666',
    marginBottom: 6,
  },
  modalInput: {
    width: '100%',
    padding: '12px 10px',
    border: '1px solid #999',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 16,
    outline: 'none',
    minHeight: 48,
  },
  modalActions: {
    display: 'flex',
    gap: 12,
    marginTop: 24,
  },
  hindsightBtns: {
    display: 'flex',
    gap: 8,
  },
  footer: {
    textAlign: 'center',
    padding: 24,
    color: '#999',
    fontSize: 11,
  },
};

export default ScalpingDashboard;
