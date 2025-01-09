import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";

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

export function DirectMessagesList() {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

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

      const data = await response.json();
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

  const otherUsers = users.filter(user => user.id !== currentUser.id);
  const sortedUsers = otherUsers.sort((a, b) => {
    const aHasConversation = conversations.some(
      conv => conv.participant.id === a.id
    );
    const bHasConversation = conversations.some(
      conv => conv.participant.id === b.id
    );

    if (aHasConversation && !bHasConversation) return -1;
    if (!aHasConversation && bHasConversation) return 1;
    return a.username.localeCompare(b.username);
  });

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
      <h2 className="font-semibold text-sidebar-foreground py-2 px-2">Direct Messages</h2>
      <div className="space-y-[2px]">
        {sortedUsers.map((user) => {
          const activeConversation = conversations.find(
            conv => conv.participant.id === user.id
          );

          return (
            <Button
              key={user.id}
              variant="ghost"
              className="w-full justify-start px-2 py-1.5 h-auto hover:bg-accent/50"
              onClick={() => startOrJoinConversation(user.id)}
            >
              <div className="flex items-center gap-2 min-w-0 w-full">
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarImage src={user.avatar || undefined} />
                  <AvatarFallback>
                    {user.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate text-foreground block">
                    {user.username}
                  </span>
                  {activeConversation?.lastMessage && (
                    <span className="text-xs truncate text-muted-foreground block">
                      {activeConversation.lastMessage.content}
                    </span>
                  )}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}