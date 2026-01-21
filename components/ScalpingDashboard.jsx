'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { usePolymarketWebSocket } from '@/hooks/usePolymarketWebSocket';
import { getTeamColor } from '@/lib/teamColors';

// Inline sparkline component - shows recent price trajectory
const Sparkline = ({ data, currentValue, entryValue, color = '#222', width = 200, height = 40 }) => {
  if (!data || data.length < 2) {
    // Placeholder when no data
    return (
      <div style={{
        width,
        height,
        background: '#fafaf8',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 10, color: '#999' }}>waiting for data...</span>
      </div>
    );
  }

  // Get last N points (or all if fewer)
  const points = data.slice(-30);
  const prices = points.map(p => p.price);
  const min = Math.min(...prices, entryValue || Infinity);
  const max = Math.max(...prices, entryValue || -Infinity);
  const range = max - min || 0.01;

  // Add padding to range
  const padding = range * 0.1;
  const displayMin = min - padding;
  const displayMax = max + padding;
  const displayRange = displayMax - displayMin;

  // Build SVG path
  const pathPoints = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.price - displayMin) / displayRange) * height;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Current price dot position
  const currentY = height - ((currentValue - displayMin) / displayRange) * height;

  // Entry line position
  const entryY = entryValue ? height - ((entryValue - displayMin) / displayRange) * height : null;

  return (
    <svg width={width} height={height} style={{ display: 'block', background: '#fafaf8', borderRadius: 4 }}>
      {/* Entry reference line - more visible */}
      {entryY !== null && (
        <line
          x1={0}
          y1={entryY}
          x2={width}
          y2={entryY}
          stroke="#666"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      )}
      {/* Price line - thicker */}
      <path
        d={pathPoints}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current price dot - larger */}
      <circle
        cx={width}
        cy={currentY}
        r={5}
        fill={color}
      />
      {/* Entry price dot */}
      {entryY !== null && (
        <circle
          cx={0}
          cy={entryY}
          r={3}
          fill="#666"
        />
      )}
    </svg>
  );
};

// Momentum indicator - shows if price is trending up/down recently
const MomentumIndicator = ({ priceHistory }) => {
  if (!priceHistory || priceHistory.length < 3) return null;

  // Compare last 5 points (or fewer if not available)
  const recent = priceHistory.slice(-5);
  if (recent.length < 2) return null;

  const oldest = recent[0].price;
  const newest = recent[recent.length - 1].price;
  const change = ((newest - oldest) / oldest) * 100;

  // Ignore tiny changes (noise)
  if (Math.abs(change) < 0.3) return null;

  const isUp = change > 0;

  return (
    <span style={{
      color: isUp ? '#16a34a' : '#dc2626',
      fontSize: 12,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      background: isUp ? '#dcfce7' : '#fee2e2',
      padding: '2px 6px',
      borderRadius: 2,
    }}>
      {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
    </span>
  );
};

// Quick exit targets - show prices needed for various profit levels
const ExitTargets = ({ entryPrice, shares, cost }) => {
  // Calculate prices for +5%, +10%, +20% profit
  const targets = [5, 10, 20].map(pct => {
    const targetValue = cost * (1 + pct / 100);
    const targetPrice = targetValue / shares;
    return { pct, price: targetPrice };
  }).filter(t => t.price <= 1); // Filter out impossible prices (>100¢)

  if (targets.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 12,
      fontSize: 10,
      color: '#666',
      marginBottom: 8,
    }}>
      {targets.map(t => (
        <span key={t.pct} style={{
          background: '#f5f5f0',
          padding: '3px 8px',
          borderRadius: 2,
        }}>
          +{t.pct}% @ {(t.price * 100).toFixed(0)}¢
        </span>
      ))}
    </div>
  );
};

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
  const [autoSyncCountdown, setAutoSyncCountdown] = useState(30);

  // Price history: { slug: { sideName: [{ time, price }, ...], ... }, ... }
  const [priceHistory, setPriceHistory] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('scalper-price-history');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Score history: { slug: [{ time, score, period, elapsed }, ...], ... }
  const [scoreHistory, setScoreHistory] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('scalper-score-history');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Watched markets (continue tracking after cash-out)
  const [watchedMarkets, setWatchedMarkets] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('scalper-watched-markets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Event data (scores, periods) by slug
  const [eventData, setEventData] = useState({});

  // Track previous prices for flash effect
  const [prevPrices, setPrevPrices] = useState({});
  const [priceFlash, setPriceFlash] = useState({}); // { positionId: 'up' | 'down' | null }

  // Track which charts are expanded
  const [expandedCharts, setExpandedCharts] = useState({});

  // Calculate slugs for WebSocket subscription
  const allSlugs = useMemo(() => {
    const positionSlugs = positions
      .filter(p => p.synced && p.id)
      .map(p => p.id);
    const watchedSlugs = watchedMarkets.map(w => w.slug);
    return [...new Set([...positionSlugs, ...watchedSlugs])];
  }, [positions, watchedMarkets]);

  // WebSocket hook for real-time updates
  const {
    prices: wsPrices,
    events: wsEvents,
    connected: wsConnected,
    error: wsError,
    connect: wsConnect,
    disconnect: wsDisconnect,
    updateSubscription
  } = usePolymarketWebSocket(allSlugs, pin);

  // Connect WebSocket after initial data is available
  useEffect(() => {
    if (allSlugs.length > 0 && !wsConnected) {
      wsConnect();
    }
  }, [allSlugs.length > 0]); // Only trigger on first having slugs

  // Update subscription when slugs change
  useEffect(() => {
    if (wsConnected && allSlugs.length > 0) {
      updateSubscription(allSlugs);
    }
  }, [allSlugs.join(','), wsConnected, updateSubscription]);

  // Merge WebSocket prices into price history
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0) return;

    const now = Date.now();
    setPriceHistory(prev => {
      const updated = { ...prev };
      for (const [slug, priceData] of Object.entries(wsPrices)) {
        if (!priceData.sides) continue;
        if (!updated[slug]) {
          updated[slug] = {};
        }
        for (const [side, price] of Object.entries(priceData.sides)) {
          if (price === null || price === undefined) continue;
          if (!updated[slug][side]) {
            updated[slug][side] = [];
          }
          // Only add if price changed or it's been more than 5 seconds (faster for WS)
          const lastPoint = updated[slug][side][updated[slug][side].length - 1];
          if (!lastPoint || lastPoint.price !== price || now - lastPoint.time > 5000) {
            updated[slug][side] = [
              ...updated[slug][side],
              { time: now, price }
            ].slice(-500); // Keep last 500 points
          }
        }
      }
      return updated;
    });
  }, [wsPrices]);

  // Merge WebSocket events into event data and score history
  useEffect(() => {
    if (Object.keys(wsEvents).length === 0) return;

    // Update event data
    setEventData(prev => ({ ...prev, ...wsEvents }));

    // Update score history
    const now = Date.now();
    setScoreHistory(prev => {
      const updated = { ...prev };
      for (const [slug, eventInfo] of Object.entries(wsEvents)) {
        if (!eventInfo.score) continue;
        // Parse score (e.g., "3 - 2" -> { home: 3, away: 2 })
        const scoreMatch = eventInfo.score.match(/(\d+)\s*-\s*(\d+)/);
        if (!scoreMatch) continue;
        const home = parseInt(scoreMatch[1], 10);
        const away = parseInt(scoreMatch[2], 10);
        if (!updated[slug]) {
          updated[slug] = [];
        }
        // Only add if score changed or it's been more than 15 seconds (faster for WS)
        const lastPoint = updated[slug][updated[slug].length - 1];
        if (!lastPoint || lastPoint.home !== home || lastPoint.away !== away || now - lastPoint.time > 15000) {
          updated[slug] = [
            ...updated[slug],
            {
              time: now,
              home,
              away,
              period: eventInfo.period || null,
              elapsed: eventInfo.elapsed || null,
            }
          ].slice(-500); // Keep last 500 points
        }
      }
      return updated;
    });
  }, [wsEvents]);

  // Track price changes for flash effect
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0 || positions.length === 0) return;

    positions.forEach(p => {
      // Inline price calculation (same logic as getLivePositionData)
      const wsData = wsPrices[p.id];
      let livePrice = null;
      if (wsData) {
        if (wsData.sides && wsData.sides[p.side] !== undefined) {
          livePrice = wsData.sides[p.side];
        } else if (wsData.currentPx !== undefined) {
          const current = wsData.currentPx;
          const opposite = 1 - current;
          const refPrice = p.marketPrice || p.currentPrice || 0.5;
          livePrice = Math.abs(current - refPrice) < Math.abs(opposite - refPrice) ? current : opposite;
        }
      }
      const price = livePrice !== null ? livePrice : p.currentPrice;
      const prevPrice = prevPrices[p.id];

      if (prevPrice !== undefined && price !== prevPrice) {
        const direction = price > prevPrice ? 'up' : 'down';
        setPriceFlash(prev => ({ ...prev, [p.id]: direction }));

        // Clear flash after animation
        setTimeout(() => {
          setPriceFlash(prev => ({ ...prev, [p.id]: null }));
        }, 500);
      }

      setPrevPrices(prev => ({ ...prev, [p.id]: price }));
    });
  }, [wsPrices]); // Trigger on WebSocket price updates

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Limit price history to last 500 points per side to avoid storage bloat
      const trimmedHistory = {};
      for (const [slug, sides] of Object.entries(priceHistory)) {
        trimmedHistory[slug] = {};
        for (const [side, points] of Object.entries(sides)) {
          trimmedHistory[slug][side] = points.slice(-500);
        }
      }
      localStorage.setItem('scalper-price-history', JSON.stringify(trimmedHistory));
    }
  }, [priceHistory]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Limit score history to last 500 points per market to avoid storage bloat
      const trimmedHistory = {};
      for (const [slug, points] of Object.entries(scoreHistory)) {
        trimmedHistory[slug] = points.slice(-500);
      }
      localStorage.setItem('scalper-score-history', JSON.stringify(trimmedHistory));
    }
  }, [scoreHistory]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('scalper-watched-markets', JSON.stringify(watchedMarkets));
    }
  }, [watchedMarkets]);

  // Ref to track syncing state for auto-sync interval (avoids stale closure)
  const syncingRef = useRef(syncing);
  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  // Auto-sync positions every 30 seconds
  useEffect(() => {
    if (!pin) return;

    const interval = setInterval(async () => {
      console.log('Auto-sync triggered');

      // Call the sync API directly instead of using handleSync
      // to avoid stale closure issues
      try {
        const res = await fetch(`/api/positions?pin=${pin}`);
        if (res.ok) {
          const data = await res.json();
          if (data.positions) {
            // Transform and update positions
            const synced = Object.entries(data.positions).map(([slug, pos]) => {
              const shares = Math.abs(parseFloat(pos.netPosition));
              const cost = parseFloat(pos.cost?.value || 0);
              return {
                id: slug,
                market: pos.marketMetadata?.title || slug,
                side: pos.marketMetadata?.outcome || 'Unknown',
                shares: shares,
                cost: cost,
                // FIX: Calculate entryPrice explicitly to prevent NaN
                entryPrice: shares > 0 ? cost / shares : 0,
                currentPrice: parseFloat(pos.cashValue?.value || 0) / shares,
                currentValue: parseFloat(pos.cashValue?.value || 0),
                synced: true,
                slug: slug,
              };
            });
            setPositions(synced);
            console.log('Auto-sync complete:', synced.length, 'positions');
          }
        }
      } catch (err) {
        console.error('Auto-sync failed:', err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [pin]);

  // Countdown timer for auto-sync (updates every second)
  useEffect(() => {
    if (!pin) return;

    const interval = setInterval(() => {
      setAutoSyncCountdown(prev => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pin]);

  // Reset countdown when sync completes
  useEffect(() => {
    if (!syncing) {
      setAutoSyncCountdown(30);
    }
  }, [syncing]);

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

  // Update price history with new prices
  const updatePriceHistory = (prices) => {
    const now = Date.now();
    setPriceHistory(prev => {
      const updated = { ...prev };
      for (const [slug, priceData] of Object.entries(prices)) {
        if (!priceData.sides) continue;
        if (!updated[slug]) {
          updated[slug] = {};
        }
        for (const [side, price] of Object.entries(priceData.sides)) {
          if (price === null || price === undefined) continue;
          if (!updated[slug][side]) {
            updated[slug][side] = [];
          }
          // Only add if price changed or it's been more than 10 seconds
          const lastPoint = updated[slug][side][updated[slug][side].length - 1];
          if (!lastPoint || lastPoint.price !== price || now - lastPoint.time > 10000) {
            updated[slug][side].push({ time: now, price });
          }
        }
      }
      return updated;
    });

    // Update event data
    const newEventData = {};
    for (const [slug, priceData] of Object.entries(prices)) {
      if (priceData.event) {
        newEventData[slug] = priceData.event;
      }
    }
    setEventData(prev => ({ ...prev, ...newEventData }));

    // Update score history
    setScoreHistory(prev => {
      const updated = { ...prev };
      for (const [slug, priceData] of Object.entries(prices)) {
        if (!priceData.event || !priceData.event.score) continue;
        if (!updated[slug]) {
          updated[slug] = [];
        }
        // Parse score (e.g., "3 - 2" -> { home: 3, away: 2 })
        const scoreMatch = priceData.event.score.match(/(\d+)\s*-\s*(\d+)/);
        if (!scoreMatch) continue;
        const home = parseInt(scoreMatch[1], 10);
        const away = parseInt(scoreMatch[2], 10);
        // Only add if score changed or it's been more than 30 seconds
        const lastPoint = updated[slug][updated[slug].length - 1];
        if (!lastPoint || lastPoint.home !== home || lastPoint.away !== away || now - lastPoint.time > 30000) {
          updated[slug].push({
            time: now,
            home,
            away,
            period: priceData.event.period || null,
            elapsed: priceData.event.elapsed || null,
          });
        }
      }
      return updated;
    });

    // Check for ended events and remove from watched list after 5 minutes
    const endedSlugs = Object.entries(newEventData)
      .filter(([, ev]) => ev.ended)
      .map(([slug]) => slug);
    if (endedSlugs.length > 0) {
      const currentTime = Date.now();
      setWatchedMarkets(prev => prev.filter(w => {
        if (!endedSlugs.includes(w.slug)) return true;
        // Keep for 5 more minutes after game ends, then auto-remove
        const endedAgo = currentTime - (newEventData[w.slug]?.endTime || currentTime);
        return endedAgo < 5 * 60 * 1000;
      }));
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

      // Fetch market prices for all synced positions + watched markets
      const positionSlugs = transformed.map(p => p.id);
      const watchedSlugs = watchedMarkets.map(w => w.slug);
      const allSlugs = [...new Set([...positionSlugs, ...watchedSlugs])];
      const prices = await fetchPrices(allSlugs);

      // Update price history and event data
      updatePriceHistory(prices);

      // Update positions with market price data (for display only)
      // Match position's side (e.g., "Minutemen") to get the correct price
      // Note: marketPrice is informational only - P&L uses cashValue from API
      const withPrices = transformed.map(p => {
        const priceData = prices[p.id];
        if (priceData && priceData.sides) {
          const sidePrice = priceData.sides[p.side];
          if (sidePrice !== null && sidePrice !== undefined) {
            return {
              ...p,
              marketPrice: sidePrice,
              // Don't overwrite currentPrice - keep it derived from cashValue
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

    // Try to reconnect WebSocket if disconnected
    if (!wsConnected && allSlugs.length > 0) {
      wsConnect();
    }
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
      closedAtTime: Date.now(), // For marking on the chart
    };

    setHistory([trade, ...history]);
    setPositions(positions.filter(p => p.id !== closing.id));

    // Add to watched markets to continue tracking prices (if synced position)
    if (closing.synced && closing.id) {
      const watchEntry = {
        slug: closing.id,
        side: closing.side,
        exitPrice: closing.marketPrice || closing.currentPrice,
        exitTime: Date.now(),
        shares: closing.shares,
        cost: closing.cost,
        exitValue: netProceeds,
        pnl: netProceeds - closing.cost,
        market: closing.market, // Store market name for display
      };
      setWatchedMarkets(prev => {
        // Don't duplicate
        if (prev.some(w => w.slug === closing.id)) return prev;
        return [...prev, watchEntry];
      });
    }

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

  // Helper: Get absolute latest price from WebSocket, falling back to API snapshot
  const getLivePositionData = (p) => {
    const wsData = wsPrices[p.id];
    let livePrice = null;

    if (wsData) {
      // 1. Try exact side match
      if (wsData.sides && wsData.sides[p.side] !== undefined) {
        livePrice = wsData.sides[p.side];
      }
      // 2. Fallback: Infer from currentPx (binary market logic)
      else if (wsData.currentPx !== undefined) {
        const current = wsData.currentPx;
        const opposite = 1 - current;
        // Heuristic: Use whichever price is closer to our last known price
        const refPrice = p.marketPrice || p.currentPrice || 0.5;
        livePrice = Math.abs(current - refPrice) < Math.abs(opposite - refPrice) ? current : opposite;
      }
    }

    // Use live WS price if available, otherwise fallback to API snapshot
    const finalPrice = livePrice !== null ? livePrice : p.currentPrice;
    const value = p.shares * finalPrice;

    return { value, price: finalPrice };
  };

  const totalUnrealized = positions.reduce((sum, p) => {
    const { value } = getLivePositionData(p);
    return sum + (value - p.cost);
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

  // Format time for chart X-axis
  const formatChartTime = (timestamp) => {
    const date = new Date(timestamp);
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Toggle chart expansion (expands/collapses both charts together)
  const toggleChart = (id) => {
    setExpandedCharts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Build chart data for a market
  const buildChartData = (slug, highlightSide = null) => {
    const history = priceHistory[slug];
    if (!history) return { data: [], sides: [] };

    const sides = Object.keys(history);
    if (sides.length === 0) return { data: [], sides: [] };

    // Get all unique timestamps and sort them
    const allTimestamps = new Set();
    for (const sideHistory of Object.values(history)) {
      for (const point of sideHistory) {
        allTimestamps.add(point.time);
      }
    }
    const sortedTimes = [...allTimestamps].sort((a, b) => a - b);

    // Build data array with all sides
    const data = sortedTimes.map(time => {
      const point = { time };
      for (const [side, sideHistory] of Object.entries(history)) {
        // Find the closest price at or before this time
        const pricePoint = [...sideHistory].reverse().find(p => p.time <= time);
        if (pricePoint) {
          point[side] = Math.round(pricePoint.price * 100); // Convert to cents
        }
      }
      return point;
    });

    return { data, sides, highlightSide };
  };

  // Price chart component
  const PriceChart = ({ slug, highlightSide, closedAtTime = null }) => {
    const { data, sides } = buildChartData(slug, highlightSide);

    if (data.length < 2) {
      return (
        <div style={s.chartEmpty}>
          Not enough data yet. Keep syncing!
        </div>
      );
    }

    // Use actual team colors
    const getLineColor = (side) => getTeamColor(side);
    const getLineWidth = (side) => side === highlightSide ? 3 : 1.5;

    return (
      <div style={s.chartContainer}>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tickFormatter={formatChartTime}
              tick={{ fontSize: 10, fill: '#888' }}
              axisLine={{ stroke: '#ddd' }}
              tickLine={false}
            />
            <YAxis
              domain={['dataMin - 5', 'dataMax + 5']}
              tick={{ fontSize: 10, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}¢`}
            />
            <Tooltip
              formatter={(value, name) => [`${value}¢`, name]}
              labelFormatter={(ts) => new Date(ts).toLocaleTimeString()}
              contentStyle={{ fontSize: 11, border: '1px solid #ccc', background: '#fff' }}
            />
            {closedAtTime && (
              <ReferenceLine
                x={closedAtTime}
                stroke="#dc2626"
                strokeDasharray="3 3"
                label={{ value: 'exit', fontSize: 10, fill: '#dc2626' }}
              />
            )}
            {sides.map(side => (
              <Line
                key={side}
                type="monotone"
                dataKey={side}
                stroke={getLineColor(side)}
                strokeWidth={getLineWidth(side)}
                strokeOpacity={side === highlightSide ? 1 : 0.4}
                dot={false}
                name={side}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div style={s.chartLegend}>
          {sides.map(side => (
            <span key={side} style={{
              ...s.legendItem,
              fontWeight: side === highlightSide ? 600 : 400,
              opacity: side === highlightSide ? 1 : 0.6,
            }}>
              <span style={{ ...s.legendDot, background: getLineColor(side) }} />
              {side}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // Build score chart data for a market
  const buildScoreChartData = (slug) => {
    const history = scoreHistory[slug];
    if (!history || history.length < 2) return { data: [], hasData: false };

    // Transform score history into chart data
    const data = history.map(point => ({
      time: point.time,
      Home: point.home,
      Away: point.away,
    }));

    return { data, hasData: true };
  };

  // Score chart component
  const ScoreChart = ({ slug, closedAtTime = null }) => {
    const { data, hasData } = buildScoreChartData(slug);

    if (!hasData) {
      return (
        <div style={s.chartEmpty}>
          Not enough score data yet. Keep syncing!
        </div>
      );
    }

    return (
      <div style={s.chartContainer}>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tickFormatter={formatChartTime}
              tick={{ fontSize: 10, fill: '#888' }}
              axisLine={{ stroke: '#ddd' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 10, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(value, name) => [value, name]}
              labelFormatter={(ts) => new Date(ts).toLocaleTimeString()}
              contentStyle={{ fontSize: 11, border: '1px solid #ccc', background: '#fff' }}
            />
            {closedAtTime && (
              <ReferenceLine
                x={closedAtTime}
                stroke="#a00"
                strokeDasharray="3 3"
                label={{ value: 'sold', fontSize: 10, fill: '#a00' }}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="Home"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="Away"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div style={s.chartLegend}>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: '#2563eb' }} />
            Home
          </span>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: '#dc2626' }} />
            Away
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.headerTop}>
            <h1 style={s.title}>scalper</h1>
            <div style={s.headerRight}>
              {wsConnected && <span style={s.wsConnected}>● live</span>}
              <button style={s.syncBtn} onClick={syncAll} disabled={syncing}>
                {syncing ? '...' : 'sync'}
              </button>
            </div>
          </div>
          {syncError && <div style={s.syncError}>{syncError}</div>}
          {/* Compact stats row - all on one line */}
          <div style={s.compactStats}>
            <span>
              open: <b style={{ color: totalUnrealized >= 0 ? '#16a34a' : '#dc2626' }}>
                {totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)}
              </b>
            </span>
            <span style={s.statDot}>·</span>
            <span>
              realized: <b style={{ color: totalRealized >= 0 ? '#16a34a' : '#dc2626' }}>
                {totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}
              </b>
            </span>
            {balance !== null && (
              <>
                <span style={s.statDot}>·</span>
                <span>cash: <b>${balance.toFixed(2)}</b></span>
              </>
            )}
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
                const { value, price } = getLivePositionData(p);
                const pnl = value - p.cost;
                const pnlPct = p.cost > 0 ? (pnl / p.cost) * 100 : 0;
                const event = eventData[p.id];
                const isLive = event?.live;
                const isEnded = event?.ended;

                // Get price history for sparkline
                const sidePriceHistory = priceHistory[p.id]?.[p.side] || [];
                const teamColor = getTeamColor(p.side);

                // Calculate price range for display
                const prices = sidePriceHistory.map(pt => pt.price);
                const minPrice = prices.length > 0 ? Math.min(...prices) : price;
                const maxPrice = prices.length > 0 ? Math.max(...prices) : price;

                return (
                  <div key={p.id} style={s.posCard}>
                    {/* Header: Side name + momentum + sell */}
                    <div style={s.posHeader}>
                      <div style={s.posHeaderLeft}>
                        <span style={{ ...s.posSideName, color: teamColor }}>
                          {p.side.toUpperCase()}
                        </span>
                        <MomentumIndicator priceHistory={sidePriceHistory} />
                        {isLive && <span style={s.liveDot}>●</span>}
                        {isEnded && <span style={s.finalBadge}>FINAL</span>}
                      </div>
                      <button
                        style={s.sellBtn}
                        onClick={() => {
                          setClosing(p);
                          setCloseForm({ proceeds: value.toFixed(2), fee: '' });
                        }}
                      >
                        SELL
                      </button>
                    </div>

                    {/* Subtitle */}
                    <div style={s.posSubtitle}>
                      {p.market} · {p.shares} shares @ {(p.entryPrice * 100).toFixed(1)}¢
                    </div>

                    {/* Hero: Current price */}
                    <div
                      style={s.priceHero}
                      className={priceFlash[p.id] === 'up' ? 'price-flash-up' : priceFlash[p.id] === 'down' ? 'price-flash-down' : ''}
                    >
                      <span style={s.priceValue}>{(price * 100).toFixed(1)}¢</span>
                    </div>

                    {/* Sparkline with range labels */}
                    <div style={s.sparklineRow}>
                      <span style={s.rangeLabel}>{(minPrice * 100).toFixed(0)}¢</span>
                      <Sparkline
                        data={sidePriceHistory}
                        currentValue={price}
                        entryValue={p.entryPrice}
                        color={teamColor}
                        width={180}
                        height={28}
                      />
                      <span style={s.rangeLabel}>{(maxPrice * 100).toFixed(0)}¢</span>
                    </div>

                    {/* Score */}
                    {event?.score && (
                      <div style={s.scoreSection}>
                        <div style={s.scoreValue}>{event.score}</div>
                        {event.period && (
                          <div style={s.scorePeriod}>
                            {isEnded ? 'FINAL' : `${event.period}${event.elapsed ? ` · ${event.elapsed}` : ''}`}
                          </div>
                        )}
                      </div>
                    )}

                    {/* P&L badge */}
                    <div style={{
                      ...s.pnlBadge,
                      background: pnl >= 0 ? '#dcfce7' : '#fee2e2',
                      color: pnl >= 0 ? '#166534' : '#991b1b',
                    }}>
                      {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% · {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>

                    {/* Exit targets */}
                    <ExitTargets entryPrice={p.entryPrice} shares={p.shares} cost={p.cost} />

                    {/* Footer stats */}
                    <div style={s.posFooter}>
                      value ${value.toFixed(2)} · cost ${p.cost.toFixed(2)}
                    </div>

                    {/* Expandable charts */}
                    {p.synced && (
                      <button
                        style={s.expandBtn}
                        onClick={() => toggleChart(p.id)}
                      >
                        {expandedCharts[p.id] ? '− hide charts' : '+ show charts'}
                      </button>
                    )}

                    {p.synced && expandedCharts[p.id] && (
                      <div style={s.chartsStack}>
                        <div style={s.chartBlock}>
                          <div style={s.chartLabel}>PRICE</div>
                          <PriceChart slug={p.id} highlightSide={p.side} />
                        </div>
                        {scoreHistory[p.id]?.length >= 2 && (
                          <div style={s.chartBlock}>
                            <div style={s.chartLabel}>SCORE</div>
                            <ScoreChart slug={p.id} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual price input for non-synced positions */}
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
          // For synced positions: use cashValue (currentValue) from API
          // For manual positions: fall back to shares * currentPrice
          const estimatedValue = closing.synced && closing.currentValue !== undefined
            ? closing.currentValue
            : closing.shares * closing.currentPrice;
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
                  <label style={s.modalLabel}>actual proceeds $ (pre-filled from position value)</label>
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

        {/* Recently Closed - Continue tracking after cash-out */}
        {watchedMarkets.length > 0 && (
          <section style={s.section}>
            <div style={s.sectionHead}>recently closed ({watchedMarkets.length})</div>
            <div style={s.positionCards}>
              {watchedMarkets.map(watched => {
                const event = eventData[watched.slug];
                const isLive = event?.live;
                const isEnded = event?.ended;

                // Get current price for this side
                const currentPriceData = priceHistory[watched.slug]?.[watched.side];
                const latestPrice = currentPriceData?.length > 0
                  ? currentPriceData[currentPriceData.length - 1].price
                  : watched.exitPrice;

                // Calculate what the position would be worth now
                const wouldBeValue = watched.shares * latestPrice;
                const wouldBePnl = wouldBeValue - watched.cost;

                // Hindsight: difference between what you would have vs what you got
                const hindsightDiff = wouldBePnl - watched.pnl;

                const hasPriceChart = priceHistory[watched.slug] && Object.keys(priceHistory[watched.slug]).length > 0;
                const hasScoreChart = scoreHistory[watched.slug] && scoreHistory[watched.slug].length >= 2;
                const hasAnyChart = hasPriceChart || hasScoreChart;

                // Function to dismiss a watched market
                const dismissWatched = (slug) => {
                  setWatchedMarkets(prev => prev.filter(w => w.slug !== slug));
                };

                return (
                  <div key={watched.slug} style={s.closedCard}>
                    <div style={s.cardHeader}>
                      <div style={s.cardTitle}>
                        {watched.market}
                        <span style={s.closedBadge}>CLOSED</span>
                        {isLive && <span style={s.liveBadge}>LIVE</span>}
                        {isEnded && <span style={s.endedBadge}>FINAL</span>}
                      </div>
                      <button
                        style={s.dismissBtn}
                        onClick={() => dismissWatched(watched.slug)}
                        title="Stop watching"
                      >
                        ×
                      </button>
                    </div>
                    <div style={s.cardSubtitle}>
                      {watched.side} · was {watched.shares} shares
                    </div>

                    {/* Live Score Display */}
                    {event && event.score && (
                      <div style={s.scoreDisplay}>
                        <span style={s.scoreText}>{event.score}</span>
                        {event.period && (
                          <>
                            <span style={s.scoreDot}>·</span>
                            <span style={s.periodText}>
                              {isEnded ? 'FINAL' : `${event.period} ${event.elapsed || ''}`}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Hindsight Comparison */}
                    <div style={s.hindsightSection}>
                      <div style={s.hindsightRow}>
                        <span style={s.hindsightLabel}>You exited:</span>
                        <span style={{ ...s.hindsightValue, color: watched.pnl >= 0 ? '#080' : '#a00' }}>
                          {watched.pnl >= 0 ? '+' : ''}${fmt(watched.pnl)} @ {(watched.exitPrice * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div style={s.hindsightRow}>
                        <span style={s.hindsightLabel}>If you held:</span>
                        <span style={{ ...s.hindsightValue, color: wouldBePnl >= 0 ? '#080' : '#a00' }}>
                          {wouldBePnl >= 0 ? '+' : ''}${fmt(wouldBePnl)} @ {(latestPrice * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div style={{ ...s.hindsightSummaryBox, background: hindsightDiff > 0 ? '#fff5f5' : '#f5fff5' }}>
                        {hindsightDiff > 0 ? (
                          <span style={{ color: '#a00' }}>
                            Left ${fmt(hindsightDiff)} on the table
                          </span>
                        ) : hindsightDiff < 0 ? (
                          <span style={{ color: '#080' }}>
                            Good exit! Saved ${fmt(Math.abs(hindsightDiff))}
                          </span>
                        ) : (
                          <span style={{ color: '#666' }}>
                            Break even so far
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable Charts */}
                    {hasAnyChart && (
                      <div style={s.chartSection}>
                        <button
                          style={{
                            ...s.chartToggleBtn,
                            ...(expandedCharts[`watched-${watched.slug}`] ? s.chartToggleBtnActive : {})
                          }}
                          onClick={() => toggleChart(`watched-${watched.slug}`)}
                        >
                          {expandedCharts[`watched-${watched.slug}`] ? '▼ Hide charts' : '▶ Show charts'}
                        </button>
                        {expandedCharts[`watched-${watched.slug}`] && (
                          <div style={s.chartsStack}>
                            {hasPriceChart && (
                              <div style={s.chartBlock}>
                                <div style={s.chartLabel}>PRICE</div>
                                <PriceChart
                                  slug={watched.slug}
                                  highlightSide={watched.side}
                                  closedAtTime={watched.exitTime}
                                />
                              </div>
                            )}
                            {hasScoreChart && (
                              <div style={s.chartBlock}>
                                <div style={s.chartLabel}>SCORE</div>
                                <ScoreChart
                                  slug={watched.slug}
                                  closedAtTime={watched.exitTime}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={s.cardFooterStats}>
                      <span>cost: ${fmt(watched.cost)}</span>
                      <span style={s.footerDot}>·</span>
                      <span>got: ${fmt(watched.exitValue)}</span>
                      <span style={s.footerDot}>·</span>
                      <span>would be: ${fmt(wouldBeValue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* History */}
        <section style={s.section}>
          <div style={s.sectionHead}>history ({history.length})</div>
          {history.length === 0 ? (
            <div style={s.empty}>no closed trades</div>
          ) : (
            <div style={s.positionCards}>
              {history.map(t => {
                const event = eventData[t.id];
                const isEnded = event?.ended;
                const hasPriceChart = priceHistory[t.id] && Object.keys(priceHistory[t.id]).length > 0;
                const hasScoreChart = scoreHistory[t.id] && scoreHistory[t.id].length >= 2;
                const hasAnyChart = hasPriceChart || hasScoreChart;

                return (
                  <div key={t.id} style={s.historyCard}>
                    <div style={s.cardHeader}>
                      <div style={s.cardTitle}>
                        {t.market}
                        {isEnded && <span style={s.endedBadge}>FINAL</span>}
                        {!isEnded && watchedMarkets.some(w => w.slug === t.id) && <span style={s.watchingBadge}>watching</span>}
                      </div>
                    </div>
                    <div style={s.cardSubtitle}>
                      {t.side} · was {t.shares} shares
                    </div>
                    {/* Final Score Display */}
                    {event && event.score && (
                      <div style={s.scoreDisplay}>
                        <span style={s.scoreText}>{event.score}</span>
                        {isEnded && (
                          <>
                            <span style={s.scoreDot}>·</span>
                            <span style={s.periodText}>FINAL</span>
                          </>
                        )}
                      </div>
                    )}
                    {/* P&L Hero */}
                    <div style={s.historyHeroSection}>
                      <div style={{ ...s.historyPnL, color: t.realizedPnL >= 0 ? '#080' : '#a00' }}>
                        You cashed out: {t.realizedPnL >= 0 ? '+' : ''}${fmt(t.realizedPnL)} ({pct(t.realizedPnL, t.cost)}%)
                      </div>
                      {t.resolved && (
                        <div style={{ ...s.hindsightLine, color: t.hindsightDiff <= 0 ? '#080' : '#a00' }}>
                          {t.won
                            ? `If you held: +$${fmt(t.shares)} (${t.side} won)`
                            : `If you held: $0.00 (${t.side} lost)`}
                        </div>
                      )}
                      {t.resolved && t.hindsightDiff !== 0 && (
                        <div style={s.hindsightSummary}>
                          {t.hindsightDiff <= 0
                            ? `Good call! Saved $${fmt(Math.abs(t.hindsightDiff))}`
                            : `Left $${fmt(t.hindsightDiff)} on the table`}
                        </div>
                      )}
                    </div>
                    {/* Resolve Buttons */}
                    {!t.resolved && (
                      <div style={s.resolveSection}>
                        <span style={s.resolveLabel}>How did it end?</span>
                        <span style={s.hindsightBtns}>
                          <button style={s.btnTiny} onClick={() => markResolved(t.id, true)}>
                            {t.side} won
                          </button>
                          <button style={{ ...s.btnTiny, borderColor: '#a00', color: '#a00' }} onClick={() => markResolved(t.id, false)}>
                            {t.side} lost
                          </button>
                        </span>
                      </div>
                    )}
                    {/* Expandable Charts */}
                    {hasAnyChart && (
                      <div style={s.chartSection}>
                        <button
                          style={{
                            ...s.chartToggleBtn,
                            ...(expandedCharts[`history-${t.id}`] ? s.chartToggleBtnActive : {})
                          }}
                          onClick={() => toggleChart(`history-${t.id}`)}
                        >
                          {expandedCharts[`history-${t.id}`] ? '▼ Hide charts' : '▶ Show charts'}
                        </button>
                        {expandedCharts[`history-${t.id}`] && (
                          <div style={s.chartsStack}>
                            {hasPriceChart && (
                              <div style={s.chartBlock}>
                                <div style={s.chartLabel}>PRICE</div>
                                <PriceChart
                                  slug={t.id}
                                  highlightSide={t.side}
                                  closedAtTime={t.closedAtTime}
                                />
                              </div>
                            )}
                            {hasScoreChart && (
                              <div style={s.chartBlock}>
                                <div style={s.chartLabel}>SCORE</div>
                                <ScoreChart
                                  slug={t.id}
                                  closedAtTime={t.closedAtTime}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={s.cardFooterStats}>
                      <span>cost: ${fmt(t.cost)}</span>
                      <span style={s.footerDot}>·</span>
                      <span>proceeds: ${fmt(t.netProceeds)}</span>
                      {t.fee > 0 && (
                        <>
                          <span style={s.footerDot}>·</span>
                          <span>fee: ${fmt(t.fee)}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer style={s.footer}>
          v0.8 · data in localStorage · {wsConnected ? 'real-time via WebSocket' : 'tap sync to fetch from polymarket'}
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
    borderBottom: '1px solid #ccc',
    paddingBottom: 10,
    marginBottom: 16,
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
  compactStats: {
    fontSize: 12,
    color: '#666',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  // WebSocket status indicator
  wsStatus: {
    display: 'flex',
    alignItems: 'center',
  },
  wsConnected: {
    color: '#22c55e',
    fontSize: 12,
    fontFamily: 'inherit',
    fontWeight: 500,
  },
  wsError: {
    color: '#ef4444',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'help',
  },
  wsConnecting: {
    color: '#f59e0b',
    fontSize: 12,
    fontFamily: 'inherit',
    animation: 'pulse 1s infinite',
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 400,
    letterSpacing: 2,
  },
  syncBtn: {
    padding: '6px 14px',
    border: '1px solid #222',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
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
  // New position card styles (v0.8)
  posCard: {
    border: '1px solid #ccc',
    background: '#fff',
    padding: '12px 14px',
    marginBottom: 8,
  },
  posHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  posHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  posSideName: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: 1,
  },
  liveDot: {
    color: '#22c55e',
    fontSize: 12,
    animation: 'pulse 2s infinite',
  },
  finalBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    background: '#e5e5e5',
    padding: '2px 6px',
    letterSpacing: 0.5,
  },
  sellBtn: {
    padding: '10px 24px',
    border: '2px solid #222',
    background: '#222',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
    minHeight: 44,
  },
  posSubtitle: {
    fontSize: 11,
    color: '#666',
    marginBottom: 8,
  },
  priceHero: {
    textAlign: 'center',
    padding: '2px 0 4px',
    borderRadius: 4,
  },
  priceValue: {
    fontSize: 44,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: -2,
    color: '#111',
  },
  sparklineRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 0',
    margin: '0 -8px',
  },
  rangeLabel: {
    fontSize: 11,
    color: '#999',
    fontVariantNumeric: 'tabular-nums',
    minWidth: 32,
    textAlign: 'center',
  },
  scoreSection: {
    textAlign: 'center',
    padding: '8px 0',
    borderTop: '1px solid #eee',
    marginTop: 4,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 3,
    color: '#222',
  },
  scorePeriod: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  pnlBadge: {
    textAlign: 'center',
    padding: '6px 12px',
    fontSize: 14,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    margin: '8px 0',
  },
  posFooter: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
    paddingTop: 8,
    borderTop: '1px solid #eee',
  },
  expandBtn: {
    width: '100%',
    padding: '6px',
    marginTop: 8,
    border: '1px solid #eee',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 11,
    color: '#999',
    cursor: 'pointer',
  },
  // Legacy position card styles (kept for compatibility)
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
  // Live badge
  liveBadge: {
    marginLeft: 6,
    padding: '2px 6px',
    background: '#080',
    fontSize: 9,
    color: '#fff',
    fontWeight: 600,
    verticalAlign: 'middle',
    letterSpacing: 0.5,
  },
  // Ended/Final badge
  endedBadge: {
    marginLeft: 6,
    padding: '2px 6px',
    background: '#666',
    fontSize: 9,
    color: '#fff',
    fontWeight: 600,
    verticalAlign: 'middle',
    letterSpacing: 0.5,
  },
  // Watching badge (for closed positions still being tracked)
  watchingBadge: {
    marginLeft: 6,
    padding: '2px 5px',
    background: '#e8e8e0',
    fontSize: 9,
    color: '#666',
    verticalAlign: 'middle',
  },
  // Score display
  scoreDisplay: {
    textAlign: 'center',
    padding: '8px 0',
    marginBottom: 4,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  scoreDot: {
    color: '#999',
    margin: '0 8px',
  },
  periodText: {
    fontSize: 12,
    color: '#666',
  },
  // Chart section
  chartSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #eee',
  },
  chartToggle: {
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: 11,
    color: '#666',
    cursor: 'pointer',
    padding: '8px 0',
    width: '100%',
    textAlign: 'left',
  },
  chartToggles: {
    display: 'flex',
    gap: 8,
    marginBottom: 8,
  },
  chartToggleBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontFamily: 'inherit',
    fontSize: 11,
    color: '#666',
    cursor: 'pointer',
    padding: '6px 12px',
  },
  chartToggleBtnActive: {
    background: '#222',
    borderColor: '#222',
    color: '#fff',
  },
  chartContainer: {
    marginTop: 4,
  },
  chartsStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 12,
  },
  chartBlock: {
    // Container for label + chart
  },
  chartLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#888',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  chartEmpty: {
    padding: 16,
    textAlign: 'center',
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  chartLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    fontSize: 11,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: '#666',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // History card styles
  historyCard: {
    border: '1px solid #ddd',
    background: '#fafaf8',
    padding: 16,
  },
  historyHeroSection: {
    padding: '12px 0',
  },
  historyPnL: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 4,
  },
  hindsightLine: {
    fontSize: 13,
    marginBottom: 4,
  },
  hindsightSummary: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  resolveSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
    borderTop: '1px solid #eee',
    marginTop: 8,
  },
  resolveLabel: {
    fontSize: 11,
    color: '#888',
  },
  // Recently closed / watched markets styles
  closedCard: {
    border: '1px solid #ccc',
    background: '#f8f8f4',
    padding: 16,
    position: 'relative',
  },
  closedBadge: {
    marginLeft: 6,
    padding: '2px 6px',
    background: '#888',
    fontSize: 9,
    color: '#fff',
    fontWeight: 600,
    verticalAlign: 'middle',
    letterSpacing: 0.5,
  },
  dismissBtn: {
    background: 'transparent',
    border: '1px solid #ccc',
    width: 32,
    height: 32,
    fontSize: 18,
    color: '#888',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  hindsightSection: {
    padding: '12px 0',
  },
  hindsightRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
  },
  hindsightLabel: {
    fontSize: 12,
    color: '#666',
  },
  hindsightValue: {
    fontSize: 13,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  hindsightSummaryBox: {
    marginTop: 8,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'center',
    border: '1px solid #ddd',
  },
};

export default ScalpingDashboard;
