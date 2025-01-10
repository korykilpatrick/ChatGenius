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
  onUserAvatarClick?: (userId: number) => void;
};

export default function ThreadView({
  message,
  onClose,
  onUserAvatarClick,
}: ThreadViewProps) {
  const queryClient = useQueryClient();
  const { subscribe, sendMessage } = useWebSocket();
  const { user } = useUser();
  const isDM = "conversationId" in message;

  useEffect(() => {
    const unsubscribe = subscribe((wsMessage) => {
      if (
        wsMessage.type === "message_created" &&
        wsMessage.payload.message.parentId === message.id
      ) {
        const { conversationId, channelId } = wsMessage.payload.message;
        queryClient.setQueryData(
          isDM
            ? [`/api/dm/conversations/${conversationId}/messages/${message.id}/replies`]
            : [`/api/channels/${channelId}/messages/${message.id}/replies`],
          (oldData: (Message | DirectMessageWithSender)[] = []) => {
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
        const { messageId, reactions, channelId, conversationId } = wsMessage.payload;
        const queryKey = isDM
          ? [`/api/dm/conversations/${(message as DirectMessageWithSender).conversationId}/messages/${message.id}/replies`]
          : [`/api/channels/${(message as Message).channelId}/messages/${message.id}/replies`];

        queryClient.setQueryData(
          queryKey,
          (oldData: (Message | DirectMessageWithSender)[] = []) =>
            oldData.map((reply) =>
              reply.id === messageId ? { ...reply, reactions } : reply
            )
        );
        if (messageId === message.id) {
          message.reactions = reactions;
        }
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, queryClient, subscribe, isDM]);

  const { data: replies = [] } = useQuery<(Message | DirectMessageWithSender)[]>({
    queryKey: isDM
      ? [`/api/dm/conversations/${(message as DirectMessageWithSender).conversationId}/messages/${message.id}/replies`]
      : [`/api/channels/${(message as Message).channelId}/messages/${message.id}/replies`],
  });

  const handleReaction = (messageId: number, reaction: string) => {
    if (!user) return;
    sendMessage("message_reaction", {
      messageId,
      reaction,
      userId: user.id,
      isDM,
    });
  };

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
          <div className="group flex items-start gap-3">
            <Avatar
              className="cursor-pointer"
              onClick={() => onUserAvatarClick?.(messageUser.id)}
            >
              <AvatarImage src={messageUser.avatar || undefined} />
              <AvatarFallback>
                {messageUser.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{messageUser.username}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.createdAt), "p")}
                </span>
              </div>
              <p className="mt-1">{message.content}</p>
              {message.reactions &&
                Object.entries(message.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(message.reactions).map(([reaction, userIds]) =>
                      userIds.length > 0 ? (
                        <Button
                          key={reaction}
                          variant="secondary"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleReaction(message.id, reaction)}
                        >
                          {reaction} {userIds.length}
                        </Button>
                      ) : null
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

          {replies.map((reply) => {
            const replyUser = "user" in reply ? reply.user : reply.sender;
            return (
              <div key={reply.id} className="group flex items-start gap-3 ml-8">
                <Avatar
                  className="cursor-pointer"
                  onClick={() => onUserAvatarClick?.(replyUser.id)}
                >
                  <AvatarImage src={replyUser.avatar || undefined} />
                  <AvatarFallback>
                    {replyUser.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{replyUser.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(reply.createdAt), "p")}
                    </span>
                  </div>
                  <p className="mt-1">{reply.content}</p>
                  {reply.reactions &&
                    Object.entries(reply.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(reply.reactions).map(
                          ([reaction, userIds]) =>
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
            );
          })}
        </div>
      </ScrollArea>

      {isDM ? (
        <MessageInput
          conversationId={(message as DirectMessageWithSender).conversationId}
          parentId={message.id}
        />
      ) : (
        <MessageInput
          channelId={(message as Message).channelId}
          parentId={message.id}
        />
      )}
    </div>
  );
}