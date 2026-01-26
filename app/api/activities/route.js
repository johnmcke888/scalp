import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse optional query params for filtering
  const url = new URL(request.url);
  const type = url.searchParams.get('type'); // e.g., 'ACTIVITY_TYPE_POSITION_RESOLUTION'

  // List of possible base endpoint variations to try (without pagination params)
  const baseEndpoints = [
    `/v1/portfolio/activities`,
    `/v1/portfolio/activity`,
    `/v1/user/activities`,
    `/v1/account/activities`,
    `/v1/portfolio/trades`,
    `/v1/portfolio/history`,
  ];

  let lastError = null;
  let successEndpoint = null;

  // Step 1: Find which endpoint works by testing with no params
  for (const endpoint of baseEndpoints) {
    try {
      console.log(`Testing activities endpoint: ${endpoint}`);
      await polymarketFetch('GET', endpoint);
      successEndpoint = endpoint;
      console.log(`Found working endpoint: ${successEndpoint}`);
      break;
    } catch (err) {
      console.log(`Endpoint ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }

  if (!successEndpoint) {
    console.error('All activities endpoints failed. Last error:', lastError?.message);
    return NextResponse.json(
      {
        error: 'Failed to fetch activities from all known endpoints',
        details: lastError?.message,
        triedEndpoints: baseEndpoints,
      },
      { status: 500 }
    );
  }

  // Step 2: Implement cursor-based pagination to fetch ALL activities
  const allActivities = [];
  let cursor = null;
  let eof = false;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety limit

  while (!eof && pageCount < MAX_PAGES) {
    // Build URL with cursor-based pagination (NOT limit/offset)
    let endpoint = successEndpoint;
    const queryParams = [];
    
    if (cursor) {
      queryParams.push(`cursor=${cursor}`);  // Try without encoding
    }
    if (type) {
      queryParams.push(`type=${encodeURIComponent(type)}`);
    }
    
    if (queryParams.length > 0) {
      endpoint += '?' + queryParams.join('&');
    }

    try {
      console.log(`\n=== PAGE ${pageCount + 1} REQUEST ===`);
      console.log(`Base endpoint: ${successEndpoint}`);
      console.log(`Query params: [${queryParams.join(', ')}]`);
      console.log(`Final endpoint: ${endpoint}`);
      console.log(`Cursor: ${cursor ? cursor.slice(0, 50) + '...' : 'none'}`);
      console.log(`==============================`);
      const data = await polymarketFetch('GET', endpoint);
      
      const activities = data?.activities || [];
      allActivities.push(...activities);

      // Update pagination state using cursor-based approach
      cursor = data?.nextCursor || null;
      eof = data?.eof === true || !cursor || activities.length === 0;
      pageCount++;

      console.log(`Got ${activities.length} activities, total: ${allActivities.length}, eof: ${eof}, nextCursor: ${cursor || 'null'}`);

      // Log structure on first page only
      if (pageCount === 1) {
        console.log('Activities data structure:', JSON.stringify(data, null, 2).slice(0, 2000));
      }

    } catch (err) {
      console.error(`Failed to fetch page ${pageCount + 1}:`, err.message);
      // If we have some data, return it; otherwise fail
      if (allActivities.length > 0) {
        console.log('Returning partial results due to error');
        break;
      } else {
        throw err;
      }
    }
  }

  console.log(`Pagination complete. Total activities fetched: ${allActivities.length} across ${pageCount} pages`);

  return NextResponse.json({
    data: {
      activities: allActivities,
    },
    _meta: {
      endpoint: successEndpoint,
      totalActivities: allActivities.length,
      pagesFetched: pageCount,
      paginationComplete: eof || pageCount >= MAX_PAGES,
    }
  });
}
