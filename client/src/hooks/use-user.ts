
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InsertUser } from "@db/schema";

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/user');
        if (!response.ok) {
          return null;
        }
        return response.json();
      } catch (err) {
        return null;
      }
    },
    retry: false,
    staleTime: 5000
  });

  const login = async (data: InsertUser) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const register = async (data: InsertUser) => {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch('/api/logout', {
      method: 'POST',
    });
    if (response.ok) {
      queryClient.setQueryData(['user'], null);
    }
    return response.ok;
  };

  return { user, isLoading, error, login, logout, register };
}
