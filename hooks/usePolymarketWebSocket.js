'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function usePolymarketWebSocket(slugs, pin) {
  const eventSourceRef = useRef(null);
  const [prices, setPrices] = useState({});
  const [events, setEvents] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const currentSlugsRef = useRef([]);
  const pinRef = useRef(pin);

  // Keep pin ref updated
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  const handleMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.data);

      // Log all messages for debugging (except heartbeats)
      if (msg.type !== 'heartbeat') {
        console.log('SSE message:', msg);
      }

      // Handle connection event
      if (msg.type === 'connected') {
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        return;
      }

      // Handle disconnection
      if (msg.type === 'disconnected') {
        setConnected(false);
        return;
      }

      // Handle heartbeat (keep-alive)
      if (msg.type === 'heartbeat') {
        return;
      }

      // Handle error
      if (msg.type === 'error') {
        console.error('SSE error message:', msg);
        setError(msg.message || 'Stream error');
        return;
      }

      // Handle market data updates from Polymarket (camelCase format)
      // Actual format: { marketDataLite: { marketSlug: "...", currentPx: { value: "0.828" }, ... } }
      if (msg.marketDataLite) {
        const data = msg.marketDataLite;
        const slug = data.marketSlug;

        // Log full structure to understand all available fields
        console.log('WS marketDataLite for', slug, ':', JSON.stringify(data, null, 2));

        if (slug && data.currentPx) {
          const currentPrice = parseFloat(data.currentPx.value);
          const lastTradePrice = data.lastTradePx ? parseFloat(data.lastTradePx.value) : undefined;
          const settlementPrice = data.settlementPx ? parseFloat(data.settlementPx.value) : undefined;
          const sharesTraded = data.sharesTraded ? parseFloat(data.sharesTraded) : undefined;

          // Check if we have outcomes array (per-side prices)
          if (data.outcomes && Array.isArray(data.outcomes)) {
            const sidesData = {};
            for (const outcome of data.outcomes) {
              const name = outcome.name || outcome.outcomeName;
              const price = outcome.price || outcome.currentPx?.value;
              if (name && price !== undefined) {
                sidesData[name] = parseFloat(price);
              }
            }
            if (Object.keys(sidesData).length > 0) {
              setPrices(prev => ({
                ...prev,
                [slug]: {
                  sides: sidesData,
                  currentPx: currentPrice,
                  lastTradePx: lastTradePrice,
                  settlementPx: settlementPrice,
                  sharesTraded: sharesTraded,
                }
              }));
              return;
            }
          }

          // Single price format - currentPx appears to be the market's "Yes" price
          // For binary markets: Yes price + No price = 1.0 (approximately)
          // Store the single price and let the UI component calculate sides if needed
          setPrices(prev => {
            const existing = prev[slug] || {};
            return {
              ...prev,
              [slug]: {
                ...existing,
                currentPx: currentPrice,
                lastTradePx: lastTradePrice,
                settlementPx: settlementPrice,
                sharesTraded: sharesTraded,
                // For single-price format, we can infer both sides
                // currentPx is typically the "first outcome" price
                inferredYesPrice: currentPrice,
                inferredNoPrice: 1 - currentPrice,
              }
            };
          });
        }
        return;
      }

      // Also check snake_case format (legacy/fallback)
      if (msg.market_data_lite) {
        const data = msg.market_data_lite;
        const slug = data.slug || data.market_slug;
        console.log('WS market_data_lite (snake_case) for', slug, ':', JSON.stringify(data, null, 2));
        if (slug && data.outcomes) {
          const sidesData = {};
          for (const outcome of data.outcomes) {
            if (outcome.name && outcome.price !== undefined) {
              sidesData[outcome.name] = parseFloat(outcome.price);
            }
          }
          if (Object.keys(sidesData).length > 0) {
            setPrices(prev => ({
              ...prev,
              [slug]: {
                sides: sidesData,
                bestBid: data.best_bid ? parseFloat(data.best_bid) : undefined,
                bestAsk: data.best_ask ? parseFloat(data.best_ask) : undefined,
              }
            }));
          }
        }
        return;
      }

      // Alternative format: subscription confirmation
      if (msg.subscribed || msg.subscribe_response || msg.subscriptionType) {
        console.log('Subscription message:', msg);
        return;
      }

      // Handle generic market updates (adapt to actual format)
      const slug = msg.slug || msg.market_slug || msg.marketSlug;
      const data = msg.data || msg;

      if (slug && (data.sides || data.marketSides || data.outcomes)) {
        let sidesData = {};

        if (data.sides) {
          // Format: { sides: { "Rockets": { price: 0.507 } } } or { sides: { "Rockets": 0.507 } }
          Object.entries(data.sides).forEach(([side, sideInfo]) => {
            if (typeof sideInfo === 'number') {
              sidesData[side] = sideInfo;
            } else if (sideInfo && typeof sideInfo === 'object') {
              sidesData[side] = sideInfo.price || sideInfo.lastPrice || sideInfo.ask;
            }
          });
        } else if (data.marketSides) {
          // Format: { marketSides: [{ description: "Rockets", price: 0.507 }] }
          data.marketSides.forEach(side => {
            if (side.description) {
              sidesData[side.description] = parseFloat(side.price) || null;
            }
          });
        } else if (data.outcomes) {
          // Format: { outcomes: [{ name: "Rockets", price: "0.507" }] }
          data.outcomes.forEach(outcome => {
            if (outcome.name) {
              sidesData[outcome.name] = parseFloat(outcome.price) || null;
            }
          });
        }

        if (Object.keys(sidesData).length > 0) {
          setPrices(prev => ({
            ...prev,
            [slug]: {
              sides: sidesData,
              bestBid: data.bestBid,
              bestAsk: data.bestAsk,
              lastTradePrice: data.lastTradePrice,
              spread: data.spread
            }
          }));
        }

        // Extract event data (scores, periods, etc.)
        const eventInfo = data.event || data.events?.[0];
        if (eventInfo) {
          setEvents(prev => ({
            ...prev,
            [slug]: {
              score: eventInfo.score || null,
              period: eventInfo.period || null,
              elapsed: eventInfo.elapsed || null,
              live: eventInfo.live || false,
              ended: eventInfo.ended || false,
            }
          }));
        }
      }
    } catch (e) {
      console.error('Error parsing SSE message:', e, event.data);
    }
  }, []);

  const connectWithSlugs = useCallback((slugsToConnect) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!slugsToConnect || slugsToConnect.length === 0) {
      return;
    }

    // Truncate to max 10 instruments
    let slugsToUse = slugsToConnect;
    if (slugsToUse.length > 10) {
      console.warn('WebSocket supports max 10 instruments, truncating');
      slugsToUse = slugsToUse.slice(0, 10);
    }

    currentSlugsRef.current = slugsToUse;

    const slugsParam = slugsToUse.join(',');
    const url = `/api/ws-stream?pin=${encodeURIComponent(pinRef.current)}&slugs=${encodeURIComponent(slugsParam)}`;

    console.log('Connecting to SSE stream:', url);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connection opened');
    };

    eventSource.onmessage = handleMessage;

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setConnected(false);
      setError('Connection error');

      // Close the errored connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Schedule reconnect with exponential backoff
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current})`);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (currentSlugsRef.current.length > 0) {
            connectWithSlugs(currentSlugsRef.current);
          }
        }, delay);
      } else {
        setError('Connection failed. Click sync to retry.');
      }
    };
  }, [handleMessage]);

  const connect = useCallback(() => {
    // Reset reconnect attempts on manual connect
    reconnectAttemptsRef.current = 0;
    setError(null);

    // Truncate to max 10 instruments per WebSocket limit
    let slugsToUse = slugs || [];
    if (slugsToUse.length === 0) return;

    connectWithSlugs(slugsToUse);
  }, [slugs, connectWithSlugs]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  // Update subscription when slugs change - reconnect with new slugs
  const updateSubscription = useCallback((newSlugs) => {
    if (!newSlugs || newSlugs.length === 0) return;

    let slugsToUse = newSlugs;
    if (slugsToUse.length > 10) {
      console.warn('WebSocket supports max 10 instruments, truncating');
      slugsToUse = slugsToUse.slice(0, 10);
    }

    // Check if slugs actually changed
    const oldSlugs = [...currentSlugsRef.current].sort().join(',');
    const newSlugsSorted = [...slugsToUse].sort().join(',');

    if (oldSlugs !== newSlugsSorted) {
      console.log('Slugs changed, reconnecting...');
      // Clear any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      connectWithSlugs(slugsToUse);
    }
  }, [connectWithSlugs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    prices,
    events,
    connected,
    error,
    connect,
    disconnect,
    updateSubscription
  };
}
