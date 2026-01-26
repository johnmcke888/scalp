#!/usr/bin/env node
/**
 * Test script to probe Polymarket API for resolution/settlement endpoints
 * Run with: node scripts/test-resolution-endpoint.js
 *
 * Tests various endpoint patterns to find where position resolutions live.
 * The activities API pagination cursor contains PositionResolutionCursor,
 * proving resolutions ARE tracked somewhere - we just need to find where.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PIN = process.env.PM_PIN || '0157'; // User's PIN

async function testEndpoint(path, description) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing: ${description}`);
  console.log(`GET ${path}`);
  console.log('─'.repeat(60));

  try {
    const res = await fetch(`${BASE}${path}`);
    const data = await res.json();

    console.log(`Status: ${res.status}`);

    if (data.error) {
      console.log(`Error: ${data.error}`);
      return { success: false, error: data.error };
    }

    // Handle direct activities response
    if (data.data?.activities) {
      console.log(`Activities count: ${data.data.activities.length}`);
      const types = [...new Set(data.data.activities.map(a => a.type))];
      console.log(`Activity types found:`, types);

      // Look for non-trade types
      const nonTrades = data.data.activities.filter(a => a.type !== 'ACTIVITY_TYPE_TRADE');
      if (nonTrades.length > 0) {
        console.log(`\n*** FOUND NON-TRADE ACTIVITIES ***`);
        nonTrades.forEach(a => {
          console.log(`  Type: ${a.type}`);
          console.log(`  Preview: ${JSON.stringify(a).slice(0, 200)}...`);
        });
      }

      return { success: true, count: data.data.activities.length, types };
    }

    // Handle resolution probe response
    if (data._meta?.successful) {
      console.log(`Successful endpoints: ${data._meta.successfulEndpoints}`);
      data._meta.successful.forEach(s => {
        console.log(`  - ${s.endpoint}`);
        if (s.activityTypes) {
          console.log(`    Types: ${s.activityTypes.join(', ')}`);
        }
      });
      return { success: true, results: data._meta.successful };
    }

    console.log(`Response keys:`, Object.keys(data));
    return { success: true, data };
  } catch (err) {
    console.log(`Failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('POLYMARKET RESOLUTION ENDPOINT DISCOVERY');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE}`);
  console.log(`PIN: ${PIN}`);

  const results = [];

  // Test 1: Activities with high limit to find all types
  results.push(await testEndpoint(
    `/api/activities?pin=${PIN}&limit=500`,
    'All activities (limit 500)'
  ));

  // Test 2: Activities with various type filters
  const typeFilters = [
    'ACTIVITY_TYPE_POSITION_RESOLUTION',
    'ACTIVITY_TYPE_SETTLEMENT',
    'ACTIVITY_TYPE_PAYOUT',
    'RESOLUTION',
    'SETTLEMENT',
    'PAYOUT',
    'ACTIVITY_TYPE_WITHDRAWAL',
    'ACTIVITY_TYPE_DEPOSIT',
  ];

  for (const type of typeFilters) {
    results.push(await testEndpoint(
      `/api/activities?pin=${PIN}&type=${type}&limit=100`,
      `Filter: ${type}`
    ));
  }

  // Test 3: Resolution probe endpoint (tests multiple endpoints in one call)
  results.push(await testEndpoint(
    `/api/resolutions?pin=${PIN}&limit=100`,
    'Resolution endpoint probe'
  ));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  console.log(`Total tests: ${results.length}`);
  console.log(`Successful: ${successCount}`);

  console.log('\nKey findings:');
  console.log('- Look for any non-TRADE, non-WITHDRAWAL activity types');
  console.log('- Check if any endpoint returns resolution/settlement/payout data');
  console.log('- The PositionResolutionCursor field in pagination proves resolutions exist');
  console.log('\nIf no resolution data found, resolutions may require:');
  console.log('1. Different authentication scope');
  console.log('2. A completely different API path not yet discovered');
  console.log('3. Manual tracking via the "Held to Resolution" UI feature');
}

main().catch(console.error);
