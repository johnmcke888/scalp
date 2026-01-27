import React from 'react';

/**
 * Visual bar showing trade direction on 0-100¢ scale
 * @param {number} buyPrice - Price bought at (0-1 scale, e.g., 0.87 for 87¢)
 * @param {number} sellPrice - Price sold at (0-1 scale)
 * @param {number} pnl - Profit/loss in dollars
 * @param {string} teamName - Name of team/side bought
 */
export default function TradeBar({ buyPrice, sellPrice, pnl, teamName }) {
  const buyPct = buyPrice * 100;
  const sellPct = sellPrice * 100;
  
  const isProfit = pnl >= 0;
  // Arrow direction based on P&L: RIGHT for profit, LEFT for loss
  const arrowRight = isProfit;
  
  // Display prices in sorted order: lower price first, higher price second
  const lowPrice = Math.min(buyPrice, sellPrice);
  const highPrice = Math.max(buyPrice, sellPrice);
  
  // Bar positioning (as percentage of container width)
  const leftEdge = Math.min(buyPct, sellPct);
  const rightEdge = Math.max(buyPct, sellPct);
  const barWidth = Math.max(rightEdge - leftEdge, 1); // Minimum 1% width for visibility
  
  // Calculate if bar is too narrow for arrow (threshold: 8% of scale)
  const isNarrowBar = barWidth < 8;
  
  const barColor = isProfit ? '#22c55e' : '#ef4444';
  const textColor = isProfit ? '#16a34a' : '#dc2626';
  
  const s = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid #1a1a1f',
    },
    teamLabel: {
      fontSize: 12,
      fontWeight: 600,
      width: 140,
      minWidth: 140,
      color: '#e5e5e5',
      textOverflow: 'ellipsis',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    },
    priceLabel: {
      fontSize: 11,
      fontFamily: '"SF Mono", monospace',
      color: '#9ca3af',
      minWidth: 36,
      textAlign: 'right',
    },
    barContainer: {
      width: 300,
      height: 20,
      background: '#1a1a1f',
      borderRadius: 2,
      position: 'relative',
      border: '1px solid #2a2a2f',
    },
    bar: {
      position: 'absolute',
      top: 2,
      bottom: 2,
      left: `${leftEdge}%`,
      width: `${barWidth}%`,
      background: barColor,
      borderRadius: 1,
      boxShadow: `0 0 8px ${barColor}40`,
    },
    arrow: {
      position: 'absolute',
      fontSize: 10,
      color: '#fff',
      fontWeight: 'bold',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 10,
      // Dynamic positioning: outside for narrow bars, inside for wide bars
      left: isNarrowBar
        ? (arrowRight 
            ? `calc(${rightEdge}% + 8px)` // Right arrow: outside right edge
            : `calc(${leftEdge}% - 16px)`) // Left arrow: outside left edge
        : (arrowRight
            ? `calc(${rightEdge}% - 12px)` // Right arrow: inside right side
            : `calc(${leftEdge}% + 4px)`), // Left arrow: inside left side
    },
    pnlLabel: {
      fontSize: 13,
      fontWeight: 600,
      fontFamily: '"SF Mono", monospace',
      color: textColor,
      minWidth: 70,
      textAlign: 'right',
    },
  };

  const formatPrice = (p) => `${(p * 100).toFixed(0)}¢`;
  const formatPnl = (p) => (p >= 0 ? '+$' : '-$') + `${Math.abs(p).toFixed(2)}`;

  return (
    <div style={s.container}>
      <span style={s.teamLabel}>{teamName}</span>
      <span style={s.priceLabel}>{formatPrice(lowPrice)}</span>
      <div style={s.barContainer}>
        <div style={s.bar}></div>
        <span style={s.arrow}>{arrowRight ? '→' : '←'}</span>
      </div>
      <span style={s.priceLabel}>{formatPrice(highPrice)}</span>
      <span style={s.pnlLabel}>{formatPnl(pnl)}</span>
    </div>
  );
}