
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Cloud, Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { signUp, signIn, signInWithGoogle } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const GoogleIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" className="mr-2">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>;

// Add prop type
interface LoginProps {
  isSignupDefault?: boolean;
}

// Accept prop
const Login = ({ isSignupDefault = false }: LoginProps) => {
  const [isLogin, setIsLogin] = useState(!isSignupDefault);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Note: Authentication check is now handled by AuthProvider
  // No need to check here as it causes UserUnAuthenticatedException errors

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.target as HTMLFormElement);

    try {
      if (isLogin) {
        // Handle sign in
        const signInData = {
          emailOrUsername: formData.get("emailOrUsername") as string,
          password: formData.get("password") as string,
        };
        const result = await signIn(signInData);
        console.log("Sign in successful:", result);
        
        toast({
          title: "Success",
          description: "Signed in successfully!",
        });

        // Determine user role from idToken
        const idToken = localStorage.getItem('idToken');
        let userRole = 'Default';
        if (idToken) {
          try {
            const payload = idToken.split('.')[1];
            const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            const parsedPayload = JSON.parse(decodedPayload);
            userRole = parsedPayload['custom:Role'] || parsedPayload['custom:role'] || 'Default';
          } catch (e) {}
        }
        if (userRole === 'ITAdmin') {
          window.location.href = "/admin";
        } else {
          window.location.href = "/workspaces";
        }
      } else {
        // Handle sign up
        const signUpData = {
          username: formData.get("username") as string,
          fullName: formData.get("fullName") as string,
          email: formData.get("email") as string,
          password: formData.get("password") as string,
        };
        const result = await signUp(signUpData);
        console.log("Sign up successful:", result);
        toast({
          title: "Success",
          description: "Account created successfully! Please check your email for verification.",
        });

        // Navigate to verification page with email and username
        navigate("/verification", {
          state: {
            email: signUpData.email,
            username: signUpData.username,
          },
        });
      }
    } catch (error: any) {
      console.error("Authentication error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-purple-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <img
          src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80"
          alt="Workspace"
          className="object-cover w-full h-full"
        />
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center text-white max-w-md">
            <div className="mb-6">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Cloud className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold mb-4">Service Workbench</h1>
              <p className="text-xl text-white/90">
                Accelerate your research with secure, compliant cloud workspaces
              </p>
            </div>
            <div className="space-y-4 text-left">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white/90">Secure cloud environments</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white/90">Cost optimization</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white/90">Collaborative workflows</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="text-center mb-8 lg:hidden">
            <Link to="/" className="inline-flex items-center space-x-2">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">Service Workbench</span>
            </Link>
          </div>

          <Card className="border-none shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                {isLogin ? "Welcome Back" : "Create Account"}
              </CardTitle>
              <CardDescription>
                {isLogin ? "Sign in to access your workbench" : "Get started with Service Workbench"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" name="username" placeholder="Enter your username" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input id="fullName" name="fullName" placeholder="Enter your full name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" placeholder="Enter your email" required />
                    </div>
                  </>
                )}

                {isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="emailOrUsername">Username</Label>
                    <Input id="emailOrUsername" name="emailOrUsername" placeholder="Enter your email or username" required />
                  </div>
                )}

                <div className="space-y-2 relative">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 focus:outline-none"
                    style={{ background: "none", border: "none", padding: 0 }}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {!isLogin && (
                  <div className="space-y-2 relative">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      name="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your password"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 focus:outline-none"
                      style={{ background: "none", border: "none", padding: 0 }}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                )}

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                  {isLoading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
                </Button>
              </form>

              <div className="my-6">
                <Separator />
                <div className="text-center text-sm text-gray-500 -mt-3 bg-white px-3">
                  or continue with
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full mb-4"
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                  } catch (error: any) {
                    console.error('Google sign in error:', error);
                    toast({
                      title: "Error",
                      description: error.message || "Failed to sign in with Google",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <GoogleIcon />
                Sign in with Google
              </Button>

              <div className="text-center text-sm text-gray-600">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center text-xs text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
