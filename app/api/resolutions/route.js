import { NextResponse } from 'next/server';
import { polymarketFetch, validatePin } from '@/lib/polymarket';

/**
 * Probes multiple potential endpoints to find where position resolutions are tracked.
 * The activities API pagination cursor contains PositionResolutionCursor, suggesting
 * resolutions ARE tracked somewhere - this endpoint helps discover where.
 */
export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit') || '100';

  // List of potential endpoints where resolutions might be tracked
  const endpointsToTry = [
    `/v1/portfolio/resolutions?limit=${limit}`,
    `/v1/portfolio/settlements?limit=${limit}`,
    `/v1/portfolio/payouts?limit=${limit}`,
    `/v1/portfolio/history?limit=${limit}`,
    `/v1/positions/resolved?limit=${limit}`,
    `/v1/positions/history?limit=${limit}`,
    `/v1/user/resolutions?limit=${limit}`,
    `/v1/user/settlements?limit=${limit}`,
    `/v1/account/resolutions?limit=${limit}`,
    `/v1/account/payouts?limit=${limit}`,
    // Try activities with different type filters
    `/v1/portfolio/activities?limit=${limit}&type=ACTIVITY_TYPE_POSITION_RESOLUTION`,
    `/v1/portfolio/activities?limit=${limit}&type=ACTIVITY_TYPE_SETTLEMENT`,
    `/v1/portfolio/activities?limit=${limit}&type=ACTIVITY_TYPE_PAYOUT`,
    `/v1/portfolio/activities?limit=${limit}&type=RESOLUTION`,
    `/v1/portfolio/activities?limit=${limit}&type=SETTLEMENT`,
    `/v1/portfolio/activities?limit=${limit}&type=PAYOUT`,
  ];

  const results = {};

  for (const endpoint of endpointsToTry) {
    try {
      console.log(`Probing endpoint: ${endpoint}`);
      const data = await polymarketFetch('GET', endpoint);

      results[endpoint] = {
        status: 200,
        dataKeys: Object.keys(data || {}),
        hasData: true,
        preview: JSON.stringify(data).slice(0, 500),
      };

      // If this is an activities response, log the types found
      if (data?.data?.activities) {
        const types = [...new Set(data.data.activities.map(a => a.type))];
        results[endpoint].activityTypes = types;
        results[endpoint].activityCount = data.data.activities.length;
      }

      console.log(`Endpoint ${endpoint} SUCCESS`);
    } catch (err) {
      const statusMatch = err.message.match(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 500;

      results[endpoint] = {
        status,
        error: err.message,
        hasData: false,
      };

      console.log(`Endpoint ${endpoint} failed: ${err.message}`);
    }
  }

  // Summarize findings
  const successfulEndpoints = Object.entries(results)
    .filter(([_, r]) => r.hasData)
    .map(([endpoint, r]) => ({
      endpoint,
      activityTypes: r.activityTypes,
      activityCount: r.activityCount,
    }));

  return NextResponse.json({
    results,
    _meta: {
      testedEndpoints: endpointsToTry.length,
      successfulEndpoints: successfulEndpoints.length,
      successful: successfulEndpoints,
    },
  });
}
