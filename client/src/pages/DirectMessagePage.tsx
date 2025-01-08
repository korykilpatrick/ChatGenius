import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
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
  const otherUserId = params?.id;

  const { data: conversation, isLoading: isLoadingConversation } = useQuery<Conversation>({
    queryKey: [`/api/dm/conversations/${otherUserId}`],
    enabled: !!otherUserId,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/dm/conversations/${otherUserId}/messages`],
    enabled: !!otherUserId,
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !otherUserId) return;

    try {
      const response = await fetch(
        `/api/dm/conversations/${otherUserId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.trim() }),
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

  if (!currentUser || isLoadingConversation) return null;

  const { participant } = conversation!;

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
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${
                  msg.sender.id === currentUser!.id ? "justify-end" : ""
                }`}
              >
                {msg.sender.id !== currentUser!.id && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.sender.avatar || undefined} />
                    <AvatarFallback>
                      {msg.sender.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] ${
                    msg.sender.id === currentUser!.id
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