import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

// Required for @noble/ed25519 v2.x
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const POLYMARKET_BASE_URL = 'https://api.polymarket.us';

/**
 * Signs a request for the Polymarket US API using Ed25519
 * Message format: {timestamp}{method}{path}
 */
export async function signRequest(method, path, privateKeyBase64) {
  const timestamp = Date.now().toString();
  const message = `${timestamp}${method}${path}`;
  
  // Debug logging for pagination requests
  if (path.includes('cursor')) {
    console.log(`Signing paginated request: ${method} ${path}`);
  }

  // Decode the base64 private key
  // Polymarket uses a 64-byte key (32-byte seed + 32-byte public key)
  const fullKey = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = fullKey.subarray(0, 32); // First 32 bytes are the seed

  // Sign the message
  const messageBytes = new TextEncoder().encode(message);
  const signature = await ed.signAsync(messageBytes, privateKey);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  return {
    timestamp,
    signature: signatureBase64,
  };
}

/**
 * Signs a WebSocket request with a specific timestamp
 * Used for WebSocket auth headers where we control the timestamp
 */
export async function signWebSocketRequest(timestamp, method, path, privateKeyBase64) {
  const message = `${timestamp}${method}${path}`;

  // Decode the base64 private key
  const fullKey = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = fullKey.subarray(0, 32); // First 32 bytes are the seed

  // Sign the message
  const messageBytes = new TextEncoder().encode(message);
  const signature = await ed.signAsync(messageBytes, privateKey);
  return Buffer.from(signature).toString('base64');
}

/**
 * Makes an authenticated request to the Polymarket US API
 */
export async function polymarketFetch(method, path, options = {}) {
  const apiKey = process.env.POLYMARKET_API_KEY;
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    throw new Error('Missing POLYMARKET_API_KEY or POLYMARKET_PRIVATE_KEY');
  }

  const { timestamp, signature } = await signRequest(method, path, privateKey);

  const headers = {
    'X-PM-Access-Key': apiKey,
    'X-PM-Timestamp': timestamp,
    'X-PM-Signature': signature,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const url = `${POLYMARKET_BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polymarket API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Helper to check PIN from request
 */
export function validatePin(request) {
  const appPin = process.env.APP_PIN;
  if (!appPin) {
    // If no PIN configured, allow all requests
    return true;
  }

  // Check header first, then query param
  const headerPin = request.headers.get('x-app-pin');
  const url = new URL(request.url);
  const queryPin = url.searchParams.get('pin');

  const providedPin = headerPin || queryPin;

  return providedPin === appPin;
}
