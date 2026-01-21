// lib/teamColors.js

// Known team colors (extend as needed)
const TEAM_COLORS = {
  // NBA
  'Lakers': '#552583',
  'Celtics': '#007A33',
  'Warriors': '#1D428A',
  'Heat': '#98002E',
  'Bulls': '#CE1141',
  'Knicks': '#006BB6',
  'Nets': '#000000',
  'Cavaliers': '#860038',
  'Hornets': '#1D1160',
  'Pacers': '#002D62',
  'Mavericks': '#00538C',
  'Spurs': '#C4CED4',
  'Suns': '#1D1160',
  'Nuggets': '#0E2240',
  'Clippers': '#C8102E',
  'Bucks': '#00471B',
  'Raptors': '#CE1141',
  'Sixers': '#006BB6',
  '76ers': '#006BB6',
  'Hawks': '#E03A3E',
  'Magic': '#0077C0',
  'Wizards': '#002B5C',
  'Pistons': '#C8102E',
  'Grizzlies': '#5D76A9',
  'Pelicans': '#0C2340',
  'Timberwolves': '#0C2340',
  'Thunder': '#007AC1',
  'Blazers': '#E03A3E',
  'Trail Blazers': '#E03A3E',
  'Jazz': '#002B5C',
  'Kings': '#5A2D81',
  // NFL
  'Chiefs': '#E31837',
  'Eagles': '#004C54',
  'Bills': '#00338D',
  'Cowboys': '#003594',
  '49ers': '#AA0000',
  'Patriots': '#002244',
  'Packers': '#203731',
  'Steelers': '#FFB612',
  'Ravens': '#241773',
  'Broncos': '#FB4F14',
  'Raiders': '#000000',
  'Chargers': '#0080C6',
  'Dolphins': '#008E97',
  'Jets': '#125740',
  'Giants': '#0B2265',
  'Commanders': '#5A1414',
  'Bears': '#0B162A',
  'Lions': '#0076B6',
  'Vikings': '#4F2683',
  'Saints': '#D3BC8D',
  'Falcons': '#A71930',
  'Panthers': '#0085CA',
  'Buccaneers': '#D50A0A',
  'Cardinals': '#97233F',
  'Rams': '#003594',
  'Seahawks': '#002244',
  'Bengals': '#FB4F14',
  'Browns': '#311D00',
  'Titans': '#0C2340',
  'Colts': '#002C5F',
  'Jaguars': '#006778',
  'Texans': '#03202F',
  // MLB
  'Yankees': '#003087',
  'Dodgers': '#005A9C',
  'Red Sox': '#BD3039',
  'Cubs': '#0E3386',
  'Mets': '#002D72',
  'Braves': '#CE1141',
  'Astros': '#002D62',
  'Phillies': '#E81828',
  'Padres': '#2F241D',
  'Mariners': '#0C2C56',
  'Blue Jays': '#134A8E',
  'Twins': '#002B5C',
  'Guardians': '#00385D',
  'Orioles': '#DF4601',
  'Rays': '#092C5C',
  'Tigers': '#0C2340',
  'Royals': '#004687',
  'White Sox': '#27251F',
  'Reds': '#C6011F',
  'Brewers': '#12284B',
  'Pirates': '#27251F',
  'Rockies': '#333366',
  'Diamondbacks': '#A71930',
  'Athletics': '#003831',
  'Angels': '#BA0021',
  'Rangers': '#003278',
  'Marlins': '#00A3E0',
  'Nationals': '#AB0003',
  // College (common)
  'Minutemen': '#881C1C',
  'Wildcats': '#4E2A84',
  'Bulldogs': '#BA0C2F',
  'Crimson Tide': '#9E1B32',
  'Buckeyes': '#BB0000',
  'Wolverines': '#00274C',
  'Fighting Irish': '#0C2340',
  'Trojans': '#990000',
  'Longhorns': '#BF5700',
  'Sooners': '#841617',
  'Gators': '#0021A5',
  'Seminoles': '#782F40',
  'Hurricanes': '#F47321',
  'Blue Devils': '#003087',
  'Tar Heels': '#7BAFD4',
  'Wolfpack': '#CC0000',
  'Yellow Jackets': '#B3A369',
  'Volunteers': '#FF8200',
  'Razorbacks': '#9D2235',
  'Aggies': '#500000',
  'Jayhawks': '#0051BA',
  'Spartans': '#18453B',
  'Hawkeyes': '#FFCD00',
  'Badgers': '#C5050C',
  'Nittany Lions': '#041E42',
  'Hoosiers': '#990000',
  'Boilermakers': '#CEB888',
  'Illini': '#E84A27',
  'Golden Gophers': '#7A0019',
  'Cornhuskers': '#E41C38',
  'Ducks': '#154733',
  'Huskies': '#4B2E83',
  'Cougars': '#981E32',
  'Beavers': '#DC4405',
  'Sun Devils': '#8C1D40',
  'Bruins': '#2D68C4',
  'Utes': '#CC0000',
  'Buffaloes': '#CFB87C',
};

// Generate a consistent color from a string (for unknown teams)
// Uses the team name to generate a deterministic HSL color
function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Generate HSL with good saturation and lightness for visibility
  const h = Math.abs(hash) % 360;
  const s = 65 + (Math.abs(hash >> 8) % 20); // 65-85% saturation
  const l = 35 + (Math.abs(hash >> 16) % 15); // 35-50% lightness
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function getTeamColor(teamName) {
  if (!teamName) return '#666';

  // Check exact match first
  if (TEAM_COLORS[teamName]) {
    return TEAM_COLORS[teamName];
  }

  // Check if team name contains a known team (e.g., "Los Angeles Lakers" contains "Lakers")
  for (const [team, color] of Object.entries(TEAM_COLORS)) {
    if (teamName.toLowerCase().includes(team.toLowerCase())) {
      return color;
    }
  }

  // Fall back to hash-generated color for unknown teams
  // This ensures the same team always gets the same color
  return hashColor(teamName);
}
