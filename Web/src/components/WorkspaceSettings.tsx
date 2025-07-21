
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Settings, Users, Database, Trash2, Power, Edit, X, Loader2 } from "lucide-react";
import { ApiClient } from "../lib/apiClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WorkspaceService } from "../services/workspaceService";
import { useUpdateWorkspaceMutation } from '../services/apiSlice';

interface WorkspaceSettingsProps {
  workspaceName: string;
  workspaceId?: string;
  workspaceStatus: string;
  workspaceDescription?: string;
  workspaceType?: string;
  workspaceTags?: string[];
  onWorkspaceDeleted?: () => void;
  onWorkspaceStatusChange?: (newStatus: string) => void;
  onWorkspaceUpdated?: () => void;
}

const WorkspaceSettings = ({ workspaceName, workspaceId, workspaceStatus, workspaceDescription = "", workspaceType = "Public", workspaceTags = [], onWorkspaceDeleted, onWorkspaceStatusChange, onWorkspaceUpdated }: WorkspaceSettingsProps) => {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(workspaceName || "");
  const [editDescription, setEditDescription] = useState(workspaceDescription || "");
  const [editType, setEditType] = useState(workspaceType || "Public");
  const [editTagInput, setEditTagInput] = useState("");
  const [editTags, setEditTags] = useState<string[]>(workspaceTags || []);

  const [updateWorkspace, { isLoading: isUpdating }] = useUpdateWorkspaceMutation();

  // Tag input handlers
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && editTagInput.trim()) {
      e.preventDefault();
      if (!editTags.includes(editTagInput.trim())) {
        setEditTags([...editTags, editTagInput.trim()]);
      }
      setEditTagInput("");
    }
  };
  const handleRemoveTag = (tag: string) => {
    setEditTags(editTags.filter(t => t !== tag));
  };
  // Reset dialog state when opened
  const handleOpenEditDialog = () => {
    setEditName(workspaceName || "");
    setEditDescription(workspaceDescription || "");
    setEditType(workspaceType || "Public");
    setEditTags(workspaceTags || []);
    setEditTagInput("");
    setIsEditDialogOpen(true);
  };

  const handleDeleteWorkspace = async () => {
    if (!workspaceId || deleteInProgress) return;
    setDeleteInProgress(true);
    setLoading(true);
    setIsDeleteDialogOpen(false);
    onWorkspaceDeleted?.();
  };

  const handleStatusChange = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const action = workspaceStatus === "Inactive" ? "enable" : "disable";
      await ApiClient.put(`/workspaces/${workspaceId}?action=${action}`);
      toast({
        title: `Workspace ${action === "enable" ? "Activated" : "Deactivated"}`,
        description: `The workspace has been ${action === "enable" ? "activated" : "deactivated"} successfully.`,
      });
      onWorkspaceStatusChange?.(action === "enable" ? "Active" : "Inactive");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || `Failed to ${workspaceStatus === "Inactive" ? "activate" : "deactivate"} workspace.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsStatusDialogOpen(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!workspaceId || !editName.trim() || !editDescription.trim() || editTags.length === 0 || !editType.trim()) {
      toast({
        title: 'Error',
        description: 'All fields are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await updateWorkspace({
        id: workspaceId,
        body: {
          WorkspaceName: editName,
          Description: editDescription,
          Tags: editTags,
          WorkspaceType: editType,
        },
      }).unwrap();
      toast({
        title: 'Workspace Updated',
        description: 'Workspace details updated successfully.',
      });
      setIsEditDialogOpen(false);
      onWorkspaceUpdated?.();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.data?.message || err.message || 'Failed to update workspace.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Workspace Settings
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleOpenEditDialog}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setIsStatusDialogOpen(true)}
            className="text-yellow-600 focus:text-yellow-600"
          >
            <Power className="w-4 h-4 mr-2" />
            {workspaceStatus === "Inactive" ? "Activate Workspace" : "Deactivate Workspace"}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{workspaceName}"? This action cannot be undone and all data will be permanently lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteWorkspace} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{workspaceStatus === "Inactive" ? "Activate Workspace" : "Deactivate Workspace"}</DialogTitle>
            <DialogDescription>
              {workspaceStatus === "Inactive"
                ? `Are you sure you want to activate "${workspaceName}"? Users will regain access to this workspace.`
                : `Are you sure you want to deactivate "${workspaceName}"? Users will lose access to this workspace, but data will be preserved and you can reactivate it later.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleStatusChange} disabled={loading}>
              {workspaceStatus === "Inactive" ? "Activate Workspace" : "Deactivate Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Workspace Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
            <DialogDescription>
              Update your workspace details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Workspace Name</Label>
              <Input id="edit-name" value={editName} onChange={e => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea id="edit-description" value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Workspace Type</Label>
              <Select value={editType} onValueChange={setEditType}>
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
              <Label htmlFor="edit-tags">Tags</Label>
              <Input
                id="edit-tags"
                placeholder="Add a tag and press Enter or Comma"
                value={editTagInput}
                onChange={e => setEditTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
              />
              {editTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {editTags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => handleRemoveTag(tag)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveChanges} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSettings;
