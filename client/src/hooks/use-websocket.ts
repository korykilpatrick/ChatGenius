import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";

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
    if (globalWs?.readyState === WebSocket.OPEN || globalConnecting) {
      return;
    }

    globalConnecting = true;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      globalWs = new WebSocket(wsUrl);

      globalWs.onopen = () => {
        console.log("[WebSocket] Connected successfully");
        globalConnecting = false;
        connectedCallbacks.forEach((cb) => cb());
        if (user) {
          globalWs?.send(
            JSON.stringify({
              type: "user_connected",
              payload: { userId: user.id },
            }),
          );
        }
      };

      globalWs.onclose = (event) => {
        console.log("[WebSocket] Disconnected:", event.code, event.reason);
        globalWs = null;
        globalConnecting = false;
        connectedCallbacks.forEach((cb) => cb());

        if (event.code !== 1000) {
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };

      globalWs.onmessage = (event) => {
        try {
          console.log(event.data);
          const message = JSON.parse(event.data) as WebSocketMessage;
          console.log("[WebSocket] Received message:", message);

          // Ensure callbacks are called with the message
          messageCallbacks.forEach((cb) => {
            try {
              cb(message);
            } catch (callbackError) {
              console.error("[WebSocket] Callback error:", callbackError);
            }
          });
        } catch (error) {
          console.error("[WebSocket] Failed to parse message:", error);
        }
      };

      globalWs.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };
    } catch (error) {
      console.error("[WebSocket] Failed to create connection:", error);
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
    connect();

    return () => {
      connectedCallbacks.delete(updateConnected);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, user]);

  const sendMessage = useCallback(
    (type: string, payload: Record<string, any>) => {
      if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
        toast({
          title: "Connection error",
          description: "Not connected to chat server",
          variant: "destructive",
        });
        return;
      }

      try {
        const message = { type, payload };
        console.log("[WebSocket] Sending message:", message);
        globalWs.send(JSON.stringify(message));
      } catch (error) {
        console.error("[WebSocket] Failed to send message:", error);
        toast({
          title: "Error",
          description: "Failed to send message",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const subscribe = useCallback(
    (callback: (message: WebSocketMessage) => void) => {
      console.log("[WebSocket] Adding message callback");
      messageCallbacks.add(callback);
      return () => {
        console.log("[WebSocket] Removing message callback");
        messageCallbacks.delete(callback);
      };
    },
    [],
  );

  return { isConnected, sendMessage, subscribe };
}
