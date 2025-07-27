// WebSocket client utility for chat
// Usage: import { createWebSocketClient } from './websocketClient';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL;

export type WebSocketEvent = 'open' | 'close' | 'error' | 'message';

export interface WebSocketClient {
  connect: () => void;
  send: (data: string) => void;
  close: () => void;
  on: (event: WebSocketEvent, handler: (event: any) => void) => void;
  isConnected: () => boolean;
}

export function createWebSocketClient(): WebSocketClient {
  let ws: WebSocket | null = null;
  const listeners: Partial<Record<WebSocketEvent, ((event: any) => void)[]>> = {};
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;
  const reconnectDelay = 2000; // 2 seconds

  function getToken() {
    return localStorage.getItem('accessToken');
  }

  function getUrlWithToken() {
    const token = getToken();
    if (!WEBSOCKET_URL) {
      console.error('[WebSocket] VITE_WEBSOCKET_URL is not set');
      throw new Error('VITE_WEBSOCKET_URL is not set');
    }
    const url = new URL(WEBSOCKET_URL);
    url.searchParams.set('token', token || '');
    return url.toString();
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      console.log('[WebSocket] Already connected or connecting');
      return;
    }

    try {
      const url = getUrlWithToken();
      console.log('[WebSocket] Connecting to', url);
      ws = new WebSocket(url);
      
      ws.onopen = (event) => {
        console.log('[WebSocket] Connection opened', event);
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        listeners.open?.forEach(fn => fn(event));
      };
      
      ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed', event);
        listeners.close?.forEach(fn => fn(event));
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          console.log(`[WebSocket] Attempting to reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
          reconnectAttempts++;
          setTimeout(() => {
            if (ws?.readyState !== WebSocket.OPEN) {
              connect();
            }
          }, reconnectDelay);
        }
      };
      
      ws.onerror = (event) => {
        console.error('[WebSocket] Error', event);
        listeners.error?.forEach(fn => fn(event));
      };
      
      ws.onmessage = (event) => {
        console.log('[WebSocket] Message received', event);
        listeners.message?.forEach(fn => fn(event));
      };
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      listeners.error?.forEach(fn => fn(error));
    }
  }

  function send(data: string) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Sending:', data);
      try {
        ws.send(data);
      } catch (error) {
        console.error('[WebSocket] Failed to send data:', error);
        throw error;
      }
    } else {
      const error = new Error(`WebSocket not open. State: ${ws?.readyState}`);
      console.warn('[WebSocket] Not open, cannot send:', data, error);
      throw error;
    }
  }

  function close() {
    if (ws) {
      console.log('[WebSocket] Closing connection');
      ws.close(1000, 'Client initiated close');
      ws = null;
    }
  }

  function isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN;
  }

  function on(event: WebSocketEvent, handler: (event: any) => void) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event]!.push(handler);
  }

  return { connect, send, close, on, isConnected };
} 