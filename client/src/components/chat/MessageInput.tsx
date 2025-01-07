import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import { PaperclipIcon, SendIcon } from "lucide-react";

type MessageInputProps = {
  channelId?: number;
  userId?: number;
  parentId?: number;
};

export default function MessageInput({ channelId, userId, parentId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const { sendMessage } = useWebSocket();
  const { user } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    try {
      if (channelId) {
        // Channel message
        sendMessage("new_message", {
          content: content.trim(),
          channelId,
          userId: user.id,
          parentId
        });
      } else if (userId) {
        // DM message
        const response = await fetch(`/api/dm/conversations/${userId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content.trim() }),
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }
      }

      setContent("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t">
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
        >
          <PaperclipIcon className="h-5 w-5" />
        </Button>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="min-h-[80px]"
        />
        <Button
          type="submit"
          disabled={!content.trim()}
          size="icon"
          className="flex-shrink-0"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}