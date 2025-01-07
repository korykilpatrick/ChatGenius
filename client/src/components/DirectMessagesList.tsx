import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { Link, useLocation } from "wouter";

interface User {
  id: number;
  username: string;
  avatar: string | null;
}

interface Conversation {
  id: number;
  createdAt: string;
  lastMessageAt: string;
}

export function DirectMessagesList() {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  const { data: users, isError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: conversations } = useQuery<{ conversation: Conversation }[]>({
    queryKey: ["/api/dm/conversations"],
  });

  const startConversation = async (participantId: number) => {
    try {
      const response = await fetch("/api/dm/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error("Failed to create conversation");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
    } catch (error) {
      console.error("Error creating DM:", error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
    }
  };

  if (isError) {
    console.error("Failed to fetch users");
    return null;
  }

  return (
    <div className="px-3 py-2">
      <h2 className="mb-2 text-lg font-semibold tracking-tight">Direct Messages</h2>
      <ScrollArea className="h-[calc(100vh-15rem)]">
        <div className="space-y-[2px]">
          {users && users.length > 0 && users
            .filter((user) => user.id !== currentUser?.id)
            .map((user) => (
              <Link key={user.id} href={`/dm/${user.id}`} >
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-1.5 h-8 hover:bg-accent/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>
                        {user.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate text-foreground">{user.username}</span>
                  </div>
                </Button>
              </Link>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}