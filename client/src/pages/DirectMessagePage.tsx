// DirectMessagePage.tsx
import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import MessageInput from "@/components/chat/MessageInput";
import MessageList from "@/components/chat/MessageList";
import ThreadView from "@/components/chat/ThreadView";
import type { DirectMessageWithSender } from "@db/schema";

interface DirectMessageProps {
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
}

export default function DirectMessagePage() {
  const [, params] = useRoute("/dm/:id");
  const { user: currentUser } = useUser();
  const { subscribe } = useWebSocket();
  const queryClient = useQueryClient();

  const otherUserId = params?.id ? parseInt(params.id) : null;

  // Track which message is opened in the thread sidebar
  const [selectedMessage, setSelectedMessage] =
    useState<DirectMessageWithSender | null>(null);

  // Also track viewing another user's profile
  const [selectedUserProfile, setSelectedUserProfile] = useState<any>(null);

  const closeUserProfile = () => setSelectedUserProfile(null);

  // Fetch or create the conversation with the other user
  const { data: conversation } = useQuery<DirectMessageProps>({
    queryKey: [`/api/dm/conversations/${otherUserId}`],
    enabled: !!otherUserId && !!currentUser,
  });

  // Function to fetch and open another user's profile
  const handleUserAvatarClick = async (userId: number) => {
    if (!userId || userId === currentUser?.id) return;
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

  /**
   * Handle real-time updates:
   */
  useEffect(() => {
    if (!conversation) return;

    const conversationId = conversation.conversation.id;

    const unsubscribe = subscribe((wsMessage) => {
      if (wsMessage.type === "message_created") {
        const { message, user } = wsMessage.payload || {};
        if (message?.conversationId === conversationId) {
          // 1) Merge the new message into our local messages list
          queryClient.setQueryData(
            [`/api/dm/conversations/${conversationId}/messages`],
            (oldData: DirectMessageWithSender[] = []) => {
              const exists = oldData.some((m) => m.id === message.id);
              if (!exists) {
                return [...oldData, { ...message, sender: user, replies: [] }];
              }
              return oldData;
            }
          );
          // 2) Invalidate the DM conversation list
          queryClient.invalidateQueries(["/api/dm/conversations"]);
        }
      }
      // For DM reactions
      else if (wsMessage.type === "message_reaction_updated") {
        const { messageId, reactions, conversationId: cId } = wsMessage.payload;
        if (cId && cId === conversationId) {
          // Update the local message's reactions
          queryClient.setQueryData(
            [`/api/dm/conversations/${cId}/messages`],
            (oldData: DirectMessageWithSender[] = []) =>
              oldData.map((m) =>
                m.id === messageId ? { ...m, reactions } : m
              )
          );
        }
      }
    });

    return () => unsubscribe();
  }, [conversation, subscribe, queryClient, currentUser]);

  if (!currentUser || !otherUserId || !conversation) {
    return null;
  }

  const { participant } = conversation;

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b h-14 flex-shrink-0 flex items-center px-4 justify-between bg-background">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarImage src={participant.avatar || undefined} />
            <AvatarFallback>
              {participant.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold">{participant.username}</span>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Chat
        </Link>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Main DM view */}
        <div
          className={`flex-1 flex flex-col ${
            selectedMessage ? "border-r" : ""
          }`}
        >
          <MessageList
            conversationId={conversation.conversation.id}
            onThreadSelect={(message) =>
              setSelectedMessage(message as DirectMessageWithSender)
            }
            onUserAvatarClick={handleUserAvatarClick}
          />
          <MessageInput conversationId={conversation.conversation.id} />
        </div>

        {/* Thread sidebar */}
        {selectedMessage && (
          <div className="w-[400px]">
            <ThreadView
              message={selectedMessage}
              onClose={() => setSelectedMessage(null)}
            />
          </div>
        )}

        {/* Optional user profile sidebar */}
        {selectedUserProfile && (
          <div className="w-[400px] border-l p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">User Profile</h2>
              <button
                type="button"
                className="p-2 hover:bg-muted rounded-md"
                onClick={closeUserProfile}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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
                <p className="text-muted-foreground">{selectedUserProfile.title}</p>
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
        )}
      </div>
    </div>
  );
}
