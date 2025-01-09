import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { format } from "date-fns";
import MessageInput from "@/components/chat/MessageInput";
import { Button } from "@/components/ui/button";
import { Download, MessageSquare, Smile } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const REACTIONS = ["👍", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

export default function DirectMessagePage() {
  const [, params] = useRoute("/dm/:id");
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const otherUserId = params?.id ? parseInt(params.id) : null;
  const { subscribe, sendMessage } = useWebSocket();

  const { data: conversation } = useQuery<Conversation>({
    queryKey: [`/api/dm/conversations/${otherUserId}`],
    enabled: !!otherUserId && !!currentUser,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/dm/conversations/${conversation?.conversation?.id}/messages`],
    enabled: !!conversation?.conversation?.id,
  });

  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  useEffect(() => {
    if (!conversation?.conversation?.id) return;
    const handleWebSocketMessage = (wsMessage: any) => {
      if (wsMessage.type === "message_created" &&
          wsMessage.payload.message.conversationId === conversation.conversation.id) {
        queryClient.setQueryData(
          [`/api/dm/conversations/${conversation.conversation.id}/messages`],
          (oldData: Message[] = []) => {
            const newMessage = {
              ...wsMessage.payload.message,
              sender: wsMessage.payload.user,
            };
            const exists = oldData.some((msg) => msg.id === newMessage.id);
            return exists ? oldData : [...oldData, newMessage];
          }
        );
      } else if (wsMessage.type === "message_reaction_updated") {
        const { messageId, reactions } = wsMessage.payload;
        queryClient.setQueryData(
          [`/api/dm/conversations/${conversation.conversation.id}/messages`],
          (oldData: Message[] = []) => {
            return oldData.map((msg) =>
              msg.id === messageId ? { ...msg, reactions } : msg
            );
          }
        );
      }
    };

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [conversation?.conversation?.id, subscribe, queryClient]);

  const handleReaction = (messageId: number, reaction: string) => {
    if (!currentUser) return;
    sendMessage("message_reaction", {
      messageId,
      reaction,
      userId: currentUser.id,
      isDM: true,
    });
  };

  const renderFileAttachment = (file: string) => {
    const filePath = file.startsWith('/') ? file : `/uploads/${file}`;
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
          {filePath.split('/').pop()}
        </a>
      </div>
    );
  };

  if (!currentUser || !otherUserId || !conversation) return null;

  const { participant } = conversation;

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
          {sortedMessages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No messages yet. Start the conversation!
            </div>
          ) : (
            sortedMessages.map((msg) => (
              <div key={msg.id} className="group message-row message-row-hover">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={msg.sender.avatar || undefined} />
                    <AvatarFallback>
                      {msg.sender.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="message-bubble">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{msg.sender.username}</span>
                        <span className="text-xs opacity-70">
                          {format(new Date(msg.createdAt), 'p')}
                        </span>
                      </div>
                      <p className="text-sm break-words">{msg.content}</p>
                      {msg.files && msg.files.length > 0 && (
                        <div className="space-y-2">
                          {msg.files.map((file, index) => (
                            <div key={index}>{renderFileAttachment(file)}</div>
                          ))}
                        </div>
                      )}
                      {msg.reactions && Object.entries(msg.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(msg.reactions).map(([reaction, userIds]) => (
                            userIds.length > 0 && (
                              <Button
                                key={reaction}
                                variant="secondary"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleReaction(msg.id, reaction)}
                              >
                                {reaction} {userIds.length}
                              </Button>
                            )
                          ))}
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
                              onClick={() => handleReaction(msg.id, reaction)}
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
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <MessageInput conversationId={conversation.conversation.id} />
    </div>
  );
}