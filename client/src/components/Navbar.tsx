import { Link } from "wouter";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { User, MessageSquare, LogOut } from "lucide-react";

export function Navbar() {
  const { user, logout } = useUser();

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2.5">
      <div className="flex flex-wrap justify-between items-center">
        <div className="flex items-center">
          <Link href="/">
            <a className="flex items-center">
              <MessageSquare className="h-6 w-6 mr-2" />
              <span className="text-xl font-semibold">ChatGenius</span>
            </a>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/profile">
            <a className="flex items-center gap-2 text-gray-700 hover:text-gray-900">
              <User className="h-5 w-5" />
              <span>Profile</span>
            </a>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="flex items-center gap-2"
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
