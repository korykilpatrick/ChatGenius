// ChatPage.tsx
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
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
import type { Message, PublicUser } from "@db/schema";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function ChatPage() {
  const [selectedChannel, setSelectedChannel] = useState<number | null>(1);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const { user } = useUser();
  const { isConnected, subscribe } = useWebSocket();
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const [unreadChannels, setUnreadChannels] = useState<Set<number>>(new Set());
  const [unreadDMConversations, setUnreadDMConversations] = useState<Set<number>>(
    new Set()
  );

  const dmMatch = location.match(/^\/dm\/(\d+)/);
  const selectedUserId = dmMatch ? parseInt(dmMatch[1], 10) : null;

  const handleSelectChannel = (channelId: number) => {
    setSelectedChannel(channelId);
    setSelectedThread(null);
    setUnreadChannels((prev) => {
      const copy = new Set(prev);
      copy.delete(channelId);
      return copy;
    });
  };

  useEffect(() => {
    if (selectedUserId) {
      setUnreadDMConversations((prev) => {
        const copy = new Set(prev);
        copy.delete(selectedUserId);
        return copy;
      });
    }
  }, [selectedUserId]);

  useEffect(() => {
    const unsubscribe = subscribe((wsMessage) => {
      if (wsMessage.type === "message_created") {
        const { message, user } = wsMessage.payload || {};
        const channelId = message?.channelId;
        const conversationId = message?.conversationId;
        const parentId = message?.parentId || null;

        // For channel messages:
        if (channelId) {
          const isViewingThisChannel =
            channelId === selectedChannel && !selectedUserId;

          if (!isViewingThisChannel) {
            setUnreadChannels((prev) => {
              const copy = new Set(prev);
              copy.add(channelId);
              return copy;
            });
            queryClient.invalidateQueries([`/api/channels/${channelId}/messages`]);
            return;
          }

          // If no parentId, we push a brand-new message
          if (!parentId) {
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
          } else {
            // If parentId exists, increment that parent’s replies
            queryClient.setQueryData(
              [`/api/channels/${channelId}/messages`],
              (oldData: Message[] = []) =>
                oldData.map((m) =>
                  m.id === parentId
                    ? {
                        ...m,
                        replies: [...(m.replies ?? []), { ...message, user }],
                      }
                    : m
                )
            );
          }
        }

        // For DM messages:
        if (conversationId) {
          const isViewingThisDM = selectedUserId === conversationId;
          if (!isViewingThisDM) {
            setUnreadDMConversations((prev) => {
              const copy = new Set(prev);
              copy.add(conversationId);
              return copy;
            });
            queryClient.invalidateQueries([
              `/api/dm/conversations/${conversationId}/messages`,
            ]);
            return;
          }

          if (!parentId) {
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
          } else {
            queryClient.setQueryData(
              [`/api/dm/conversations/${conversationId}/messages`],
              (oldData: Message[] = []) =>
                oldData.map((m) =>
                  m.id === parentId
                    ? {
                        ...m,
                        replies: [...(m.replies ?? []), { ...message, user }],
                      }
                    : m
                )
            );
          }
        }
      } else if (wsMessage.type === "message_reaction_updated") {
        const { messageId, reactions, channelId, conversationId } =
          wsMessage.payload;

        if (channelId) {
          queryClient.setQueryData(
            [`/api/channels/${channelId}/messages`],
            (oldData: Message[] = []) =>
              oldData.map((m) => (m.id === messageId ? { ...m, reactions } : m))
          );
        } else if (conversationId) {
          queryClient.setQueryData(
            [`/api/dm/conversations/${conversationId}/messages`],
            (oldData: Message[] = []) =>
              oldData.map((m) => (m.id === messageId ? { ...m, reactions } : m))
          );
        }
      }
    });

    return () => unsubscribe();
  }, [
    subscribe,
    queryClient,
    selectedChannel,
    selectedUserId,
    setUnreadChannels,
    setUnreadDMConversations,
  ]);

  const [selectedUserProfile, setSelectedUserProfile] = useState<PublicUser | null>(
    null
  );

  const handleUserAvatarClick = async (userId: number) => {
    if (!userId || userId === user?.id) return;
    try {
      const response = await fetch(`/api/users/${userId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load user profile");
      const fetchedUser = await response.json();
      setSelectedUserProfile(fetchedUser);
    } catch (err) {
      console.error(err);
    }
  };

  const closeUserProfile = () => setSelectedUserProfile(null);

  const { data: allChannels = [] } = useQuery({
    queryKey: ["/api/channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch channels");
      return res.json() as Promise<Message[]>;
    },
  });

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b h-14 flex-shrink-0 flex items-center px-4 justify-between bg-background">
        <h1 className="text-xl font-bold">Waystar Royco</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <UserPresence />
            <span className="text-sm font-medium">{user?.username}</span>
          </div>
          <ThemeToggle />
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <div className="h-full">
            <ScrollArea className="h-full">
              <div className="space-y-2">
                <ChannelList
                  selectedChannel={selectedUserId ? null : selectedChannel}
                  unreadChannels={unreadChannels}
                  onSelectChannel={handleSelectChannel}
                  channels={allChannels}
                />
                <Separator className="mx-2" />
                <DirectMessagesList unreadDMConversations={unreadDMConversations} />
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={55} minSize={30}>
          <div className="h-full flex flex-col min-h-0">
            {selectedChannel && !selectedUserId && (
              <>
                <MessageList
                  channelId={selectedChannel}
                  onThreadSelect={setSelectedThread}
                  onUserAvatarClick={handleUserAvatarClick}
                />
                <MessageInput channelId={selectedChannel} />
              </>
            )}
            {selectedUserId && (
              <>
                <MessageList
                  conversationId={selectedUserId}
                  onThreadSelect={setSelectedThread}
                  onUserAvatarClick={handleUserAvatarClick}
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

        {selectedUserProfile && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={25} minSize={20}>
              <div className="h-full border-l p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">User Profile</h2>
                  <Button variant="ghost" size="icon" onClick={closeUserProfile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedUserProfile.avatar || undefined} />
                    <AvatarFallback>
                      {selectedUserProfile.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="text-xl font-bold">
                    {selectedUserProfile.username}
                  </h3>
                  {selectedUserProfile.title && (
                    <p className="text-muted-foreground">
                      {selectedUserProfile.title}
                    </p>
                  )}
                </div>
                {selectedUserProfile.bio && (
                  <div>
                    <h4 className="font-semibold mb-1">Bio</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedUserProfile.bio}
                    </p>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}