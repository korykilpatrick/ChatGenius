import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Smile, Download, Volume2, Pause } from "lucide-react";
import { format } from "date-fns";
import type { Message, DirectMessageWithSender } from "@db/schema";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

type MessageListProps = {
  channelId?: number;
  conversationId?: number;
  onThreadSelect: (message: Message) => void;
  onUserAvatarClick?: (userId: number) => void;
};

type MessageType = Message | DirectMessageWithSender;

// Add types for files and reactions
type FileAttachment = {
  url: string;
  name: string;
  type: string;
  size: number;
};

type MessageReactions = Record<string, number[]>;

const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🤔", "👀", "🙌", "🔥"];

export default function MessageList({
  channelId,
  conversationId,
  onThreadSelect,
  onUserAvatarClick,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { sendMessage } = useWebSocket();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
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

  const renderFileAttachment = (file: FileAttachment) => {
    const filePath = file.url.startsWith("/") ? file.url : `/uploads/${file.url}`;
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
          {file.name}
        </a>
      </div>
    );
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const handlePlayAudio = async (message: MessageType) => {
    try {
      if (playingMessageId === message.id) {
        // If this message is currently playing, pause it
        if (audioRef.current) {
          audioRef.current.pause();
          setPlayingMessageId(null);
        }
        return;
      }

      // If we already have audio data, play it directly
      if (message.audioData) {
        if (audioRef.current) {
          audioRef.current.src = message.audioData;
          await audioRef.current.play();
          setPlayingMessageId(message.id);
          return;
        }
      }

      // Otherwise, generate new audio
      const response = await fetch("/api/voice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.content, messageId: message.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate audio");
      }

      const { audioUrl } = await response.json();
      
      // Play the audio
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
        setPlayingMessageId(message.id);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      toast({
        title: "Error",
        description: "Failed to play audio message",
        variant: "destructive",
      });
      setPlayingMessageId(null);
    }
  };

  // Handle audio ending
  useEffect(() => {
    if (audioRef.current) {
      const handleEnded = () => {
        setPlayingMessageId(null);
      };
      
      audioRef.current.addEventListener("ended", handleEnded);
      
      return () => {
        audioRef.current?.removeEventListener("ended", handleEnded);
      };
    }
  }, []);

  return (
    <>
      <audio ref={audioRef} className="hidden" />
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

              const isPlaying = playingMessageId === message.id;
              const reactions = message.reactions as MessageReactions;

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
                            {(message.files as FileAttachment[]).map((file, index) => (
                              <div key={index}>{renderFileAttachment(file)}</div>
                            ))}
                          </div>
                        )}
                        {reactions && Object.entries(reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(reactions).map(
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handlePlayAudio(message)}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
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
    </>
  );
}