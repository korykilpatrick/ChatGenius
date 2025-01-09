import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X, Smile } from "lucide-react";
import MessageInput from "./MessageInput";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import type { Message, DirectMessageWithSender } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

type ThreadViewProps = {
  message: Message | DirectMessageWithSender;
  onClose: () => void;
};

type MessageType = Message | DirectMessageWithSender;

export default function ThreadView({ message, onClose }: ThreadViewProps) {
  const queryClient = useQueryClient();
  const { subscribe, sendMessage } = useWebSocket();
  const { user } = useUser();

  // Determine if this is a DM thread or channel thread
  const isDM = "conversationId" in message;
  const threadQueryKey = isDM
    ? [`/api/dm/conversations/${message.conversationId}/messages/${message.id}/replies`]
    : [`/api/channels/${(message as Message).channelId}/messages/${message.id}/replies`];

  useEffect(() => {
    const unsubscribe = subscribe((wsMessage) => {
      if (wsMessage.type === "message_created" && 
          wsMessage.payload.message.parentId === message.id) {
        // Update the thread replies view
        queryClient.setQueryData(
          threadQueryKey,
          (oldData: MessageType[] = []) => {
            const newReply = {
              ...wsMessage.payload.message,
              user: wsMessage.payload.user,
              sender: wsMessage.payload.user,
            };
            const exists = oldData.some((msg) => msg.id === newReply.id);
            return exists ? oldData : [...oldData, newReply];
          }
        );
      } else if (wsMessage.type === "message_reaction_updated") {
        const { messageId, reactions } = wsMessage.payload;
        // Update reactions for replies in the thread
        queryClient.setQueryData(
          threadQueryKey,
          (oldData: MessageType[] = []) => {
            return oldData.map((reply) =>
              reply.id === messageId ? { ...reply, reactions } : reply
            );
          }
        );
      }
    });

    return () => unsubscribe();
  }, [message.id, threadQueryKey, queryClient, subscribe]);

  const { data: replies = [] } = useQuery<MessageType[]>({
    queryKey: threadQueryKey,
  });

  const handleReaction = (messageId: number, reaction: string) => {
    sendMessage("message_reaction", {
      messageId,
      reaction,
      userId: user?.id,
      isDM,
    });
  };

  // Get the user/sender info based on message type
  const messageUser = "user" in message ? message.user : message.sender;

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
          <div className="flex items-start gap-3">
            <Avatar>
              <AvatarImage src={messageUser.avatar || undefined} />
              <AvatarFallback>
                {messageUser.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{messageUser.username}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.createdAt), 'p')}
                </span>
              </div>
              <p className="mt-1">{message.content}</p>
              {message.reactions && Object.entries(message.reactions as Record<string, number[]>).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(message.reactions as Record<string, number[]>).map(([reaction, userIds]) =>
                    userIds.length > 0 && (
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
            <div className="opacity-0 group-hover:opacity-100">
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
            </div>
          </div>

          {replies.map((reply) => (
            <div key={reply.id} className="group flex items-start gap-3 ml-8">
              <Avatar>
                <AvatarImage src={("user" in reply ? reply.user : reply.sender).avatar || undefined} />
                <AvatarFallback>
                  {("user" in reply ? reply.user : reply.sender).username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{("user" in reply ? reply.user : reply.sender).username}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(reply.createdAt), 'p')}
                  </span>
                </div>
                <p className="mt-1">{reply.content}</p>
                {reply.reactions && Object.entries(reply.reactions as Record<string, number[]>).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(reply.reactions as Record<string, number[]>).map(([reaction, userIds]) =>
                      userIds.length > 0 && (
                        <Button
                          key={reaction}
                          variant="secondary"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleReaction(reply.id, reaction)}
                        >
                          {reaction} {userIds.length}
                        </Button>
                      )
                    )}
                  </div>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100">
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
                          onClick={() => handleReaction(reply.id, reaction)}
                        >
                          {reaction}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      {isDM ? (
        <MessageInput conversationId={message.conversationId} parentId={message.id} />
      ) : (
        <MessageInput channelId={(message as Message).channelId} parentId={message.id} />
      )}
    </div>
  );
}