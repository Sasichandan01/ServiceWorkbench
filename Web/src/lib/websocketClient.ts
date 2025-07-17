// WebSocket client utility for chat
// Usage: import { createWebSocketClient } from './websocketClient';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL;

export type WebSocketEvent = 'open' | 'close' | 'error' | 'message';

export interface WebSocketClient {
  connect: () => void;
  send: (data: string) => void;
  close: () => void;
  on: (event: WebSocketEvent, handler: (event: any) => void) => void;
}

export function createWebSocketClient(): WebSocketClient {
  let ws: WebSocket | null = null;
  const listeners: Partial<Record<WebSocketEvent, ((event: any) => void)[]>> = {};

  function getToken() {
    return localStorage.getItem('accessToken');
  }

  function getUrlWithToken() {
    const token = getToken();
    if (!WEBSOCKET_URL) throw new Error('VITE_WEBSOCKET_URL is not set');
    const url = new URL(WEBSOCKET_URL);
    url.searchParams.set('token', token || '');
    return url.toString();
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const url = getUrlWithToken();
    console.log('[WebSocket] Connecting to', url);
    ws = new WebSocket(url);
    ws.onopen = (event) => {
      console.log('[WebSocket] Connection opened', event);
      listeners.open?.forEach(fn => fn(event));
    };
    ws.onclose = (event) => {
      console.log('[WebSocket] Connection closed', event);
      listeners.close?.forEach(fn => fn(event));
    };
    ws.onerror = (event) => {
      console.error('[WebSocket] Error', event);
      listeners.error?.forEach(fn => fn(event));
    };
    ws.onmessage = (event) => {
      console.log('[WebSocket] Message received', event);
      listeners.message?.forEach(fn => fn(event));
    };
  }

  function send(data: string) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Sending:', data);
      ws.send(data);
    } else {
      console.warn('[WebSocket] Not open, cannot send:', data);
    }
  }

  function close() {
    ws?.close();
  }

  function on(event: WebSocketEvent, handler: (event: any) => void) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event]!.push(handler);
  }

  return { connect, send, close, on };
} 