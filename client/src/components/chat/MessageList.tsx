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
  autoPlayVoices?: boolean;
  onAutoPlayComplete?: () => void;
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
  autoPlayVoices = false,
  onAutoPlayComplete,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { sendMessage } = useWebSocket();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const [messageQueue, setMessageQueue] = useState<Message[]>([]);
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

  const handlePlayAudio = useCallback(async (message: Message) => {
    if (!audioRef.current) return;

    try {
      if (playingMessageId === message.id) {
        audioRef.current.pause();
        setPlayingMessageId(null);
        return;
      }

      // If we don't have audio data, generate it first
      let audioData = message.audioData || null;
      if (!audioData) {
        console.log('Generating audio for message:', message.id);
        const response = await fetch("/api/voice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: message.content, 
            messageId: message.id,
            userId: message.user.id 
          }),
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error("Failed to generate audio");
        }

        const { audioUrl } = await response.json();
        if (!audioUrl) {
          throw new Error("No audio URL returned");
        }
        console.log('Generated audio URL:', audioUrl);
        audioData = audioUrl;
      }

      if (!audioData) {
        throw new Error("No audio data available");
      }

      console.log('Playing audio for message:', message.id);
      setPlayingMessageId(message.id);
      audioRef.current.src = audioData;
      await audioRef.current.play();

      // Mark message as played
      if (channelId) {
        await fetch(`/api/channels/${channelId}/messages/${message.id}/mark-played`, {
          method: 'POST',
          credentials: 'include',
        });
      } else if (conversationId) {
        await fetch(`/api/dm/conversations/${conversationId}/messages/${message.id}/mark-played`, {
          method: 'POST',
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setPlayingMessageId(null);
      toast({
        title: "Error",
        description: "Failed to play audio message",
        variant: "destructive",
      });
    }
  }, [playingMessageId, channelId, conversationId, toast]);

  // Handle auto-play queue
  useEffect(() => {
    console.log('Auto-play effect triggered:', { 
      autoPlayVoices, 
      hasMessages: messages.length > 0,
      messageCount: messages.length 
    });

    if (autoPlayVoices && messages.length > 0) {
      console.log('Setting up auto-play queue');
      const unplayedMessages = messages.filter(msg => {
        // Only handle channel messages (not DMs)
        if (!('channelId' in msg)) {
          console.log('Skipping DM message:', msg.id);
          return false;
        }

        // Only handle messages that have the isAudioPlayed field
        if (!('isAudioPlayed' in msg)) {
          console.log('Message missing isAudioPlayed field:', msg.id);
          return false;
        }

        // Explicitly check if isAudioPlayed is false (not just falsy)
        const isUnplayed = msg.isAudioPlayed === false;
        const isRecent = msg.createdAt ? 
          new Date(msg.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000) : 
          false;
        
        console.log('Checking message:', { 
          id: msg.id, 
          content: msg.content,
          isAudioPlayed: msg.isAudioPlayed,
          createdAt: msg.createdAt,
          isUnplayed: isUnplayed,
          isRecent: isRecent,
          willInclude: isUnplayed && isRecent
        });

        return isUnplayed && isRecent;
      }) as Message[]; // Cast to Message[] since we've filtered to only channel messages
      
      console.log('Found unplayed messages:', unplayedMessages.length);
      if (unplayedMessages.length > 0) {
        console.log('Setting message queue:', unplayedMessages);
        setMessageQueue(unplayedMessages);
      } else {
        console.log('No unplayed messages found');
        onAutoPlayComplete?.();
      }
    } else {
      console.log('Clearing message queue because:', { autoPlayVoices, messageCount: messages.length });
      setMessageQueue([]);
    }
  }, [autoPlayVoices, messages, onAutoPlayComplete]);

  // Play next message in queue
  useEffect(() => {
    console.log('Queue effect triggered:', { 
      queueLength: messageQueue.length, 
      playingMessageId 
    });

    const playNextMessage = async () => {
      if (messageQueue.length > 0 && !playingMessageId) {
        console.log('Playing next message from queue, remaining:', messageQueue.length);
        const nextMessage = messageQueue[0];
        console.log('Next message to play:', { 
          id: nextMessage.id, 
          content: nextMessage.content 
        });
        await handlePlayAudio(nextMessage);
        setMessageQueue(prev => prev.slice(1));
      } else if (messageQueue.length === 0 && !playingMessageId && autoPlayVoices) {
        console.log('Auto-play queue complete');
        onAutoPlayComplete?.();
      }
    };

    playNextMessage();
  }, [messageQueue, playingMessageId, handlePlayAudio, onAutoPlayComplete, autoPlayVoices]);

  const handleReaction = (messageId: number, reaction: string) => {
    if (!user) return;
    sendMessage("message_reaction", {
      messageId,
      reaction,
      userId: user.id,
      isDM,
    });
  };

  const renderFileAttachment = (fileUrl: string) => {
    const filePath = fileUrl.startsWith("/") ? fileUrl : `/uploads/${fileUrl}`;
    const isImage = filePath.match(/\.(jpg|jpeg|png|gif)$/i);
    const fileName = fileUrl.split("/").pop() || fileUrl;

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
          {fileName}
        </a>
      </div>
    );
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

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
                            {(message.files as string[]).map((file: string, index: number) => (
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
                        onClick={() => handlePlayAudio(message as Message)}
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