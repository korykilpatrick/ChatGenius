import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import MessageInput from "@/components/chat/MessageInput";
import MessageList from "@/components/chat/MessageList";

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
  const queryClient = useQueryClient();
  const otherUserId = params?.id ? parseInt(params.id) : null;

  const { data: conversation } = useQuery<DirectMessageProps>({
    queryKey: [`/api/dm/conversations/${otherUserId}`],
    enabled: !!otherUserId && !!currentUser,
  });

  if (!currentUser || !otherUserId || !conversation) return null;

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
          <span className="font-semibold">
            {participant.username}
          </span>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to Chat
        </Link>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <MessageList conversationId={conversation.conversation.id} onThreadSelect={() => {}} />
        <MessageInput conversationId={conversation.conversation.id} />
      </div>
    </div>
  );
}