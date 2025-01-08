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

const REACTIONS = ["👍", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

export default function MessageList({
  channelId,
  userId,
  onThreadSelect,
}: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Get conversation for DMs
  const { data: conversation } = useQuery({
    queryKey: [`/api/dm/conversations/${userId}`],
    enabled: !!userId,
  });

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: channelId 
      ? [`/api/channels/${channelId}/messages`]
      : [`/api/dm/conversations/${conversation?.conversation?.id}/messages`],
    enabled: !!channelId || (!!userId && !!conversation?.conversation?.id),
  });

  const { subscribe, sendMessage, isConnected } = useWebSocket();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Handle real-time message updates
  const handleWebSocketMessage = useCallback(
    (message: any) => {
      if (message.type === "message_created") {
        const isRelevantMessage = channelId 
          ? message.payload.message.channelId === channelId
          : message.payload.message.conversationId === conversation?.conversation?.id;

        if (isRelevantMessage && !message.payload.message.parentId) {
          queryClient.setQueryData(
            channelId 
              ? [`/api/channels/${channelId}/messages`]
              : [`/api/dm/conversations/${conversation?.conversation?.id}/messages`],
            (oldData: Message[] = []) => {
              const newMessage = {
                ...message.payload.message,
                user: message.payload.user,
              };
              const exists = oldData.some((msg) => msg.id === newMessage.id);
              return exists ? oldData : [...oldData, newMessage];
            }
          );
        }
      } else if (message.type === "message_reaction_updated") {
        const { messageId, reactions } = message.payload;
        queryClient.setQueryData(
          channelId
            ? [`/api/channels/${channelId}/messages`]
            : [`/api/dm/conversations/${conversation?.conversation?.id}/messages`],
          (oldData: Message[] = []) => {
            return oldData.map((msg) =>
              msg.id === messageId ? { ...msg, reactions } : msg,
            );
          }
        );
      }
    },
    [channelId, conversation?.conversation?.id, queryClient]
  );

  useEffect(() => {
    if (!channelId && !userId) return;

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [channelId, userId, subscribe, handleWebSocketMessage]);

  // Sort messages by creation date (oldest first)
  const sortedMessages = [...messages].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const handleReaction = useCallback(
    (messageId: number, reaction: string, userId?: number) => {
      sendMessage("message_reaction", { messageId, reaction, userId });
    },
    [sendMessage]
  );

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {sortedMessages.map((message) => (
            <div key={message.id} className="group">
              <div className="flex items-start gap-3">
                <Avatar>
                  <AvatarImage src={message.user.avatar || undefined} />
                  <AvatarFallback>
                    {message.user.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {message.user.username}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(message.createdAt), "p")}
                    </span>
                  </div>
                  <p className="mt-1">{message.content}</p>
                  {message.reactions &&
                    Object.entries(
                      message.reactions as Record<string, number[]>,
                    ).length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {Object.entries(
                          message.reactions as Record<string, number[]>,
                        ).map(([reaction, userIds]) => (
                          <Button
                            key={reaction}
                            variant="secondary"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleReaction(message.id, reaction)}
                          >
                            {reaction} {userIds.length}
                          </Button>
                        ))}
                      </div>
                    )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-2" align="end">
                      <div className="grid grid-cols-4 gap-2">
                        {REACTIONS.map((reaction) => (
                          <Button
                            key={reaction}
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              handleReaction(
                                message.id,
                                reaction,
                                message.user.id,
                              )
                            }
                          >
                            {reaction}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onThreadSelect(message)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {message.replies && message.replies.length > 0 && (
                <Button
                  variant="ghost"
                  className="ml-12 mt-2 text-xs"
                  onClick={() => onThreadSelect(message)}
                >
                  {message.replies.length} replies
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <MessageInput channelId={channelId} userId={userId} />
    </div>
  );
}