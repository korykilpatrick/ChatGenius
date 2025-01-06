import { useEffect, useRef, useState, useCallback } from 'react';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';

interface WebSocketMessage {
  type: string;
  payload: Record<string, any>;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { user } = useUser();
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!user) {
      console.log('No user, skipping WebSocket connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket is already connected');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket is already connecting');
      return;
    }

    if (wsRef.current) {
      console.log('Cleaning up existing connection');
      wsRef.current.close(1000, 'New connection requested');
      wsRef.current = null;
    }

    try {
      // Create WebSocket URL using the current window location
      // For Replit, always use wss and the full hostname
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Connecting to WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);

      // Setup ping/pong for connection health check
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      // Connection opened
      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        // Send user connected message
        ws.send(JSON.stringify({
          type: 'user_connected',
          payload: { userId: user.id }
        }));
      };

      // Connection closed
      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        clearInterval(pingInterval);

        // Only reconnect on unexpected closures (not clean closes or server-initiated)
        if (event.code !== 1000 && event.code !== 1005) {
          console.log('Unexpected disconnect, attempting reconnect...');
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };

      // Connection error
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: 'Connection error',
          description: 'Failed to connect to chat server',
          variant: 'destructive',
        });
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      toast({
        title: 'Connection error',
        description: 'Failed to establish WebSocket connection',
        variant: 'destructive',
      });

      // Attempt to reconnect after error
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, [user, toast]);

  // Connect when component mounts or user changes
  useEffect(() => {
    if (user) {
      connect();
    }

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect, user]);

  // Send message helper
  const sendMessage = useCallback((type: string, payload: Record<string, any>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, attempting to reconnect...');
      connect();
      return;
    }

    try {
      const message: WebSocketMessage = { type, payload };
      console.log('Sending message:', message);
      wsRef.current.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    }
  }, [connect, toast]);

  // Subscribe to messages
  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, waiting for connection...');
      return () => {};
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        console.log('Received message:', message);

        // Handle error messages
        if (message.type === 'error') {
          toast({
            title: 'Error',
            description: message.payload.message,
            variant: 'destructive',
          });
          return;
        }

        callback(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    wsRef.current.addEventListener('message', handleMessage);
    return () => {
      if (wsRef.current) {
        wsRef.current.removeEventListener('message', handleMessage);
      }
    };
  }, [toast]);

  return { isConnected, sendMessage, subscribe };
}