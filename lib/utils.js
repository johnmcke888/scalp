/**
 * Bulletproof Utilities - Safe parsing and calculation helpers
 * Handles ALL edge cases for API data transformation
 */

/**
 * Safely parse float value from various input formats
 * @param {*} value - Value to parse (string, number, object with .value, etc.)
 * @param {number} fallback - Default value if parsing fails
 * @returns {number} Parsed number or fallback
 */
export function safeParseFloat(value, fallback = 0) {
  // Handle null/undefined
  if (value == null) return fallback;
  
  // Handle numbers
  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? fallback : value;
  }
  
  // Handle objects with .value property (API format)
  if (typeof value === 'object' && value.value != null) {
    return safeParseFloat(value.value, fallback);
  }
  
  // Handle strings
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '0' || trimmed === 'null' || trimmed === 'undefined') {
      return fallback;
    }
    
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
  }
  
  // Fallback for any other type
  return fallback;
}

/**
 * Calculate entry price per share with bulletproof error handling
 * @param {*} cost - Total cost (from API: { value: "70.576" })
 * @param {*} shares - Number of shares (from API: { value: "100" })
 * @returns {number|null} Entry price per share, or null if calculation impossible
 */
export function calculateEntryPrice(cost, shares) {
  const safeCost = safeParseFloat(cost, null);
  const safeShares = safeParseFloat(shares, null);
  
  // Return null if either value is invalid or shares is zero
  if (safeCost === null || safeShares === null || safeShares === 0) {
    return null;
  }
  
  const entryPrice = safeCost / safeShares;
  
  // Validate result is reasonable for Polymarket (0.01 to 0.99)
  if (entryPrice < 0.001 || entryPrice > 1.0 || !isFinite(entryPrice)) {
    return null;
  }
  
  return entryPrice;
}

/**
 * Format price for display with fallback
 * @param {number|null} price - Price value
 * @param {string} fallback - Display when price unavailable
 * @returns {string} Formatted price string
 */
export function formatPrice(price, fallback = '--¢') {
  if (price === null || price === undefined || isNaN(price)) {
    return fallback;
  }
  return `${Math.round(price * 100)}¢`;
}

/**
 * Format currency for display with fallback
 * @param {number|null} amount - Dollar amount
 * @param {string} fallback - Display when amount unavailable
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, fallback = '--') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return fallback;
  }
  return amount >= 0 ? `+$${Math.abs(amount).toFixed(2)}` : `-$${Math.abs(amount).toFixed(2)}`;
}

export default {
  safeParseFloat,
  calculateEntryPrice, 
  formatPrice,
  formatCurrency
};