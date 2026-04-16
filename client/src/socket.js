import { io } from 'socket.io-client';
import { socketBaseUrl } from './lib/api';

// undefined means deriving the URL from window.location.
const URL = socketBaseUrl || undefined;

export const socket = io(URL, {
  autoConnect: true,
});
