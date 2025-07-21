import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { ProtectedButton } from "@/components/ui/protected-button";
import { 
  Users, 
  Plus, 
  Search,
  Filter,
  FolderOpen,
  Calendar,
  Archive,
  X,
  Loader2
} from "lucide-react";
import { WorkspaceService, type Workspace as ApiWorkspace } from "../services/workspaceService";
import { useGetWorkspacesQuery, useCreateWorkspaceMutation } from '../services/apiSlice';

interface LocalWorkspace {
  id: string;
  name: string;
  status: string;
  members: number;
  projects: number;
  lastActivity: string;
  owner: string;
  description: string;
  type: string;
  tags: string[];
}

const Workspaces = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceType, setWorkspaceType] = useState("Standard");
  const [currentTag, setCurrentTag] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const itemsPerPage = 10;
  const { data, isLoading, isError, refetch } = useGetWorkspacesQuery({ limit: itemsPerPage, offset: currentPage, filterBy: searchTerm });
  const [createWorkspace, { isLoading: isCreating }] = useCreateWorkspaceMutation();

  // Map RTK Query response to LocalWorkspace[]
  const workspaces: LocalWorkspace[] = (data?.Workspaces ?? []).map(ws => ({
    id: ws.WorkspaceId,
    name: ws.WorkspaceName,
    status: ws.WorkspaceStatus,
    members: ws.Users?.Pagination?.TotalCount ?? 0,
    projects: 0, // Placeholder, update if you have project info
    lastActivity: ws.LastUpdationTime || ws.CreationTime,
    owner: ws.CreatedBy,
    description: ws.Description,
    type: ws.WorkspaceType,
    tags: Array.isArray(ws.Tags) ? ws.Tags : [],
  }));
  const totalWorkspaces = data?.Pagination?.TotalCount || 0;
  const totalPages = Math.ceil(totalWorkspaces / itemsPerPage);

  // Compute status counts for the current page
  const activeWorkspaces = workspaces.filter(w => w.status === "Active").length;
  const archivedWorkspaces = workspaces.filter(w => w.status === "Archived").length;
  const defaultWorkspaces = workspaces.filter(w => w.status === "Default").length;

  const { toast } = useToast();

  const formatLastActivity = (timestamp: string): string => {
    if (!timestamp) return "Unknown";
    // If timestamp is in 'YYYY-MM-DD HH:mm:ss' format, treat as UTC
    let isoTimestamp = timestamp;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      isoTimestamp = timestamp.replace(' ', 'T') + 'Z';
    }
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) return "Unknown";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "Just now";
    const diffInMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // No client-side filtering or slicing; use backend data directly

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Active": return "bg-green-100 text-green-800 border-green-200";
      case "Archived": return "bg-gray-100 text-gray-800 border-gray-200";
      case "Default": return "bg-blue-100 text-blue-800 border-blue-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRowColor = (status: string) => {
    switch (status) {
      case "Active": return "hover:bg-green-50";
      case "Archived": return "hover:bg-gray-50 bg-gray-25";
      case "Default": return "hover:bg-blue-50 bg-blue-25";
      default: return "hover:bg-gray-50";
    }
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    navigate(`/workspaces/${workspaceId}`);
  };

  const handleAddTag = () => {
    if (currentTag.trim() && !tags.includes(currentTag.trim())) {
      setTags([...tags, currentTag.trim()]);
      setCurrentTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) {
      toast({
        title: "Error",
        description: "Workspace name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!workspaceDescription.trim()) {
      toast({
        title: "Error",
        description: "Workspace description is required.",
        variant: "destructive",
      });
      return;
    }

    if (!workspaceType || workspaceType === "" || workspaceType === undefined) {
      toast({
        title: "Error",
        description: "Workspace type is required.",
        variant: "destructive",
      });
      return;
    }

    if (tags.length === 0) {
      toast({
        title: "Error",
        description: "At least one tag is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createWorkspace({
        WorkspaceName: workspaceName,
        Description: workspaceDescription,
        Tags: tags,
        WorkspaceType: workspaceType
      }).unwrap();
      toast({
        title: "Success",
        description: `Workspace "${workspaceName}" created successfully!`,
      });
      resetForm();
      setIsCreateDialogOpen(false);
      refetch();
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
        errorMsg = error?.data?.message || error.message || 'Failed to create workspace';
      }
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setWorkspaceName("");
    setWorkspaceDescription("");
    setWorkspaceType("Standard");
    setTags([]);
    setCurrentTag("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Workspaces</h1>
          <p className="text-gray-600">Collaborative environments for your team projects</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <ProtectedButton 
              resource="workspaces" 
              action="manage"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Workspace
            </ProtectedButton>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
              <DialogDescription>
                Create a collaborative workspace for your team projects.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workspace Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  placeholder="Enter workspace name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                <Textarea
                  id="description"
                  placeholder="Describe your workspace"
                  value={workspaceDescription}
                  onChange={(e) => setWorkspaceDescription(e.target.value)}
                  rows={3}
                  required
                />
              </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Workspace Type <span className="text-red-500">*</span></Label>
                    <Select value={workspaceType} onValueChange={setWorkspaceType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select workspace type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Public">Public</SelectItem>
                        <SelectItem value="Private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags <span className="text-red-500">*</span></Label>
                    <Input
                      id="tags"
                      placeholder="Add a tag and press Enter"
                      value={currentTag}
                      onChange={(e) => setCurrentTag(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="flex items-center gap-1">
                            {tag}
                            <X 
                              className="w-3 h-3 cursor-pointer hover:text-red-500" 
                              onClick={() => handleRemoveTag(tag)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  resetForm();
                  setIsCreateDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateWorkspace} disabled={isCreating} className="bg-blue-600 hover:bg-blue-700">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Workspace'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalWorkspaces}</p>
                <p className="text-sm text-gray-600">Total Workspaces</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{activeWorkspaces}</p>
                <p className="text-sm text-gray-600">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Archive className="w-8 h-8 text-gray-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{archivedWorkspaces}</p>
                <p className="text-sm text-gray-600">Archived</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{defaultWorkspaces}</p>
                <p className="text-sm text-gray-600">Default</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workspaces Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Workspaces</CardTitle>
          <CardDescription>
            {totalWorkspaces} workspace{totalWorkspaces !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search Bar inside All Workspaces */}
          <div className="mb-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search workspaces..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading workspaces...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-red-500">
                    Failed to load workspaces. Please try again later.
                  </TableCell>
                </TableRow>
              ) : workspaces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No workspaces found
                  </TableCell>
                </TableRow>
              ) : (
                workspaces.map((workspace) => (
                <TableRow 
                  key={workspace.id} 
                  className={`${getRowColor(workspace.status)} cursor-pointer`}
                  onClick={() => handleWorkspaceClick(workspace.id)}
                >
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FolderOpen className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                          {workspace.name}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-900">{workspace.owner}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-800 border-gray-200">
                      <span>{workspace.type}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(workspace.status)}`}>
                      <span>{workspace.status}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {workspace.tags.length > 0 ? (
                        workspace.tags.map((tag, idx) => (
                          <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full border border-blue-200">{tag}</span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-xs">No tags</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{workspace.lastActivity}</span>
                    </div>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* No workspaces state */}
      {!isLoading && workspaces.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No workspaces</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter !== "all" 
                ? "Try adjusting your filters" 
                : "Create your first workspace to start collaborating"
              }
            </p>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Workspace
                </Button>
              </DialogTrigger>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Workspaces;
