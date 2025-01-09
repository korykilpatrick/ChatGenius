import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import { PaperclipIcon, SendIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

type MessageInputProps = {
  channelId?: number;
  conversationId?: number;
  parentId?: number;
};

type FilePreview = {
  url: string;
  name: string;
  type: string;
  size: number;
};

export default function MessageInput({ channelId, conversationId, parentId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage } = useWebSocket();
  const { user } = useUser();
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    setIsUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setFiles(prev => [...prev, ...data.files]);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && !files.length) || !user) return;

    if (channelId) {
      sendMessage("new_message", {
        content: content.trim(),
        channelId,
        userId: user.id,
        parentId,
        files: files.map(f => f.url)
      });
    } else if (conversationId) {
      sendMessage("new_direct_message", {
        content: content.trim(),
        conversationId,
        senderId: user.id,
        files: files.map(f => f.url)
      });
    }

    setContent("");
    setFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t">
      {files.length > 0 && (
        <ScrollArea className="max-h-32 mb-4">
          <div className="flex flex-wrap gap-2 p-2">
            {files.map((file, index) => (
              <div key={file.url} className="relative group">
                {file.type.startsWith("image/") ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    className="h-20 w-20 object-cover rounded"
                  />
                ) : (
                  <div className="h-20 w-20 flex items-center justify-center bg-muted rounded">
                    <span className="text-xs text-center break-words p-1">
                      {file.name}
                    </span>
                  </div>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6 absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <PaperclipIcon className={`h-5 w-5 ${isUploading ? 'animate-spin' : ''}`} />
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
          disabled={!content.trim() && !files.length}
          size="icon"
          className="flex-shrink-0"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}