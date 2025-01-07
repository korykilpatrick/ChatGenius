import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUser } from "@/hooks/use-user";

type Conversation = {
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
};

export function DirectMessagesList() {
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useUser();

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/dm/conversations"],
  });

  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    enabled: isNewDmOpen,
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

      setIsNewDmOpen(false);
      toast({
        title: "Success",
        description: "Direct message conversation created",
      });
    } catch (error) {
      console.error("Error creating DM:", error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-sm font-semibold">Direct Messages</h2>
          <Button variant="ghost" size="icon" disabled>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2 px-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-2">
        <h2 className="text-sm font-semibold">Direct Messages</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsNewDmOpen(true)}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-[200px]">
        <div className="space-y-1">
          {conversations?.map(({ conversation, participant, lastMessage }) => (
            <Button
              key={conversation.id}
              variant="ghost"
              className="w-full justify-start px-2"
              asChild
            >
              <a href={`/dm/${conversation.id}`}>
                <Avatar className="h-8 w-8 mr-2">
                  <AvatarImage src={participant.avatar || undefined} />
                  <AvatarFallback>
                    {participant.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm truncate">{participant.username}</p>
                  {lastMessage && (
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMessage.content}
                    </p>
                  )}
                </div>
              </a>
            </Button>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={isNewDmOpen} onOpenChange={setIsNewDmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Direct Message</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-1">
              {users
                ?.filter((user) => user.id !== currentUser?.id)
                .map((user) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => startConversation(user.id)}
                  >
                    <Avatar className="h-8 w-8 mr-2">
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>
                        {user.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{user.username}</span>
                  </Button>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
