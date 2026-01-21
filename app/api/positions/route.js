import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const positions = await polymarketFetch('GET', '/v1/portfolio/positions');
    console.log('Full positions response:', JSON.stringify(positions, null, 2));
    return NextResponse.json(positions);
  } catch (error) {
    console.error('Failed to fetch positions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
