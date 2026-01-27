#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

const LEAGUES = {
  nba: `${ESPN_BASE_URL}/basketball/nba/teams`,
  nfl: `${ESPN_BASE_URL}/football/nfl/teams`,
  nhl: `${ESPN_BASE_URL}/hockey/nhl/teams`,
  mlb: `${ESPN_BASE_URL}/baseball/mlb/teams`,
  ncaab: `${ESPN_BASE_URL}/basketball/mens-college-basketball/teams`,
};

function normalizeTeamName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLeagueTeams(league, url) {
  console.log(`Fetching ${league.toUpperCase()} teams...`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    
    return teams.map(teamData => {
      const team = teamData.team;
      return {
        id: team.id,
        name: team.displayName,
        shortName: team.shortDisplayName,
        abbreviation: team.abbreviation,
        normalizedName: normalizeTeamName(team.displayName),
        location: team.location,
        nickname: team.name,
        color: team.color || null,
        alternateColor: team.alternateColor || null,
        league: league.toUpperCase(),
        record: {
          wins: null,
          losses: null,
          ties: null,
          winPct: null,
        },
        stats: {
          pointsPerGame: null,
          pointsAllowed: null,
          totalYards: null,
          passingYards: null,
          rushingYards: null,
        },
        lastUpdated: new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error(`Failed to fetch ${league} teams:`, error.message);
    return [];
  }
}

async function fetchTeamRecord(league, teamId) {
  const recordUrl = `${ESPN_BASE_URL}/${getLeagueRoute(league)}/${league}/teams/${teamId}`;
  
  try {
    const response = await fetch(recordUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    const team = data.team;
    
    if (team.record?.items?.[0]) {
      const record = team.record.items[0];
      return {
        wins: parseInt(record.stats?.find(s => s.name === 'wins')?.value || 0),
        losses: parseInt(record.stats?.find(s => s.name === 'losses')?.value || 0),
        ties: parseInt(record.stats?.find(s => s.name === 'ties')?.value || 0),
        winPct: parseFloat(record.stats?.find(s => s.name === 'winPercent')?.value || 0),
      };
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch record for team ${teamId}:`, error.message);
    return null;
  }
}

function getLeagueRoute(league) {
  const routes = {
    nba: 'basketball',
    nfl: 'football', 
    nhl: 'hockey',
    mlb: 'baseball',
    ncaab: 'basketball/mens-college-basketball',
  };
  return routes[league] || 'basketball';
}

async function scrapeAllTeams() {
  console.log('🏈 Starting team statistics scraper...');
  
  const allTeams = {};
  
  for (const [league, url] of Object.entries(LEAGUES)) {
    const teams = await fetchLeagueTeams(league, url);
    
    console.log(`✅ Found ${teams.length} teams in ${league.toUpperCase()}`);
    
    for (const team of teams.slice(0, 5)) {
      const record = await fetchTeamRecord(league, team.id);
      if (record) {
        team.record = record;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    allTeams[league] = teams;
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const outputPath = path.join(__dirname, '..', 'data', 'team-stats.json');
  
  const output = {
    lastUpdated: new Date().toISOString(),
    leagues: allTeams,
    _meta: {
      totalTeams: Object.values(allTeams).reduce((sum, teams) => sum + teams.length, 0),
      generatedBy: 'scripts/update-team-stats.js',
      version: '1.0.0',
    },
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log('📊 Team statistics saved to:', outputPath);
  console.log(`🎯 Total teams: ${output._meta.totalTeams}`);
  
  Object.entries(allTeams).forEach(([league, teams]) => {
    console.log(`  ${league.toUpperCase()}: ${teams.length} teams`);
  });
  
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeAllTeams()
    .then(() => {
      console.log('✅ Scraper completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Scraper failed:', error);
      process.exit(1);
    });
}

export { scrapeAllTeams, normalizeTeamName };