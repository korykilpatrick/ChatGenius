// MessageList.tsx
import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Smile, Download } from "lucide-react";
import { format } from "date-fns";
import type { Message, DirectMessageWithSender } from "@db/schema";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";

type MessageListProps = {
  channelId?: number;
  conversationId?: number;
  onThreadSelect: (message: Message) => void;
  onUserAvatarClick?: (userId: number) => void;
};

const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

type MessageType = Message | DirectMessageWithSender;

export default function MessageList({
  channelId,
  conversationId,
  onThreadSelect,
  onUserAvatarClick,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { sendMessage } = useWebSocket();
  const isDM = !!conversationId;

  const { data: messages = [] } = useQuery<MessageType[]>({
    queryKey: channelId
      ? [`/api/channels/${channelId}/messages`]
      : [`/api/dm/conversations/${conversationId}/messages`],
    enabled: !!channelId || !!conversationId,
  });

  const scrollToBottom = useCallback(() => {
    const scrollViewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement;
    if (scrollViewport) {
      requestAnimationFrame(() => {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      });
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [messages, channelId, conversationId, scrollToBottom]);

  const handleReaction = (messageId: number, reaction: string) => {
    if (!user) return;
    sendMessage("message_reaction", {
      messageId,
      reaction,
      userId: user.id,
      isDM,
    });
  };

  const renderFileAttachment = (file: string) => {
    const filePath = file.startsWith("/") ? file : `/uploads/${file}`;
    const isImage = filePath.match(/\.(jpg|jpeg|png|gif)$/i);

    if (isImage) {
      return (
        <div className="mt-2 relative group">
          <img
            src={filePath}
            alt="Attached file"
            className="max-h-48 rounded-lg object-contain"
          />
          <a
            href={filePath}
            download
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Button variant="secondary" size="icon" className="h-8 w-8">
              <Download className="h-4 w-4" />
            </Button>
          </a>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <a
          href={filePath}
          download
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Download className="h-4 w-4" />
          {filePath.split("/").pop()}
        </a>
      </div>
    );
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <ScrollArea className="flex-1" ref={scrollAreaRef}>
      <div className="p-4 space-y-4">
        {sortedMessages.length === 0 ? (
          <div className="text-center text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          sortedMessages.map((message) => {
            const messageUser = "user" in message ? message.user : message.sender;
            if (!messageUser) return null;

            return (
              <div key={message.id} className="group message-row message-row-hover">
                <div className="flex items-start gap-3">
                  <div
                    className="cursor-pointer"
                    onClick={() => onUserAvatarClick?.(messageUser.id)}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={messageUser.avatar || undefined} />
                      <AvatarFallback>
                        {messageUser.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="flex-1">
                    <div className="message-bubble">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">
                          {messageUser.username}
                        </span>
                        <span className="text-xs opacity-70">
                          {format(new Date(message.createdAt), "p")}
                        </span>
                      </div>
                      <p className="text-sm break-words">{message.content}</p>
                      {message.files && message.files.length > 0 && (
                        <div className="space-y-2">
                          {message.files.map((file, index) => (
                            <div key={index}>{renderFileAttachment(file)}</div>
                          ))}
                        </div>
                      )}
                      {message.reactions &&
                        Object.entries(message.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(message.reactions).map(
                              ([reaction, userIds]) =>
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
                    {"channelId" in message && channelId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onThreadSelect(message as Message)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {"channelId" in message &&
                  channelId &&
                  "replies" in message &&
                  message.replies &&
                  message.replies.length > 0 && (
                    <Button
                      variant="ghost"
                      className="ml-12 mt-2 text-xs"
                      onClick={() => onThreadSelect(message as Message)}
                    >
                      {message.replies.length} replies
                    </Button>
                  )}
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
