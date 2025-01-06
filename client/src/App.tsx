
import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import ChatPage from "./pages/ChatPage";
import AuthPage from "./pages/AuthPage";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) return <div className="min-h-screen bg-blue-100" />;

  return (
    <div className="min-h-screen">
      <Switch>
        <Route path="/login">
          {user ? <Redirect to="/" /> : <AuthPage />}
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
