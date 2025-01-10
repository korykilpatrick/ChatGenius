// use-user.ts
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
    queryKey: ["/api/user"],
    queryFn: async () => {
      const response = await fetch("/api/user", {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) return null;
        throw new Error(`${response.status}: ${await response.text()}`);
      }
      return response.json();
    },
    retry: false,
    staleTime: 5000,
  });

  const login = async (data: { username: string; password: string }) => {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    queryClient.setQueryData(["/api/user"], result.user);
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    return result;
  };

  const register = async (data: { username: string; password: string }) => {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    queryClient.setQueryData(["/api/user"], result.user);
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    return result;
  };

  const logout = async () => {
    const userId = user?.id;
    const response = await fetch("/api/logout", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) throw new Error("Logout failed");

    queryClient.clear();
    queryClient.setQueryData(["/api/user"], null);
    queryClient.resetQueries();
    window.location.href = "/login";
    return true;
  };

  return { user, isLoading, error, login, register, logout };
}
