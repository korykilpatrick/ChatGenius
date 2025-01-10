import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface User {
  id: number;
  username: string;
  avatar: string | null;
  status?: string;
  lastSeen?: string;
}

interface Conversation {
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
  lastMessage?: {
    content: string;
    createdAt: string;
  };
}

type DirectMessagesListProps = {
  /**
   * A set of conversationIds that have unread messages,
   * so we can highlight them.
   */
  unreadDMConversations: Set<number>;
};

export function DirectMessagesList({ unreadDMConversations }: DirectMessagesListProps) {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/dm/conversations"],
    enabled: !!currentUser,
  });

  const startOrJoinConversation = async (participantId: number) => {
    try {
      const response = await fetch(`/api/dm/conversations/${participantId}`, {
        method: "GET",
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error("Failed to get/create conversation");
      }

      await response.json(); // not strictly needed, we just need the conversation to exist
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
      setLocation(`/dm/${participantId}`);
    } catch (error) {
      console.error("Error with conversation:", error);
      toast({
        title: "Error",
        description: "Failed to start conversation",
        variant: "destructive",
      });
    }
  };

  if (!currentUser) return null;

  const otherUsers = users.filter((u) => u.id !== currentUser.id);

  // Sort so that users with existing convos appear first, then by username
  const sortedUsers = otherUsers.sort((a, b) => {
    const aHasConvo = conversations.some((c) => c.participant.id === a.id);
    const bHasConvo = conversations.some((c) => c.participant.id === b.id);

    if (aHasConvo && !bHasConvo) return -1;
    if (!aHasConvo && bHasConvo) return 1;
    return a.username.localeCompare(b.username);
  });

  // For highlighting "selected" DM in the list
  const dmMatch = location.match(/^\/dm\/(\d+)/);
  const currentDMId = dmMatch ? parseInt(dmMatch[1], 10) : null;

  if (sortedUsers.length === 0) {
    return (
      <div className="px-4 py-2">
        <h2 className="text-lg font-semibold tracking-tight">Direct Messages</h2>
        <p className="text-sm text-muted-foreground">No other users available</p>
      </div>
    );
  }

  return (
    <div className="px-2">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <h2 className="font-semibold text-sidebar-foreground flex-1 px-2">
            Direct Messages
          </h2>
        </div>
        <CollapsibleContent className="space-y-[2px]">
          {sortedUsers.map((thisUser) => {
            const activeConversation = conversations.find(
              (conv) => conv.participant.id === thisUser.id
            );
            const conversationId = activeConversation?.conversation.id;
            const isUnread = conversationId
              ? unreadDMConversations.has(conversationId)
              : false;

            // If the user is in /dm/<id> that matches thisUser.id => selected
            const isSelected = currentDMId === thisUser.id;

            return (
              <Button
                key={thisUser.id}
                variant={isSelected ? "secondary" : "ghost"}
                className={`
                  w-full px-2 py-1.5 h-auto flex items-center
                  justify-between
                  ${!isSelected ? "hover:bg-accent/50" : ""}
                `}
                onClick={() => startOrJoinConversation(thisUser.id)}
              >
                {/* Left side: Avatar + Full username (never truncate) */}
                <div className="flex items-center gap-2 flex-none">
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarImage src={thisUser.avatar || undefined} />
                    <AvatarFallback>
                      {thisUser.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`
                      whitespace-nowrap
                      ${isUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"}
                    `}
                  >
                    {thisUser.username}
                    {isUnread && " •"}
                  </span>
                </div>
                {/* Right side: message preview (truncated) */}
                <div className="flex-1 text-right ml-2 text-xs text-muted-foreground truncate">
                  {activeConversation?.lastMessage?.content || ""}
                </div>
              </Button>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
