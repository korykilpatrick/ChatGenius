import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Smile, Download } from "lucide-react";
import { format } from "date-fns";
import type { Message, DirectMessageWithSender } from "@db/schema";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type MessageListProps = {
  channelId?: number;
  conversationId?: number;
  // Updated so it can accept both channel and DM messages:
  onThreadSelect: (message: Message | DirectMessageWithSender) => void;
};

const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

// Union type for channel or DM messages
type MessageType = Message | DirectMessageWithSender;

export default function MessageList({
  channelId,
  conversationId,
  onThreadSelect,
}: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const { user } = useUser();
  const { subscribe, sendMessage } = useWebSocket();

  // Decide which queryKey to use: channel messages vs. DM messages
  const queryKey = channelId
    ? [`/api/channels/${channelId}/messages`]
    : [`/api/dm/conversations/${conversationId}/messages`];

  // Fetch the messages from the appropriate endpoint
  const { data: messages = [] } = useQuery<MessageType[]>({
    queryKey,
    enabled: !!channelId || !!conversationId,
  });

  // Helper to scroll to the bottom
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

  // Auto-scroll on initial load or when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
        isInitialLoadRef.current = false;
      }, 100);
    }
  }, [messages, channelId, conversationId, scrollToBottom]);

  // Handle incoming WebSocket messages for new messages and reaction updates
  const handleWebSocketMessage = useCallback(
    (wsMessage: any) => {
      if (wsMessage.type === "message_created") {
        // Determine if this new message is relevant to our current channel/DM
        const isRelevantMessage = channelId
          ? wsMessage.payload.message.channelId === channelId
          : wsMessage.payload.message.conversationId === conversationId;

        if (isRelevantMessage) {
          const isReply = !!wsMessage.payload.message.parentId;
          queryClient.setQueryData(queryKey, (oldData: MessageType[] = []) => {
            if (!isReply) {
              // It's a new top-level message
              const newMessage = {
                ...wsMessage.payload.message,
                user: wsMessage.payload.user,
                sender: wsMessage.payload.user,
                replies: [],
              };
              const exists = oldData.some((m) => m.id === newMessage.id);
              if (!exists) {
                setTimeout(scrollToBottom, 100);
                return [...oldData, newMessage];
              }
            } else {
              // It's a reply -> find its parent message
              return oldData.map((msg) => {
                if (msg.id === wsMessage.payload.message.parentId) {
                  return {
                    ...msg,
                    replies: [
                      ...(msg.replies || []),
                      {
                        ...wsMessage.payload.message,
                        user: wsMessage.payload.user,
                        sender: wsMessage.payload.user,
                      },
                    ],
                  };
                }
                return msg;
              });
            }
            return oldData;
          });
        }
      } else if (wsMessage.type === "message_reaction_updated") {
        // Reaction update for either channel or DM
        const { messageId, reactions } = wsMessage.payload;
        queryClient.setQueryData(queryKey, (oldData: MessageType[] = []) => {
          return oldData.map((msg) => {
            // Update if this is the message that got reacted
            if (msg.id === messageId) {
              return { ...msg, reactions };
            }
            // Also handle replies if needed
            if (msg.replies && msg.replies.length > 0) {
              return {
                ...msg,
                replies: msg.replies.map((r) =>
                  r.id === messageId ? { ...r, reactions } : r
                ),
              };
            }
            return msg;
          });
        });
      }
    },
    [channelId, conversationId, queryClient, queryKey, scrollToBottom]
  );

  // Subscribe/unsubscribe to WebSocket events for this channel/DM
  useEffect(() => {
    if (!channelId && !conversationId) return;
    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [channelId, conversationId, subscribe, handleWebSocketMessage]);

  // Reaction sender
  const handleReaction = useCallback(
    (messageId: number, reaction: string) => {
      if (!user) return;
      const payload: any = {
        messageId,
        reaction,
        userId: user.id,
      };
      // If a DM, set isDM = true so the server updates directMessages
      if (conversationId) {
        payload.isDM = true;
      }
      sendMessage("message_reaction", payload);
    },
    [user, conversationId, sendMessage]
  );

  // File preview logic
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

  // Sort messages chronologically
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
            // For channels => message.user, for DMs => message.sender
            const messageUser = "user" in message ? message.user : message.sender;
            if (!messageUser) return null;

            return (
              <div key={message.id} className="group message-row message-row-hover">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={messageUser.avatar || undefined} />
                    <AvatarFallback>
                      {messageUser.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="message-bubble">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{messageUser.username}</span>
                        <span className="text-xs opacity-70">
                          {format(new Date(message.createdAt), "p")}
                        </span>
                      </div>
                      <p className="text-sm break-words">{message.content}</p>

                      {message.files && message.files.length > 0 && (
                        <div className="space-y-2">
                          {message.files.map((file: string, idx: number) => (
                            <div key={idx}>{renderFileAttachment(file)}</div>
                          ))}
                        </div>
                      )}

                      {message.reactions &&
                        Object.entries(message.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(
                              message.reactions as Record<string, number[]>
                            ).map(([reaction, userIds]) =>
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
                  </div>

                  {/* Reaction + Thread icons */}
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

                    {/* Show thread button for both channels AND DMs */}
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

                {/* "X replies" label. 
                    For channels => message.replies
                    For DMs => also store replies in message.replies if you want the same approach */}
                {message.replies && message.replies.length > 0 && (
                  <Button
                    variant="ghost"
                    className="ml-12 mt-2 text-xs"
                    onClick={() => onThreadSelect(message)}
                  >
                    {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
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
