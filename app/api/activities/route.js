import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse optional query params for filtering/pagination
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit') || '100';
  const offset = url.searchParams.get('offset') || '0';
  const type = url.searchParams.get('type'); // e.g., 'ACTIVITY_TYPE_POSITION_RESOLUTION'

  // Build query string for the API
  let queryString = `?limit=${limit}&offset=${offset}`;
  if (type) {
    queryString += `&type=${encodeURIComponent(type)}`;
  }

  // List of possible endpoint variations to try
  const endpoints = [
    `/v1/portfolio/activities${queryString}`,
    `/v1/portfolio/activities`,  // Try without query params
    `/v1/portfolio/activity${queryString}`,
    `/v1/portfolio/activity`,
    `/v1/user/activities${queryString}`,
    `/v1/user/activities`,
    `/v1/account/activities${queryString}`,
    `/v1/account/activities`,
    `/v1/portfolio/trades${queryString}`,
    `/v1/portfolio/trades`,
    `/v1/portfolio/history${queryString}`,
    `/v1/portfolio/history`,
  ];

  let lastError = null;
  let successEndpoint = null;

  for (const endpoint of endpoints) {
    try {
      console.log(`Trying activities endpoint: ${endpoint}`);
      const data = await polymarketFetch('GET', endpoint);

      // Log the raw response for debugging
      console.log('Activities API status: 200');
      console.log(`Activities API success from: ${endpoint}`);
      console.log('Activities data structure:', JSON.stringify(data, null, 2).slice(0, 2000));

      successEndpoint = endpoint;

      return NextResponse.json({
        data,
        _meta: {
          endpoint: successEndpoint,
          limit: parseInt(limit),
          offset: parseInt(offset),
        }
      });
    } catch (err) {
      console.log(`Endpoint ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }

  // All endpoints failed
  console.error('All activities endpoints failed. Last error:', lastError?.message);
  console.log('Tried endpoints:', endpoints);

  return NextResponse.json(
    {
      error: 'Failed to fetch activities from all known endpoints',
      details: lastError?.message,
      triedEndpoints: endpoints,
    },
    { status: 500 }
  );
}
