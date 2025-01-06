
import { useEffect, useRef, useState, useCallback } from 'react';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';

interface WebSocketMessage {
  type: string;
  payload: Record<string, any>;
}

// Global singleton instance
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let connectedCallbacks: Set<() => void> = new Set();
let messageCallbacks: Set<(message: WebSocketMessage) => void> = new Set();

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useUser();
  const { toast } = useToast();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!user || globalWs?.readyState === WebSocket.OPEN || globalConnecting) {
      return;
    }

    globalConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      globalWs = new WebSocket(wsUrl);

      globalWs.onopen = () => {
        console.log('WebSocket connected successfully');
        globalConnecting = false;
        connectedCallbacks.forEach(cb => cb());
        globalWs?.send(JSON.stringify({
          type: 'user_connected',
          payload: { userId: user.id }
        }));
      };

      globalWs.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        globalWs = null;
        globalConnecting = false;
        connectedCallbacks.forEach(cb => cb());

        if (event.code !== 1000) {
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };

      globalWs.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          messageCallbacks.forEach(cb => cb(message));
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      globalConnecting = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, [user]);

  useEffect(() => {
    const updateConnected = () => {
      setIsConnected(globalWs?.readyState === WebSocket.OPEN);
    };
    
    connectedCallbacks.add(updateConnected);
    if (user) connect();
    
    return () => {
      connectedCallbacks.delete(updateConnected);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, user]);

  const sendMessage = useCallback((type: string, payload: Record<string, any>) => {
    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Connection error',
        description: 'Not connected to chat server',
        variant: 'destructive',
      });
      return;
    }

    try {
      globalWs.send(JSON.stringify({ type, payload }));
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    messageCallbacks.add(callback);
    return () => {
      messageCallbacks.delete(callback);
    };
  }, []);

  return { isConnected, sendMessage, subscribe };
}
