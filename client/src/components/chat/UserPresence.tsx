import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/use-user";
import { LogOut, User } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function UserPresence() {
  const { user, logout } = useUser();
  const [, setLocation] = useLocation();

  if (!user) return null;

  // Use fallback if avatar is null
  const avatarUrl = user.avatar || undefined;

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 p-0 rounded-full">
            <Avatar>
              <AvatarImage src={avatarUrl} />
              <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className="w-56 p-1"
          sideOffset={5}
        >
          <DropdownMenuItem 
            onClick={() => setLocation("/profile")} 
            className="flex items-center cursor-pointer px-2 py-2 text-sm hover:bg-slate-100 rounded-md"
          >
            <User className="mr-2 h-4 w-4" />
            <span>View Profile</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem 
            onClick={() => logout()} 
            className="flex items-center cursor-pointer px-2 py-2 text-sm hover:bg-slate-100 rounded-md text-red-600 hover:text-red-700"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}