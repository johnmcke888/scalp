import { signWebSocketRequest, validatePin } from '@/lib/polymarket';
import WebSocket from 'ws';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get('pin');
  const slugs = searchParams.get('slugs')?.split(',').filter(Boolean) || [];

  // Validate PIN
  if (!validatePin(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (slugs.length === 0) {
    return new Response('No slugs provided', { status: 400 });
  }

  const apiKey = process.env.POLYMARKET_API_KEY;
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    return new Response('Missing API credentials', { status: 500 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let ws = null;
      let closed = false;
      let heartbeatInterval = null;

      const sendSSE = (data) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            console.error('SSE send error:', e);
          }
        }
      };

      const cleanup = () => {
        closed = true;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };

      try {
        // Generate auth for WebSocket handshake
        const timestamp = Date.now().toString();
        const path = '/v1/ws/markets';
        const signature = await signWebSocketRequest(timestamp, 'GET', path, privateKey);

        console.log('Connecting to Polymarket WebSocket...');

        // Connect with auth headers (Node.js ws library supports this)
        ws = new WebSocket('wss://api.polymarket.us/v1/ws/markets', {
          headers: {
            'X-PM-Access-Key': apiKey,
            'X-PM-Timestamp': timestamp,
            'X-PM-Signature': signature,
          },
        });

        ws.on('open', () => {
          console.log('WebSocket connected to Polymarket');

          // Send SSE connection event
          sendSSE({ type: 'connected' });

          // Subscribe to markets using MARKET_DATA_LITE (subscription_type: 2)
          const subscribeMsg = {
            subscribe: {
              request_id: `sub-${Date.now()}`,
              subscription_type: 2, // MARKET_DATA_LITE
              market_slugs: slugs.slice(0, 10), // Max 10
            },
          };
          ws.send(JSON.stringify(subscribeMsg));
          console.log('Subscribed to:', slugs.slice(0, 10));

          // Send periodic heartbeats to keep SSE connection alive
          heartbeatInterval = setInterval(() => {
            sendSSE({ type: 'heartbeat', time: Date.now() });
          }, 30000);
        });

        ws.on('message', (data) => {
          if (closed) return;

          try {
            const msg = JSON.parse(data.toString());

            // Handle Polymarket heartbeat
            if (msg.heartbeat) {
              // Polymarket heartbeat - don't forward to client
              return;
            }

            // Forward all other messages to client
            sendSSE(msg);
          } catch (e) {
            console.error('Error parsing WS message:', e);
          }
        });

        ws.on('error', (err) => {
          console.error('WebSocket error:', err.message);
          sendSSE({ type: 'error', message: err.message });
        });

        ws.on('close', (code, reason) => {
          console.log('WebSocket closed:', code, reason?.toString());
          if (!closed) {
            sendSSE({ type: 'disconnected', code });
            cleanup();
            try {
              controller.close();
            } catch (e) {
              // Already closed
            }
          }
        });

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          console.log('Client disconnected, cleaning up WebSocket');
          cleanup();
        });

      } catch (err) {
        console.error('WebSocket setup error:', err);
        sendSSE({ type: 'error', message: err.message });
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
