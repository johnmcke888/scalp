import React from 'react';

/**
 * Mini line chart for P&L history
 * @param {number[]} data - Array of P&L values over time
 * @param {number} width - Chart width in pixels
 * @param {number} height - Chart height in pixels
 */
export default function Sparkline({ data = [], width = 120, height = 32 }) {
  if (data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const isUp = lastValue >= firstValue;
  const color = isUp ? '#22c55e' : '#ef4444';
  
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={(data.length - 1) / (data.length - 1) * width}
        cy={height - ((lastValue - min) / range) * height}
        r="2"
        fill={color}
      />
      {/* Start dot */}
      <circle
        cx={0}
        cy={height - ((firstValue - min) / range) * height}
        r="1"
        fill={color}
        opacity="0.6"
      />
    </svg>
  );
}

export { Sparkline };