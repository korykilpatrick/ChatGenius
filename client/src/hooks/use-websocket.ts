import { useEffect, useRef, useState, useCallback } from 'react';
import { useUser } from '@/hooks/use-user';

type WebSocketMessage = {
  type: string;
  payload: any;
};

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { user } = useUser();

  const connect = useCallback(() => {
    if (!user) {
      console.log('No user, skipping WebSocket connection');
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      console.log('Closing existing WebSocket connection');
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      // Create WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Connecting to WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);

      // Connection opened
      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        ws.send(JSON.stringify({
          type: 'user_connected',
          payload: { userId: user.id }
        }));
      };

      // Connection closed
      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event);
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };

      // Connection error
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      // Attempt to reconnect after error
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, [user]);

  // Connect when component mounts or user changes
  useEffect(() => {
    connect();
    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Send message helper
  const sendMessage = useCallback((type: string, payload: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, attempting to reconnect...');
      connect();
      return;
    }

    try {
      const message = JSON.stringify({ type, payload });
      console.log('Sending message:', message);
      wsRef.current.send(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [connect]);

  // Subscribe to messages
  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    if (!wsRef.current) {
      console.log('No WebSocket connection available for subscription');
      return;
    }

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        callback(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
  }, []);

  return { isConnected, sendMessage, subscribe };
}