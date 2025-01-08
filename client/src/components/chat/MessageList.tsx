import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Smile } from "lucide-react";
import MessageInput from "@/components/chat/MessageInput";
import { format } from "date-fns";
import type { Message } from "@db/schema";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type MessageListProps = {
  channelId?: number;
  userId?: number;
  onThreadSelect: (message: Message) => void;
};

export default function MessageList({
  channelId,
  userId,
  onThreadSelect,
}: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { subscribe, sendMessage } = useWebSocket();

  // Get conversation for DMs
  const { data: conversation } = useQuery({
    queryKey: userId ? [`/api/dm/conversations/${userId}`] : null,
    enabled: !!userId,
  });

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: channelId
      ? [`/api/channels/${channelId}/messages`]
      : conversation?.conversation?.id
      ? [`/api/dm/conversations/${conversation.conversation.id}/messages`]
      : null,
    enabled: !!channelId || (!!userId && !!conversation?.conversation?.id),
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (!channelId && !conversation?.conversation?.id) return;

    const handleWebSocketMessage = (message: any) => {
      if (message.type === "message_created") {
        const isRelevantMessage = channelId
          ? message.payload.message.channelId === channelId
          : message.payload.message.conversationId === conversation?.conversation?.id;

        if (isRelevantMessage) {
          const queryKey = channelId
            ? [`/api/channels/${channelId}/messages`]
            : [`/api/dm/conversations/${conversation.conversation.id}/messages`];

          queryClient.setQueryData(queryKey, (oldData: Message[] = []) => {
            const newMessage = {
              ...message.payload.message,
              sender: message.payload.user,
            };
            const exists = oldData.some((msg) => msg.id === newMessage.id);
            return exists ? oldData : [...oldData, newMessage];
          });
        }
      }
    };

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [channelId, conversation?.conversation?.id, queryClient, subscribe]);

  // Sort messages by creation date (oldest first)
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {sortedMessages.map((message) => (
            <div key={message.id} className="group">
              <div className="flex items-start gap-3">
                <Avatar>
                  <AvatarImage src={message.sender?.avatar || undefined} />
                  <AvatarFallback>
                    {message.sender?.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {message.sender?.username}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(message.createdAt), "p")}
                    </span>
                  </div>
                  <p className="mt-1">{message.content}</p>
                </div>
                {channelId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    onClick={() => onThreadSelect(message)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <MessageInput channelId={channelId} userId={userId} />
    </div>
  );
}