import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import { PaperclipIcon, SendIcon } from "lucide-react";

type MessageInputProps = {
  channelId: number;
  parentId?: number;
};

export default function MessageInput({ channelId, parentId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const { sendMessage } = useWebSocket();
  const { user } = useUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    sendMessage("new_message", {
      content: content.trim(),
      channelId,
      userId: user.id,
      parentId
    });

    setContent("");
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
