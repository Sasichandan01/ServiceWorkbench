import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Search, 
  Eye, 
  Edit, 
  MoreHorizontal,
  Shield,
  Ban,
  CheckCircle,
  Loader2
} from "lucide-react";
import { ProtectedButton } from "@/components/ui/protected-button";
import UserProfileDialog from "./UserProfileDialog";
import { useToast } from "@/hooks/use-toast";
import { UserService } from "../../services/userService";

// Update LocalUser type to support multiple roles
// Remove 'role' and add 'roles' as string[]
type LocalUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  lastLogin: string;
  workspaces: number;
  createdAt: string;
};

function formatRelativeTime(timestamp: string): string {
  if (!timestamp || timestamp === 'Unknown') return 'Unknown';
  let isoTimestamp = timestamp;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    isoTimestamp = timestamp.replace(' ', 'T') + 'Z';
  }
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return 'Unknown';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const diffInMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  } else if (diffInMinutes < 1440) {
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else {
    const days = Math.floor(diffInMinutes / 1440);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
}

const AdminUsersTable = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  // Remove selectedUser state and UserProfileDialog rendering
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const searchParams: any = {
        limit: itemsPerPage,
        offset: currentPage,
      };

      if (searchTerm.trim()) {
        searchParams.filter = searchTerm.trim();
      }

      const response = await UserService.getUsers(searchParams);
      
      if (response && response.Users && Array.isArray(response.Users)) {
        const transformedUsers: LocalUser[] = response.Users.map(user => ({
          id: user.UserId,
          name: user.Username,
          email: user.Email,
          roles: Array.isArray(user.Roles) ? user.Roles : (user.Roles ? [user.Roles] : []),
          lastLogin: user.LastLoginTime || "Unknown",
          workspaces: Math.floor(Math.random() * 5) + 1, // Mock data for workspaces if not in API
          createdAt: new Date().toISOString().split('T')[0] // Mock data
        }));
        setUsers(transformedUsers);
        setTotalCount(response.Pagination?.TotalCount || transformedUsers.length);
      } else {
        setUsers([]);
        setTotalCount(0);
      }
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
      setUsers([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentPage, searchTerm]);

  // Remove mockUsers and any code that expects a 'status' property on user objects

  // Update role filter logic to check all roles
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || user.roles.map(r => r.toLowerCase()).includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  // Helper to render up to 3 role badges, then '+N more' if needed
  const getRoleBadges = (roles: string[]) => {
    const colorMap: Record<string, string> = {
      Admin: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
      Editor: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
      Viewer: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    };
    const displayRoles = roles.slice(0, 3);
    const remainingCount = Math.max(0, roles.length - 3);
    return (
      <div className="flex flex-wrap gap-1">
        {displayRoles.map((role, idx) => (
          <Badge key={role + idx} className={colorMap[role] || 'bg-gray-100 text-gray-800 hover:bg-gray-200'}>
            {role}
          </Badge>
        ))}
        {remainingCount > 0 && (
          <Badge variant="outline" className="text-xs">+{remainingCount} more</Badge>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="w-5 h-5" />
          <span>User Management</span>
        </CardTitle>
        <CardDescription>
          Manage user accounts, roles, and permissions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading users...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar>
                          <AvatarFallback className="bg-blue-600 text-white">
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{user.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleBadges(user.roles)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{formatRelativeTime(user.lastLogin)}</TableCell>
                    <TableCell>
                      <UserProfileDialog 
                        userId={user.id}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit user profile">
                            <Edit className="w-4 h-4" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) setCurrentPage(currentPage - 1);
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      href="#"
                      isActive={page === currentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(page);
                      }}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminUsersTable;
