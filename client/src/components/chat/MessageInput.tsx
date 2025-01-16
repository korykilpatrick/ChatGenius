import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUser } from "@/hooks/use-user";
import { PaperclipIcon, SendIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import MentionDropdown from "./MentionDropdown";

interface User {
  id: number;
  username: string;
  avatar: string | null;
}

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

export default function MessageInput({
  channelId,
  conversationId,
  parentId,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [isMentioning, setIsMentioning] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<User[]>([]);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useWebSocket();
  const { user } = useUser();
  const { toast } = useToast();

  const searchUsers = useCallback(async (query: string) => {
    try {
      const response = await fetch(`/api/users/_search?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to search users');
      }
      const users = await response.json();
      setMentionUsers(users);
    } catch (error) {
      console.error("Error searching users:", error);
      toast({
        title: "Error searching users",
        description: error instanceof Error ? error.message : "Failed to search users",
        variant: "destructive",
      });
      setMentionUsers([]);
    }
  }, [toast]);

  const handleMentionSelect = (selectedUser: User) => {
    const beforeMention = content.slice(0, content.lastIndexOf("@"));
    const afterMention = content.slice(content.lastIndexOf("@") + mentionQuery.length + 1);
    const newContent = `${beforeMention}@${selectedUser.username} ${afterMention}`;
    setContent(newContent);
    setIsMentioning(false);
    setMentionQuery("");
    setMentionUsers([]);
    setTriggerPosition(null);
    setActiveMentionIndex(0);
    
    // Set cursor position after the inserted mention
    const newCursorPosition = beforeMention.length + selectedUser.username.length + 2; // +2 for @ and space
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    const lastAtIndex = newContent.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const textAfterAt = newContent.slice(lastAtIndex + 1);
      const spaceAfterAt = textAfterAt.indexOf(" ");
      const query = spaceAfterAt === -1 ? textAfterAt : textAfterAt.slice(0, spaceAfterAt);

      if (query !== mentionQuery) {
        setMentionQuery(query);
        if (query) {
          searchUsers(query);
        }
      }

      if (!isMentioning) {
        const textarea = textareaRef.current;
        if (textarea) {
          const { selectionEnd } = textarea;
          const textBeforeCaret = newContent.slice(0, selectionEnd);
          const lines = textBeforeCaret.split("\n");
          const currentLineIndex = lines.length - 1;
          const currentLine = lines[currentLineIndex];
          
          const rect = textarea.getBoundingClientRect();
          const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
          const top = rect.top + (currentLineIndex * lineHeight) + lineHeight;
          
          // Approximate the left position based on character width
          const charWidth = 8; // Approximate character width in pixels
          const charsInCurrentLine = currentLine.length;
          const left = rect.left + (charsInCurrentLine * charWidth);

          setTriggerPosition({ top, left });
        }
        setIsMentioning(true);
        setActiveMentionIndex(0);
      }
    } else {
      setIsMentioning(false);
      setMentionQuery("");
      setTriggerPosition(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMentioning && mentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveMentionIndex((prev) => (prev + 1) % mentionUsers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveMentionIndex((prev) => (prev - 1 + mentionUsers.length) % mentionUsers.length);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleMentionSelect(mentionUsers[activeMentionIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsMentioning(false);
        setMentionQuery("");
        setTriggerPosition(null);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    setIsUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => {
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
      setFiles((prev) => [...prev, ...data.files]);
    } catch (error) {
      toast({
        title: "Upload failed",
        description:
          error instanceof Error ? error.message : "Failed to upload files",
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
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!content.trim() && !files.length)) return;
    
    if (channelId) {
      sendMessage("new_message", {
        content: content.trim() || " ",
        channelId,
        userId: user.id,
        parentId,
        files: files.map((f) => f.url),
      });
    } else if (conversationId) {
      sendMessage("new_direct_message", {
        content: content.trim() || " ",
        conversationId,
        senderId: user.id,
        parentId,
        files: files.map((f) => f.url),
      });
    }

    setContent("");
    setFiles([]);
    setIsMentioning(false);
    setMentionQuery("");
    setTriggerPosition(null);
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
      <div className="flex items-end gap-2 relative">
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
          <PaperclipIcon
            className={`h-5 w-5 ${isUploading ? "animate-spin" : ""}`}
          />
        </Button>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... Use @ to mention users"
          className="min-h-[80px]"
        />
        <Button
          type="submit"
          disabled={!user || (!content.trim() && !files.length)}
          size="icon"
          className="flex-shrink-0"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
        <MentionDropdown
          users={mentionUsers}
          isOpen={isMentioning}
          onSelect={handleMentionSelect}
          activeIndex={activeMentionIndex}
          inputRef={textareaRef}
          triggerPosition={triggerPosition}
        />
      </div>
    </form>
  );
}
