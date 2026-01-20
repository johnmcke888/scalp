import React, { useState, useEffect } from 'react';

const ScalpingDashboard = () => {
  const [positions, setPositions] = useState(() => {
    try {
      const saved = localStorage.getItem('scalper-positions-v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('scalper-history-v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [newPos, setNewPos] = useState({ market: '', side: '', cost: '', shares: '' });
  const [closing, setClosing] = useState(null);
  const [closeForm, setCloseForm] = useState({ proceeds: '', fee: '' });
  const [priceEdits, setPriceEdits] = useState({});

  useEffect(() => {
    localStorage.setItem('scalper-positions-v2', JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    localStorage.setItem('scalper-history-v2', JSON.stringify(history));
  }, [history]);

  const addPosition = () => {
    const cost = parseFloat(newPos.cost);
    const shares = parseFloat(newPos.shares);
    if (!newPos.market.trim() || !newPos.side.trim() || isNaN(cost) || isNaN(shares) || shares === 0) return;
    
    const pos = {
      id: Date.now(),
      market: newPos.market.trim(),
      side: newPos.side.trim(),
      cost,
      shares,
      entryPrice: cost / shares,
      currentPrice: cost / shares,
      openedAt: new Date().toISOString(),
    };
    setPositions([pos, ...positions]);
    setNewPos({ market: '', side: '', cost: '', shares: '' });
  };

  const updateCurrentPrice = (id, price) => {
    const p = parseFloat(price);
    if (isNaN(p)) return;
    setPositions(positions.map(pos => pos.id === id ? { ...pos, currentPrice: p } : pos));
  };

  const closePosition = () => {
    if (!closing) return;
    const proceeds = parseFloat(closeForm.proceeds) || 0;
    const fee = parseFloat(closeForm.fee) || 0;
    const netProceeds = proceeds - fee;
    
    const trade = {
      ...closing,
      closedAt: new Date().toISOString(),
      grossProceeds: proceeds,
      fee,
      netProceeds,
      realizedPnL: netProceeds - closing.cost,
      resolved: false,
      won: null,
      hindsightValue: null,
      hindsightDiff: null,
    };
    
    setHistory([trade, ...history]);
    setPositions(positions.filter(p => p.id !== closing.id));
    setClosing(null);
    setCloseForm({ proceeds: '', fee: '' });
  };

  const markResolved = (id, won) => {
    setHistory(history.map(t => {
      if (t.id !== id) return t;
      const hindsightValue = won ? t.shares : 0;
      return {
        ...t,
        resolved: true,
        won,
        hindsightValue,
        hindsightDiff: hindsightValue - t.netProceeds,
      };
    }));
  };

  const totalUnrealized = positions.reduce((sum, p) => sum + (p.shares * p.currentPrice - p.cost), 0);
  const totalRealized = history.reduce((sum, t) => sum + t.realizedPnL, 0);
  const resolvedTrades = history.filter(t => t.resolved);
  const totalHindsight = resolvedTrades.reduce((sum, t) => sum + t.hindsightDiff, 0);

  const fmt = (n, showSign = false) => {
    const num = parseFloat(n) || 0;
    const sign = showSign && num > 0 ? '+' : '';
    return sign + num.toFixed(2);
  };

  const pct = (pnl, cost) => {
    if (!cost) return '0.0';
    const p = (pnl / cost) * 100;
    return (p > 0 ? '+' : '') + p.toFixed(1);
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <h1 style={s.title}>scalper</h1>
          <div style={s.stats}>
            <span>unrealized: <b style={{ color: totalUnrealized >= 0 ? '#080' : '#a00' }}>${fmt(totalUnrealized, true)}</b></span>
            <span style={s.statDivider}>|</span>
            <span>realized: <b style={{ color: totalRealized >= 0 ? '#080' : '#a00' }}>${fmt(totalRealized, true)}</b></span>
            <span style={s.statDivider}>|</span>
            <span>hindsight: <b style={{ color: totalHindsight <= 0 ? '#080' : '#a00' }}>
              {totalHindsight <= 0 ? '↑' : '↓'} ${fmt(Math.abs(totalHindsight))}
            </b></span>
          </div>
        </header>

        {/* New Position */}
        <section style={s.section}>
          <div style={s.sectionHead}>log buy</div>
          <div style={s.inputRow}>
            <input
              style={{ ...s.input, flex: 2 }}
              placeholder="market (e.g. Lakers v Celtics)"
              value={newPos.market}
              onChange={e => setNewPos({ ...newPos, market: e.target.value })}
            />
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="side (e.g. Lakers)"
              value={newPos.side}
              onChange={e => setNewPos({ ...newPos, side: e.target.value })}
            />
            <input
              style={{ ...s.input, width: 90 }}
              placeholder="cost $"
              type="number"
              step="0.01"
              value={newPos.cost}
              onChange={e => setNewPos({ ...newPos, cost: e.target.value })}
            />
            <input
              style={{ ...s.input, width: 70 }}
              placeholder="shares"
              type="number"
              step="1"
              value={newPos.shares}
              onChange={e => setNewPos({ ...newPos, shares: e.target.value })}
            />
            <button style={s.btn} onClick={addPosition}>+</button>
          </div>
        </section>

        {/* Open Positions */}
        <section style={s.section}>
          <div style={s.sectionHead}>open positions ({positions.length})</div>
          {positions.length === 0 ? (
            <div style={s.empty}>no open positions</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>market</th>
                  <th style={s.th}>side</th>
                  <th style={s.thR}>shares</th>
                  <th style={s.thR}>entry ¢</th>
                  <th style={s.thR}>cost</th>
                  <th style={s.thR}>now ¢</th>
                  <th style={s.thR}>value</th>
                  <th style={s.thR}>p&l</th>
                  <th style={s.thR}>%</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => {
                  const value = p.shares * p.currentPrice;
                  const pnl = value - p.cost;
                  return (
                    <tr key={p.id} style={s.tr}>
                      <td style={s.td}>{p.market}</td>
                      <td style={s.td}>{p.side}</td>
                      <td style={s.tdR}>{p.shares}</td>
                      <td style={s.tdR}>{(p.entryPrice * 100).toFixed(1)}</td>
                      <td style={s.tdR}>${fmt(p.cost)}</td>
                      <td style={s.tdR}>
                        <input
                          style={s.priceInput}
                          type="number"
                          step="0.001"
                          value={priceEdits[p.id] !== undefined ? priceEdits[p.id] : p.currentPrice}
                          onChange={e => setPriceEdits({ ...priceEdits, [p.id]: e.target.value })}
                          onBlur={e => {
                            updateCurrentPrice(p.id, e.target.value);
                            setPriceEdits({ ...priceEdits, [p.id]: undefined });
                          }}
                        />
                      </td>
                      <td style={s.tdR}>${fmt(value)}</td>
                      <td style={{ ...s.tdR, color: pnl >= 0 ? '#080' : '#a00', fontWeight: 600 }}>
                        ${fmt(pnl, true)}
                      </td>
                      <td style={{ ...s.tdR, color: pnl >= 0 ? '#080' : '#a00' }}>
                        {pct(pnl, p.cost)}%
                      </td>
                      <td style={s.td}>
                        <button style={s.btnSmall} onClick={() => setClosing(p)}>sell</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Close Modal */}
        {closing && (
          <div style={s.overlay} onClick={() => setClosing(null)}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
              <div style={s.modalTitle}>close: {closing.side}</div>
              <div style={s.modalSub}>{closing.market}</div>
              <div style={s.modalInfo}>
                {closing.shares} shares @ {(closing.entryPrice * 100).toFixed(1)}¢ = ${fmt(closing.cost)}
              </div>
              <div style={s.modalRow}>
                <label style={s.modalLabel}>total payout $</label>
                <input
                  style={s.input}
                  type="number"
                  step="0.01"
                  value={closeForm.proceeds}
                  onChange={e => setCloseForm({ ...closeForm, proceeds: e.target.value })}
                  autoFocus
                />
              </div>
              <div style={s.modalRow}>
                <label style={s.modalLabel}>fee $ (optional)</label>
                <input
                  style={s.input}
                  type="number"
                  step="0.01"
                  value={closeForm.fee}
                  onChange={e => setCloseForm({ ...closeForm, fee: e.target.value })}
                />
              </div>
              <div style={s.modalActions}>
                <button style={s.btnCancel} onClick={() => setClosing(null)}>cancel</button>
                <button style={s.btn} onClick={closePosition}>confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        <section style={s.section}>
          <div style={s.sectionHead}>history ({history.length})</div>
          {history.length === 0 ? (
            <div style={s.empty}>no closed trades</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>market</th>
                  <th style={s.th}>side</th>
                  <th style={s.thR}>cost</th>
                  <th style={s.thR}>proceeds</th>
                  <th style={s.thR}>p&l</th>
                  <th style={s.th}>hindsight</th>
                </tr>
              </thead>
              <tbody>
                {history.map(t => (
                  <tr key={t.id} style={s.tr}>
                    <td style={s.td}>{t.market}</td>
                    <td style={s.td}>{t.side}</td>
                    <td style={s.tdR}>${fmt(t.cost)}</td>
                    <td style={s.tdR}>${fmt(t.netProceeds)}</td>
                    <td style={{ ...s.tdR, color: t.realizedPnL >= 0 ? '#080' : '#a00', fontWeight: 600 }}>
                      ${fmt(t.realizedPnL, true)}
                    </td>
                    <td style={s.td}>
                      {!t.resolved ? (
                        <span style={s.hindsightBtns}>
                          <button style={s.btnTiny} onClick={() => markResolved(t.id, true)} title="would have won">✓</button>
                          <button style={{ ...s.btnTiny, borderColor: '#a00', color: '#a00' }} onClick={() => markResolved(t.id, false)} title="would have lost">✗</button>
                        </span>
                      ) : (
                        <span style={{ color: t.hindsightDiff <= 0 ? '#080' : '#a00' }}>
                          {t.hindsightDiff <= 0 
                            ? `saved $${fmt(Math.abs(t.hindsightDiff))}` 
                            : `left $${fmt(t.hindsightDiff)}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer style={s.footer}>
          v0.2 · data in localStorage
        </footer>
      </div>
    </div>
  );
};

const s = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f0',
    fontFamily: '"IBM Plex Mono", "SF Mono", "Consolas", monospace',
    fontSize: 13,
    color: '#222',
    padding: 16,
  },
  container: {
    maxWidth: 1000,
    margin: '0 auto',
  },
  header: {
    borderBottom: '2px solid #222',
    paddingBottom: 12,
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 400,
    letterSpacing: 2,
  },
  stats: {
    marginTop: 8,
    fontSize: 12,
  },
  statDivider: {
    margin: '0 12px',
    color: '#999',
  },
  section: {
    marginBottom: 32,
  },
  sectionHead: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#666',
    marginBottom: 8,
    borderBottom: '1px solid #ccc',
    paddingBottom: 4,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #999',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
  },
  btn: {
    padding: '8px 16px',
    border: '1px solid #222',
    background: '#222',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  },
  btnSmall: {
    padding: '4px 10px',
    border: '1px solid #666',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
  },
  btnTiny: {
    padding: '2px 8px',
    border: '1px solid #080',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 11,
    color: '#080',
    cursor: 'pointer',
    marginRight: 4,
  },
  btnCancel: {
    padding: '8px 16px',
    border: '1px solid #999',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '8px 6px',
    borderBottom: '1px solid #999',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
    fontWeight: 500,
  },
  thR: {
    textAlign: 'right',
    padding: '8px 6px',
    borderBottom: '1px solid #999',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#666',
    fontWeight: 500,
  },
  tr: {
    borderBottom: '1px solid #ddd',
  },
  td: {
    padding: '10px 6px',
    verticalAlign: 'middle',
  },
  tdR: {
    padding: '10px 6px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  priceInput: {
    width: 60,
    padding: '4px 6px',
    border: '1px solid #ccc',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 13,
    textAlign: 'right',
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    border: '2px solid #222',
    padding: 24,
    width: 340,
    maxWidth: '90vw',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 2,
  },
  modalSub: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  modalInfo: {
    fontSize: 12,
    background: '#f0f0e8',
    padding: 8,
    marginBottom: 16,
  },
  modalRow: {
    marginBottom: 12,
  },
  modalLabel: {
    display: 'block',
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  modalActions: {
    display: 'flex',
    gap: 8,
    marginTop: 20,
  },
  hindsightBtns: {
    display: 'flex',
    gap: 4,
  },
  footer: {
    textAlign: 'center',
    padding: 24,
    color: '#999',
    fontSize: 11,
  },
};

export default ScalpingDashboard;
