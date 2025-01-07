import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { formatDistanceToNow } from "date-fns";

type Message = {
  id: number;
  content: string;
  createdAt: string;
  sender: {
    id: number;
    username: string;
    avatar: string | null;
  };
};

export default function DirectMessagePage() {
  const [message, setMessage] = useState("");
  const [, params] = useRoute("/dm/:id");
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const conversationId = params?.id;

  const { data: messages, isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/dm/conversations/${conversationId}/messages`],
    enabled: !!conversationId,
  });

  const { data: conversation } = useQuery({
    queryKey: [`/api/dm/conversations/${conversationId}`],
    enabled: !!conversationId,
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !conversationId) return;

    try {
      const response = await fetch(
        `/api/dm/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const newMessage = await response.json();
      queryClient.setQueryData<Message[]>(
        [`/api/dm/conversations/${conversationId}/messages`],
        (old) => [newMessage, ...(old || [])]
      );
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

  if (!currentUser) return null;

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b h-14 flex items-center px-4 shrink-0">
        {conversation?.participant && (
          <div className="flex items-center gap-2">
            <Avatar>
              <AvatarImage
                src={conversation.participant.avatar || undefined}
              />
              <AvatarFallback>
                {conversation.participant.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-semibold">
              {conversation.participant.username}
            </span>
          </div>
        )}
      </header>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {isLoadingMessages ? (
            <div className="text-center text-muted-foreground">Loading...</div>
          ) : messages?.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No messages yet
            </div>
          ) : (
            messages?.map((msg) => (
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
                  } rounded-lg p-2`}
                >
                  <div className="flex items-center gap-2">
                    {msg.sender.id !== currentUser.id && (
                      <span className="text-sm font-medium">
                        {msg.sender.username}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <form onSubmit={sendMessage} className="border-t p-4 shrink-0">
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
