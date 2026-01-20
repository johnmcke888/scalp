'use client';

import { useState, useEffect } from 'react';
import ScalpingDashboard from '@/components/ScalpingDashboard';

export default function Home() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');

  // Check sessionStorage on mount
  useEffect(() => {
    const savedPin = sessionStorage.getItem('scalper-pin');
    if (savedPin) {
      setPin(savedPin);
      setAuthenticated(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Verify PIN by making a test request
    try {
      const res = await fetch(`/api/positions?pin=${encodeURIComponent(pinInput)}`);
      if (res.status === 401) {
        setError('invalid pin');
        return;
      }
      // PIN is valid (or API is down, but PIN accepted)
      sessionStorage.setItem('scalper-pin', pinInput);
      setPin(pinInput);
      setAuthenticated(true);
    } catch {
      // Network error - still accept PIN, will fail later if wrong
      sessionStorage.setItem('scalper-pin', pinInput);
      setPin(pinInput);
      setAuthenticated(true);
    }
  };

  if (!authenticated) {
    return (
      <div style={styles.pinPage}>
        <div style={styles.pinContainer}>
          <h1 style={styles.pinTitle}>scalper</h1>
          <form onSubmit={handleSubmit} style={styles.pinForm}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="enter pin"
              style={styles.pinInput}
              autoFocus
            />
            <button type="submit" style={styles.pinButton}>
              enter
            </button>
          </form>
          {error && <div style={styles.pinError}>{error}</div>}
        </div>
      </div>
    );
  }

  return <ScalpingDashboard pin={pin} />;
}

const styles = {
  pinPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f0',
    padding: 16,
  },
  pinContainer: {
    textAlign: 'center',
  },
  pinTitle: {
    fontSize: 24,
    fontWeight: 400,
    letterSpacing: 2,
    marginBottom: 32,
  },
  pinForm: {
    display: 'flex',
    gap: 8,
  },
  pinInput: {
    padding: '12px 16px',
    border: '1px solid #999',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    width: 160,
  },
  pinButton: {
    padding: '12px 24px',
    border: '1px solid #222',
    background: '#222',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    cursor: 'pointer',
  },
  pinError: {
    marginTop: 12,
    color: '#a00',
    fontSize: 12,
  },
};
