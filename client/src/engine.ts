// Where the local engine (connector) lives.
// Dev: same-origin (Vite proxies /api, /assets, /ws to :5918).
// Hosted on a real domain: talk to the user's local connector at localhost:5918.
const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const ENGINE = local ? '' : 'http://localhost:5918';
export const WS_URL = (ENGINE ? ENGINE.replace(/^http/, 'ws') : `ws://${location.host}`) + '/ws';
export const api = (path: string): string => ENGINE + path;
