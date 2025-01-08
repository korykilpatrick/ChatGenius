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
import { ThemeToggle } from "@/components/ui/theme-toggle";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) return <div className="min-h-screen" />;

  const PageLayout = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-background dark:bg-zinc-900">
      {/* Global Header */}
      <header className="fixed top-0 left-0 right-0 h-14 px-4 flex items-center justify-between bg-background/80 backdrop-blur-sm border-b z-50 transition-all duration-200 dark:bg-zinc-900/80 dark:border-zinc-800">
        <div className="flex-1">
          {user && (
            <a href="/" className="text-xl font-bold hover:opacity-80">
              ChatGenius
            </a>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{user.username}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14">
        {children}
      </main>
    </div>
  );

  return (
    <div className="min-h-screen">
      <Switch>
        <Route path="/login">
          {user ? <Redirect to="/" /> : <PageLayout><AuthPage /></PageLayout>}
        </Route>
        <Route path="/profile">
          {user ? <PageLayout><ProfilePage /></PageLayout> : <Redirect to="/login" />}
        </Route>
        <Route path="/profile/:id">
          {user ? <PageLayout><UserProfilePage /></PageLayout> : <Redirect to="/login" />}
        </Route>
        <Route path="/dm/:id">
          {user ? <PageLayout><DirectMessagePage /></PageLayout> : <Redirect to="/login" />}
        </Route>
        <Route path="/">
          {user ? <PageLayout><ChatPage /></PageLayout> : <Redirect to="/login" />}
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