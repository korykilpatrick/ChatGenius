
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";

type UserProfile = {
  id: number;
  username: string;
  avatar?: string;
  title?: string;
  bio?: string;
};

export default function UserProfilePage() {
  const [, params] = useRoute("/profile/:id");
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`/api/users/${params?.id}`);
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      }
    };

    if (params?.id) {
      fetchUser();
    }
  }, [params?.id]);

  if (!user) return null;

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
                <AvatarImage src={user.avatar} />
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
