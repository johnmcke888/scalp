/**
 * CSV Export Utility - Export trade history data to CSV format
 */

/**
 * Convert an array of objects to CSV string
 */
export function arrayToCSV(data, headers) {
  if (!data || data.length === 0) return '';

  // Use provided headers or extract from first object
  const csvHeaders = headers || Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    // Header row
    csvHeaders.map(header => `"${header}"`).join(','),
    // Data rows
    ...data.map(row =>
      csvHeaders.map(header => {
        const value = row[header];
        // Handle different data types
        if (value === null || value === undefined) {
          return '""';
        }
        if (typeof value === 'number') {
          return value.toString();
        }
        if (value instanceof Date) {
          return `"${value.toISOString()}"`;
        }
        // Escape quotes in strings and wrap in quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    // Create download link
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    URL.revokeObjectURL(url);
  }
}

/**
 * Export unified trade history to CSV
 */
export function exportUnifiedTradeHistory(unifiedTrades, filename = null) {
  if (!unifiedTrades || unifiedTrades.length === 0) {
    alert('No trade data to export');
    return;
  }

  // Prepare data for CSV export
  const csvData = unifiedTrades.map(trade => ({
    'Date': new Date(trade.timestamp).toLocaleDateString(),
    'Time': new Date(trade.timestamp).toLocaleTimeString(),
    'Team': trade.team,
    'League': trade.league.toUpperCase(),
    'Type': trade.type,
    'Entry Price (¢)': trade.entryPrice.toFixed(0),
    'Exit Price (¢)': trade.exitPrice.toFixed(0),
    'Shares': trade.shares.toFixed(2),
    'P&L ($)': trade.profit.toFixed(2),
    'Timestamp': trade.timestamp
  }));

  // Generate filename with current date
  const now = new Date();
  const defaultFilename = `polymarket-trades-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
  
  const csvContent = arrayToCSV(csvData);
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Export performance metrics to CSV
 */
export function exportPerformanceMetrics(performanceMetrics, filename = null) {
  if (!performanceMetrics) {
    alert('No performance data to export');
    return;
  }

  // Convert performance metrics to CSV format
  const csvData = [
    { 'Metric': 'Total P&L', 'Value': `$${performanceMetrics.totalRealizedPnl?.toFixed(2) || '0.00'}` },
    { 'Metric': 'Total Trades', 'Value': performanceMetrics.totalTrades || 0 },
    { 'Metric': 'Wins', 'Value': performanceMetrics.winners || 0 },
    { 'Metric': 'Losses', 'Value': performanceMetrics.losers || 0 },
    { 'Metric': 'Win Rate (%)', 'Value': `${performanceMetrics.winRate?.toFixed(1) || '0.0'}%` },
    { 'Metric': 'ROI (%)', 'Value': `${performanceMetrics.roi?.toFixed(1) || '0.0'}%` },
    { 'Metric': 'Best Win', 'Value': `$${performanceMetrics.biggestWin?.toFixed(2) || '0.00'}` },
    { 'Metric': 'Worst Loss', 'Value': `$${performanceMetrics.biggestLoss?.toFixed(2) || '0.00'}` },
    { 'Metric': 'Average Trade', 'Value': `$${performanceMetrics.avgTrade?.toFixed(2) || '0.00'}` },
    { 'Metric': 'Total Events', 'Value': performanceMetrics.totalEvents || 0 },
    { 'Metric': 'Export Date', 'Value': new Date().toISOString() }
  ];

  const now = new Date();
  const defaultFilename = `polymarket-performance-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
  
  const csvContent = arrayToCSV(csvData);
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Export positions to CSV
 */
export function exportPositions(positions, filename = null) {
  if (!positions || positions.length === 0) {
    alert('No position data to export');
    return;
  }

  // Prepare positions data for CSV export
  const csvData = positions.map(position => ({
    'Team': position.team || position.teamName || 'Unknown',
    'League': position.league?.toUpperCase() || 'Unknown',
    'Event': position.title || 'Unknown Event',
    'Shares': position.shares?.toFixed(2) || '0.00',
    'Average Price (¢)': position.avgPrice?.toFixed(0) || '0',
    'Current Price (¢)': position.currentPrice?.toFixed(0) || '0',
    'Unrealized P&L ($)': position.unrealizedPnl?.toFixed(2) || '0.00',
    'Market Value ($)': position.marketValue?.toFixed(2) || '0.00',
    'Cost Basis ($)': position.costBasis?.toFixed(2) || '0.00',
    'Slug': position.id || position.slug || 'Unknown'
  }));

  const now = new Date();
  const defaultFilename = `polymarket-positions-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
  
  const csvContent = arrayToCSV(csvData);
  downloadCSV(csvContent, filename || defaultFilename);
}

export default {
  arrayToCSV,
  downloadCSV,
  exportUnifiedTradeHistory,
  exportPerformanceMetrics,
  exportPositions
};