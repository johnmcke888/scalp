import React from 'react';

/**
 * Scale legend showing 0¢ to 100¢ reference points
 */
export default function PriceScaleLegend() {
  const s = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '4px 0',
      marginBottom: 8,
      borderBottom: '1px solid #2a2a2f',
    },
    spacer: {
      minWidth: 80 + 36 + 12, // teamLabel + priceLabel + gap
    },
    scale: {
      flex: 1,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 9,
      color: '#4b5563',
      fontFamily: '"SF Mono", monospace',
      minWidth: 100,
      position: 'relative',
    },
    scaleBar: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      height: 1,
      background: '#2a2a2f',
      zIndex: 0,
    },
    scaleMarker: {
      position: 'relative',
      zIndex: 1,
      background: '#0a0b0d',
      padding: '0 4px',
    },
    pnlSpacer: {
      minWidth: 36 + 70 + 12, // priceLabel + pnlLabel + gap
    },
  };

  return (
    <div style={s.container}>
      <div style={s.spacer} />
      <div style={s.scale}>
        <div style={s.scaleBar} />
        <span style={s.scaleMarker}>0¢</span>
        <span style={s.scaleMarker}>25¢</span>
        <span style={s.scaleMarker}>50¢</span>
        <span style={s.scaleMarker}>75¢</span>
        <span style={s.scaleMarker}>100¢</span>
      </div>
      <div style={s.pnlSpacer} />
    </div>
  );
}