import { useCallback, useEffect } from "react";
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
  channelId: number;
  onThreadSelect: (message: Message) => void;
};

const REACTIONS = ["👍", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

export default function MessageList({
  channelId,
  onThreadSelect,
}: MessageListProps) {
  const queryClient = useQueryClient();
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
  });

  const { subscribe, sendMessage, isConnected } = useWebSocket();

  const handleWebSocketMessage = useCallback(
    (message: any) => {
      if (message.type === "message_created") {
        if (message.payload.message.channelId === channelId) {
          // For thread replies, we need to update the parent message's replies
          if (message.payload.message.parentId) {
            queryClient.setQueryData(
              [`/api/channels/${channelId}/messages`],
              (oldData: Message[] = []) => {
                return oldData.map(msg => {
                  if (msg.id === message.payload.message.parentId) {
                    // Add the new reply to the beginning of the replies array
                    const replies = msg.replies || [];
                    const newReply = {
                      ...message.payload.message,
                      user: message.payload.user,
                    };
                    return {
                      ...msg,
                      replies: [newReply, ...replies].slice(0, 3) // Keep only the latest 3 replies
                    };
                  }
                  return msg;
                });
              }
            );
          } else {
            // For new parent messages
            queryClient.setQueryData(
              [`/api/channels/${channelId}/messages`],
              (oldData: Message[] = []) => {
                const newMessage = {
                  ...message.payload.message,
                  user: message.payload.user,
                  replies: [],
                };
                const exists = oldData.some((msg) => msg.id === newMessage.id);
                return exists ? oldData : [newMessage, ...oldData];
              }
            );
          }
        }
      } else if (message.type === "message_reaction_updated") {
        const { messageId, reactions } = message.payload;
        queryClient.setQueryData(
          [`/api/channels/${channelId}/messages`],
          (oldData: Message[] = []) => {
            return oldData.map((msg) =>
              msg.id === messageId ? { ...msg, reactions } : msg
            );
          }
        );
      }
    },
    [channelId, queryClient]
  );

  useEffect(() => {
    if (!channelId || !isConnected) return;

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [channelId, isConnected, subscribe, handleWebSocketMessage]);

  const handleReaction = useCallback(
    (messageId: number, reaction: string) => {
      sendMessage("message_reaction", { messageId, reaction });
    },
    [sendMessage]
  );

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
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
                    Object.entries(message.reactions as Record<string, number[]>).length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {Object.entries(message.reactions as Record<string, number[]>).map(
                          ([reaction, userIds]) => (
                            <Button
                              key={reaction}
                              variant="secondary"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => handleReaction(message.id, reaction)}
                            >
                              {reaction} {userIds.length}
                            </Button>
                          )
                        )}
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
                            onClick={() => handleReaction(message.id, reaction)}
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
                  {message.replies.length} {message.replies.length === 1 ? 'reply' : 'replies'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <MessageInput channelId={channelId} />
    </div>
  );
}