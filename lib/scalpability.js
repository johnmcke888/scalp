/**
 * Scalpability Scoring Engine
 * 
 * Calculates a 0-100 score indicating how "scalpable" a market is.
 * Higher score = better opportunity for quick profit from volatility.
 */

/**
 * Sport-specific game duration constants (in minutes)
 */
const GAME_DURATION = {
  nba: 48,      // 4 x 12 minute quarters
  ncaa: 40,     // 2 x 20 minute halves
  nfl: 60,      // 4 x 15 minute quarters
  nhl: 60,      // 3 x 20 minute periods
  mlb: 180,     // ~3 hours average, 9 innings
  unknown: 60,  // default
};

/**
 * Sport-specific "blowout" thresholds (point differential that kills volatility)
 */
const BLOWOUT_THRESHOLD = {
  nba: 25,
  ncaa: 20,
  nfl: 21,
  nhl: 4,
  mlb: 7,
  unknown: 20,
};

/**
 * Estimate percentage of game remaining based on period/elapsed info
 * Returns 0-1 where 1 = game just started, 0 = game over
 */
export function estimateTimeRemaining(event, sport) {
  if (event.ended) return 0;
  if (!event.live) return 1; // Game hasn't started
  
  const period = event.period;
  const elapsed = event.elapsed;
  
  // Parse elapsed time if available (format: "8:24" or "12:30")
  let elapsedMinutes = 0;
  if (elapsed) {
    const match = elapsed.match(/(\d+):(\d+)/);
    if (match) {
      elapsedMinutes = parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
    }
  }
  
  // Sport-specific time calculation
  const totalMinutes = GAME_DURATION[sport] || GAME_DURATION.unknown;
  
  if (sport === 'nba') {
    // NBA: Q1, Q2, Q3, Q4, OT
    const quarterNum = parseInt(period?.replace(/\D/g, ''), 10) || 1;
    const quarterMinutes = 12;
    const completedMinutes = (quarterNum - 1) * quarterMinutes + elapsedMinutes;
    return Math.max(0, 1 - completedMinutes / totalMinutes);
  }
  
  if (sport === 'ncaa') {
    // NCAA: 1H, 2H or 1st, 2nd
    const isSecondHalf = period?.includes('2') || period?.toLowerCase().includes('2nd');
    const completedMinutes = (isSecondHalf ? 20 : 0) + elapsedMinutes;
    return Math.max(0, 1 - completedMinutes / totalMinutes);
  }
  
  if (sport === 'nfl') {
    const quarterNum = parseInt(period?.replace(/\D/g, ''), 10) || 1;
    const quarterMinutes = 15;
    const completedMinutes = (quarterNum - 1) * quarterMinutes + elapsedMinutes;
    return Math.max(0, 1 - completedMinutes / totalMinutes);
  }
  
  if (sport === 'nhl') {
    const periodNum = parseInt(period?.replace(/\D/g, ''), 10) || 1;
    const periodMinutes = 20;
    const completedMinutes = (periodNum - 1) * periodMinutes + elapsedMinutes;
    return Math.max(0, 1 - completedMinutes / totalMinutes);
  }
  
  if (sport === 'mlb') {
    // MLB: Top/Bot 1-9+ innings
    const inningMatch = period?.match(/(\d+)/);
    const inning = inningMatch ? parseInt(inningMatch[1], 10) : 1;
    const isBottom = period?.toLowerCase().includes('bot');
    const completedInnings = inning - 1 + (isBottom ? 0.5 : 0);
    return Math.max(0, 1 - completedInnings / 9);
  }
  
  // Fallback: rough estimate
  return 0.5;
}

/**
 * Calculate price uncertainty score (0-100)
 * Higher when prices are close to 50/50, lower when one side dominates
 */
export function calculatePriceUncertainty(team1Price, team2Price) {
  if (!team1Price || !team2Price) return 0;
  
  // Perfect uncertainty = both at 50¢
  // Prices should sum to ~100¢ (minus vig)
  const avgPrice = (team1Price + team2Price) / 2;
  const normalizedT1 = team1Price / (team1Price + team2Price);
  
  // Distance from 0.5 (perfect uncertainty)
  const distanceFrom50 = Math.abs(normalizedT1 - 0.5);
  
  // Score: 100 at 50/50, approaching 0 as one side approaches 100%
  // Use exponential decay for sharper dropoff
  const uncertainty = 100 * Math.pow(1 - distanceFrom50 * 2, 2);
  
  return Math.max(0, Math.min(100, uncertainty));
}

/**
 * Calculate score closeness factor (0-100)
 * Higher when game is close, lower for blowouts
 */
export function calculateScoreCloseness(homeScore, awayScore, sport) {
  if (homeScore === null || awayScore === null) {
    // No score data = assume moderate closeness
    return 50;
  }
  
  const scoreDiff = Math.abs(homeScore - awayScore);
  const blowout = BLOWOUT_THRESHOLD[sport] || BLOWOUT_THRESHOLD.unknown;
  
  if (scoreDiff >= blowout) return 0;
  if (scoreDiff === 0) return 100;
  
  // Linear decay from 100 (tied) to 0 (blowout)
  return Math.max(0, 100 * (1 - scoreDiff / blowout));
}

/**
 * Detect price-score mismatch (potential mispricing)
 * Returns bonus points (0-30) if losing team has higher price than expected
 */
export function detectMispricing(team1Price, team2Price, homeScore, awayScore) {
  if (homeScore === null || awayScore === null) return 0;
  if (!team1Price || !team2Price) return 0;
  
  const scoreDiff = homeScore - awayScore; // Positive = home winning
  const priceDiff = team1Price - team2Price; // Positive = team1 higher price
  
  // Mismatch: team is losing but has higher price
  // This could indicate the market hasn't caught up to game events
  if (scoreDiff > 3 && priceDiff < -0.05) {
    // Home winning by 3+ but priced 5+ cents lower
    return 20;
  }
  if (scoreDiff < -3 && priceDiff > 0.05) {
    // Away winning by 3+ but home priced 5+ cents higher
    return 20;
  }
  
  return 0;
}

/**
 * Calculate overall scalpability score (0-100)
 */
export function calculateScalpability(market) {
  const { team1, team2, event, sport } = market;
  
  // Disqualifiers - return 0 immediately
  if (event.ended) return { score: 0, reason: 'Game ended', breakdown: {} };
  if (!team1 || !team2) return { score: 0, reason: 'Missing team data', breakdown: {} };
  
  // Component scores
  const timeRemaining = estimateTimeRemaining(event, sport);
  const priceUncertainty = calculatePriceUncertainty(team1.price, team2.price);
  const scoreCloseness = calculateScoreCloseness(event.homeScore, event.awayScore, sport);
  const mispricingBonus = detectMispricing(team1.price, team2.price, event.homeScore, event.awayScore);
  
  // Weights (must sum to 1.0 for base components)
  const weights = {
    time: 0.30,         // 30% - time remaining
    uncertainty: 0.35,  // 35% - price uncertainty (most important)
    closeness: 0.35,    // 35% - score closeness
  };
  
  // Calculate weighted score
  const timeScore = timeRemaining * 100 * weights.time;
  const uncertaintyScore = priceUncertainty * weights.uncertainty;
  const closenessScore = scoreCloseness * weights.closeness;
  
  // Base score (0-100)
  let baseScore = timeScore + uncertaintyScore + closenessScore;
  
  // Add mispricing bonus (can push above 100, will be capped)
  const totalScore = Math.min(100, baseScore + mispricingBonus);
  
  // Determine qualitative rating
  let rating;
  if (totalScore >= 75) rating = 'HOT';
  else if (totalScore >= 50) rating = 'WARM';
  else if (totalScore >= 25) rating = 'COOL';
  else rating = 'SKIP';
  
  // Generate reason
  let reason;
  if (totalScore >= 75) {
    reason = event.live ? 'Live game, close score, uncertain prices' : 'High uncertainty, good entry point';
  } else if (totalScore >= 50) {
    reason = 'Moderate opportunity';
  } else if (totalScore >= 25) {
    reason = event.live && scoreCloseness < 30 ? 'Score gap widening' : 'Limited upside';
  } else {
    reason = event.ended ? 'Game over' : 'Low volatility expected';
  }
  
  return {
    score: Math.round(totalScore),
    rating,
    reason,
    breakdown: {
      timeRemaining: Math.round(timeRemaining * 100),
      priceUncertainty: Math.round(priceUncertainty),
      scoreCloseness: Math.round(scoreCloseness),
      mispricingBonus,
    },
  };
}

/**
 * Rank markets by scalpability
 */
export function rankMarkets(markets) {
  return markets
    .map(market => ({
      ...market,
      scalpability: calculateScalpability(market),
    }))
    .sort((a, b) => b.scalpability.score - a.scalpability.score);
}