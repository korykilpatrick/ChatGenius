import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChannelList from "@/components/chat/ChannelList";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import type { Message } from "@db/schema";

export default function ChatPage() {
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const { user } = useUser();
  const { isConnected } = useWebSocket();

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b h-14 flex items-center px-4 justify-between bg-background">
        <h1 className="text-xl font-bold">ChatGenius</h1>
        <div className="flex items-center gap-4">
          <UserPresence />
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <ChannelList 
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
          />
        </ResizablePanel>
        
        <ResizableHandle />
        
        <ResizablePanel defaultSize={55} minSize={30}>
          {selectedChannel && (
            <MessageList
              channelId={selectedChannel}
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
