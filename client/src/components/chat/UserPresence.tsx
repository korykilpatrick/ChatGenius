
import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { LogOut, User } from "lucide-react";
import { useLocation } from "wouter";

export default function UserPresence() {
  const { user, logout } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  if (!user) return null;

  const avatarUrl = user.avatar || undefined;
  const initials = user.username[0].toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-8 rounded-full overflow-hidden hover:opacity-90 focus:outline-none"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={user.username} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-primary flex items-center justify-center text-primary-foreground">
            {initials}
          </div>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
          <div className="py-1" role="menu">
            <button
              onClick={() => {
                setLocation("/profile");
                setIsOpen(false);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <User className="mr-2 h-4 w-4" />
              <span>View Profile</span>
            </button>
            <button
              onClick={() => {
                logout();
                setIsOpen(false);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
