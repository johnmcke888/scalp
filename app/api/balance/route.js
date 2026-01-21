import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Try multiple endpoints to find balance data
    const endpoints = [
      '/v1/portfolio/balance',
      '/v1/account/balance',
      '/v1/account',
      '/v1/portfolio',
      '/v1/user/balance',
      '/v1/wallet/balance',
    ];

    let balance = null;

    for (const endpoint of endpoints) {
      try {
        console.log(`Trying balance endpoint: ${endpoint}`);
        const data = await polymarketFetch('GET', endpoint);
        console.log(`Response from ${endpoint}:`, JSON.stringify(data, null, 2));

        // Extract balance from various possible response formats
        const extractedBalance = data.balance ?? data.cash ?? data.available ??
                                 data.cashBalance ?? data.availableBalance ??
                                 data.usdcBalance ?? data.usdc ?? null;

        if (extractedBalance !== null && extractedBalance !== undefined) {
          balance = extractedBalance;
          console.log(`Found balance: ${balance} from ${endpoint}`);
          break;
        }
      } catch (err) {
        console.log(`Endpoint ${endpoint} failed:`, err.message);
      }
    }

    // If no dedicated balance endpoint works, try to get balance from positions response
    if (balance === null) {
      try {
        console.log('Trying to extract balance from positions response...');
        const positions = await polymarketFetch('GET', '/v1/portfolio/positions');
        console.log('Positions response for balance extraction:', JSON.stringify(positions, null, 2));

        // Check if there's balance data in the positions response
        if (positions.balance !== undefined) {
          balance = positions.balance;
        } else if (positions.cash !== undefined) {
          balance = positions.cash;
        } else if (positions.availableCash !== undefined) {
          balance = positions.availableCash;
        }
      } catch (err) {
        console.log('Failed to extract balance from positions:', err.message);
      }
    }

    if (balance === null) {
      console.log('All balance endpoints failed, returning null balance');
      return NextResponse.json({ balance: null, unavailable: true });
    }

    return NextResponse.json({ balance });
  } catch (error) {
    console.error('Failed to fetch balance:', error);
    return NextResponse.json({ balance: null, unavailable: true });
  }
}
