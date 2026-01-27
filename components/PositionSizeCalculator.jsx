/**
 * Position Size Calculator - Help users calculate optimal position sizes
 */
import { useState } from 'react';

export const PositionSizeCalculator = ({ 
  onClose, 
  currentPrice = 50, 
  availableBalance = 1000 
}) => {
  const [targetProfit, setTargetProfit] = useState(10);
  const [riskPercent, setRiskPercent] = useState(2); // % of account to risk
  const [entryPrice, setEntryPrice] = useState(currentPrice);
  const [exitPrice, setExitPrice] = useState(currentPrice + 5);
  const [maxRisk, setMaxRisk] = useState(50);
  
  // Calculate position sizes
  const calculatePositions = () => {
    const priceMove = Math.abs(exitPrice - entryPrice);
    if (priceMove <= 0) return { shares: 0, cost: 0, maxShares: 0, maxCost: 0 };
    
    // Position size for target profit
    const sharesForProfit = Math.floor(targetProfit / (priceMove / 100));
    const costForProfit = sharesForProfit * (entryPrice / 100);
    
    // Maximum position based on risk percentage
    const riskAmount = (availableBalance * riskPercent) / 100;
    const maxSharesForRisk = Math.floor(riskAmount / (priceMove / 100));
    const maxCostForRisk = maxSharesForRisk * (entryPrice / 100);
    
    // Maximum position based on fixed risk amount
    const maxSharesForFixedRisk = Math.floor(maxRisk / (priceMove / 100));
    const maxCostForFixedRisk = maxSharesForFixedRisk * (entryPrice / 100);
    
    return {
      // Target profit calculation
      shares: Math.max(0, sharesForProfit),
      cost: Math.max(0, costForProfit),
      
      // Risk-based calculations
      maxShares: Math.max(0, Math.min(maxSharesForRisk, maxSharesForFixedRisk)),
      maxCost: Math.max(0, Math.min(maxCostForRisk, maxCostForFixedRisk)),
      
      // Additional metrics
      priceMove: priceMove,
      profitPerShare: priceMove / 100,
      percentMove: ((exitPrice - entryPrice) / entryPrice) * 100,
    };
  };

  const results = calculatePositions();
  
  // Quick preset buttons
  const quickSets = [
    { profit: 5, label: '$5' },
    { profit: 10, label: '$10' },
    { profit: 25, label: '$25' },
    { profit: 50, label: '$50' },
    { profit: 100, label: '$100' }
  ];

  const riskPresets = [
    { risk: 1, label: '1%' },
    { risk: 2, label: '2%' },
    { risk: 5, label: '5%' },
    { risk: 10, label: '10%' }
  ];

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Position Size Calculator</h2>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        
        <div style={styles.content}>
          {/* Input Controls */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Trade Parameters</h3>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Entry Price (¢)</label>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
                style={styles.input}
                min="1"
                max="99"
              />
            </div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Exit Price (¢)</label>
              <input
                type="number"
                value={exitPrice}
                onChange={(e) => setExitPrice(parseFloat(e.target.value) || 0)}
                style={styles.input}
                min="1"
                max="99"
              />
            </div>
            
            <div style={styles.metric}>
              <span>Price Move: {results.priceMove.toFixed(0)}¢ ({results.percentMove.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Target Profit Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Target Profit</h3>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Profit Goal ($)</label>
              <input
                type="number"
                value={targetProfit}
                onChange={(e) => setTargetProfit(parseFloat(e.target.value) || 0)}
                style={styles.input}
                min="1"
                step="1"
              />
            </div>
            
            <div style={styles.presets}>
              {quickSets.map(({ profit, label }) => (
                <button
                  key={profit}
                  style={{
                    ...styles.presetBtn,
                    ...(targetProfit === profit ? styles.presetBtnActive : {})
                  }}
                  onClick={() => setTargetProfit(profit)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Management Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Risk Management</h3>
            
            <div style={styles.inputRow}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Account Risk (%)</label>
                <input
                  type="number"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                  style={styles.input}
                  min="0.1"
                  max="20"
                  step="0.5"
                />
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Max Risk ($)</label>
                <input
                  type="number"
                  value={maxRisk}
                  onChange={(e) => setMaxRisk(parseFloat(e.target.value) || 0)}
                  style={styles.input}
                  min="1"
                  step="5"
                />
              </div>
            </div>
            
            <div style={styles.presets}>
              {riskPresets.map(({ risk, label }) => (
                <button
                  key={risk}
                  style={{
                    ...styles.presetBtn,
                    ...(riskPercent === risk ? styles.presetBtnActive : {})
                  }}
                  onClick={() => setRiskPercent(risk)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div style={styles.results}>
            <h3 style={styles.sectionTitle}>Calculations</h3>
            
            <div style={styles.resultRow}>
              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>For ${targetProfit} Profit</div>
                <div style={styles.resultValue}>{results.shares.toLocaleString()} shares</div>
                <div style={styles.resultSub}>${results.cost.toFixed(2)} cost</div>
              </div>
              
              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>Max Position (Risk-Based)</div>
                <div style={styles.resultValue}>{results.maxShares.toLocaleString()} shares</div>
                <div style={styles.resultSub}>${results.maxCost.toFixed(2)} cost</div>
              </div>
            </div>
            
            <div style={styles.metrics}>
              <div style={styles.metricItem}>
                <span>Profit per share: ${results.profitPerShare.toFixed(4)}</span>
              </div>
              <div style={styles.metricItem}>
                <span>Available balance: ${availableBalance.toFixed(2)}</span>
              </div>
              <div style={styles.metricItem}>
                <span>Risk amount: ${((availableBalance * riskPercent) / 100).toFixed(2)} ({riskPercent}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--bg-card, #111114)',
    border: '1px solid var(--border-default, #333340)',
    borderRadius: 8,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottom: '1px solid var(--border-default, #333340)',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary, #ffffff)',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary, #9ca3af)',
    fontSize: 24,
    cursor: 'pointer',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary, #ffffff)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputRow: {
    display: 'flex',
    gap: 12,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-secondary, #9ca3af)',
    marginBottom: 4,
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-input, #0d0d10)',
    border: '1px solid var(--border-default, #333340)',
    borderRadius: 4,
    color: 'var(--text-primary, #ffffff)',
    fontSize: 14,
    outline: 'none',
  },
  metric: {
    fontSize: 12,
    color: 'var(--text-muted, #6b7280)',
    fontFamily: 'monospace',
  },
  presets: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  presetBtn: {
    padding: '4px 12px',
    backgroundColor: 'var(--bg-elevated, #1a1a1f)',
    border: '1px solid var(--border-default, #333340)',
    borderRadius: 4,
    color: 'var(--text-secondary, #9ca3af)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  presetBtnActive: {
    backgroundColor: 'var(--accent-blue, #3b82f6)',
    borderColor: 'var(--accent-blue, #3b82f6)',
    color: '#ffffff',
  },
  results: {
    backgroundColor: 'var(--bg-elevated, #1a1a1f)',
    border: '1px solid var(--border-default, #333340)',
    borderRadius: 6,
    padding: 16,
  },
  resultRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
  },
  resultCard: {
    flex: 1,
    backgroundColor: 'var(--bg-secondary, #0a0b0d)',
    border: '1px solid var(--border-subtle, #222228)',
    borderRadius: 4,
    padding: 12,
    textAlign: 'center',
  },
  resultLabel: {
    fontSize: 11,
    color: 'var(--text-muted, #6b7280)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  resultValue: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary, #ffffff)',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  resultSub: {
    fontSize: 12,
    color: 'var(--text-secondary, #9ca3af)',
    fontFamily: 'monospace',
  },
  metrics: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  metricItem: {
    fontSize: 12,
    color: 'var(--text-muted, #6b7280)',
    fontFamily: 'monospace',
  },
};

export default PositionSizeCalculator;