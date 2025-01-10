import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useWebSocket } from "./use-websocket";

// Track unread status for channels and DMs
interface UnreadState {
  channels: Set<number>;
  directMessages: Set<number>;
}

interface UnreadContextType {
  unreadState: UnreadState;
  markAsRead: (type: "channel" | "dm", id: number) => void;
  markAsUnread: (type: "channel" | "dm", id: number) => void;
}

const UnreadContext = createContext<UnreadContextType | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [unreadState, setUnreadState] = useState<UnreadState>({
    channels: new Set(),
    directMessages: new Set(),
  });
  const { subscribe } = useWebSocket();
  const [location] = useLocation();

  // Get current channel/DM from URL
  const getCurrentView = () => {
    const dmMatch = location.match(/^\/dm\/(\d+)/);
    if (dmMatch) {
      return { type: "dm" as const, id: parseInt(dmMatch[1], 10) };
    }
    const channelMatch = location.match(/^\/channels?\/(\d+)/);
    if (channelMatch) {
      return { type: "channel" as const, id: parseInt(channelMatch[1], 10) };
    }
    return null;
  };

  // Mark a channel or DM as read
  const markAsRead = (type: "channel" | "dm", id: number) => {
    setUnreadState((prev) => {
      const newState = { ...prev };
      if (type === "channel") {
        newState.channels = new Set([...prev.channels].filter((cid) => cid !== id));
      } else {
        newState.directMessages = new Set([...prev.directMessages].filter((did) => did !== id));
      }
      return newState;
    });
  };

  // Mark a channel or DM as unread
  const markAsUnread = (type: "channel" | "dm", id: number) => {
    setUnreadState((prev) => {
      const newState = { ...prev };
      if (type === "channel") {
        newState.channels = new Set([...prev.channels, id]);
      } else {
        newState.directMessages = new Set([...prev.directMessages, id]);
      }
      return newState;
    });
  };

  // Listen for new messages via WebSocket
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === "message_created") {
        const currentView = getCurrentView();
        const channelId = message.payload.message.channelId;
        const conversationId = message.payload.message.conversationId;

        // If it's a channel message
        if (channelId) {
          // Only mark as unread if we're not currently viewing this channel
          if (!currentView || currentView.type !== "channel" || currentView.id !== channelId) {
            markAsUnread("channel", channelId);
          }
        }
        // If it's a DM
        else if (conversationId) {
          if (!currentView || currentView.type !== "dm" || currentView.id !== conversationId) {
            markAsUnread("dm", conversationId);
          }
        }
      }
    };

    const unsubscribe = subscribe(handleMessage);
    return () => unsubscribe();
  }, [subscribe, location]);

  // Clear unread status when changing location
  useEffect(() => {
    const currentView = getCurrentView();
    if (currentView) {
      markAsRead(currentView.type, currentView.id);
    }
  }, [location]);

  return (
    <UnreadContext.Provider value={{ unreadState, markAsRead, markAsUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  const context = useContext(UnreadContext);
  if (!context) {
    throw new Error("useUnread must be used within an UnreadProvider");
  }
  return context;
}
