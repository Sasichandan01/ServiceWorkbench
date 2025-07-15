import { useState, useEffect } from "react";
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
import { Settings, Edit, Database, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatasourceService } from "../services/datasourceService";
import { ApiClient } from "../lib/apiClient";

interface SolutionSettingsProps {
  workspaceId: string;
  solutionId: string;
  solutionName: string;
  solutionDescription: string;
  solutionTags: string[];
  currentDatasources: string[];
  onSolutionUpdated?: () => void;
}

const SolutionSettings = ({ workspaceId, solutionId, solutionName, solutionDescription, solutionTags, currentDatasources, onSolutionUpdated }: SolutionSettingsProps) => {
  const { toast } = useToast();
  // Edit Details dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(solutionName || "");
  const [editDescription, setEditDescription] = useState(solutionDescription || "");
  const [editTagInput, setEditTagInput] = useState("");
  const [editTags, setEditTags] = useState<string[]>(solutionTags || []);
  // Manage Datasources dialog state
  const [isDatasourceDialogOpen, setIsDatasourceDialogOpen] = useState(false);
  const [allDatasources, setAllDatasources] = useState<any[]>([]);
  const [selectedDatasources, setSelectedDatasources] = useState<string[]>(currentDatasources || []);
  const [loadingDatasources, setLoadingDatasources] = useState(false);
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
    setEditName(solutionName || "");
    setEditDescription(solutionDescription || "");
    setEditTags(solutionTags || []);
    setEditTagInput("");
    setIsEditDialogOpen(true);
  };
  const handleOpenDatasourceDialog = () => {
    setLoadingDatasources(true);
    DatasourceService.getDatasources({ limit: 50 }).then(res => {
      setAllDatasources(res.Datasources || []);
      setSelectedDatasources(currentDatasources || []);
    }).finally(() => setLoadingDatasources(false));
    setIsDatasourceDialogOpen(true);
  };
  // Edit Details API call
  const handleSaveEditDetails = async () => {
    try {
      await ApiClient.put(`/workspaces/${workspaceId}/solutions/${solutionId}`, {
        SolutionName: editName,
        Description: editDescription,
        Tags: editTags,
      });
      toast({ title: "Solution Updated", description: "Solution details updated successfully." });
      setIsEditDialogOpen(false);
      onSolutionUpdated?.();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update solution.", variant: "destructive" });
    }
  };
  // Manage Datasources API call
  const handleSaveDatasources = async () => {
    try {
      await ApiClient.put(`/workspaces/${workspaceId}/solutions/${solutionId}?action=datasource`, {
        Datasources: selectedDatasources,
      });
      toast({ title: "Datasources Updated", description: "Solution datasources updated successfully." });
      setIsDatasourceDialogOpen(false);
      onSolutionUpdated?.();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update datasources.", variant: "destructive" });
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Solution Settings
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleOpenEditDialog}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleOpenDatasourceDialog}>
            <Database className="w-4 h-4 mr-2" />
            Manage Datasources
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Edit Details Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Solution Details</DialogTitle>
            <DialogDescription>Update the solution name, description, and tags.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-solution-name">Solution Name</Label>
              <Input id="edit-solution-name" value={editName} onChange={e => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-solution-description">Description</Label>
              <Textarea id="edit-solution-description" value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} required />
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
            <Button onClick={handleSaveEditDetails}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Manage Datasources Dialog */}
      <Dialog open={isDatasourceDialogOpen} onOpenChange={setIsDatasourceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Datasources</DialogTitle>
            <DialogDescription>Select datasources to associate with this solution.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto py-2">
            {loadingDatasources ? (
              <div className="text-center text-gray-500">Loading datasources...</div>
            ) : (
              allDatasources.map((ds: any) => (
                <div key={ds.DatasourceId} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id={`ds-${ds.DatasourceId}`}
                    checked={selectedDatasources.includes(ds.DatasourceId)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedDatasources(prev => [...prev, ds.DatasourceId]);
                      } else {
                        setSelectedDatasources(prev => prev.filter(id => id !== ds.DatasourceId));
                      }
                    }}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">{ds.DatasourceName}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.isArray(ds.Tags) && ds.Tags.length > 0 ? (
                        ds.Tags.map((tag: string, idx: number) => (
                          <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full border border-blue-200">{tag}</span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-xs">No tags</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDatasourceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDatasources}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SolutionSettings; 