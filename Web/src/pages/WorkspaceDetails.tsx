import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import WorkspaceSettings from "@/components/WorkspaceSettings";
import WorkspaceBreadcrumb from "@/components/WorkspaceBreadcrumb";
import { 
  Users, 
  Plus, 
  Database,
  FolderOpen,
  DollarSign,
  Calendar,
  Mail,
  UserPlus,
  Search,
  Settings,
  Trash2,
  Power,
  Wand2
} from "lucide-react";
import { WorkspaceService, type Workspace as ApiWorkspace } from "../services/workspaceService";

interface Solution {
  id: number;
  name: string;
  status: string;
  lastModified: string;
  type: string;
}

interface WorkspaceUser {
  id: number;
  name: string;
  email: string;
  role: string;
  joinedDate: string;
}

interface WorkspaceData {
  id: number;
  name: string;
  description: string;
  status: string;
  owner: string;
  created: string;
  members: number;
  solutions: number;
  dataSources: number;
  monthlyCost: number;
}

const WorkspaceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("viewer");
  const [isCreateSolutionDialogOpen, setIsCreateSolutionDialogOpen] = useState(false);
  const [newSolutionName, setNewSolutionName] = useState("");
  const [newSolutionDescription, setNewSolutionDescription] = useState("");

  // Search and pagination states
  const [solutionsSearch, setSolutionsSearch] = useState("");
  const [usersSearch, setUsersSearch] = useState("");
  const [solutionsPage, setSolutionsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const itemsPerPage = 5;

  // Workspace state management
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string>("Active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkspace = async () => {
      setLoading(true);
      try {
        if (id) {
          const data = await WorkspaceService.getWorkspace(id);
          setWorkspace(data);
          setWorkspaceStatus(data.WorkspaceStatus);
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch workspace details.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    fetchWorkspace();
  }, [id]);

  // Mock data - in a real app, this would come from an API with server-side pagination
  const [allSolutions, setAllSolutions] = useState<Solution[]>([
    { id: 1, name: "Customer Segmentation", status: "Active", lastModified: "2 hours ago", type: "ML Model" },
    { id: 2, name: "Sales Dashboard", status: "Active", lastModified: "1 day ago", type: "Dashboard" },
    { id: 3, name: "Churn Prediction", status: "Development", lastModified: "3 hours ago", type: "ML Model" },
    { id: 4, name: "Revenue Analytics", status: "Active", lastModified: "5 hours ago", type: "Dashboard" },
    { id: 5, name: "Product Recommendation", status: "Development", lastModified: "1 day ago", type: "ML Model" },
    { id: 6, name: "Inventory Management", status: "Active", lastModified: "2 days ago", type: "Dashboard" },
    { id: 7, name: "Fraud Detection", status: "Active", lastModified: "3 days ago", type: "ML Model" },
    { id: 8, name: "Marketing Campaign", status: "Development", lastModified: "4 days ago", type: "Dashboard" },
  ]);

  const [allUsers, setAllUsers] = useState<WorkspaceUser[]>([
    { id: 1, name: "Sarah Chen", email: "sarah.chen@company.com", role: "Admin", joinedDate: "2024-01-15" },
    { id: 2, name: "Mike Johnson", email: "mike.johnson@company.com", role: "Editor", joinedDate: "2024-01-20" },
    { id: 3, name: "Anna Smith", email: "anna.smith@company.com", role: "Viewer", joinedDate: "2024-02-01" },
    { id: 4, name: "David Wilson", email: "david.wilson@company.com", role: "Editor", joinedDate: "2024-02-05" },
    { id: 5, name: "Emma Davis", email: "emma.davis@company.com", role: "Viewer", joinedDate: "2024-02-10" },
    { id: 6, name: "James Brown", email: "james.brown@company.com", role: "Editor", joinedDate: "2024-02-15" },
    { id: 7, name: "Lisa Taylor", email: "lisa.taylor@company.com", role: "Viewer", joinedDate: "2024-02-20" },
    { id: 8, name: "Robert Garcia", email: "robert.garcia@company.com", role: "Editor", joinedDate: "2024-02-25" },
  ]);

  // Filter and paginate solutions
  const filteredSolutions = allSolutions.filter(solution =>
    solution.name.toLowerCase().includes(solutionsSearch.toLowerCase()) ||
    solution.type.toLowerCase().includes(solutionsSearch.toLowerCase())
  );
  const totalSolutionsPages = Math.ceil(filteredSolutions.length / itemsPerPage);
  const paginatedSolutions = filteredSolutions.slice(
    (solutionsPage - 1) * itemsPerPage,
    solutionsPage * itemsPerPage
  );

  // Filter and paginate users
  const filteredUsers = allUsers.filter(user =>
    user.name.toLowerCase().includes(usersSearch.toLowerCase()) ||
    user.email.toLowerCase().includes(usersSearch.toLowerCase()) ||
    user.role.toLowerCase().includes(usersSearch.toLowerCase())
  );
  const totalUsersPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (usersPage - 1) * itemsPerPage,
    usersPage * itemsPerPage
  );

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Active": return "bg-green-100 text-green-800 border-green-200";
      case "Development": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Inactive": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "Admin": return "bg-red-100 text-red-800 border-red-200";
      case "Editor": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Viewer": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const handleAddUser = () => {
    if (!newUserEmail.trim()) {
      toast({
        title: "Error",
        description: "Email is required.",
        variant: "destructive",
      });
      return;
    }

    // Add new user to the list
    const newUser: WorkspaceUser = {
      id: allUsers.length + 1,
      name: newUserEmail.split('@')[0], // Simple name extraction
      email: newUserEmail,
      role: newUserRole.charAt(0).toUpperCase() + newUserRole.slice(1),
      joinedDate: new Date().toISOString().split('T')[0]
    };

    setAllUsers(prev => [...prev, newUser]);

    toast({
      title: "Success",
      description: `User invited to workspace successfully!`,
    });

    setNewUserEmail("");
    setNewUserRole("viewer");
    setIsAddUserDialogOpen(false);
  };

  const handleRemoveUser = (userId: number) => {
    setAllUsers(prev => prev.filter(user => user.id !== userId));
    toast({
      title: "User Removed",
      description: "User has been removed from the workspace.",
      variant: "destructive",
    });
  };

  const handleWorkspaceDeleted = () => {
    // Navigate back to workspaces list after deletion
    navigate('/workspaces');
  };

  const handleWorkspaceDeactivated = () => {
    // Update workspace status
    setWorkspaceStatus("Inactive");
  };

  const handleCreateSolution = () => {
    if (!newSolutionName.trim()) {
      toast({
        title: "Error",
        description: "Solution name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!newSolutionDescription.trim()) {
      toast({
        title: "Error",
        description: "Solution description is required.",
        variant: "destructive",
      });
      return;
    }

    // Create new solution
    const newSolution: Solution = {
      id: allSolutions.length + 1,
      name: newSolutionName,
      status: "Development",
      lastModified: "Just now",
      type: "ML Model"
    };

    setAllSolutions(prev => [...prev, newSolution]);

    toast({
      title: "Success",
      description: "Solution created successfully!",
    });

    // Navigate to the new solution page
    navigate(`/workspaces/${id}/solutions/${newSolution.id}`);

    setNewSolutionName("");
    setNewSolutionDescription("");
    setIsCreateSolutionDialogOpen(false);
  };

  const handleSolutionClick = (solutionId: number) => {
    navigate(`/workspaces/${id}/solutions/${solutionId}`);
  };

  const handleGenerateWithAI = () => {
    // Close the dialog first
    setIsCreateSolutionDialogOpen(false);
    // Navigate to AI generation page
    navigate(`/workspaces/${id}/ai-generator`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span>Loading workspace details...</span>
      </div>
    );
  }
  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <span>Workspace not found.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <WorkspaceBreadcrumb workspaceName={workspace.WorkspaceName} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{workspace.WorkspaceName}</h1>
          <p className="text-gray-600 mt-1">{workspace.Description}</p>
        </div>
        <WorkspaceSettings 
          workspaceName={workspace.WorkspaceName} 
          onWorkspaceDeleted={handleWorkspaceDeleted}
          onWorkspaceDeactivated={handleWorkspaceDeactivated}
        />
      </div>

      {/* Show deactivated workspace notice */}
      {workspaceStatus === "Inactive" && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-yellow-800">
              <Power className="w-5 h-5" />
              <p className="font-medium">This workspace has been deactivated</p>
            </div>
            <p className="text-sm text-yellow-700 mt-1">
              Users have limited access to this workspace. Contact an administrator to reactivate it.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{workspace.SolutionsCount}</p>
                <p className="text-sm text-gray-600">Solutions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Users className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{workspace.MembersCount}</p>
                <p className="text-sm text-gray-600">Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Database className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{workspace.DataSourcesCount}</p>
                <p className="text-sm text-gray-600">Data Sources</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">${workspace.MonthlyCost}</p>
                <p className="text-sm text-gray-600">Monthly Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workspace Info */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label className="text-sm font-medium text-gray-700">Owner</Label>
              <p className="mt-1 text-gray-900">{workspace.CreatedBy}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Status</Label>
              <div className="mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(workspaceStatus)}`}>
                  {workspaceStatus}
                </span>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Created</Label>
              <div className="mt-1 flex items-center space-x-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <p className="text-gray-900">{workspace.CreationTime}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Solutions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Solutions</CardTitle>
              <CardDescription>Manage solutions in this workspace</CardDescription>
            </div>
            <Dialog open={isCreateSolutionDialogOpen} onOpenChange={setIsCreateSolutionDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Solution
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Solution</DialogTitle>
                  <DialogDescription>
                    Create a new solution in this workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="solution-name">Solution Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="solution-name"
                      placeholder="Enter solution name"
                      value={newSolutionName}
                      onChange={(e) => setNewSolutionName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="solution-description">Description <span className="text-red-500">*</span></Label>
                    <Textarea
                      id="solution-description"
                      placeholder="Describe your solution..."
                      value={newSolutionDescription}
                      onChange={(e) => setNewSolutionDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateSolutionDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateSolution}>
                    Create Solution
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search solutions by name..."
                value={solutionsSearch}
                onChange={(e) => {
                  setSolutionsSearch(e.target.value);
                  setSolutionsPage(1);
                }}
                className="pl-10"
              />
            </div>

            {/* Solutions Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSolutions.map((solution) => (
                  <TableRow 
                    key={solution.id} 
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleSolutionClick(solution.id)}
                  >
                    <TableCell>
                      <div className="font-medium text-gray-900">{solution.name}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(solution.status)}`}>
                        {solution.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-600">{solution.lastModified}</TableCell>
                  </TableRow>
                ))}
                {paginatedSolutions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                      No solutions found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Solutions Pagination */}
            {totalSolutionsPages > 1 && (
              <div className="flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setSolutionsPage(Math.max(1, solutionsPage - 1))}
                        className={solutionsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {[...Array(totalSolutionsPages)].map((_, i) => (
                      <PaginationItem key={i + 1}>
                        <PaginationLink
                          onClick={() => setSolutionsPage(i + 1)}
                          isActive={solutionsPage === i + 1}
                          className="cursor-pointer"
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setSolutionsPage(Math.min(totalSolutionsPages, solutionsPage + 1))}
                        className={solutionsPage === totalSolutionsPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage users and their permissions</CardDescription>
            </div>
            <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={workspaceStatus === "Inactive"}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add User to Workspace</DialogTitle>
                  <DialogDescription>
                    Invite a user to join this workspace by entering their email address.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@company.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role <span className="text-red-500">*</span></Label>
                    <Select value={newUserRole} onValueChange={setNewUserRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddUser}>
                    Send Invitation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search users by name, email, or role..."
                value={usersSearch}
                onChange={(e) => {
                  setUsersSearch(e.target.value);
                  setUsersPage(1);
                }}
                className="pl-10"
              />
            </div>

            {/* Users Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-600 flex items-center space-x-1">
                          <Mail className="w-3 h-3" />
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeClass(user.role)}`}>
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-600">{user.joinedDate}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" disabled={workspaceStatus === "Inactive"}>
                          <Settings className="w-4 h-4" />
                        </Button>
                        {user.role !== "Admin" && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleRemoveUser(user.id)}
                            disabled={workspaceStatus === "Inactive"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No users found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Users Pagination */}
            {totalUsersPages > 1 && (
              <div className="flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setUsersPage(Math.max(1, usersPage - 1))}
                        className={usersPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {[...Array(totalUsersPages)].map((_, i) => (
                      <PaginationItem key={i + 1}>
                        <PaginationLink
                          onClick={() => setUsersPage(i + 1)}
                          isActive={usersPage === i + 1}
                          className="cursor-pointer"
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setUsersPage(Math.min(totalUsersPages, usersPage + 1))}
                        className={usersPage === totalUsersPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkspaceDetails;
