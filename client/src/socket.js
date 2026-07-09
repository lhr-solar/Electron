import { io } from 'socket.io-client';
import { getManageToken, socketBaseUrl } from './lib/api';

// undefined means deriving the URL from window.location.
const URL = socketBaseUrl || undefined;

// WebSocket-first. Polling through Cloudflare Tunnel can 400 when consecutive
// requests hit different connectors (Engine.IO sessions are not sticky).
export const socket = io(URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  upgrade: true,
  withCredentials: true,
  auth: (cb) => {
    const token = getManageToken();
    cb(token ? { manage_token: token } : {});
  },
});
