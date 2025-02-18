import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Hash, ChevronRight, ChevronDown, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Channel } from "@db/schema";

const channelSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200).optional(),
  isPrivate: z.boolean().default(false),
});

type ChannelFormData = z.infer<typeof channelSchema>;

type ChannelListProps = {
  selectedChannel: number | null;
  // A set of channel IDs that have unread messages
  unreadChannels?: Set<number>;
  onSelectChannel: (channelId: number) => void;
  onVoiceClick?: (channelId: number) => void;
};

export default function ChannelList({
  selectedChannel,
  unreadChannels = new Set(),
  onSelectChannel,
  onVoiceClick,
}: ChannelListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  // Listen for newly created channels from WebSocket
  useEffect(() => {
    const handleWebSocketMessage = (message: any) => {
      if (message.type === "channel_created") {
        queryClient.setQueryData<Channel[]>(["/api/channels"], (oldData = []) => {
          const newChannel = message.payload;
          const exists = oldData.some((c) => c.id === newChannel.id);
          return exists ? oldData : [...oldData, newChannel];
        });
      }
    };

    const unsubscribe = subscribe(handleWebSocketMessage);
    return () => unsubscribe();
  }, [subscribe, queryClient]);

  const form = useForm<ChannelFormData>({
    resolver: zodResolver(channelSchema),
    defaultValues: {
      name: "",
      description: "",
      isPrivate: false,
    },
  });

  const createChannel = async (data: ChannelFormData) => {
    const response = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    setIsDialogOpen(false);
    form.reset();
  };

  return (
    <div className="px-2">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <h2 className="font-semibold text-sidebar-foreground flex-1 px-2">
            Channels
          </h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground h-6 w-6">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(createChannel)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="general" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="What's this channel about?" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full">
                    Create Channel
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
        <CollapsibleContent className="space-y-[2px]">
          {channels.map((channel) => {
            const isSelected = selectedChannel === channel.id;
            const isUnread = unreadChannels.has(channel.id) && !isSelected;

            return (
              <div key={channel.id} className="group relative">
                <Button
                  variant={isSelected ? "secondary" : "ghost"}
                  onClick={() => onSelectChannel(channel.id)}
                  className={`
                    w-full justify-start px-2 py-1.5 h-auto text-sm
                    ${isUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"}
                  `}
                >
                  <Hash className="h-4 w-4 mr-2" />
                  {channel.name}
                </Button>
                {onVoiceClick && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVoiceClick(channel.id);
                    }}
                  >
                    <Volume2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
