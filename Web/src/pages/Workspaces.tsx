import { useState } from "react";
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
import { 
  Users, 
  Plus, 
  Search,
  Filter,
  FolderOpen,
  Calendar,
  Archive,
  X
} from "lucide-react";

interface Workspace {
  id: number;
  name: string;
  status: string;
  members: number;
  projects: number;
  lastActivity: string;
  owner: string;
}

const Workspaces = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [currentTag, setCurrentTag] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { toast } = useToast();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    {
      id: 1,
      name: "Analytics Team",
      status: "Active",
      members: 8,
      projects: 12,
      lastActivity: "2 hours ago",
      owner: "Sarah Chen"
    },
    {
      id: 2,
      name: "ML Research Lab",
      status: "Active",
      members: 15,
      projects: 7,
      lastActivity: "30 minutes ago",
      owner: "Dr. Martinez"
    },
    {
      id: 3,
      name: "Customer Insights",
      status: "Active",
      members: 6,
      projects: 18,
      lastActivity: "1 day ago",
      owner: "Mike Johnson"
    },
    {
      id: 4,
      name: "Development Sandbox",
      status: "Default",
      members: 2,
      projects: 5,
      lastActivity: "4 hours ago",
      owner: "Alex Kim"
    },
    {
      id: 5,
      name: "Legacy Projects",
      status: "Archived",
      members: 3,
      projects: 25,
      lastActivity: "2 weeks ago",
      owner: "Jennifer Wu"
    }
  ]);

  const filteredWorkspaces = workspaces.filter(workspace => {
    const matchesSearch = workspace.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || workspace.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredWorkspaces.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedWorkspaces = filteredWorkspaces.slice(startIndex, startIndex + itemsPerPage);

  const totalWorkspaces = workspaces.length;
  const activeWorkspaces = workspaces.filter(w => w.status === "Active").length;
  const archivedWorkspaces = workspaces.filter(w => w.status === "Archived").length;
  const defaultWorkspaces = workspaces.filter(w => w.status === "Default").length;

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

  const handleWorkspaceClick = (workspaceId: number) => {
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

  const handleCreateWorkspace = () => {
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

    if (tags.length === 0) {
      toast({
        title: "Error",
        description: "At least one tag is required.",
        variant: "destructive",
      });
      return;
    }

    const newWorkspace: Workspace = {
      id: Math.max(...workspaces.map(w => w.id)) + 1,
      name: workspaceName,
      status: "Active",
      members: 1,
      projects: 0,
      lastActivity: "Just now",
      owner: "You"
    };

    setWorkspaces([newWorkspace, ...workspaces]);

    console.log("Creating workspace:", {
      name: workspaceName,
      description: workspaceDescription,
      tags: tags
    });

    toast({
      title: "Success",
      description: `Workspace "${workspaceName}" created successfully!`,
    });

    // Reset form
    setWorkspaceName("");
    setWorkspaceDescription("");
    setTags([]);
    setCurrentTag("");
    setIsCreateDialogOpen(false);
  };

  const resetForm = () => {
    setWorkspaceName("");
    setWorkspaceDescription("");
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
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Workspace
            </Button>
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
              <Button onClick={handleCreateWorkspace} className="bg-blue-600 hover:bg-blue-700">
                Create Workspace
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search workspaces..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Workspaces Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Workspaces</CardTitle>
          <CardDescription>
            {filteredWorkspaces.length} workspace{filteredWorkspaces.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead className="text-center">Projects</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedWorkspaces.map((workspace) => (
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
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(workspace.status)}`}>
                      <span>{workspace.status}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-900">{workspace.owner}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{workspace.members}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <FolderOpen className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{workspace.projects}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{workspace.lastActivity}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {totalPages > 1 && (
            <div className="mt-4">
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
      {filteredWorkspaces.length === 0 && (
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
