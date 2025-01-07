import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import MessageInput from "./MessageInput";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, useCallback } from "react";
import type { Message } from "@db/schema";

type ThreadViewProps = {
  message: Message;
  onClose: () => void;
};

export default function ThreadView({ message, onClose }: ThreadViewProps) {
  const queryClient = useQueryClient();
  const { data: replies = [] } = useQuery<Message[]>({
    queryKey: [`/api/channels/${message.channelId}/messages/${message.id}/replies`],
  });

  const { subscribe, isConnected } = useWebSocket();

  const handleWebSocketMessage = useCallback(
    (wsMessage: any) => {
      if (wsMessage.type === "message_created" && wsMessage.payload.message.parentId === message.id) {
        // Add the new reply to the existing replies
        queryClient.setQueryData(
          [`/api/channels/${message.channelId}/messages/${message.id}/replies`],
          (oldData: Message[] = []) => {
            const newReply = {
              ...wsMessage.payload.message,
              user: wsMessage.payload.user,
            };
            return [...oldData, newReply];
          },
        );
      }
    },
    [message.id, message.channelId, queryClient],
  );

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [isConnected, subscribe, handleWebSocketMessage]);

  return (
    <div className="h-full flex flex-col border-l">
      <div className="h-14 border-b flex items-center justify-between px-4">
        <h3 className="font-semibold">Thread</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Parent message */}
          <div className="flex items-start gap-3 pb-4 border-b">
            <Avatar>
              <AvatarImage src={message.user.avatar || undefined} />
              <AvatarFallback>
                {message.user.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{message.user.username}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <p className="mt-1 text-sm">{message.content}</p>
              {message.reactions && Object.entries(message.reactions as Record<string, number[]>).length > 0 && (
                <div className="flex gap-1 mt-2">
                  {Object.entries(message.reactions as Record<string, number[]>).map(([reaction, userIds]) => (
                    <div key={reaction} className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded-md text-xs">
                      <span>{reaction}</span>
                      <span className="text-muted-foreground">{userIds.length}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Replies */}
          <div className="space-y-4">
            {replies.map((reply) => (
              <div key={reply.id} className="flex items-start gap-3">
                <Avatar>
                  <AvatarImage src={reply.user.avatar || undefined} />
                  <AvatarFallback>
                    {reply.user.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{reply.user.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(reply.createdAt), 'h:mm a')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{reply.content}</p>
                  {reply.reactions && Object.entries(reply.reactions as Record<string, number[]>).length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {Object.entries(reply.reactions as Record<string, number[]>).map(([reaction, userIds]) => (
                        <div key={reaction} className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded-md text-xs">
                          <span>{reaction}</span>
                          <span className="text-muted-foreground">{userIds.length}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
      <MessageInput channelId={message.channelId} parentId={message.id} />
    </div>
  );
}