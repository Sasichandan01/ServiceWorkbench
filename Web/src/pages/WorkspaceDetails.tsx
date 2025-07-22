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
import UserProfileDialog from "@/components/admin/UserProfileDialog";
import WorkspaceAuditLogs from "@/components/WorkspaceAuditLogs";
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
  Wand2,
  Loader2,
  Pencil,
  Tag // Add Tag icon
} from "lucide-react";
import { WorkspaceService } from "../services/workspaceService";
import { SolutionService } from "../services/solutionService";
import { useGetWorkspaceQuery, useGetSolutionsQuery, useDeleteWorkspaceMutation, useCreateSolutionMutation, useShareResourceMutation } from '../services/apiSlice';
import { useAppSelector } from "@/hooks/useAppSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  const [newSolutionTags, setNewSolutionTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [createSolution, { isLoading: isCreatingSolution }] = useCreateSolutionMutation();
  const [shareResource, { isLoading: isSharing }] = useShareResourceMutation();

  // Search and pagination states
  const [solutionsSearch, setSolutionsSearch] = useState("");
  const [usersSearch, setUsersSearch] = useState("");
  const [solutionsPage, setSolutionsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const itemsPerPage = 5;

  // Replace manual workspace state with RTK Query
  const {
    data,
    isLoading: workspaceLoading,
    isError: workspaceError,
    refetch: refetchWorkspace
  } = useGetWorkspaceQuery(id!);
  const workspace = data ? {
    id: data.WorkspaceId,
    name: data.WorkspaceName,
    description: data.Description,
    status: data.WorkspaceStatus,
    owner: data.CreatedBy,
    created: data.CreationTime,
    members: data.Users?.Pagination?.TotalCount || 0,
    solutions: 0, // update if needed
    dataSources: 0, // update if needed
    monthlyCost: 0, // update if needed
    type: data.WorkspaceType,
    tags: data.Tags || [],
  } : null;

  // Fetch solutions count and list using RTK Query
  const { data: solutionsData, isLoading: solutionsLoading, isError: solutionsError } = useGetSolutionsQuery({ workspaceId: id!, limit: 10, offset: solutionsPage });
  const solutionsTotalCount = solutionsData?.Pagination?.TotalCount || 0;

  // Add a function to refetch workspace details
  // Remove old workspace state, loading, error, and fetchWorkspaceDetails

  // Fetch solutions from API
  const fetchSolutions = (search: string, page: number) => {
    // setSolutionsLoading(true); // This state is removed
    // setSolutionsError(null); // This state is removed
    SolutionService.getSolutions(id, {
      limit: 10,
      offset: page,
      filterBy: search.trim() ? search : undefined,
    })
      .then((data) => {
        // setAllSolutions(data.Solutions || []); // This state is removed
        // setSolutionsTotalCount(data.Pagination?.TotalCount || 0); // This state is removed
        // setSolutionsLoading(false); // This state is removed
      })
      .catch((err: any) => {
        // setSolutionsError(err.message); // This state is removed
        // setSolutionsLoading(false); // This state is removed
      });
  };

  // Fetch workspace details only on mount or when id changes
  useEffect(() => {
    // Remove old workspace state, loading, error, and fetchWorkspaceDetails
  }, [id]);

  // Fetch solutions when search or page changes
  useEffect(() => {
    fetchSolutions(solutionsSearch, solutionsPage);
  }, [id, solutionsSearch, solutionsPage]);

  // Filter and paginate users
  const apiUsers = Array.isArray(data?.Users) ? data.Users : [];
  const filteredApiUsers = apiUsers.filter(user =>
    user.Username.toLowerCase().includes(usersSearch.toLowerCase()) ||
    user.Email.toLowerCase().includes(usersSearch.toLowerCase()) ||
    user.Access.toLowerCase().includes(usersSearch.toLowerCase())
  );
  const totalApiUsersPages = Math.ceil(filteredApiUsers.length / itemsPerPage);
  const paginatedApiUsers = filteredApiUsers.slice(
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

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) {
      toast({
        title: "Error",
        description: "Email is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      await shareResource({
        Username: newUserEmail,
        ResourceType: 'workspace',
        ResourceId: id!,
        AccessType: newUserRole as 'owner' | 'read-only' | 'editor',
      }).unwrap();

      toast({
        title: "Success",
        description: `User invited to workspace successfully!`,
      });

      setNewUserEmail("");
      setNewUserRole("viewer");
      setIsAddUserDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.message || 'Failed to share workspace.',
        variant: "destructive",
      });
    }
  };

  const handleRemoveUser = (userId: number) => {
    // setAllUsers(prev => prev.filter(user => user.id !== userId));
    toast({
      title: "User Removed",
      description: "User has been removed from the workspace.",
      variant: "destructive",
    });
  };

  const [deleteWorkspace, { isLoading: isDeleting }] = useDeleteWorkspaceMutation();

  const handleWorkspaceDeleted = async () => {
    if (!workspace?.id) return;
    try {
      await deleteWorkspace(workspace.id).unwrap();
      toast({
        title: "Workspace Deleted",
        description: "The workspace has been deleted successfully.",
        variant: "destructive",
      });
      navigate('/workspaces', { replace: true });
    } catch (error: any) {
      let errorMsg = '';
      if (error && typeof error.error === 'string') {
        try {
          const parsed = JSON.parse(error.error);
          if (parsed && parsed.Error) {
            errorMsg = parsed.Error;
          } else {
            errorMsg = error.error;
          }
        } catch {
          errorMsg = error.error;
        }
      } else {
        errorMsg = error?.data?.message || error.message || 'Failed to delete workspace';
      }
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const handleWorkspaceDeactivated = () => {
    // Update workspace status
    // setWorkspaceStatus("Inactive"); // This state is removed, so this function is no longer relevant
  };

  const handleCreateSolution = async () => {
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
    if (newSolutionTags.length === 0) {
      toast({
        title: "Error",
        description: "At least one tag is required.",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await createSolution({
        workspaceId: id!,
        body: {
          SolutionName: newSolutionName,
          Description: newSolutionDescription,
          Tags: newSolutionTags,
        },
      }).unwrap();
      toast({
        title: "Success",
        description: "Solution created successfully!",
      });
      setIsCreateSolutionDialogOpen(false);
      setNewSolutionName("");
      setNewSolutionDescription("");
      setNewSolutionTags([]);
      setNewTagInput("");
      if (response && response.SolutionId) {
        navigate(`/workspaces/${id}/solutions/${response.SolutionId}`);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.message || error.message || 'Failed to create solution',
        variant: "destructive",
      });
    }
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

  const user = useAppSelector((state) => state.auth.user);
  // Helper to check if current user is the owner
  const isOwner =
    user && workspace?.owner && (
      user.username === workspace.owner ||
      user.sub === workspace.owner ||
      user.email === workspace.owner
    );

  const [activeTab, setActiveTab] = useState("solutions");

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <WorkspaceBreadcrumb workspaceName={workspace?.name || "Loading..."} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{workspace?.name || "Loading..."}</h1>
          <p className="text-gray-600 mt-1">{workspace?.description || "Description not available."}</p>
        </div>
        <WorkspaceSettings
          workspaceName={workspace?.name || "Loading..."}
          workspaceId={workspace?.id}
          workspaceStatus={workspace?.status || "Active"}
          workspaceDescription={workspace?.description || ""}
          workspaceType={workspace?.type || "Public"}
          workspaceTags={workspace?.tags || []}
          onWorkspaceDeleted={handleWorkspaceDeleted}
          onWorkspaceStatusChange={() => { refetchWorkspace(); }}
          onWorkspaceUpdated={() => { /* This function is no longer relevant */ }}
        />
      </div>

      {/* Show deactivated workspace notice */}
      {workspace?.status === "Inactive" && (
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

      {/* Overview Cards (moved above tabs) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{solutionsTotalCount}</p>
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
                <p className="text-2xl font-bold text-gray-900">{workspace?.members || "0"}</p>
                <p className="text-sm text-gray-600">Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">${workspace?.monthlyCost || "0"}</p>
                <p className="text-sm text-gray-600">Monthly Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Tag className="w-8 h-8 text-purple-600" />
              <div>
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(workspace?.tags) && workspace.tags.length > 0 ? (
                    workspace.tags.map((tag: string, idx: number) => (
                      <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full border border-blue-200">{tag}</span>
                    ))
                  ) : (
                    <span className="text-gray-400 text-xs">No tags</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">Tags</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workspace Info Card (moved above tabs) */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label className="text-sm font-medium text-gray-700">Owner</Label>
              <p className="mt-1 text-gray-900">{workspace?.owner || "N/A"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Status</Label>
              <div className="mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(workspace?.status || "Active")}`}>
                  {workspace?.status || "Active"}
                </span>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Created</Label>
              <div className="mt-1 flex items-center space-x-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <p className="text-gray-900">{workspace?.created || "N/A"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content with Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="xl:col-span-3 lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${isOwner ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TabsTrigger value="solutions">Solutions</TabsTrigger>
              {isOwner && <TabsTrigger value="users">Users</TabsTrigger>}
            </TabsList>
            {/* Solutions Tab */}
            <TabsContent value="solutions" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Solutions</CardTitle>
                      <CardDescription>Manage solutions in this workspace</CardDescription>
                    </div>
                    <Dialog open={isCreateSolutionDialogOpen} onOpenChange={setIsCreateSolutionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button disabled={workspace?.status === 'Inactive' || isCreatingSolution}>
                          <Plus className="w-4 h-4 mr-2" />
                          {isCreatingSolution ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Solution'}
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
                              disabled={workspace?.status === 'Inactive' || isCreatingSolution}
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
                              disabled={workspace?.status === 'Inactive' || isCreatingSolution}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="solution-tags">Tags <span className="text-red-500">*</span></Label>
                            <div className="flex gap-2">
                              <Input
                                id="solution-tags"
                                placeholder="Add a tag and press Enter"
                                value={newTagInput}
                                onChange={e => setNewTagInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && newTagInput.trim()) {
                                    e.preventDefault();
                                    if (!newSolutionTags.includes(newTagInput.trim())) {
                                      setNewSolutionTags([...newSolutionTags, newTagInput.trim()]);
                                    }
                                    setNewTagInput("");
                                  }
                                }}
                                disabled={workspace?.status === 'Inactive' || isCreatingSolution}
                              />
                              <Button
                                type="button"
                                onClick={() => {
                                  if (newTagInput.trim() && !newSolutionTags.includes(newTagInput.trim())) {
                                    setNewSolutionTags([...newSolutionTags, newTagInput.trim()]);
                                  }
                                  setNewTagInput("");
                                }}
                                disabled={workspace?.status === 'Inactive' || isCreatingSolution}
                                variant="outline"
                                size="sm"
                              >
                                Add
                              </Button>
                            </div>
                            {newSolutionTags.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {newSolutionTags.map((tag, idx) => (
                                  <span key={idx} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs flex items-center gap-1">
                                    {tag}
                                    <button
                                      type="button"
                                      className="ml-1 text-blue-600 hover:text-red-600"
                                      onClick={() => setNewSolutionTags(newSolutionTags.filter(t => t !== tag))}
                                      disabled={workspace?.status === 'Inactive' || isCreatingSolution}
                                    >
                                      &times;
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsCreateSolutionDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleCreateSolution} disabled={workspace?.status === 'Inactive' || isCreatingSolution}>
                            {isCreatingSolution ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Solution'}
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
                          <TableHead>Solution Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead>Last Modified</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {solutionsLoading ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                              Loading solutions...
                            </TableCell>
                          </TableRow>
                        ) : solutionsError ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-red-500">
                              {solutionsError}
                            </TableCell>
                          </TableRow>
                        ) : solutionsData?.Solutions?.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                              No solutions found matching your search.
                            </TableCell>
                          </TableRow>
                        ) : (
                          solutionsData?.Solutions?.map((solution) => (
                            <TableRow 
                              key={solution.SolutionId} 
                              className="cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => handleSolutionClick(solution.SolutionId)}
                            >
                              <TableCell>
                                <div className="font-medium text-gray-900">{solution.SolutionName}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-gray-700 text-sm line-clamp-2">{solution.Description}</div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {Array.isArray(solution.Tags) && solution.Tags.length > 0 ? (
                                    solution.Tags.map((tag: string, idx: number) => (
                                      <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full border border-blue-200">{tag}</span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 text-xs">No tags</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-600">{solution.LastUpdationTime}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>

                    {/* Solutions Pagination */}
                    {solutionsTotalCount > 10 && (
                      <div className="flex justify-center">
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious 
                                onClick={() => setSolutionsPage(Math.max(1, solutionsPage - 1))}
                                className={solutionsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                            {Array.from({ length: Math.ceil(solutionsTotalCount / 10) }, (_, i) => (
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
                                onClick={() => setSolutionsPage(Math.min(Math.ceil(solutionsTotalCount / 10), solutionsPage + 1))}
                                className={solutionsPage === Math.ceil(solutionsTotalCount / 10) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            {/* Users Tab (only if isOwner) */}
            {isOwner && (
              <TabsContent value="users" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>User Management</CardTitle>
                        <CardDescription>Manage users and their permissions</CardDescription>
                      </div>
                      <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                        <DialogTrigger asChild>
                          <Button disabled={workspace?.status === "Inactive"}>
                            <UserPlus className="w-4 h-4 mr-2" />
                            Share
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Share Workspace</DialogTitle>
                            <DialogDescription>
                              Invite a user to join this workspace by entering their email address or user ID.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="email">Username <span className="text-red-500">*</span></Label>
                              <Input
                                id="email"
                                type="email"
                                placeholder="enter email or userid"
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
                                  <SelectItem value="owner">Owner</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="read-only">read-only</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleAddUser} disabled={workspace?.status === "Inactive" || isSharing}>
                              {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invitation"}
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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedApiUsers.map((user, idx) => (
                            <TableRow key={user.UserId || idx}>
                              <TableCell>
                                <div className="font-medium text-gray-900">{user.Username}</div>
                                <div className="text-sm text-gray-600 flex items-center space-x-1">
                                  <Mail className="w-3 h-3" />
                                  <span>{user.Email}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-800 border-gray-200">
                                  {user.Access}
                                </span>
                              </TableCell>
                              <TableCell className="text-gray-600">{user.CreationTime}</TableCell>
                            </TableRow>
                          ))}
                          {paginatedApiUsers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                                No users found matching your search.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>

                      {/* Users Pagination */}
                      {totalApiUsersPages > 1 && (
                        <div className="flex justify-center">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious 
                                  onClick={() => setUsersPage(Math.max(1, usersPage - 1))}
                                  className={usersPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                              {[...Array(totalApiUsersPages)].map((_, i) => (
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
                                  onClick={() => setUsersPage(Math.min(totalApiUsersPages, usersPage + 1))}
                                  className={usersPage === totalApiUsersPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Right Sidebar - Audit Logs */}
        <div className="space-y-6">
          <WorkspaceAuditLogs workspaceId={workspace?.id} />
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDetails;
