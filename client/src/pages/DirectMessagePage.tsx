import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { format } from "date-fns";

interface Message {
  id: number;
  content: string;
  createdAt: string;
  senderId: number;
  sender: {
    id: number;
    username: string;
    avatar: string | null;
  };
}

interface Conversation {
  conversation: {
    id: number;
    createdAt: string;
    lastMessageAt: string;
  };
  participant: {
    id: number;
    username: string;
    avatar: string | null;
  };
}

export default function DirectMessagePage() {
  const [message, setMessage] = useState("");
  const [, params] = useRoute("/dm/:id");
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const otherUserId = params?.id ? parseInt(params.id) : null;
  const { subscribe } = useWebSocket();

  const { data: conversation, isLoading: isLoadingConversation } = useQuery<Conversation>({
    queryKey: [`/api/dm/conversations/${otherUserId}`],
    enabled: !!otherUserId,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/dm/conversations/${conversation?.conversation?.id}/messages`],
    enabled: !!otherUserId && !!conversation?.conversation?.id,
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !conversation?.conversation?.id) return;

    try {
      const response = await fetch(
        `/api/dm/conversations/${conversation.conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.trim() }),
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (!conversation?.conversation?.id) return;

    const handleWebSocketMessage = (message: any) => {
      if (message.type === "message_created") {
        if (message.payload.message.conversationId === conversation.conversation.id) {
          queryClient.setQueryData(
            [`/api/dm/conversations/${conversation.conversation.id}/messages`],
            (oldData: Message[] = []) => {
              const newMessage = message.payload.message;
              const exists = oldData.some((msg) => msg.id === newMessage.id);
              return exists ? oldData : [...oldData, newMessage];
            }
          );
        }
      }
    };

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [conversation?.conversation?.id, subscribe, queryClient]);

  if (!currentUser || !otherUserId) return null;

  if (isLoadingConversation) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading conversation...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Conversation not found</p>
      </div>
    );
  }

  const { participant } = conversation;

  // Sort messages by creation date (oldest first)
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b h-14 flex items-center px-4 justify-between bg-background">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={participant.avatar || undefined} />
            <AvatarFallback>
              {participant.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold">
            {participant.username}
          </span>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to Chat
        </Link>
      </header>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {isLoadingMessages ? (
            <div className="text-center text-muted-foreground">Loading messages...</div>
          ) : sortedMessages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </div>
          ) : (
            sortedMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${
                  msg.sender.id === currentUser.id ? "justify-end" : ""
                }`}
              >
                {msg.sender.id !== currentUser.id && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.sender.avatar || undefined} />
                    <AvatarFallback>
                      {msg.sender.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] ${
                    msg.sender.id === currentUser.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  } rounded-lg p-3`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs opacity-70">
                      {format(new Date(msg.createdAt), "PP p")}
                    </span>
                  </div>
                  <p className="text-sm break-words">{msg.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <form onSubmit={sendMessage} className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" disabled={!message.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}