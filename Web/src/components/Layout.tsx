
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
  Home, 
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
import { signOut } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getUserInfo, getInitials, UserInfo } from "@/lib/tokenUtils";

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Get user info from stored tokens
    const info = getUserInfo();
    setUserInfo(info);
  }, []);

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Workspaces", href: "/workspaces", icon: Cloud },
    { name: "Data Sources", href: "/data-sources", icon: Database },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        await signOut(accessToken);
      } else {
        // If no token, just clear localStorage and redirect
        localStorage.clear();
      }
      
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out."
      });
      
      navigate("/login");
    } catch (error: any) {
      console.error("Logout error:", error);
      toast({
        title: "Logout Error",
        description: "There was an issue logging out, but you've been signed out locally.",
        variant: "destructive"
      });
      // Still navigate to login even if logout API fails
      navigate("/login");
    }
  };

  const handleSwitchRole = () => {
    console.log("Switching role...");
    // Add switch role logic here
  };

  const NavLink = ({ item }: { item: typeof navigation[0] }) => {
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

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-16'} bg-white border-r transition-all duration-300 flex flex-col`}>
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
        <div className="flex-1 flex flex-col">
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
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="w-full">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Dashboard
                      </Link>
                    </DropdownMenuItem>
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
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Layout;
