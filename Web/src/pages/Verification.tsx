
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Cloud, Clock, Mail } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { confirmSignUp, resendConfirmationCode } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const Verification = () => {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  // Get email and username from location state (passed from signup)
  const email = location.state?.email || "";
  const username = location.state?.username || "";

  // Timer effect
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [timeLeft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter a 6-digit verification code.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignUp(username, code);
      toast({
        title: "Success",
        description: "Email verified successfully! You can now sign in."
      });
      navigate("/login");
    } catch (error: any) {
      console.error("Verification error:", error);
      toast({
        title: "Verification Failed",
        description: error?.data?.message || error?.message || (typeof error === 'string' ? error : 'An error occurred.'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    
    setIsResending(true);
    try {
      await resendConfirmationCode(username);
      toast({
        title: "Code Resent",
        description: "A new verification code has been sent to your email."
      });
      setTimeLeft(60);
      setCanResend(false);
      setCode(""); // Clear the current code
    } catch (error: any) {
      console.error("Resend error:", error);
      toast({
        title: "Error",
        description: error?.data?.message || error?.message || (typeof error === 'string' ? error : 'An error occurred.'),
        variant: "destructive"
      });
    } finally {
      setIsResending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold mb-4">Almost There!</h1>
              <p className="text-xl text-white/90">
                Check your email and enter the verification code to complete your account setup
              </p>
            </div>
            <div className="space-y-4 text-left">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white/90">Secure account verification</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white/90">Email-based confirmation</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white/90">One-time verification code</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Verification Form */}
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
              <CardTitle className="text-2xl">Verify Your Email</CardTitle>
              <CardDescription>
                We've sent a 6-digit code to{" "}
                <span className="font-medium text-gray-900">{email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={(value) => setCode(value)}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  
                  <p className="text-center text-sm text-gray-600">
                    Enter the 6-digit code sent to your email
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700" 
                  disabled={isLoading || code.length !== 6}
                >
                  {isLoading ? "Verifying..." : "Verify Email"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                {!canResend ? (
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>Resend code in {formatTime(timeLeft)}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleResendCode}
                    disabled={isResending}
                    className="text-blue-600 hover:underline font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? "Resending..." : "Resend verification code"}
                  </button>
                )}
              </div>

              <div className="mt-6 text-center text-sm text-gray-600">
                Remember your password?{" "}
                <Link to="/login" className="text-blue-600 hover:underline font-medium">
                  Sign in instead
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center text-xs text-gray-500">
            Didn't receive an email? Check your spam folder or contact support.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Verification;
