/**
 * PriceBar Component - Visual 0-100¢ bar with entry/exit markers
 * Shows price movement from entry to exit with visual fill
 */
export const PriceBar = ({ entry, exit, profit, className = "" }) => {
  // Convert prices to percentages (0-100¢ = 0-100%)
  const entryPct = Math.max(0, Math.min(100, entry));
  const exitPct = Math.max(0, Math.min(100, exit));
  const isProfit = profit > 0;
  
  // Color based on profit/loss
  const barColor = isProfit ? '#22c55e' : '#ef4444';
  const arrowColor = barColor;
  
  // Calculate fill range
  const fillStart = Math.min(entryPct, exitPct);
  const fillWidth = Math.abs(exitPct - entryPct);
  
  return (
    <div className={`relative h-3 bg-gray-800 rounded w-full ${className}`}>
      {/* Fill bar showing entry to exit range */}
      <div 
        className="absolute h-full rounded transition-all duration-200"
        style={{
          left: `${fillStart}%`,
          width: `${fillWidth}%`,
          backgroundColor: barColor,
          opacity: 0.7,
        }}
      />
      
      {/* Entry price marker (vertical line) */}
      <div 
        className="absolute w-0.5 h-full bg-white opacity-90"
        style={{ left: `${entryPct}%` }}
      />
      
      {/* Exit price arrow marker */}
      <div 
        className="absolute text-xs font-bold leading-none select-none"
        style={{ 
          left: `${exitPct}%`,
          color: arrowColor,
          transform: 'translateX(-50%)',
          top: '1px',
        }}
      >
        ▶
      </div>
      
      {/* Tick marks at 25, 50, 75 for reference */}
      <div className="absolute inset-0">
        {[25, 50, 75].map(tick => (
          <div
            key={tick}
            className="absolute w-px h-1 bg-gray-600 opacity-40"
            style={{ 
              left: `${tick}%`,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default PriceBar;