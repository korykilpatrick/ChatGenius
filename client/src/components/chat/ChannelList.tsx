import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Channel } from "@db/schema";

const channelSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200).optional(),
  isPrivate: z.boolean().default(false),
});

type ChannelFormData = z.infer<typeof channelSchema>;

type ChannelListProps = {
  selectedChannel: number | null;
  onSelectChannel: (channelId: number) => void;
};

export default function ChannelList({ selectedChannel, onSelectChannel }: ChannelListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['/api/channels'],
  });

  useEffect(() => {
    const handleWebSocketMessage = (message: any) => {
      if (message.type === "channel_created") {
        queryClient.setQueryData<Channel[]>(['/api/channels'], (oldData = []) => {
          const newChannel = message.payload;
          const exists = oldData.some(channel => channel.id === newChannel.id);
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
    const response = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    setIsDialogOpen(false);
    form.reset();
  };

  return (
    <div className="h-full flex flex-col p-4 bg-sidebar">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sidebar-foreground">Channels</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground">
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
                <Button type="submit" className="w-full">Create Channel</Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1">
          {channels.map((channel) => (
            <Button
              key={channel.id}
              variant={selectedChannel === channel.id ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => onSelectChannel(channel.id)}
            >
              <Hash className="h-4 w-4 mr-2" />
              {channel.name}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}