import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  // Fetch all users except current user
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }
      return res.json();
    },
  });

  // Fetch existing conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/dm/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/dm/conversations", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch conversations");
      }
      return res.json();
    },
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

  // Filter out current user from the users list
  const otherUsers = users.filter(user => user.id !== currentUser.id);

  // Sort users: active conversations first, then by username
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
      <div className="px-3 py-2">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">Direct Messages</h2>
        <p className="text-sm text-muted-foreground">No other users available</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <h2 className="mb-2 text-lg font-semibold tracking-tight">Direct Messages</h2>
      <ScrollArea className="h-[calc(100vh-15rem)]">
        <div className="space-y-[2px]">
          {sortedUsers.map((user) => {
            const activeConversation = conversations.find(
              conv => conv.participant.id === user.id
            );

            return (
              <div key={user.id}>
                <Button
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
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}