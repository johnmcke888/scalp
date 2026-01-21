'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function usePolymarketWebSocket(slugs, pin) {
  const wsRef = useRef(null);
  const [prices, setPrices] = useState({});
  const [events, setEvents] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const currentSlugsRef = useRef([]);

  const connect = useCallback(async () => {
    // Truncate to max 10 instruments per WebSocket limit
    let slugsToUse = slugs || [];
    if (slugsToUse.length === 0) return;
    if (slugsToUse.length > 10) {
      console.warn('WebSocket supports max 10 instruments, truncating');
      slugsToUse = slugsToUse.slice(0, 10);
    }

    // Store current slugs for reference
    currentSlugsRef.current = slugsToUse;

    try {
      // Get WebSocket auth from our API route
      const authRes = await fetch(`/api/ws-auth?pin=${encodeURIComponent(pin)}`);
      if (!authRes.ok) {
        const errData = await authRes.json();
        throw new Error(errData.error || 'Failed to get WebSocket auth');
      }
      const { wsUrl, authMessage } = await authRes.json();

      // Close any existing connection
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Send auth message
        ws.send(JSON.stringify(authMessage));

        // Subscribe to markets
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels: ['markets'],
          slugs: currentSlugsRef.current
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('WS message:', msg); // Debug logging

          // Handle different message types
          if (msg.type === 'error') {
            console.error('WS error message:', msg);
            setError(msg.message || 'WebSocket error');
            return;
          }

          if (msg.type === 'auth_success' || msg.type === 'authenticated') {
            console.log('WebSocket authenticated');
            return;
          }

          if (msg.type === 'subscribed') {
            console.log('WebSocket subscribed to:', msg.slugs || msg.channels);
            return;
          }

          // Handle market updates - adapt to actual message format
          // The format may vary, so we handle multiple possibilities
          const slug = msg.slug || msg.market_slug || msg.marketSlug;
          const data = msg.data || msg;

          if (slug && (data.sides || data.marketSides || data.bestBid !== undefined)) {
            // Extract sides data
            let sidesData = {};
            if (data.sides) {
              // Format: { sides: { "Rockets": { price: 0.507, bid: 0.50, ask: 0.52 } } }
              // or: { sides: { "Rockets": 0.507 } }
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
            }

            // Update prices state
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

            // Extract and update event data (score, period, etc.)
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
          console.error('Error parsing WS message:', e, event.data);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnected(false);
        wsRef.current = null;

        // Reconnect with exponential backoff
        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setError('WebSocket disconnected. Click sync to retry.');
        }
      };

    } catch (err) {
      console.error('WebSocket setup error:', err);
      setError(err.message);
    }
  }, [slugs, pin]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  // Update subscription when slugs change
  const updateSubscription = useCallback((newSlugs) => {
    if (!newSlugs || newSlugs.length === 0) return;

    let slugsToUse = newSlugs;
    if (slugsToUse.length > 10) {
      console.warn('WebSocket supports max 10 instruments, truncating');
      slugsToUse = slugsToUse.slice(0, 10);
    }

    currentSlugsRef.current = slugsToUse;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Unsubscribe from all first, then subscribe to new list
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        channels: ['markets']
      }));

      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channels: ['markets'],
        slugs: slugsToUse
      }));
    }
  }, []);

  // Reset reconnect attempts when manually connecting
  const manualConnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

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
    connect: manualConnect,
    disconnect,
    updateSubscription
  };
}
