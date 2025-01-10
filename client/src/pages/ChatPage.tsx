import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ChannelList from "@/components/chat/ChannelList";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import ThreadView from "@/components/chat/ThreadView";
import UserPresence from "@/components/chat/UserPresence";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DirectMessagesList } from "@/components/DirectMessagesList";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message } from "@db/schema";
import { useQueryClient } from "@tanstack/react-query";

/**
 * We’ll highlight channels with new messages
 * by storing their IDs in an `unreadChannels` set.
 */
export default function ChatPage() {
  const [selectedChannel, setSelectedChannel] = useState<number | null>(1);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const { user } = useUser();
  const { isConnected, subscribe } = useWebSocket();
  const [location] = useLocation();
  const queryClient = useQueryClient();

  /**
   * If you also want "unread" for DMs, you can create a separate unreadDMs set 
   * or unify them in one map. For now, let's just do it for channels.
   */
  const [unreadChannels, setUnreadChannels] = useState<Set<number>>(new Set());

  // Identify if we’re in a DM route
  const dmMatch = location.match(/^\/dm\/(\d+)/);
  const selectedUserId = dmMatch ? parseInt(dmMatch[1], 10) : null;

  // Helper to select a channel and clear its “unread” highlight
  const handleSelectChannel = (channelId: number) => {
    setSelectedChannel(channelId);
    setSelectedThread(null);
    setUnreadChannels((prev) => {
      const copy = new Set(prev);
      copy.delete(channelId);
      return copy;
    });
  };

  /**
   * GLOBAL SUBSCRIPTION FOR ANY "message_created" EVENT
   *
   * 1) If it’s a channel message AND we are NOT viewing that channel, 
   *    - Invalidate queries so next time we open that channel, we get full history 
   *    - Add to `unreadChannels` to highlight it in the channel list
   *
   * 2) If it’s a channel message AND we ARE viewing that channel,
   *    - We can do a partial merge or also do an invalidate if you want 
   *      simpler logic. Shown below is partial merge, but you could do the same
   *      "invalidateQueries" approach if you like.
   *
   * 3) If it’s a DM message, similarly you can highlight and/or invalidate
   *    the DM query if you’re not currently viewing that DM.
   */
  useEffect(() => {
    const unsubscribe = subscribe((wsMessage) => {
      if (wsMessage.type === "message_created") {
        const { message, user } = wsMessage.payload || {};
        const channelId = message?.channelId;
        const conversationId = message?.conversationId;

        // If it's a channel message
        if (channelId) {
          // Check if we’re currently viewing this channel
          const isViewingThisChannel = channelId === selectedChannel && !selectedUserId;
          if (!isViewingThisChannel) {
            // Mark channel as unread
            setUnreadChannels((prev) => {
              const copy = new Set(prev);
              copy.add(channelId);
              return copy;
            });

            // Also invalidate so next time we open that channel,
            // we re-fetch and see the entire updated history.
            queryClient.invalidateQueries([`/api/channels/${channelId}/messages`]);
            return; // Done
          }

          // If we ARE viewing that channel, let's do a partial merge 
          // so the new message is appended without re-fetching:
          queryClient.setQueryData(
            [`/api/channels/${channelId}/messages`],
            (oldData: Message[] = []) => {
              const exists = oldData.some((m) => m.id === message.id);
              if (!exists) {
                return [...oldData, { ...message, user, replies: [] }];
              }
              return oldData;
            }
          );
        }

        // If it’s a DM message
        if (conversationId) {
          // Similar approach for unread DM highlight if you want,
          // plus invalidation or partial merge:
          const isViewingThisDM = selectedUserId === conversationId;
          if (!isViewingThisDM) {
            // No direct code here for DM highlight in this snippet,
            // but you’d do e.g. setUnreadDMs(...) if you had that state
            queryClient.invalidateQueries([
              `/api/dm/conversations/${conversationId}/messages`,
            ]);
            return;
          }

          // If we are viewing that DM, partial merge:
          queryClient.setQueryData(
            [`/api/dm/conversations/${conversationId}/messages`],
            (oldData: Message[] = []) => {
              const exists = oldData.some((m) => m.id === message.id);
              if (!exists) {
                return [...oldData, { ...message, user, replies: [] }];
              }
              return oldData;
            }
          );
        }
      }
    });

    return () => unsubscribe();
  }, [subscribe, queryClient, selectedChannel, selectedUserId]);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b h-14 flex-shrink-0 flex items-center px-4 justify-between bg-background">
        <h1 className="text-xl font-bold">ChatGenius</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <UserPresence />
            <span className="text-sm font-medium">{user?.username}</span>
          </div>
          <ThemeToggle />
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <div className="h-full">
            <ScrollArea className="h-full">
              <div className="space-y-2">
                <ChannelList 
                  selectedChannel={selectedUserId ? null : selectedChannel}
                  // Pass the unreadChannels set so ChannelList can highlight
                  unreadChannels={unreadChannels}
                  onSelectChannel={handleSelectChannel}
                />
                <Separator className="mx-2" />
                <DirectMessagesList />
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={55} minSize={30}>
          <div className="h-full flex flex-col min-h-0">
            {/* If we have a selected channel, show channel messages */}
            {selectedChannel && !selectedUserId && (
              <>
                <MessageList
                  channelId={selectedChannel}
                  onThreadSelect={setSelectedThread}
                />
                <MessageInput channelId={selectedChannel} />
              </>
            )}
            {/* If we have a selectedUserId from the /dm/:id route, show DM messages */}
            {selectedUserId && (
              <>
                <MessageList
                  conversationId={selectedUserId}
                  onThreadSelect={setSelectedThread}
                />
                <MessageInput conversationId={selectedUserId} />
              </>
            )}
          </div>
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
