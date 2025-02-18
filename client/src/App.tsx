import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import ChatPage from "./pages/ChatPage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import UserProfilePage from "./pages/UserProfilePage";
import DirectMessagePage from "./pages/DirectMessagePage";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) return <div className="min-h-screen" />;

  return (
    <div className="min-h-screen bg-background dark:bg-zinc-900">
      <Switch>
        <Route path="/login">
          {user ? <Redirect to="/" /> : <AuthPage />}
        </Route>
        <Route path="/profile">
          {user ? <ProfilePage /> : <Redirect to="/login" />}
        </Route>
        <Route path="/profile/:id">
          {user ? <UserProfilePage /> : <Redirect to="/login" />}
        </Route>
        <Route path="/dm/:id">
          {user ? <DirectMessagePage /> : <Redirect to="/login" />}
        </Route>
        <Route path="/">
          {user ? <ChatPage /> : <Redirect to="/login" />}
        </Route>
      </Switch>
    </div>
  );
}

export default function AppWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  );
}