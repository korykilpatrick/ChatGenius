import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from "@db/schema";

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/user', {
          credentials: 'include'
        });
        if (!response.ok) {
          if (response.status === 401) {
            return null;
          }
          throw new Error(`${response.status}: ${await response.text()}`);
        }
        return response.json();
      } catch (err) {
        console.error("Failed to fetch user:", err);
        return null;
      }
    },
    retry: false,
    staleTime: 5000
  });

  const login = async (data: { username: string; password: string }) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    queryClient.setQueryData(['user'], result.user);
    return result;
  };

  const register = async (data: { username: string; password: string }) => {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    queryClient.setQueryData(['user'], result.user);
    return result;
  };

  const logout = async () => {
    // Clear cache before making the logout request to prevent UI lag
    queryClient.clear();
    queryClient.setQueryData(['user'], null);

    const response = await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      // If logout fails, attempt to restore the user state
      queryClient.invalidateQueries({ queryKey: ['user'] });
      throw new Error('Logout failed');
    }

    // Force reload all queries after successful logout
    queryClient.resetQueries();
    return true;
  };

  return { user, isLoading, error, login, logout, register };
}