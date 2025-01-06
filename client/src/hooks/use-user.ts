import { useQuery } from '@tanstack/react-query';

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
    // No-op functions for development
    login: async () => ({ ok: true }),
    logout: async () => ({ ok: true }),
    register: async () => ({ ok: true })
  };
}