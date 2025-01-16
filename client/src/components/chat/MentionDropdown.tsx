import React, { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Command, CommandGroup, CommandItem } from "../ui/command";

interface User {
  id: number;
  username: string;
  avatar: string | null;
}

interface MentionDropdownProps {
  users: User[];
  isOpen: boolean;
  onSelect: (user: User) => void;
  activeIndex: number;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  triggerPosition: { top: number; left: number } | null;
}

export default function MentionDropdown({
  users,
  isOpen,
  onSelect,
  activeIndex,
  inputRef,
  triggerPosition,
}: MentionDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && dropdownRef.current && triggerPosition) {
      const inputRect = inputRef.current?.getBoundingClientRect();
      if (!inputRect) return;

      const { top, left } = triggerPosition;
      dropdownRef.current.style.top = `${top}px`;
      dropdownRef.current.style.left = `${left}px`;
    }
  }, [isOpen, triggerPosition, inputRef]);

  if (!isOpen || !users.length || !triggerPosition) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 w-64 bg-background border rounded-md shadow-lg"
    >
      <Command>
        <CommandGroup>
          {users.map((user, index) => (
            <CommandItem
              key={user.id}
              onSelect={() => onSelect(user)}
              className={`flex items-center gap-2 p-2 cursor-pointer ${
                index === activeIndex ? "bg-accent" : ""
              }`}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={user.avatar || undefined} />
                <AvatarFallback>
                  {user.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{user.username}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </Command>
    </div>
  );
} 