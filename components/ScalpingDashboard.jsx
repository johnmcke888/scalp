'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { usePolymarketWebSocket } from '@/hooks/usePolymarketWebSocket';
import { getTeamColor } from '@/lib/teamColors';
import { transformActivities, groupTradesByEvent, calculatePerformanceMetrics, getClosingTrades } from '@/lib/activityTransformer';

// ===== DARK MODE SPARKLINE - Always visible, optimized for performance =====
const Sparkline = ({ data, currentValue, entryValue, color = '#39ff14', width = '100%', height = 48 }) => {
  if (!data || data.length < 2) {
    return (
      <div style={{
        width,
        height,
        background: '#0a0b0d',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, color: '#4b5563' }}>waiting...</span>
      </div>
    );
  }

  const points = data.slice(-40);
  const prices = points.map(p => p.price);
  const min = Math.min(...prices, entryValue || Infinity);
  const max = Math.max(...prices, entryValue || -Infinity);
  const range = max - min || 0.01;
  const padding = range * 0.15;
  const displayMin = min - padding;
  const displayMax = max + padding;
  const displayRange = displayMax - displayMin;

  // Calculate SVG dimensions
  const svgWidth = typeof width === 'number' ? width : 200;
  const svgHeight = typeof height === 'number' ? height : 48;

  const pathPoints = points.map((p, i) => {
    const x = (i / (points.length - 1)) * svgWidth;
    const y = svgHeight - ((p.price - displayMin) / displayRange) * svgHeight;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Gradient fill path
  const fillPath = pathPoints + ` L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;

  const currentY = svgHeight - ((currentValue - displayMin) / displayRange) * svgHeight;
  const entryY = entryValue ? svgHeight - ((entryValue - displayMin) / displayRange) * svgHeight : null;

  // Determine if price is up or down from entry
  const isUp = currentValue >= (entryValue || currentValue);
  const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none" style={{ display: 'block', background: '#0a0b0d', borderRadius: 6 }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isUp ? '#39ff14' : '#ff3b30'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isUp ? '#39ff14' : '#ff3b30'} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Gradient fill */}
      <path d={fillPath} fill={`url(#${gradientId})`} />
      {/* Entry reference line */}
      {entryY !== null && (
        <line
          x1={0}
          y1={entryY}
          x2={svgWidth}
          y2={entryY}
          stroke="#4b5563"
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.6}
        />
      )}
      {/* Price line */}
      <path
        d={pathPoints}
        fill="none"
        stroke={isUp ? '#39ff14' : '#ff3b30'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current price dot */}
      <circle
        cx={svgWidth}
        cy={currentY}
        r={4}
        fill={isUp ? '#39ff14' : '#ff3b30'}
      />
    </svg>
  );
};

// ===== MOMENTUM INDICATOR - Dark mode styled =====
const MomentumIndicator = ({ priceHistory }) => {
  if (!priceHistory || priceHistory.length < 3) return null;

  const recent = priceHistory.slice(-5);
  if (recent.length < 2) return null;

  const oldest = recent[0].price;
  const newest = recent[recent.length - 1].price;
  const change = ((newest - oldest) / oldest) * 100;

  if (Math.abs(change) < 0.3) return null;

  const isUp = change > 0;

  return (
    <span style={{
      color: isUp ? '#39ff14' : '#ff3b30',
      fontSize: 11,
      fontWeight: 600,
      fontFamily: '"SF Mono", monospace',
      background: isUp ? 'rgba(57, 255, 20, 0.15)' : 'rgba(255, 59, 48, 0.15)',
      padding: '3px 8px',
      borderRadius: 4,
    }}>
      {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
    </span>
  );
};

// ===== EXIT TARGETS - Dark mode styled =====
const ExitTargets = ({ entryPrice, shares, cost }) => {
  const targets = [5, 10, 20].map(pct => {
    const targetValue = cost * (1 + pct / 100);
    const targetPrice = targetValue / shares;
    return { pct, price: targetPrice };
  }).filter(t => t.price <= 1);

  if (targets.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      fontSize: 10,
      color: '#6b7280',
      marginTop: 8,
    }}>
      {targets.map(t => (
        <span key={t.pct} style={{
          background: '#1a1a1f',
          padding: '4px 8px',
          borderRadius: 4,
          fontFamily: '"SF Mono", monospace',
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
  const [showInputForm, setShowInputForm] = useState(false);

  const [priceHistory, setPriceHistory] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('scalper-price-history');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [scoreHistory, setScoreHistory] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('scalper-score-history');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [watchedMarkets, setWatchedMarkets] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('scalper-watched-markets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Trade History State
  const [tradeHistory, setTradeHistory] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('scalper-trade-history');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [performanceMetrics, setPerformanceMetrics] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem('scalper-performance-metrics');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [closingTrades, setClosingTrades] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('scalper-closing-trades');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState(null);
  const [expandedEvents, setExpandedEvents] = useState({});

  // Manual resolution tracking for positions held to resolution
  const [manualResolutions, setManualResolutions] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('scalper-manual-resolutions');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [eventData, setEventData] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [priceFlash, setPriceFlash] = useState({});
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
  }, [allSlugs.length > 0]);

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
          const lastPoint = updated[slug][side][updated[slug][side].length - 1];
          if (!lastPoint || lastPoint.price !== price || now - lastPoint.time > 5000) {
            updated[slug][side] = [
              ...updated[slug][side],
              { time: now, price }
            ].slice(-500);
          }
        }
      }
      return updated;
    });
  }, [wsPrices]);

  // Merge WebSocket events into event data and score history
  useEffect(() => {
    if (Object.keys(wsEvents).length === 0) return;

    setEventData(prev => ({ ...prev, ...wsEvents }));

    const now = Date.now();
    setScoreHistory(prev => {
      const updated = { ...prev };
      for (const [slug, eventInfo] of Object.entries(wsEvents)) {
        if (!eventInfo.score) continue;
        const scoreMatch = eventInfo.score.match(/(\d+)\s*-\s*(\d+)/);
        if (!scoreMatch) continue;
        const home = parseInt(scoreMatch[1], 10);
        const away = parseInt(scoreMatch[2], 10);
        if (!updated[slug]) {
          updated[slug] = [];
        }
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
          ].slice(-500);
        }
      }
      return updated;
    });
  }, [wsEvents]);

  // Track price changes for flash effect
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0 || positions.length === 0) return;

    positions.forEach(p => {
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

        setTimeout(() => {
          setPriceFlash(prev => ({ ...prev, [p.id]: null }));
        }, 500);
      }

      setPrevPrices(prev => ({ ...prev, [p.id]: price }));
    });
  }, [wsPrices]);

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

  // Persist trade history to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(tradeHistory).length > 0) {
      localStorage.setItem('scalper-trade-history', JSON.stringify(tradeHistory));
    }
  }, [tradeHistory]);

  const syncingRef = useRef(syncing);
  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  // Auto-sync positions every 30 seconds - WITH NaN FIX
  useEffect(() => {
    if (!pin) return;

    const interval = setInterval(async () => {
      console.log('Auto-sync triggered');

      try {
        const res = await fetch(`/api/positions?pin=${pin}`);
        if (res.ok) {
          const data = await res.json();
          if (data.positions) {
            const synced = Object.entries(data.positions).map(([slug, pos]) => {
              const shares = Math.abs(parseFloat(pos.netPosition));
              const cost = parseFloat(pos.cost?.value || 0);
              const cashValue = parseFloat(pos.cashValue?.value || 0);
              return {
                id: slug,
                market: pos.marketMetadata?.title || slug,
                side: pos.marketMetadata?.outcome || 'Unknown',
                shares: shares,
                cost: cost,
                // FIX: Calculate entryPrice with NaN protection
                entryPrice: shares > 0 ? cost / shares : 0,
                // FIX: Calculate currentPrice with NaN protection
                currentPrice: shares > 0 ? cashValue / shares : 0,
                currentValue: cashValue,
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

  // Countdown timer for auto-sync
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
          const lastPoint = updated[slug][side][updated[slug][side].length - 1];
          if (!lastPoint || lastPoint.price !== price || now - lastPoint.time > 10000) {
            updated[slug][side].push({ time: now, price });
          }
        }
      }
      return updated;
    });

    const newEventData = {};
    for (const [slug, priceData] of Object.entries(prices)) {
      if (priceData.event) {
        newEventData[slug] = priceData.event;
      }
    }
    setEventData(prev => ({ ...prev, ...newEventData }));

    setScoreHistory(prev => {
      const updated = { ...prev };
      for (const [slug, priceData] of Object.entries(prices)) {
        if (!priceData.event || !priceData.event.score) continue;
        if (!updated[slug]) {
          updated[slug] = [];
        }
        const scoreMatch = priceData.event.score.match(/(\d+)\s*-\s*(\d+)/);
        if (!scoreMatch) continue;
        const home = parseInt(scoreMatch[1], 10);
        const away = parseInt(scoreMatch[2], 10);
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

    const endedSlugs = Object.entries(newEventData)
      .filter(([, ev]) => ev.ended)
      .map(([slug]) => slug);
    if (endedSlugs.length > 0) {
      const currentTime = Date.now();
      setWatchedMarkets(prev => prev.filter(w => {
        if (!endedSlugs.includes(w.slug)) return true;
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

      const transformPositions = (data) => {
        if (!data.positions || typeof data.positions !== 'object') {
          return [];
        }

        return Object.entries(data.positions).map(([slug, pos]) => {
          const shares = Math.abs(parseFloat(pos.netPosition));
          const cost = parseFloat(pos.cost?.value || 0);
          const currentValue = parseFloat(pos.cashValue?.value || 0);

          return {
            id: slug,
            market: pos.marketMetadata?.title || slug,
            side: pos.marketMetadata?.outcome || 'Unknown',
            shares: shares,
            cost: cost,
            // NaN protection
            entryPrice: shares > 0 ? cost / shares : 0,
            currentPrice: shares > 0 ? currentValue / shares : 0,
            currentValue: currentValue,
            marketPrice: null,
            openedAt: pos.updateTime || new Date().toISOString(),
            synced: true,
            source: 'api',
          };
        }).filter(p => p.shares > 0);
      };

      const transformed = transformPositions(data);

      const positionSlugs = transformed.map(p => p.id);
      const watchedSlugs = watchedMarkets.map(w => w.slug);
      const allSlugs = [...new Set([...positionSlugs, ...watchedSlugs])];
      const prices = await fetchPrices(allSlugs);

      updatePriceHistory(prices);

      const withPrices = transformed.map(p => {
        const priceData = prices[p.id];
        if (priceData && priceData.sides) {
          const sidePrice = priceData.sides[p.side];
          if (sidePrice !== null && sidePrice !== undefined) {
            return {
              ...p,
              marketPrice: sidePrice,
            };
          }
        }
        return p;
      });

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

  // Fetch activities and group by event
  const fetchActivities = async () => {
    setActivitiesLoading(true);
    setActivitiesError(null);

    try {
      const res = await fetch(`/api/activities?pin=${encodeURIComponent(pin)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      const trades = transformActivities(data);
      const grouped = groupTradesByEvent(trades);
      const metrics = calculatePerformanceMetrics(grouped);
      const closingTradesList = getClosingTrades(trades);

      setTradeHistory(grouped);
      setPerformanceMetrics(metrics);
      setClosingTrades(closingTradesList);

      // Persist to localStorage
      localStorage.setItem('scalper-performance-metrics', JSON.stringify(metrics));
      localStorage.setItem('scalper-closing-trades', JSON.stringify(closingTradesList));
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setActivitiesError(err.message);
    } finally {
      setActivitiesLoading(false);
    }
  };

  // Fetch activities on initial load
  useEffect(() => {
    if (pin) {
      fetchActivities();
    }
  }, [pin]);

  // Handler for manually marking position resolutions
  const markResolution = (slug, outcome, payout) => {
    const updated = {
      ...manualResolutions,
      [slug]: { outcome, payout, timestamp: Date.now() },
    };
    setManualResolutions(updated);
    localStorage.setItem('scalper-manual-resolutions', JSON.stringify(updated));
  };

  // Clear a manual resolution
  const clearResolution = (slug) => {
    const updated = { ...manualResolutions };
    delete updated[slug];
    setManualResolutions(updated);
    localStorage.setItem('scalper-manual-resolutions', JSON.stringify(updated));
  };

  // Calculate held positions (incomplete events where buyShares !== sellShares)
  const heldPositions = useMemo(() => {
    return Object.values(tradeHistory)
      .filter(e => !e.isComplete && Math.abs(e.totalBuyShares - e.totalSellShares) > 0.5)
      .filter(e => !manualResolutions[e.slug]) // Exclude already resolved
      .map(e => {
        const heldShares = Math.abs(e.totalBuyShares - e.totalSellShares);
        const isLong = e.totalBuyShares > e.totalSellShares;
        return {
          ...e,
          heldShares,
          heldType: isLong ? 'LONG' : 'SHORT',
          avgHeldPrice: isLong ? e.avgBuyPrice : e.avgSellPrice,
          heldCost: heldShares * (isLong ? e.avgBuyPrice : e.avgSellPrice),
          potentialWinPayout: heldShares, // Payout if price goes to $1
          potentialLossPayout: 0, // Payout if price goes to $0
        };
      });
  }, [tradeHistory, manualResolutions]);

  const syncAll = async () => {
    await Promise.all([syncPositions(), syncBalance()]);
    setLastSynced(new Date());

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
      synced: false,
    };
    setPositions([pos, ...positions]);
    setNewPos({ market: '', side: '', cost: '', shares: '' });
    setShowInputForm(false);
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
      closedAtTime: Date.now(),
    };

    setHistory([trade, ...history]);
    setPositions(positions.filter(p => p.id !== closing.id));

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
        market: closing.market,
      };
      setWatchedMarkets(prev => {
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

  // Helper: Get live price from WebSocket, falling back to API snapshot
  const getLivePositionData = (p) => {
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

    const finalPrice = livePrice !== null ? livePrice : p.currentPrice;
    const value = p.shares * finalPrice;

    return { value, price: finalPrice };
  };

  const totalUnrealized = positions.reduce((sum, p) => {
    const { value } = getLivePositionData(p);
    return sum + (value - p.cost);
  }, 0);
  const totalRealized = history.reduce((sum, t) => sum + t.realizedPnL, 0);

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

  useEffect(() => {
    if (!lastSynced) return;
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastSynced));
    }, 1000);
    setTimeAgo(formatTimeAgo(lastSynced));
    return () => clearInterval(interval);
  }, [lastSynced]);

  const formatChartTime = (timestamp) => {
    const date = new Date(timestamp);
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const toggleChart = (id) => {
    setExpandedCharts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const buildChartData = (slug, highlightSide = null) => {
    const history = priceHistory[slug];
    if (!history) return { data: [], sides: [] };

    const sides = Object.keys(history);
    if (sides.length === 0) return { data: [], sides: [] };

    const allTimestamps = new Set();
    for (const sideHistory of Object.values(history)) {
      for (const point of sideHistory) {
        allTimestamps.add(point.time);
      }
    }
    const sortedTimes = [...allTimestamps].sort((a, b) => a - b);

    const data = sortedTimes.map(time => {
      const point = { time };
      for (const [side, sideHistory] of Object.entries(history)) {
        const pricePoint = [...sideHistory].reverse().find(p => p.time <= time);
        if (pricePoint) {
          point[side] = Math.round(pricePoint.price * 100);
        }
      }
      return point;
    });

    return { data, sides, highlightSide };
  };

  // Price chart component - Dark mode
  const PriceChart = ({ slug, highlightSide, closedAtTime = null }) => {
    const { data, sides } = buildChartData(slug, highlightSide);

    if (data.length < 2) {
      return (
        <div style={s.chartEmpty}>
          Not enough data yet
        </div>
      );
    }

    const getLineColor = (side) => {
      if (side === highlightSide) {
        return '#39ff14';
      }
      return getTeamColor(side);
    };
    const getLineWidth = (side) => side === highlightSide ? 2.5 : 1.5;

    return (
      <div style={s.chartContainer}>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tickFormatter={formatChartTime}
              tick={{ fontSize: 9, fill: '#6b7280' }}
              axisLine={{ stroke: '#333340' }}
              tickLine={false}
            />
            <YAxis
              domain={['dataMin - 5', 'dataMax + 5']}
              tick={{ fontSize: 9, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}¢`}
            />
            <Tooltip
              formatter={(value, name) => [`${value}¢`, name]}
              labelFormatter={(ts) => new Date(ts).toLocaleTimeString()}
              contentStyle={{
                fontSize: 11,
                border: '1px solid #333340',
                background: '#111114',
                color: '#fff',
                borderRadius: 6,
              }}
            />
            {closedAtTime && (
              <ReferenceLine
                x={closedAtTime}
                stroke="#ff3b30"
                strokeDasharray="3 3"
                label={{ value: 'exit', fontSize: 9, fill: '#ff3b30' }}
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
      </div>
    );
  };

  const buildScoreChartData = (slug) => {
    const history = scoreHistory[slug];
    if (!history || history.length < 2) return { data: [], hasData: false };

    const data = history.map(point => ({
      time: point.time,
      Home: point.home,
      Away: point.away,
    }));

    return { data, hasData: true };
  };

  // Score chart component - Dark mode
  const ScoreChart = ({ slug, closedAtTime = null }) => {
    const { data, hasData } = buildScoreChartData(slug);

    if (!hasData) {
      return (
        <div style={s.chartEmpty}>
          Not enough score data
        </div>
      );
    }

    return (
      <div style={s.chartContainer}>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tickFormatter={formatChartTime}
              tick={{ fontSize: 9, fill: '#6b7280' }}
              axisLine={{ stroke: '#333340' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 9, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(value, name) => [value, name]}
              labelFormatter={(ts) => new Date(ts).toLocaleTimeString()}
              contentStyle={{
                fontSize: 11,
                border: '1px solid #333340',
                background: '#111114',
                color: '#fff',
                borderRadius: 6,
              }}
            />
            {closedAtTime && (
              <ReferenceLine
                x={closedAtTime}
                stroke="#ff3b30"
                strokeDasharray="3 3"
                label={{ value: 'sold', fontSize: 9, fill: '#ff3b30' }}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="Home"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="Away"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div style={s.chartLegend}>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: '#3b82f6' }} />
            Home
          </span>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: '#ef4444' }} />
            Away
          </span>
        </div>
      </div>
    );
  };

  // ========== RENDER ==========
  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* ===== HERO SECTION - Massive P&L ===== */}
        <header style={s.header}>
          <div style={s.headerTop}>
            <h1 style={s.title}>SCALPER</h1>
            <div style={s.headerRight}>
              {wsConnected && <span style={s.wsLive}>● LIVE</span>}
              <button style={s.syncBtn} onClick={syncAll} disabled={syncing}>
                {syncing ? '...' : `↻ ${autoSyncCountdown}s`}
              </button>
            </div>
          </div>

          {/* HERO: Unrealized P&L - MASSIVE */}
          <div style={s.heroSection}>
            <div
              style={{
                ...s.heroPnL,
                color: totalUnrealized >= 0 ? '#39ff14' : '#ff3b30',
                textShadow: totalUnrealized >= 0
                  ? '0 0 30px rgba(57, 255, 20, 0.5)'
                  : '0 0 30px rgba(255, 59, 48, 0.5)',
              }}
            >
              {totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)}
            </div>
            <div style={s.heroLabel}>UNREALIZED P&L</div>
          </div>

          {/* Pills: Cash + Realized */}
          <div style={s.pillRow}>
            {balance !== null && (
              <span style={s.pill}>
                <span style={s.pillLabel}>Cash</span>
                <span style={s.pillValue}>${balance.toFixed(2)}</span>
              </span>
            )}
            <span style={{
              ...s.pill,
              background: totalRealized >= 0 ? 'rgba(57, 255, 20, 0.1)' : 'rgba(255, 59, 48, 0.1)',
            }}>
              <span style={s.pillLabel}>Realized</span>
              <span style={{
                ...s.pillValue,
                color: totalRealized >= 0 ? '#39ff14' : '#ff3b30',
              }}>
                {totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}
              </span>
            </span>
          </div>

          {syncError && <div style={s.syncError}>{syncError}</div>}
        </header>

        {/* ===== PERFORMANCE SUMMARY ===== */}
        {performanceMetrics && performanceMetrics.totalEvents > 0 && (
          <section style={s.performanceSection}>
            <div style={s.performanceHeader}>
              <span style={s.performanceTitle}>PERFORMANCE</span>
              <button
                style={s.refreshBtn}
                onClick={fetchActivities}
                disabled={activitiesLoading}
              >
                {activitiesLoading ? '...' : '↻ Refresh'}
              </button>
            </div>

            {/* Main stats row */}
            <div style={s.performanceGrid}>
              <div style={s.performanceStat}>
                <div style={{
                  ...s.performanceValue,
                  color: performanceMetrics.totalRealizedPnl >= 0 ? '#39ff14' : '#ff3b30',
                }}>
                  {performanceMetrics.totalRealizedPnl >= 0 ? '+' : ''}${performanceMetrics.totalRealizedPnl.toFixed(2)}
                </div>
                <div style={s.performanceLabel}>Total P&L</div>
              </div>
              <div style={s.performanceStat}>
                <div style={s.performanceValue}>
                  {performanceMetrics.winners}
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                    {performanceMetrics.winners === 1 ? 'win' : 'wins'}
                  </span>
                </div>
                <div style={s.performanceLabel}>
                  {performanceMetrics.losers} {performanceMetrics.losers === 1 ? 'loss' : 'losses'} / {performanceMetrics.totalEvents} total
                </div>
              </div>
              <div style={s.performanceStat}>
                <div style={{
                  ...s.performanceValue,
                  color: performanceMetrics.winRate >= 50 ? '#39ff14' : '#ff3b30',
                }}>
                  {performanceMetrics.winRate.toFixed(1)}%
                </div>
                <div style={s.performanceLabel}>
                  ROI: {performanceMetrics.roi >= 0 ? '+' : ''}{performanceMetrics.roi.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Secondary stats row */}
            <div style={s.performanceSubgrid}>
              <div style={s.performanceSmallStat}>
                <div style={{ ...s.performanceSmallValue, color: '#39ff14' }}>
                  +${performanceMetrics.biggestWin.toFixed(2)}
                </div>
                <div style={s.performanceSmallLabel}>
                  {performanceMetrics.biggestWinEvent?.title?.split(' vs')[0] || 'Best'}
                </div>
              </div>
              <div style={s.performanceSmallStat}>
                <div style={{ ...s.performanceSmallValue, color: '#ff3b30' }}>
                  ${performanceMetrics.biggestLoss.toFixed(2)}
                </div>
                <div style={s.performanceSmallLabel}>
                  {performanceMetrics.biggestLossEvent?.title?.split(' vs')[0] || 'Worst'}
                </div>
              </div>
              <div style={s.performanceSmallStat}>
                <div style={{ ...s.performanceSmallValue, color: '#39ff14' }}>
                  +${performanceMetrics.avgWin.toFixed(2)}
                </div>
                <div style={s.performanceSmallLabel}>Avg Win</div>
              </div>
              <div style={s.performanceSmallStat}>
                <div style={{ ...s.performanceSmallValue, color: '#ff3b30' }}>
                  ${performanceMetrics.avgLoss.toFixed(2)}
                </div>
                <div style={s.performanceSmallLabel}>Avg Loss</div>
              </div>
            </div>
          </section>
        )}

        {/* ===== RECENT TRADES - Visual P&L bars ===== */}
        {closingTrades.length > 0 && (
          <section style={s.tradeListSection}>
            <div style={s.tradeListHeader}>
              <span style={s.tradeListTitle}>RECENT TRADES</span>
              <span style={{ fontSize: 10, color: '#4b5563' }}>{closingTrades.length} closes</span>
            </div>
            <div style={s.tradeListContainer}>
              {closingTrades.slice(0, 20).map((trade, idx) => {
                const pnl = trade.realizedPnl || 0;
                const isWin = pnl >= 0;
                const entryPrice = trade.originalPrice || 0;
                const exitPrice = trade.price || 0;
                const isShort = trade.intent?.includes('SHORT');
                const teamColor = trade.teamColor || '#9ca3af';

                // Bar width: log scale, min 8px, max 120px
                const maxPnl = Math.max(...closingTrades.slice(0, 20).map(t => Math.abs(t.realizedPnl || 0)), 1);
                const barWidth = Math.max(8, Math.min(120, (Math.log(Math.abs(pnl) + 1) / Math.log(maxPnl + 1)) * 120));

                const timeStr = trade.timestamp
                  ? new Date(trade.timestamp).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    }).replace(' ', '')  // "10:15PM" not "10:15 PM"
                  : '--:--';

                return (
                  <div key={trade.id || idx} style={s.tradeRowCompact}>
                    {/* Team name + short indicator */}
                    <div style={s.tradeTeamCell}>
                      <span style={{ color: teamColor, fontWeight: 600 }}>
                        {trade.team}
                      </span>
                      {isShort && <span style={s.shortBadge}>▼</span>}
                    </div>

                    {/* Entry → Exit price */}
                    <div style={s.tradePriceCell}>
                      {(entryPrice * 100).toFixed(0)}→{(exitPrice * 100).toFixed(0)}¢
                    </div>

                    {/* P&L Bar - GREEN for win, RED for loss */}
                    <div style={s.tradeBarCell}>
                      <div style={{
                        width: barWidth,
                        height: 16,
                        borderRadius: 2,
                        backgroundColor: isWin ? '#22c55e' : '#ef4444',
                      }} />
                    </div>

                    {/* P&L value */}
                    <div style={{
                      ...s.tradePnlCell,
                      color: isWin ? '#22c55e' : '#ef4444',
                    }}>
                      {isWin ? '+' : ''}${pnl.toFixed(2)}
                    </div>

                    {/* Shares */}
                    <div style={s.tradeSharesCell}>
                      {trade.shares.toFixed(0)}sh
                    </div>

                    {/* Time */}
                    <div style={s.tradeTimeCell}>
                      {timeStr}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== HELD TO RESOLUTION - Positions not fully closed ===== */}
        {heldPositions.length > 0 && (
          <section style={s.heldSection}>
            <div style={s.tradeListHeader}>
              <span style={s.tradeListTitle}>HELD TO RESOLUTION</span>
              <span style={{ fontSize: 10, color: '#f59e0b' }}>⚠ manual entry needed</span>
            </div>
            <div style={s.tradeListContainer}>
              {heldPositions.map((pos) => {
                // Extract team name from first trade if available
                const firstTrade = pos.trades?.[0];
                const teamColor = firstTrade?.teamColor || '#9ca3af';

                return (
                  <div key={pos.slug} style={s.heldRow}>
                    <div style={s.heldInfo}>
                      <span style={{ ...s.heldTitle, color: teamColor }}>
                        {pos.title || pos.slug}
                      </span>
                      <span style={{
                        ...s.heldBadge,
                        background: pos.heldType === 'LONG' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: pos.heldType === 'LONG' ? '#22c55e' : '#ef4444',
                      }}>
                        {pos.heldType}
                      </span>
                      {pos.league && (
                        <span style={s.heldLeague}>{pos.league}</span>
                      )}
                    </div>
                    <div style={s.heldDetails}>
                      <span style={s.heldShareInfo}>
                        {pos.heldShares.toFixed(0)} shares @ {(pos.avgHeldPrice * 100).toFixed(0)}¢ avg
                      </span>
                      <span style={s.heldCost}>
                        Cost: ${pos.heldCost.toFixed(2)}
                      </span>
                    </div>
                    <div style={s.heldActions}>
                      <button
                        style={s.heldWinBtn}
                        onClick={() => markResolution(pos.slug, 'WIN', pos.heldShares)}
                      >
                        ✓ WON (${pos.heldShares.toFixed(2)})
                      </button>
                      <button
                        style={s.heldLossBtn}
                        onClick={() => markResolution(pos.slug, 'LOSS', 0)}
                      >
                        ✗ LOST ($0)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== OPEN POSITIONS - Compact Cards with Always-Visible Sparklines ===== */}
        <section style={s.section}>
          <div style={s.sectionHead}>
            <span>POSITIONS</span>
            <span style={s.posCount}>{positions.length}</span>
          </div>

          {positions.length === 0 ? (
            <div style={s.empty}>No open positions</div>
          ) : (
            <div style={s.positionGrid}>
              {positions.map(p => {
                const { value, price } = getLivePositionData(p);
                const pnl = value - p.cost;
                const pnlPct = p.cost > 0 ? (pnl / p.cost) * 100 : 0;
                const event = eventData[p.id];
                const isLive = event?.live;
                const isEnded = event?.ended;
                const sidePriceHistory = priceHistory[p.id]?.[p.side] || [];
                const teamColor = getTeamColor(p.side);

                return (
                  <div
                    key={p.id}
                    style={s.posCard}
                    onClick={() => {
                      setClosing(p);
                      setCloseForm({ proceeds: value.toFixed(2), fee: '' });
                    }}
                  >
                    {/* Top Row: Name + Live Price */}
                    <div style={s.posTopRow}>
                      <div style={s.posLeft}>
                        <span style={{ ...s.posSide, color: teamColor }}>{p.side.toUpperCase()}</span>
                        {isLive && <span style={s.liveDot}>●</span>}
                        {isEnded && <span style={s.endedTag}>FINAL</span>}
                        <MomentumIndicator priceHistory={sidePriceHistory} />
                      </div>
                      <div
                        style={s.priceBox}
                        className={priceFlash[p.id] === 'up' ? 'price-flash-up' : priceFlash[p.id] === 'down' ? 'price-flash-down' : ''}
                      >
                        <span style={s.livePrice}>{(price * 100).toFixed(1)}¢</span>
                      </div>
                    </div>

                    {/* Subtitle */}
                    <div style={s.posSubtitle}>
                      {p.shares} shares @ {(p.entryPrice * 100).toFixed(1)}¢
                    </div>

                    {/* ALWAYS VISIBLE SPARKLINE */}
                    <div style={s.sparklineWrapper}>
                      <Sparkline
                        data={sidePriceHistory}
                        currentValue={price}
                        entryValue={p.entryPrice}
                        color={pnl >= 0 ? '#39ff14' : '#ff3b30'}
                        height={48}
                      />
                    </div>

                    {/* Score (if available) */}
                    {event?.score && (
                      <div style={s.scoreRow}>
                        <span style={s.scoreText}>{event.score}</span>
                        {event.period && (
                          <span style={s.periodText}>
                            {isEnded ? 'FINAL' : `${event.period}${event.elapsed ? ` · ${event.elapsed}` : ''}`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* P&L Badge */}
                    <div style={{
                      ...s.pnlBadge,
                      background: pnl >= 0 ? 'rgba(57, 255, 20, 0.15)' : 'rgba(255, 59, 48, 0.15)',
                      color: pnl >= 0 ? '#39ff14' : '#ff3b30',
                      borderColor: pnl >= 0 ? 'rgba(57, 255, 20, 0.3)' : 'rgba(255, 59, 48, 0.3)',
                    }}>
                      {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% · {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>

                    {/* Exit targets */}
                    <ExitTargets entryPrice={p.entryPrice} shares={p.shares} cost={p.cost} />

                    {/* Footer */}
                    <div style={s.posFooter}>
                      <span>value ${value.toFixed(2)}</span>
                      <span style={s.footerDot}>·</span>
                      <span>cost ${p.cost.toFixed(2)}</span>
                    </div>

                    {/* Expanded charts */}
                    {p.synced && expandedCharts[p.id] && (
                      <div style={s.chartsStack} onClick={e => e.stopPropagation()}>
                        <div style={s.chartBlock}>
                          <div style={s.chartLabel}>PRICE CHART</div>
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

                    {p.synced && (
                      <button
                        style={s.expandBtn}
                        onClick={(e) => { e.stopPropagation(); toggleChart(p.id); }}
                      >
                        {expandedCharts[p.id] ? '− hide details' : '+ show details'}
                      </button>
                    )}

                    {/* Manual price input for non-synced */}
                    {!p.synced && (
                      <div style={s.manualInput} onClick={e => e.stopPropagation()}>
                        <span style={s.manualLabel}>Current ¢:</span>
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

        {/* ===== RECENTLY CLOSED ===== */}
        {watchedMarkets.length > 0 && (
          <section style={s.section}>
            <div style={s.sectionHead}>
              <span>RECENTLY CLOSED</span>
              <span style={s.posCount}>{watchedMarkets.length}</span>
            </div>
            <div style={s.positionGrid}>
              {watchedMarkets.map(watched => {
                const event = eventData[watched.slug];
                const isLive = event?.live;
                const isEnded = event?.ended;

                const currentPriceData = priceHistory[watched.slug]?.[watched.side];
                const latestPrice = currentPriceData?.length > 0
                  ? currentPriceData[currentPriceData.length - 1].price
                  : watched.exitPrice;

                const wouldBeValue = watched.shares * latestPrice;
                const wouldBePnl = wouldBeValue - watched.cost;
                const hindsightDiff = wouldBePnl - watched.pnl;

                const dismissWatched = (slug, e) => {
                  e.stopPropagation();
                  setWatchedMarkets(prev => prev.filter(w => w.slug !== slug));
                };

                return (
                  <div key={watched.slug} style={s.closedCard}>
                    <div style={s.closedHeader}>
                      <div style={s.closedTitle}>
                        <span style={s.closedName}>{watched.market}</span>
                        {isLive && <span style={s.liveTag}>LIVE</span>}
                        {isEnded && <span style={s.endedTag}>FINAL</span>}
                      </div>
                      <button style={s.dismissBtn} onClick={(e) => dismissWatched(watched.slug, e)}>×</button>
                    </div>

                    <div style={s.closedSubtitle}>{watched.side} · was {watched.shares} shares</div>

                    {event?.score && (
                      <div style={s.scoreRow}>
                        <span style={s.scoreText}>{event.score}</span>
                        <span style={s.periodText}>{isEnded ? 'FINAL' : `${event.period || ''} ${event.elapsed || ''}`}</span>
                      </div>
                    )}

                    <div style={s.hindsightSection}>
                      <div style={s.hindsightRow}>
                        <span style={s.hindsightLabel}>You exited:</span>
                        <span style={{ ...s.hindsightValue, color: watched.pnl >= 0 ? '#39ff14' : '#ff3b30' }}>
                          {watched.pnl >= 0 ? '+' : ''}${fmt(watched.pnl)} @ {(watched.exitPrice * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div style={s.hindsightRow}>
                        <span style={s.hindsightLabel}>If you held:</span>
                        <span style={{ ...s.hindsightValue, color: wouldBePnl >= 0 ? '#39ff14' : '#ff3b30' }}>
                          {wouldBePnl >= 0 ? '+' : ''}${fmt(wouldBePnl)} @ {(latestPrice * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div style={{
                        ...s.hindsightSummary,
                        background: hindsightDiff > 0 ? 'rgba(255, 59, 48, 0.1)' : 'rgba(57, 255, 20, 0.1)',
                        color: hindsightDiff > 0 ? '#ff3b30' : '#39ff14',
                      }}>
                        {hindsightDiff > 0 ? (
                          `Left $${fmt(hindsightDiff)} on the table`
                        ) : hindsightDiff < 0 ? (
                          `Good exit! Saved $${fmt(Math.abs(hindsightDiff))}`
                        ) : (
                          'Break even so far'
                        )}
                      </div>
                    </div>

                    {expandedCharts[`watched-${watched.slug}`] && (
                      <div style={s.chartsStack}>
                        <PriceChart slug={watched.slug} highlightSide={watched.side} closedAtTime={watched.exitTime} />
                        {scoreHistory[watched.slug]?.length >= 2 && (
                          <ScoreChart slug={watched.slug} closedAtTime={watched.exitTime} />
                        )}
                      </div>
                    )}

                    <button
                      style={s.expandBtn}
                      onClick={() => toggleChart(`watched-${watched.slug}`)}
                    >
                      {expandedCharts[`watched-${watched.slug}`] ? '− hide charts' : '+ show charts'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== HISTORY ===== */}
        <section style={s.section}>
          <div style={s.sectionHead}>
            <span>HISTORY</span>
            <span style={s.posCount}>{history.length}</span>
          </div>

          {history.length === 0 ? (
            <div style={s.empty}>No closed trades</div>
          ) : (
            <div style={s.positionGrid}>
              {history.map(t => {
                const event = eventData[t.id];
                const isEnded = event?.ended;

                return (
                  <div key={t.id} style={s.historyCard}>
                    <div style={s.historyHeader}>
                      <span style={s.historyName}>{t.market}</span>
                      {isEnded && <span style={s.endedTag}>FINAL</span>}
                    </div>
                    <div style={s.historySubtitle}>{t.side} · was {t.shares} shares</div>

                    {event?.score && (
                      <div style={s.scoreRow}>
                        <span style={s.scoreText}>{event.score}</span>
                        {isEnded && <span style={s.periodText}>FINAL</span>}
                      </div>
                    )}

                    <div style={{
                      ...s.historyPnL,
                      color: t.realizedPnL >= 0 ? '#39ff14' : '#ff3b30',
                    }}>
                      Cashed out: {t.realizedPnL >= 0 ? '+' : ''}${fmt(t.realizedPnL)} ({pct(t.realizedPnL, t.cost)}%)
                    </div>

                    {t.resolved && (
                      <div style={{ ...s.historyHindsight, color: t.hindsightDiff <= 0 ? '#39ff14' : '#ff3b30' }}>
                        {t.won
                          ? `If you held: +$${fmt(t.shares)} (${t.side} won)`
                          : `If you held: $0.00 (${t.side} lost)`}
                      </div>
                    )}

                    {!t.resolved && (
                      <div style={s.resolveSection}>
                        <span style={s.resolveLabel}>How did it end?</span>
                        <div style={s.resolveBtns}>
                          <button style={s.resolveWon} onClick={() => markResolved(t.id, true)}>{t.side} won</button>
                          <button style={s.resolveLost} onClick={() => markResolved(t.id, false)}>{t.side} lost</button>
                        </div>
                      </div>
                    )}

                    {expandedCharts[`history-${t.id}`] && (
                      <div style={s.chartsStack}>
                        <PriceChart slug={t.id} highlightSide={t.side} closedAtTime={t.closedAtTime} />
                        {scoreHistory[t.id]?.length >= 2 && (
                          <ScoreChart slug={t.id} closedAtTime={t.closedAtTime} />
                        )}
                      </div>
                    )}

                    <button style={s.expandBtn} onClick={() => toggleChart(`history-${t.id}`)}>
                      {expandedCharts[`history-${t.id}`] ? '− hide charts' : '+ show charts'}
                    </button>

                    <div style={s.historyFooter}>
                      cost ${fmt(t.cost)} · proceeds ${fmt(t.netProceeds)}
                      {t.fee > 0 && ` · fee ${fmt(t.fee)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== TRADE HISTORY ===== */}
        <section style={s.tradeHistorySection}>
          <div style={s.tradeHistoryHeader}>
            <span style={s.tradeHistoryTitle}>
              TRADE HISTORY ({Object.keys(tradeHistory).length} events)
            </span>
            <button
              style={s.refreshBtn}
              onClick={fetchActivities}
              disabled={activitiesLoading}
            >
              {activitiesLoading ? '...' : '↻ Refresh'}
            </button>
          </div>

          {activitiesError && (
            <div style={s.syncError}>{activitiesError}</div>
          )}

          {Object.keys(tradeHistory).length === 0 && !activitiesLoading ? (
            <div style={s.empty}>No trade history</div>
          ) : (
            <div style={s.positionGrid}>
              {Object.values(tradeHistory)
                .sort((a, b) => b.lastTradeTime - a.lastTradeTime)
                .map(event => {
                  const isExpanded = expandedEvents[event.slug];
                  // Use realizedPnl if available, otherwise use netPnl
                  const displayPnl = event.realizedPnl !== 0 ? event.realizedPnl : event.netPnl;

                  return (
                    <div key={event.slug} style={s.eventCard}>
                      <div style={s.eventHeader}>
                        <div>
                          <div style={s.eventTitle}>{event.title || event.slug}</div>
                        </div>
                        <div style={s.eventMeta}>
                          {event.league && (
                            <span style={s.leagueBadge}>{event.league}</span>
                          )}
                          <span style={{
                            ...s.statusBadge,
                            background: event.isComplete ? 'rgba(57, 255, 20, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                            color: event.isComplete ? '#39ff14' : '#fbbf24',
                          }}>
                            {event.isComplete ? 'CLOSED' : 'OPEN'}
                          </span>
                        </div>
                      </div>

                      <div style={{
                        ...s.eventPnl,
                        color: displayPnl >= 0 ? '#39ff14' : '#ff3b30',
                      }}>
                        {displayPnl >= 0 ? '+' : ''}${displayPnl.toFixed(2)}
                      </div>

                      <div style={s.eventStats}>
                        {event.trades.length} trades · Avg buy: {(event.avgBuyPrice * 100).toFixed(1)}¢ → Avg sell: {(event.avgSellPrice * 100).toFixed(1)}¢
                      </div>

                      <button
                        style={s.expandBtn}
                        onClick={() => setExpandedEvents(prev => ({
                          ...prev,
                          [event.slug]: !prev[event.slug]
                        }))}
                      >
                        {isExpanded ? '▲ Hide trades' : '▼ Show trades'}
                      </button>

                      {isExpanded && (
                        <div style={s.tradesList}>
                          {event.trades.map((trade, idx) => {
                            const isBuy = trade.side === 'BUY';
                            const tradeTime = new Date(trade.timestamp);
                            const timeStr = tradeTime.toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            });

                            return (
                              <div key={trade.id || idx} style={s.tradeRow}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <span style={{
                                    ...s.tradeSideBadge,
                                    background: isBuy ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                    color: isBuy ? '#3b82f6' : '#a855f7',
                                  }}>
                                    {trade.side}
                                  </span>
                                  <span style={{ fontFamily: '"SF Mono", monospace' }}>
                                    {trade.shares.toFixed(0)} @ {(trade.price * 100).toFixed(1)}¢
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ color: '#6b7280' }}>{timeStr}</span>
                                  {trade.realizedPnl !== null && (
                                    <span style={{
                                      ...s.tradePnl,
                                      color: trade.realizedPnl >= 0 ? '#39ff14' : '#ff3b30',
                                    }}>
                                      ({trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(2)})
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* Spacer for sticky footer */}
        <div style={{ height: 100 }} />

        <footer style={s.footer}>
          v0.9 · data in localStorage · {wsConnected ? 'real-time via WebSocket' : 'tap sync to fetch'}
        </footer>
      </div>

      {/* ===== CLOSE MODAL ===== */}
      {closing && (() => {
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
                  <span style={{ color: estimatedPnl >= 0 ? '#39ff14' : '#ff3b30', fontWeight: 600 }}>
                    Est. P&L: {estimatedPnl >= 0 ? '+' : ''}${fmt(estimatedPnl)}
                  </span>
                </div>
              </div>
              <div style={s.modalRow}>
                <label style={s.modalLabel}>Actual proceeds $</label>
                <input
                  style={s.modalInput}
                  type="number"
                  step="0.01"
                  value={closeForm.proceeds}
                  onChange={e => setCloseForm({ ...closeForm, proceeds: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') closePosition(); }}
                  autoFocus
                />
              </div>
              <div style={s.modalRow}>
                <label style={s.modalLabel}>Fee $ (optional)</label>
                <input
                  style={s.modalInput}
                  type="number"
                  step="0.01"
                  value={closeForm.fee}
                  onChange={e => setCloseForm({ ...closeForm, fee: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') closePosition(); }}
                />
              </div>
              <div style={s.modalActions}>
                <button style={s.btnCancel} onClick={() => setClosing(null)}>Cancel</button>
                <button style={s.btnConfirm} onClick={closePosition}>Confirm</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== STICKY FOOTER - Quick Trade Bar ===== */}
      <div style={s.stickyFooter} className="frosted-glass">
        {!showInputForm ? (
          <button style={s.addBtn} onClick={() => setShowInputForm(true)}>
            + Log Buy
          </button>
        ) : (
          <div style={s.inputForm}>
            <div style={s.inputRow}>
              <input
                style={s.input}
                placeholder="Market"
                value={newPos.market}
                onChange={e => setNewPos({ ...newPos, market: e.target.value })}
              />
              <input
                style={{ ...s.input, maxWidth: 100 }}
                placeholder="Side"
                value={newPos.side}
                onChange={e => setNewPos({ ...newPos, side: e.target.value })}
              />
            </div>
            <div style={s.inputRow}>
              <input
                style={{ ...s.input, maxWidth: 100 }}
                placeholder="Cost $"
                type="number"
                step="0.01"
                value={newPos.cost}
                onChange={e => setNewPos({ ...newPos, cost: e.target.value })}
              />
              <input
                style={{ ...s.input, maxWidth: 80 }}
                placeholder="Shares"
                type="number"
                step="1"
                value={newPos.shares}
                onChange={e => setNewPos({ ...newPos, shares: e.target.value })}
              />
              <button style={s.submitBtn} onClick={addPosition}>+</button>
              <button style={s.cancelInputBtn} onClick={() => setShowInputForm(false)}>×</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===== STYLES - Dark Mode Robinhood Vibe =====
const s = {
  page: {
    minHeight: '100vh',
    background: '#000000',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize: 14,
    color: '#ffffff',
    paddingBottom: 100,
  },
  container: {
    maxWidth: 500,
    margin: '0 auto',
    padding: '0 16px',
  },

  // Header
  header: {
    paddingTop: 20,
    paddingBottom: 16,
    borderBottom: '1px solid #222228',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 3,
    color: '#9ca3af',
  },
  wsLive: {
    color: '#39ff14',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
  },
  syncBtn: {
    padding: '8px 16px',
    border: '1px solid #333340',
    background: 'transparent',
    color: '#9ca3af',
    fontFamily: '"SF Mono", monospace',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 6,
  },
  syncError: {
    marginTop: 12,
    padding: '10px 14px',
    background: 'rgba(255, 59, 48, 0.15)',
    border: '1px solid #ff3b30',
    color: '#ff3b30',
    fontSize: 12,
    borderRadius: 6,
  },

  // Hero Section
  heroSection: {
    textAlign: 'center',
    padding: '20px 0',
  },
  heroPnL: {
    fontSize: '4rem',
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: -3,
    lineHeight: 1,
  },
  heroLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 8,
    letterSpacing: 2,
    fontWeight: 500,
  },

  // Pills
  pillRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: '#1a1a1f',
    borderRadius: 20,
  },
  pillLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 500,
  },
  pillValue: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: '"SF Mono", monospace',
    color: '#ffffff',
  },

  // Performance Section
  performanceSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  performanceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  performanceTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#6b7280',
  },
  performanceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    padding: 16,
    background: '#0a0b0d',
    borderRadius: 12,
    border: '1px solid #1a1a1f',
  },
  performanceStat: {
    textAlign: 'center',
  },
  performanceValue: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    color: '#ffffff',
  },
  performanceLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  performanceSubgrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    padding: '12px 16px',
    background: '#0a0b0d',
    borderRadius: 8,
    border: '1px solid #1a1a1f',
    marginTop: 12,
  },
  performanceSmallStat: {
    textAlign: 'center',
  },
  performanceSmallValue: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: '"SF Mono", monospace',
  },
  performanceSmallLabel: {
    fontSize: 9,
    color: '#4b5563',
    marginTop: 2,
  },

  // Trade List Section (Recent Trades)
  tradeListSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  tradeListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tradeListTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#6b7280',
  },
  tradeListContainer: {
    background: '#0a0b0d',
    borderRadius: 12,
    border: '1px solid #1a1a1f',
    overflow: 'hidden',
  },
  tradeRowCompact: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #1a1a1f',
    gap: 8,
  },
  tradeTeamCell: {
    width: 110,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
  },
  shortBadge: {
    fontSize: 10,
    color: '#f59e0b',
    marginLeft: 2,
  },
  tradePriceCell: {
    width: 70,
    flexShrink: 0,
    fontSize: 11,
    color: '#6b7280',
    fontFamily: '"SF Mono", Monaco, monospace',
  },
  tradeBarCell: {
    width: 120,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  tradePnlCell: {
    width: 70,
    flexShrink: 0,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: '"SF Mono", Monaco, monospace',
    textAlign: 'right',
  },
  tradeSharesCell: {
    width: 50,
    flexShrink: 0,
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'right',
  },
  tradeTimeCell: {
    width: 70,
    flexShrink: 0,
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },

  // Held to Resolution Section
  heldSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  heldRow: {
    padding: '12px 16px',
    borderBottom: '1px solid #1a1a1f',
  },
  heldInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  heldTitle: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
  },
  heldBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: '0.05em',
  },
  heldLeague: {
    fontSize: 10,
    color: '#6b7280',
    background: '#1a1a1f',
    padding: '2px 6px',
    borderRadius: 4,
  },
  heldDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  heldShareInfo: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: '"SF Mono", Monaco, monospace',
  },
  heldCost: {
    fontSize: 11,
    color: '#6b7280',
  },
  heldActions: {
    display: 'flex',
    gap: 8,
  },
  heldWinBtn: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  heldLossBtn: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    cursor: 'pointer',
  },

  // Sections
  section: {
    marginTop: 32,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 2,
    color: '#6b7280',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: '1px solid #222228',
  },
  posCount: {
    background: '#1a1a1f',
    color: '#9ca3af',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 600,
  },

  // Position Grid
  positionGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },

  // Position Card
  posCard: {
    background: '#111114',
    border: '1px solid #222228',
    borderRadius: 12,
    padding: 16,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  posTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  posLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  posSide: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
  },
  liveDot: {
    color: '#39ff14',
    fontSize: 10,
    animation: 'pulse 2s infinite',
  },
  endedTag: {
    fontSize: 9,
    fontWeight: 600,
    color: '#6b7280',
    background: '#1a1a1f',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  liveTag: {
    fontSize: 9,
    fontWeight: 600,
    color: '#39ff14',
    background: 'rgba(57, 255, 20, 0.15)',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  priceBox: {
    borderRadius: 6,
    padding: '4px 8px',
  },
  livePrice: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    color: '#ffffff',
  },
  posSubtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 12,
  },

  // Sparkline
  sparklineWrapper: {
    marginBottom: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // Score
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '8px 0',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: '"SF Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 3,
  },
  periodText: {
    fontSize: 11,
    color: '#6b7280',
  },

  // P&L Badge
  pnlBadge: {
    textAlign: 'center',
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: '"SF Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    borderRadius: 8,
    border: '1px solid',
    marginBottom: 8,
  },

  // Footer
  posFooter: {
    fontSize: 10,
    color: '#4b5563',
    textAlign: 'center',
    paddingTop: 8,
    fontFamily: '"SF Mono", monospace',
  },
  footerDot: {
    color: '#333340',
    margin: '0 6px',
  },

  // Expand Button
  expandBtn: {
    width: '100%',
    padding: '8px',
    marginTop: 8,
    border: '1px solid #222228',
    background: 'transparent',
    color: '#6b7280',
    fontSize: 11,
    cursor: 'pointer',
    borderRadius: 6,
    fontFamily: 'inherit',
  },

  // Charts
  chartsStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 12,
  },
  chartBlock: {
    background: '#0a0b0d',
    borderRadius: 8,
    padding: 12,
  },
  chartLabel: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#4b5563',
    marginBottom: 8,
  },
  chartContainer: {},
  chartEmpty: {
    padding: 20,
    textAlign: 'center',
    fontSize: 11,
    color: '#4b5563',
    fontStyle: 'italic',
  },
  chartLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    fontSize: 10,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: '#6b7280',
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Manual Input
  manualInput: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #222228',
  },
  manualLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  priceInput: {
    width: 70,
    padding: '6px 8px',
    border: '1px solid #333340',
    background: '#0a0b0d',
    color: '#ffffff',
    fontFamily: '"SF Mono", monospace',
    fontSize: 13,
    textAlign: 'right',
    borderRadius: 4,
  },

  // Closed Card
  closedCard: {
    background: '#0d0d10',
    border: '1px solid #222228',
    borderRadius: 12,
    padding: 16,
  },
  closedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  closedTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  closedName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#9ca3af',
  },
  closedSubtitle: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 12,
  },
  dismissBtn: {
    background: 'transparent',
    border: '1px solid #333340',
    width: 28,
    height: 28,
    fontSize: 16,
    color: '#6b7280',
    cursor: 'pointer',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hindsight
  hindsightSection: {
    padding: '8px 0',
  },
  hindsightRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
  },
  hindsightLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  hindsightValue: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: '"SF Mono", monospace',
  },
  hindsightSummary: {
    marginTop: 8,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
    borderRadius: 6,
  },

  // History Card
  historyCard: {
    background: '#0a0b0d',
    border: '1px solid #1a1a1f',
    borderRadius: 12,
    padding: 16,
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  historyName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#9ca3af',
  },
  historySubtitle: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 12,
  },
  historyPnL: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    fontFamily: '"SF Mono", monospace',
  },
  historyHindsight: {
    fontSize: 12,
    marginBottom: 8,
  },
  historyFooter: {
    fontSize: 10,
    color: '#4b5563',
    paddingTop: 8,
    borderTop: '1px solid #1a1a1f',
    marginTop: 8,
    fontFamily: '"SF Mono", monospace',
  },

  // Resolve
  resolveSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 0',
  },
  resolveLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  resolveBtns: {
    display: 'flex',
    gap: 8,
  },
  resolveWon: {
    flex: 1,
    padding: '10px 16px',
    border: '1px solid rgba(57, 255, 20, 0.3)',
    background: 'rgba(57, 255, 20, 0.1)',
    color: '#39ff14',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  resolveLost: {
    flex: 1,
    padding: '10px 16px',
    border: '1px solid rgba(255, 59, 48, 0.3)',
    background: 'rgba(255, 59, 48, 0.1)',
    color: '#ff3b30',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    fontFamily: 'inherit',
  },

  // Empty State
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#4b5563',
    fontSize: 13,
  },

  // Footer
  footer: {
    textAlign: 'center',
    padding: 24,
    color: '#333340',
    fontSize: 11,
  },

  // Modal
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: '#111114',
    border: '1px solid #333340',
    borderRadius: 16,
    padding: 24,
    width: 360,
    maxWidth: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 4,
    color: '#ffffff',
  },
  modalSub: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 20,
  },
  modalInfo: {
    fontSize: 12,
    background: '#0a0b0d',
    padding: 14,
    marginBottom: 20,
    borderRadius: 8,
    color: '#9ca3af',
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
    color: '#6b7280',
    marginBottom: 6,
  },
  modalInput: {
    width: '100%',
    padding: '14px 12px',
    border: '1px solid #333340',
    background: '#0a0b0d',
    color: '#ffffff',
    fontFamily: '"SF Mono", monospace',
    fontSize: 16,
    borderRadius: 8,
  },
  modalActions: {
    display: 'flex',
    gap: 12,
    marginTop: 24,
  },
  btnCancel: {
    flex: 1,
    padding: '14px 20px',
    border: '1px solid #333340',
    background: 'transparent',
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 8,
    fontFamily: 'inherit',
  },
  btnConfirm: {
    flex: 1,
    padding: '14px 20px',
    border: 'none',
    background: '#ffffff',
    color: '#000000',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 8,
    fontFamily: 'inherit',
  },

  // Sticky Footer
  stickyFooter: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    zIndex: 100,
  },
  addBtn: {
    width: '100%',
    maxWidth: 500,
    margin: '0 auto',
    display: 'block',
    padding: '16px 24px',
    border: 'none',
    background: '#ffffff',
    color: '#000000',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 12,
    fontFamily: 'inherit',
  },
  inputForm: {
    maxWidth: 500,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    border: '1px solid #333340',
    background: '#0a0b0d',
    color: '#ffffff',
    fontSize: 14,
    borderRadius: 8,
    fontFamily: 'inherit',
  },
  submitBtn: {
    padding: '12px 20px',
    border: 'none',
    background: '#39ff14',
    color: '#000000',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    borderRadius: 8,
  },
  cancelInputBtn: {
    padding: '12px 16px',
    border: '1px solid #333340',
    background: 'transparent',
    color: '#6b7280',
    fontSize: 18,
    cursor: 'pointer',
    borderRadius: 8,
  },

  // Trade History styles
  tradeHistorySection: {
    marginTop: 32,
    marginBottom: 32,
  },
  tradeHistoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: '1px solid #222228',
  },
  tradeHistoryTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#6b7280',
  },
  refreshBtn: {
    padding: '6px 12px',
    border: '1px solid #333340',
    background: 'transparent',
    color: '#9ca3af',
    fontFamily: '"SF Mono", monospace',
    fontSize: 11,
    cursor: 'pointer',
    borderRadius: 6,
  },
  eventCard: {
    background: '#0a0b0d',
    border: '1px solid #1a1a1f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: '#ffffff',
  },
  eventMeta: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  leagueBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#1a1a1f',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
  },
  eventPnl: {
    fontSize: 18,
    fontWeight: 600,
    fontFamily: '"SF Mono", monospace',
  },
  eventStats: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  tradesList: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #1a1a1f',
  },
  tradeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: 12,
    color: '#9ca3af',
  },
  tradeSideBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    marginRight: 8,
  },
  tradePnl: {
    fontSize: 11,
    fontFamily: '"SF Mono", monospace',
  },
};

export default ScalpingDashboard;
