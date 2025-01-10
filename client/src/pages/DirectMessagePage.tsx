// DirectMessagePage.tsx
import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import MessageInput from "@/components/chat/MessageInput";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import type { DirectMessageWithSender } from "@db/schema";

interface DirectMessageProps {
  conversation: {
    id: number;
    createdAt: string;
    lastMessageAt: string;
  };
  participant: {
    id: number;
    username: string;
    avatar: string | null;
  };
}

export default function DirectMessagePage() {
  const [, params] = useRoute("/dm/:id");
  const { user: currentUser } = useUser();
  const { subscribe } = useWebSocket();
  const queryClient = useQueryClient();

  const otherUserId = params?.id ? parseInt(params.id) : null;

  // Track which message is opened in the thread sidebar
  const [selectedMessage, setSelectedMessage] =
    useState<DirectMessageWithSender | null>(null);

  // Fetch or create the conversation with the other user
  const { data: conversation } = useQuery<DirectMessageProps>({
    queryKey: [`/api/dm/conversations/${otherUserId}`],
    enabled: !!otherUserId && !!currentUser,
  });

  /**
   * Handle real-time updates:
   * Whenever the server sends a "message_created" event,
   * if it belongs to our current conversationId, merge it
   * into the existing React Query cache so that it shows
   * up immediately without a refresh.
   */
  useEffect(() => {
    if (!conversation) return;

    const conversationId = conversation.conversation.id;

    const unsubscribe = subscribe((wsMessage) => {
      if (wsMessage.type === "message_created") {
        const { message, user } = wsMessage.payload || {};
        if (message?.conversationId === conversationId) {
          queryClient.setQueryData(
            [`/api/dm/conversations/${conversationId}/messages`],
            (oldData: DirectMessageWithSender[] = []) => {
              // Only add if it isn't already in the list
              const exists = oldData.some((m) => m.id === message.id);
              if (!exists) {
                return [...oldData, { ...message, sender: user, replies: [] }];
              }
              return oldData;
            }
          );
        }
      }
    });

    return () => unsubscribe();
  }, [conversation, subscribe, queryClient]);

  if (!currentUser || !otherUserId || !conversation) {
    return null;
  }

  const { participant } = conversation;

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b h-14 flex-shrink-0 flex items-center px-4 justify-between bg-background">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={participant.avatar || undefined} />
            <AvatarFallback>
              {participant.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold">{participant.username}</span>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to Chat
        </Link>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 flex flex-col ${selectedMessage ? "border-r" : ""}`}>
          <MessageList
            conversationId={conversation.conversation.id}
            onThreadSelect={(message) =>
              setSelectedMessage(message as DirectMessageWithSender)
            }
          />
          <MessageInput conversationId={conversation.conversation.id} />
        </div>

        {selectedMessage && (
          <div className="w-[400px]">
            <ThreadView
              message={selectedMessage}
              onClose={() => setSelectedMessage(null)}
            />
          </div>
        )}
      </div>
    </div>
  )};