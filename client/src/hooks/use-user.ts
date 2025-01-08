import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@db/schema";

export function useUser() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/user", {
          credentials: "include",
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
    staleTime: 5000,
  });

  const login = async (data: { username: string; password: string }) => {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    queryClient.setQueryData(["user"], result.user);
    // Invalidate users list to reflect status changes
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    return result;
  };

  const register = async (data: { username: string; password: string }) => {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    queryClient.setQueryData(["user"], result.user);
    return result;
  };

  const logout = async () => {
    try {
      // First, make the logout request
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      // After successful logout:
      // 1. Clear React Query cache
      queryClient.clear();
      queryClient.setQueryData(["user"], null);
      queryClient.resetQueries();

      // 2. Force navigation to login page
      // setLocation('/');
      window.location.href = "/login";

      return true;
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return { user, isLoading, error, login, logout, register };
}
