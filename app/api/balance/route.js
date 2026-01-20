import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Try /v1/portfolio/balance first, fall back to /v1/account/balance
    let balance;
    let lastError;

    for (const endpoint of ['/v1/portfolio/balance', '/v1/account/balance']) {
      try {
        console.log(`Trying balance endpoint: ${endpoint}`);
        balance = await polymarketFetch('GET', endpoint);
        console.log(`Balance API response from ${endpoint}:`, JSON.stringify(balance, null, 2));
        break;
      } catch (err) {
        console.log(`Endpoint ${endpoint} failed:`, err.message);
        lastError = err;
      }
    }

    if (!balance) {
      // Balance endpoint not available - return empty response instead of error
      // This allows the app to continue working without balance display
      console.log('All balance endpoints failed, returning null balance');
      return NextResponse.json({ balance: null, unavailable: true });
    }

    return NextResponse.json(balance);
  } catch (error) {
    console.error('Failed to fetch balance:', error);
    // Return a null balance instead of an error to prevent UI disruption
    return NextResponse.json({ balance: null, unavailable: true });
  }
}
