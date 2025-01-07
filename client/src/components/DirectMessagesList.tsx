import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface User {
  id: number;
  username: string;
  avatar: string | null;
}

export function DirectMessagesList() {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();

  const { data: users, isError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  console.log("DirectMessagesList - users:", users); // Debug log

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

      const conversation = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
      window.location.href = `/dm/${conversation.id}`;
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
              <Button
                key={user.id}
                variant="ghost"
                className="w-full justify-start px-2 py-1.5 h-8 hover:bg-accent/50"
                onClick={() => startConversation(user.id)}
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
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}