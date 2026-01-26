import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse optional query params
  const url = new URL(request.url);
  const type = url.searchParams.get('type'); // e.g., 'ACTIVITY_TYPE_POSITION_RESOLUTION'
  const fetchAll = url.searchParams.get('fetchAll') !== 'false'; // Default to true
  
  const allActivities = [];
  let offset = 0;
  const limit = 100; // Fetch in chunks of 100

  // List of possible endpoint variations to try
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
  
  // Find the working endpoint first with a small test request
  for (const baseEndpoint of baseEndpoints) {
    try {
      const testQueryString = `?limit=1&offset=0`;
      const testEndpoint = `${baseEndpoint}${testQueryString}`;
      console.log(`Testing activities endpoint: ${testEndpoint}`);
      
      await polymarketFetch('GET', testEndpoint);
      successEndpoint = baseEndpoint;
      console.log(`Found working endpoint: ${successEndpoint}`);
      break;
    } catch (err) {
      console.log(`Endpoint ${baseEndpoint} failed:`, err.message);
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

  // Now fetch all activities using pagination
  if (fetchAll) {
    console.log('Fetching all activities with pagination...');
    
    while (true) {
      // Build query string for this page
      let queryString = `?limit=${limit}&offset=${offset}`;
      if (type) {
        queryString += `&type=${encodeURIComponent(type)}`;
      }

      try {
        const endpoint = `${successEndpoint}${queryString}`;
        console.log(`Fetching page: offset=${offset}, limit=${limit}`);
        
        const data = await polymarketFetch('GET', endpoint);
        const activities = data?.activities || [];
        
        if (activities.length === 0) {
          console.log(`No more activities found at offset ${offset}. Total fetched: ${allActivities.length}`);
          break;
        }
        
        allActivities.push(...activities);
        console.log(`Fetched ${activities.length} activities. Total so far: ${allActivities.length}`);
        
        // If we got less than the limit, we've reached the end
        if (activities.length < limit) {
          console.log('Reached end of activities (partial page)');
          break;
        }
        
        offset += limit;
        
        // Safety check to prevent infinite loops
        if (allActivities.length > 10000) {
          console.warn('Hit safety limit of 10000 activities');
          break;
        }
        
      } catch (err) {
        console.error(`Failed to fetch page at offset ${offset}:`, err.message);
        if (allActivities.length > 0) {
          // Return partial results if we got some data
          break;
        } else {
          throw err;
        }
      }
    }

    console.log(`Total activities fetched: ${allActivities.length}`);

    return NextResponse.json({
      data: {
        activities: allActivities,
        totalFetched: allActivities.length,
        paginationUsed: true,
      },
      _meta: {
        endpoint: successEndpoint,
        totalPages: Math.ceil(offset / limit),
        fetchAll: true,
      }
    });
    
  } else {
    // Fetch single page (legacy behavior)
    const limit = url.searchParams.get('limit') || '100';
    const offset = url.searchParams.get('offset') || '0';
    
    let queryString = `?limit=${limit}&offset=${offset}`;
    if (type) {
      queryString += `&type=${encodeURIComponent(type)}`;
    }

    try {
      const endpoint = `${successEndpoint}${queryString}`;
      const data = await polymarketFetch('GET', endpoint);

      return NextResponse.json({
        data,
        _meta: {
          endpoint: successEndpoint,
          limit: parseInt(limit),
          offset: parseInt(offset),
          fetchAll: false,
        }
      });
    } catch (err) {
      throw err;
    }
  }
}
