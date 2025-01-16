import { useState, useRef, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { Link } from "wouter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useQueryClient } from "@tanstack/react-query";

const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  title: z.string().max(100, "Title must be less than 100 characters").optional(),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  aiResponseEnabled: z.boolean(),
  avatarUrl: z.string().url("Please enter a valid URL").optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [useUrlAvatar, setUseUrlAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username || "",
      title: user?.title || "",
      bio: user?.bio || "",
      aiResponseEnabled: Boolean(user?.aiResponseEnabled),
      avatarUrl: user?.avatar || "",
    },
  });

  // Reset form when user data changes
  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username,
        title: user.title || "",
        bio: user.bio || "",
        aiResponseEnabled: Boolean(user.aiResponseEnabled),
        avatarUrl: user.avatar || "",
      });
    }
  }, [user, form]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });

      setIsEditing(false);
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Update error:", error);
      form.setError("root", {
        message: error instanceof Error ? error.message : "Update failed",
      });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const response = await fetch("/api/user/avatar", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload avatar");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Success",
        description: "Avatar updated successfully",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-zinc-900">
      <header className="border-b h-14 flex items-center px-4 justify-between bg-background/80 backdrop-blur-sm dark:bg-zinc-900/80 dark:border-zinc-800">
        <Link href="/" className="text-xl font-bold hover:opacity-80">
          ChatGenius
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{user?.username}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 p-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Profile Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-col items-center space-y-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>

              <div className="flex items-center space-x-2">
                <Label htmlFor="useUrlAvatar">Use URL for avatar</Label>
                <Switch
                  id="useUrlAvatar"
                  checked={useUrlAvatar}
                  onCheckedChange={setUseUrlAvatar}
                />
              </div>

              {useUrlAvatar ? (
                <FormField
                  control={form.control}
                  name="avatarUrl"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormControl>
                        <Input
                          placeholder="Enter avatar URL"
                          {...field}
                          onChange={async (e) => {
                            field.onChange(e);
                            if (e.target.value) {
                              try {
                                const response = await fetch("/api/user/avatar-url", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  credentials: "include",
                                  body: JSON.stringify({ avatarUrl: e.target.value }),
                                });
                                
                                if (response.ok) {
                                  await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                                  toast({
                                    title: "Success",
                                    description: "Avatar updated successfully",
                                  });
                                } else {
                                  toast({
                                    title: "Error",
                                    description: "Failed to update avatar",
                                    variant: "destructive",
                                  });
                                }
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to update avatar",
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {isUploading ? "Uploading..." : "Upload Avatar"}
                  </Button>
                </div>
              )}
            </div>

            {isEditing ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Username</Label>
                        <FormControl>
                          <Input placeholder="Enter username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Title</Label>
                        <FormControl>
                          <Input placeholder="e.g. Senior Developer" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Bio</Label>
                        <FormControl>
                          <Textarea
                            placeholder="Tell us about yourself..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="aiResponseEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <Label className="text-base">AI Response</Label>
                          <FormDescription>
                            Enable AI responses when you are mentioned in channels
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2">
                    <Button type="submit">Save</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>

                  {form.formState.errors.root && (
                    <p className="text-red-500 text-sm">
                      {form.formState.errors.root.message}
                    </p>
                  )}
                </form>
              </Form>
            ) : (
              <div className="space-y-6">
                <div>
                  <Label>Username</Label>
                  <p className="mt-1 text-lg">{user?.username}</p>
                </div>

                <div>
                  <Label>Title</Label>
                  <p className="mt-1 text-lg text-muted-foreground">
                    {user?.title || "No title set"}
                  </p>
                </div>

                <div>
                  <Label>Bio</Label>
                  <p className="mt-1 text-muted-foreground">
                    {user?.bio || "No bio set"}
                  </p>
                </div>

                <div>
                  <Label>AI Response</Label>
                  <p className="mt-1 text-muted-foreground">
                    {Boolean(user?.aiResponseEnabled) ? "Enabled" : "Disabled"}
                  </p>
                </div>

                <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}