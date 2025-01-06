import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

type WebSocketMessage = {
  type: string;
  payload: any;
};

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      toast({
        title: "Connected",
        description: "Real-time messaging enabled",
      });
    };

    ws.onclose = () => {
      setIsConnected(false);
      toast({
        title: "Disconnected",
        description: "Connection lost. Trying to reconnect...",
        variant: "destructive",
      });
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          window.location.reload();
        }
      }, 5000);
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = (type: string, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = { type, payload };
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const subscribe = (callback: (message: WebSocketMessage) => void) => {
    if (wsRef.current) {
      wsRef.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        callback(message);
      };
    }
  };

  return { isConnected, sendMessage, subscribe };
}
