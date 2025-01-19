import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/hooks/use-user";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const authSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const { login, register } = useUser();

  const form = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: AuthFormData) => {
    try {
      if (isLogin) {
        await login(data);
      } else {
        await register(data);
      }
    } catch (error) {
      console.error("Auth error:", error);
      form.setError("root", {
        message:
          error instanceof Error ? error.message : "Authentication failed",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative">
      <div className="absolute inset-0 bg-[#0A192F]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A192F] via-[#162844] to-[#0A192F] opacity-90" />
        <div className="absolute inset-0" style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px'
        }} />
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-4 z-10">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md mx-4 bg-white/95 dark:bg-[#1A2942]/95 border-0 shadow-2xl backdrop-blur-sm z-10">
        <CardHeader className="space-y-4">
          <div className="flex justify-center mb-4">
            <img
              src="data:image/png;base64,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"
              alt="Waystar Royco"
              className="h-12 object-contain"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <Label className="text-[#0A192F] dark:text-gray-200">Username</Label>
                    <FormControl>
                      <Input 
                        placeholder="Enter username" 
                        {...field}
                        className="border-gray-300 dark:border-gray-600 focus:border-[#0A192F] dark:focus:border-blue-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <Label className="text-[#0A192F] dark:text-gray-200">Password</Label>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter password"
                        {...field}
                        className="border-gray-300 dark:border-gray-600 focus:border-[#0A192F] dark:focus:border-blue-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full bg-[#0A192F] hover:bg-[#162844] dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {isLogin ? "Sign In" : "Create Account"}
              </Button>

              {form.formState.errors.root && (
                <p className="text-red-500 text-sm text-center mt-2">
                  {form.formState.errors.root.message}
                </p>
              )}

              <p className="text-center text-sm text-[#4A5568] dark:text-gray-400">
                {isLogin
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[#0A192F] dark:text-blue-400 hover:underline font-medium"
                >
                  {isLogin ? "Register" : "Sign In"}
                </button>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}