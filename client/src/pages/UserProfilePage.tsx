import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/use-user";

type UserProfile = {
  id: number;
  username: string;
  avatar?: string | null;
  title?: string | null;
  bio?: string | null;
};

export default function UserProfilePage() {
  const [, params] = useRoute("/profile/:id");
  const [, setLocation] = useLocation();
  const { user: currentUser } = useUser();

  // If viewing your own profile, redirect to /profile
  if (currentUser && params?.id && parseInt(params.id) === currentUser.id) {
    setLocation("/profile");
    return null;
  }

  const { data: user, isLoading, error } = useQuery<UserProfile>({
    queryKey: [`/api/users/${params?.id}`],
    enabled: !!params?.id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="border-b h-14 flex items-center px-4 justify-between bg-background">
          <Link href="/" className="text-xl font-bold hover:opacity-80">
            ChatGenius
          </Link>
        </header>
        <div className="flex-1 p-4">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl">User Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center space-y-4">
                <Skeleton className="h-24 w-24 rounded-full" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="border-b h-14 flex items-center px-4 justify-between bg-background">
          <Link href="/" className="text-xl font-bold hover:opacity-80">
            ChatGenius
          </Link>
        </header>
        <div className="flex-1 p-4">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                User not found or error loading profile
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="border-b h-14 flex items-center px-4 justify-between bg-background">
        <Link href="/" className="text-xl font-bold hover:opacity-80">
          ChatGenius
        </Link>
      </header>

      <div className="flex-1 p-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">User Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-col items-center">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.avatar || undefined} />
                <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <h2 className="mt-4 text-2xl font-bold">{user.username}</h2>
              {user.title && <p className="text-muted-foreground">{user.title}</p>}
            </div>

            {user.bio && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Bio</h3>
                <p className="text-muted-foreground">{user.bio}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}