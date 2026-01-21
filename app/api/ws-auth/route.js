import { NextResponse } from 'next/server';
import { signRequest, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.POLYMARKET_API_KEY;
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    return NextResponse.json(
      { error: 'Missing POLYMARKET_API_KEY or POLYMARKET_PRIVATE_KEY' },
      { status: 500 }
    );
  }

  try {
    // Sign the WebSocket endpoint
    const method = 'GET';
    const path = '/v1/ws/markets';

    const { timestamp, signature } = await signRequest(method, path, privateKey);

    return NextResponse.json({
      wsUrl: 'wss://api.polymarket.us/v1/ws/markets',
      authMessage: {
        type: 'auth',
        apiKey: apiKey,
        timestamp: timestamp,
        signature: signature
      }
    });
  } catch (error) {
    console.error('WS auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth: ' + error.message },
      { status: 500 }
    );
  }
}
