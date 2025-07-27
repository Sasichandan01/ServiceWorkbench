
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProtectedButton } from "@/components/ui/protected-button";
import {
  Cloud,
  Search,
  FolderOpen,
  Calendar,
  Archive,
  Play,
  Users,
  Loader2,
  Plus,
  DollarSign,
  X
} from "lucide-react";
import { WorkspaceService } from "../../services/workspaceService";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface LocalWorkspace {
  id: string;
  name: string;
  status: string;
  lastActivity: string;
  owner: string;
  description: string;
  type: string;
}

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

function formatRelativeTime(timestamp: string): string {
  if (!timestamp || timestamp === 'Unknown') return 'Unknown';
  let isoTimestamp = timestamp;
  // Convert 'YYYY-MM-DD HH:mm:ss' to ISO format
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    isoTimestamp = timestamp.replace(' ', 'T') + 'Z';
  }
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return timestamp; // fallback: show raw timestamp if parsing fails
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

const AdminWorkspacesTable = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceType, setWorkspaceType] = useState("Private");
  const [currentTag, setCurrentTag] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const itemsPerPage = 10;
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch workspaces
  useEffect(() => {
    const fetchWorkspaces = async () => {
      setLoading(true);
      try {
        const searchParams: any = {
          limit: itemsPerPage,
          offset: currentPage,
        };
        if (searchTerm.trim()) {
          searchParams.filter = searchTerm.trim();
        }
        const response = await WorkspaceService.getWorkspaces(searchParams);
        if (response && response.Workspaces && Array.isArray(response.Workspaces)) {
          const transformedWorkspaces: LocalWorkspace[] = response.Workspaces.map(ws => ({
            id: ws.WorkspaceId,
            name: ws.WorkspaceName,
            status: ws.WorkspaceStatus,
            lastActivity: formatRelativeTime(ws.LastUpdationTime),
            owner: ws.CreatedBy,
            description: ws.Description,
            type: ws.WorkspaceType
          }));
          setWorkspaces(transformedWorkspaces);
          setTotalCount(response.Pagination?.TotalCount || transformedWorkspaces.length);
        } else {
          setWorkspaces([]);
          setTotalCount(0);
        }
      } catch (error) {
        setWorkspaces([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkspaces();
  }, [currentPage, searchTerm]);

  const filteredWorkspaces = workspaces.filter(workspace => {
    const matchesSearch = workspace.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || workspace.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedWorkspaces = filteredWorkspaces.slice(startIndex, startIndex + itemsPerPage);

  const totalWorkspaces = totalCount;
  const activeWorkspaces = workspaces.filter(w => w.status === "Active").length;
  const archivedWorkspaces = workspaces.filter(w => w.status === "Archived").length;
  const defaultWorkspaces = workspaces.filter(w => w.status === "Default").length;

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

    setIsCreating(true);
    try {
      await WorkspaceService.createWorkspace({
        WorkspaceName: workspaceName,
        Description: workspaceDescription,
        Tags: tags,
        WorkspaceType: workspaceType
      });
      toast({
        title: "Success",
        description: `Workspace "${workspaceName}" created successfully!`,
      });
      resetForm();
      setIsCreateDialogOpen(false);
      // Refresh the workspaces list
      const searchParams: any = {
        limit: itemsPerPage,
        offset: currentPage,
      };
      if (searchTerm.trim()) {
        searchParams.filter = searchTerm.trim();
      }
      const response = await WorkspaceService.getWorkspaces(searchParams);
      if (response && response.Workspaces && Array.isArray(response.Workspaces)) {
        const transformedWorkspaces: LocalWorkspace[] = response.Workspaces.map(ws => ({
          id: ws.WorkspaceId,
          name: ws.WorkspaceName,
          status: ws.WorkspaceStatus,
          lastActivity: formatRelativeTime(ws.LastUpdationTime),
          owner: ws.CreatedBy,
          description: ws.Description,
          type: ws.WorkspaceType
        }));
        setWorkspaces(transformedWorkspaces);
        setTotalCount(response.Pagination?.TotalCount || transformedWorkspaces.length);
      }
    } catch (error: any) {
      let errorMsg = '';
      if (error && typeof error.message === 'string') {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed && parsed.Error) {
            errorMsg = parsed.Error;
          } else {
            errorMsg = error.message;
          }
        } catch {
          errorMsg = error.message;
        }
      } else {
        errorMsg = error?.data?.message || error.message || 'Failed to create workspace';
      }
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Cloud className="w-5 h-5" />
          <span>Workspace Management</span>
        </CardTitle>
        <CardDescription>
          Monitor and manage all workspaces across the system
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create Workspace Button */}
        <div className="flex justify-end">
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Workspace Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="name"
                    placeholder="Enter workspace name"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                  <Textarea
                    id="description"
                    placeholder="Enter workspace description"
                    value={workspaceDescription}
                    onChange={(e) => setWorkspaceDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Workspace Type <span className="text-red-500">*</span></Label>
                  <Select value={workspaceType} onValueChange={setWorkspaceType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select workspace type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Private">Private</SelectItem>
                      <SelectItem value="Public">Public</SelectItem>
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
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">Total Workspaces</p>
                <p className="text-2xl font-bold text-blue-900">{totalWorkspaces}</p>
              </div>
              <Cloud className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">Active</p>
                <p className="text-2xl font-bold text-green-900">{activeWorkspaces}</p>
              </div>
              <Play className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>
        {/* Workspaces Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Workspaces</CardTitle>
            <CardDescription>
              {filteredWorkspaces.length} workspace{filteredWorkspaces.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading workspaces...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredWorkspaces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No workspaces found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedWorkspaces.map((workspace) => (
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
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">{formatRelativeTime(workspace.lastActivity)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
      </CardContent>
    </Card>
  );
};

export default AdminWorkspacesTable;
