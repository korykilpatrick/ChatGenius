import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import MessageInput from "./MessageInput";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import type { Message } from "@db/schema";

type ThreadViewProps = {
  message: Message;
  onClose: () => void;
};

export default function ThreadView({ message, onClose }: ThreadViewProps) {
  const { data: replies = [] } = useQuery<Message[]>({
    queryKey: [`/api/channels/${message.channelId}/messages/${message.id}/replies`],
  });

  return (
    <div className="h-full flex flex-col border-l">
      <div className="h-14 border-b flex items-center justify-between px-4">
        <h3 className="font-semibold">Thread</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Avatar>
              <AvatarImage src={message.user.avatar || undefined} />
              <AvatarFallback>
                {message.user.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{message.user.username}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.createdAt), 'p')}
                </span>
              </div>
              <p className="mt-1">{message.content}</p>
            </div>
          </div>

          {replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-3 ml-8">
              <Avatar>
                <AvatarImage src={reply.user.avatar || undefined} />
                <AvatarFallback>
                  {reply.user.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{reply.user.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(reply.createdAt), 'p')}
                  </span>
                </div>
                <p className="mt-1">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <MessageInput channelId={message.channelId} parentId={message.id} />
    </div>
  );
}