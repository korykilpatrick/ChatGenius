import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChannelList from "@/components/chat/ChannelList";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DirectMessagesList } from "@/components/DirectMessagesList";
import { Separator } from "@/components/ui/separator";
import type { Message } from "@db/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ChatPage() {
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const { user } = useUser();
  const { isConnected } = useWebSocket();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Extract user ID from DM URL if present
  const dmMatch = location.match(/^\/dm\/(\d+)/);
  const selectedUserId = dmMatch ? parseInt(dmMatch[1], 10) : null;

  // Initialize conversation if we're in a DM
  useEffect(() => {
    if (!selectedUserId) return;

    const initializeConversation = async () => {
      try {
        const response = await fetch("/api/dm/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: selectedUserId }),
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error("Failed to create conversation");
        }

        // Invalidate conversations cache to ensure we have the latest data
        queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
      } catch (error) {
        console.error("Error initializing DM conversation:", error);
        toast({
          title: "Error",
          description: "Failed to initialize conversation",
          variant: "destructive",
        });
      }
    };

    initializeConversation();
  }, [selectedUserId, queryClient, toast]);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b h-14 flex items-center px-4 justify-between bg-background">
        <h1 className="text-xl font-bold">ChatGenius</h1>
        <div className="flex items-center gap-4">
          <Link href="/profile" className="flex items-center gap-2 hover:opacity-80">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback>
                {user?.username?.[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{user?.username}</span>
          </Link>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <div className="flex flex-col h-full">
            <ChannelList 
              selectedChannel={selectedUserId ? null : selectedChannel}
              onSelectChannel={(id) => {
                setSelectedChannel(id);
                setSelectedThread(null);
              }}
            />
            <Separator className="my-2" />
            <DirectMessagesList />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={55} minSize={30}>
          {selectedChannel && !selectedUserId && (
            <MessageList
              channelId={selectedChannel}
              onThreadSelect={setSelectedThread}
            />
          )}
          {selectedUserId && (
            <MessageList
              userId={selectedUserId}
              onThreadSelect={setSelectedThread}
            />
          )}
        </ResizablePanel>

        {selectedThread && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={25} minSize={20}>
              <ThreadView 
                message={selectedThread}
                onClose={() => setSelectedThread(null)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}