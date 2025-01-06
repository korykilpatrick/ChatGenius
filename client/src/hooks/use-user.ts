import { useQuery } from '@tanstack/react-query';
import type { InsertUser } from "@db/schema";

// Development user for prototyping
const devUser = {
  id: 1,
  username: "dev_user"
};

// Simplified hook for development
export function useUser() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => devUser,
    staleTime: Infinity,
  });

  return {
    user,
    isLoading: false,
    error: null,
    // No-op functions for development that accept arguments but don't use them
    login: async (_data: InsertUser) => ({ ok: true }),
    logout: async () => ({ ok: true }),
    register: async (_data: InsertUser) => ({ ok: true })
  };
}