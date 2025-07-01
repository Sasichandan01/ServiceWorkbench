
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
import { Settings, Users, Database, Trash2, Power } from "lucide-react";

interface WorkspaceSettingsProps {
  workspaceName: string;
  onWorkspaceDeleted?: () => void;
  onWorkspaceDeactivated?: () => void;
}

const WorkspaceSettings = ({ workspaceName, onWorkspaceDeleted, onWorkspaceDeactivated }: WorkspaceSettingsProps) => {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);

  const handleDeleteWorkspace = () => {
    toast({
      title: "Workspace Deleted",
      description: "The workspace has been deleted successfully.",
      variant: "destructive",
    });
    setIsDeleteDialogOpen(false);
    onWorkspaceDeleted?.();
  };

  const handleDeactivateWorkspace = () => {
    toast({
      title: "Workspace Deactivated",
      description: "The workspace has been deactivated successfully.",
    });
    setIsDeactivateDialogOpen(false);
    onWorkspaceDeactivated?.();
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
          <DropdownMenuItem>
            <Users className="w-4 h-4 mr-2" />
            Manage Users
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Database className="w-4 h-4 mr-2" />
            Data Sources
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setIsDeactivateDialogOpen(true)}
            className="text-yellow-600 focus:text-yellow-600"
          >
            <Power className="w-4 h-4 mr-2" />
            Deactivate Workspace
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
            <Button variant="destructive" onClick={handleDeleteWorkspace}>
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate "{workspaceName}"? Users will lose access to this workspace, but data will be preserved and you can reactivate it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeactivateDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeactivateWorkspace}>
              Deactivate Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSettings;
