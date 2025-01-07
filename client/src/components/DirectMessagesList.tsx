import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

export function DirectMessagesList() {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
  });

  const startConversation = async (participantId: number) => {
    try {
      const response = await fetch("/api/dm/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId }),
      });

      if (!response.ok) {
        throw new Error("Failed to create conversation");
      }

      const conversation = await response.json();
      // Invalidate conversations cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });

      // Navigate to the new conversation
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

  return (
    <div>
      <div className="px-2 mb-2">
        <h2 className="text-sm font-semibold">Direct Messages</h2>
      </div>

      <ScrollArea className="h-[200px]">
        <div className="space-y-0.5">
          {users
            ?.filter((user) => user.id !== currentUser?.id)
            .map((user) => (
              <Button
                key={user.id}
                variant="ghost"
                className="w-full justify-start px-2 h-7"
                onClick={() => startConversation(user.id)}
              >
                <Avatar className="h-5 w-5 mr-2">
                  <AvatarImage src={user.avatar || undefined} />
                  <AvatarFallback>
                    {user.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm truncate">{user.username}</span>
              </Button>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}