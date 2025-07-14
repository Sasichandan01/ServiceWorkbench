
import { useState, useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  DollarSign, 
  Database, 
  Cloud, 
  User, 
  Cog, 
  Search,
  Bell,
  LogOut,
  RefreshCw,
  Shield
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { signOut, clearAllAuthData } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getUserInfo, getInitials, UserInfo } from "@/lib/tokenUtils";
import { ProtectedContent } from "@/components/ui/protected-content";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { setAuth } from "@/store/slices/authSlice";
import { clearPermissions } from "@/store/slices/permissionsSlice";

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canView } = usePermissions();
  const { loading: authLoading } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Get user info from stored tokens
    const info = getUserInfo();
    setUserInfo(info);
  }, []);

  const navigation = [
    { name: "Workspaces", href: "/workspaces", icon: Cloud, resource: "workspaces" },
    { name: "Data Sources", href: "/data-sources", icon: Database, resource: "datasources" },
    { name: "Cost Dashboard", href: "/dashboard", icon: DollarSign, resource: null },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      
      // Clear Redux state first
      dispatch(setAuth({ user: null, isAuthenticated: false }));
      dispatch(clearPermissions());
      
      if (accessToken) {
        await signOut(accessToken);
      } else {
        // If no token, just clear all auth data
        clearAllAuthData();
      }
      
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out."
      });
      
      navigate("/login");
    } catch (error: any) {
      console.error("Logout error:", error);
      
      // Ensure cleanup happens even if API fails
      clearAllAuthData();
      dispatch(setAuth({ user: null, isAuthenticated: false }));
      dispatch(clearPermissions());
      
      toast({
        title: "Logged Out", 
        description: "You have been signed out locally.",
      });
      
      navigate("/login");
    }
  };

  const handleSwitchRole = () => {
    console.log("Switching role...");
    // Add switch role logic here
  };

  // Check if user has any permissions
  const hasAnyPermission = () => {
    return navigation.some(item => !item.resource || canView(item.resource));
  };

  const NavLink = ({ item }: { item: typeof navigation[0] }) => {
    // Check if user has permission to view this resource
    if (item.resource && !canView(item.resource)) {
      return null;
    }

    const linkContent = (
      <Link
        to={item.href}
        className={`flex items-center ${sidebarOpen ? 'space-x-3 px-3' : 'justify-center px-2'} py-3 rounded-lg transition-colors ${
          isActive(item.href)
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <item.icon className={`${sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'}`} />
        {sidebarOpen && <span className="whitespace-nowrap">{item.name}</span>}
      </Link>
    );

    if (!sidebarOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{item.name}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white border-r transition-all duration-300 flex flex-col fixed left-0 top-0 h-full z-10`}>
          {/* Logo */}
          <div className="px-4 py-4 border-b h-[73px] flex items-center justify-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              {sidebarOpen && (
                <div>
                  <span className="text-lg font-bold text-gray-900">Workbench</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {navigation.map((item) => (
                <li key={item.name}>
                  <NavLink item={item} />
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Main Content */}
        <div className={`flex-1 flex flex-col ${sidebarOpen ? 'ml-64' : 'ml-16'} transition-all duration-300`}>
          {/* Header */}
          <header className="bg-white border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-2 hover:bg-gray-100"
                >
                  <div className="flex flex-col space-y-1.5">
                    <div className="w-5 h-0.5 bg-gray-700 rounded-full"></div>
                    <div className="w-5 h-0.5 bg-gray-700 rounded-full"></div>
                    <div className="w-5 h-0.5 bg-gray-700 rounded-full"></div>
                  </div>
                </Button>
              </div>

              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm">
                  <Bell className="w-4 h-4" />
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Avatar className="cursor-pointer">
                      <AvatarFallback className="bg-blue-600 text-white font-medium">
                        {userInfo?.name ? getInitials(userInfo.name) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {userInfo?.name || 'User'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {userInfo?.email || ''}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="w-full">
                        <User className="w-4 h-4 mr-2" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <ProtectedContent resource="users" action="manage" hideIfNoAccess>
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="w-full">
                          <Shield className="w-4 h-4 mr-2" />
                          Admin Dashboard
                        </Link>
                      </DropdownMenuItem>
                    </ProtectedContent>
                    <DropdownMenuItem onClick={handleSwitchRole}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Switch Role
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-6">
            {!hasAnyPermission() && location.pathname !== '/welcome' ? (
              <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="w-full max-w-md">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Shield className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome!</h1>
                    <p className="text-gray-600">Your account is being set up</p>
                  </div>
                  
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
                    <div className="flex items-center justify-center space-x-2 mb-2">
                      <Shield className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium text-yellow-800">Waiting for Access</span>
                    </div>
                    <p className="text-sm text-yellow-700 text-center">
                      Please wait for an administrator to assign you a role with the necessary permissions.
                    </p>
                  </div>
                  
                  <div className="text-sm text-gray-500 text-center">
                    <p className="mb-3">Once your role is assigned, you'll have access to:</p>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                        <span>Workspaces management</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                        <span>Data sources</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                        <span>Cost analytics</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Layout;
