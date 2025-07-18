
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import SolutionBreadcrumb from "@/components/SolutionBreadcrumb";
import SolutionOverviewCards from "@/components/SolutionOverviewCards";
import SolutionInformation from "@/components/SolutionInformation";
import SolutionTabs from "@/components/SolutionTabs";
import { Play, Brain, Trash2, Plus } from "lucide-react";
import { SolutionService } from "../services/solutionService";
import { WorkspaceService } from "../services/workspaceService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatasourceService } from "../services/datasourceService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface RunHistoryItem {
  id: number;
  runId: string;
  status: string;
  startTime: string;
  duration: string;
  triggeredBy: string;
  type: string;
}

const SolutionDetails = () => {
  const { workspaceId, solutionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [solution, setSolution] = useState<any>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editDatasources, setEditDatasources] = useState<string[]>([]);
  const [allDatasources, setAllDatasources] = useState<any[]>([]);
  const [datasourcePopoverOpen, setDatasourcePopoverOpen] = useState(false);
  const [addDatasourceDialogOpen, setAddDatasourceDialogOpen] = useState(false);
  const [selectedDatasources, setSelectedDatasources] = useState<string[]>([]);
  const [addingDatasource, setAddingDatasource] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch solution and workspace name on mount
  useEffect(() => {
    if (!workspaceId || !solutionId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      SolutionService.getSolution(workspaceId, solutionId),
      WorkspaceService.getWorkspace(workspaceId)
    ])
      .then(([solutionData, workspaceData]) => {
        setSolution(solutionData);
        setWorkspaceName(workspaceData.WorkspaceName);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load solution details.");
        setLoading(false);
      });
  }, [workspaceId, solutionId]);

  useEffect(() => {
    if (!datasourcePopoverOpen) return;
    DatasourceService.getDatasources({ limit: 50 }).then(res => {
      setAllDatasources(res.Datasources || []);
    });
  }, [datasourcePopoverOpen]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading solution details...</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }
  if (!solution) {
    return <div className="p-8 text-center text-gray-500">Solution not found.</div>;
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Success": return "bg-green-100 text-green-800 border-green-200";
      case "Failed": return "bg-red-100 text-red-800 border-red-200";
      case "Running": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Active": return "bg-green-100 text-green-800 border-green-200";
      case "Development": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const handleRunSolution = () => {
    toast({
      title: "Solution Started",
      description: "Solution execution has been initiated successfully.",
    });
  };

  const handleGenerateSolution = () => {
    navigate(`/workspaces/${workspaceId}/solutions/${solutionId}/ai-generator`);
  };

  // Determine if the solution is new based on SolutionsStatus
  const isNewSolution = solution.SolutionsStatus === "YET_TO_BE_PREPARED" || solution.SolutionsStatus === "DRAFT";
  const isReadySolution = solution.SolutionsStatus === "READY";

  // Handler to open add datasource dialog
  const handleOpenAddDatasource = () => {
    setAddingDatasource(true);
    DatasourceService.getDatasources({ limit: 50 }).then(res => {
      setAllDatasources(res.Datasources || []);
      setSelectedDatasources([]);
    }).finally(() => setAddingDatasource(false));
    setAddDatasourceDialogOpen(true);
  };

  // Handler to attach datasources
  const handleAttachDatasources = async () => {
    if (!workspaceId || !solutionId) return;
    try {
      await SolutionService.updateSolutionDatasources(workspaceId, solutionId, selectedDatasources);
      toast({ title: "Datasources Added", description: "Datasources attached to solution." });
      setAddDatasourceDialogOpen(false);
      // Refresh solution details
      const updated = await SolutionService.getSolution(workspaceId, solutionId);
      setSolution(updated);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to add datasources.", variant: "destructive" });
    }
  };

  // Handler to detach a datasource
  const handleDetachDatasource = async (datasourceId: string) => {
    if (!workspaceId || !solutionId) return;
    try {
      const remaining = (solution.Datasources || []).filter((ds: any) => ds.DatasourceId !== datasourceId).map((ds: any) => ds.DatasourceId);
      await SolutionService.updateSolutionDatasources(workspaceId, solutionId, remaining);
      toast({ title: "Datasource Detached", description: "Datasource removed from solution." });
      // Refresh solution details
      const updated = await SolutionService.getSolution(workspaceId, solutionId);
      setSolution(updated);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to detach datasource.", variant: "destructive" });
    }
  };

  // Handler to open edit dialog
  const handleOpenEditDialog = () => {
    setEditName(solution.SolutionName || "");
    setEditDescription(solution.Description || "");
    setEditTags(Array.isArray(solution.Tags) ? solution.Tags : (solution.Tags ? [solution.Tags] : []));
    setEditTagInput("");
    setEditDialogOpen(true);
  };

  // Handler to save edit details
  const handleEditSave = async () => {
    if (!workspaceId || !solutionId) return;
    try {
      await SolutionService.updateSolution(workspaceId, solutionId, {
        SolutionName: editName,
        Description: editDescription,
        Tags: editTags,
        Datasources: Array.isArray(solution.Datasources) ? solution.Datasources.map((ds: any) => ds.DatasourceId) : [],
      });
      toast({ title: "Success", description: "Solution details updated." });
      setEditDialogOpen(false);
      // Refresh solution details
      const updated = await SolutionService.getSolution(workspaceId, solutionId);
      setSolution(updated);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Handler to delete solution
  const handleDeleteSolution = async () => {
    if (!workspaceId || !solutionId) return;
    try {
      await SolutionService.deleteSolution(workspaceId, solutionId);
      toast({ title: "Solution Deleted", description: "The solution has been deleted." });
      navigate(`/workspaces/${workspaceId}`);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete solution.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <SolutionBreadcrumb 
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        solutionName={solution.SolutionName}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{solution.SolutionName}</h1>
          <p className="text-gray-600 mt-1">{solution.Description}</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={handleOpenEditDialog}>Edit Details</Button>
          {/* Delete Solution Button */}
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Solution
          </Button>
        </div>
      </div>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Solution</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this solution? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSolution}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Solution Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Solution Details</DialogTitle>
            <DialogDescription>Update the solution name, description, and tags.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-solution-name">Solution Name</Label>
              <Input id="edit-solution-name" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-solution-description">Description</Label>
              <Textarea id="edit-solution-description" value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag and press Enter"
                  value={editTagInput}
                  onChange={e => setEditTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && editTagInput.trim()) {
                      e.preventDefault();
                      if (!editTags.includes(editTagInput.trim())) {
                        setEditTags([...editTags, editTagInput.trim()]);
                      }
                      setEditTagInput("");
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (editTagInput.trim() && !editTags.includes(editTagInput.trim())) {
                      setEditTags([...editTags, editTagInput.trim()]);
                    }
                    setEditTagInput("");
                  }}
                  variant="outline"
                  size="sm"
                >
                  Add
                </Button>
              </div>
              {editTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {editTags.map((tag, idx) => (
                    <span key={idx} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs flex items-center gap-1">
                      {tag}
                      <button
                        type="button"
                        className="ml-1 text-blue-600 hover:text-red-600"
                        onClick={() => setEditTags(editTags.filter(t => t !== tag))}
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
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overview Cards */}
      {/* <SolutionOverviewCards solutionData={solution} /> */}

      {/* Solution Information */}
      {/* <SolutionInformation solutionData={solution} getStatusBadgeClass={getStatusBadgeClass} /> */}

      {/* Solution Tabs */}
      {!isNewSolution ? (
        <SolutionTabs
          workspaceId={workspaceId!}
          solutionId={solutionId!}
          solution={solution}
          isReadySolution={isReadySolution}
          onRunSolution={handleRunSolution}
          onOpenAddDatasource={handleOpenAddDatasource}
          onDetachDatasource={handleDetachDatasource}
          getStatusBadgeClass={getStatusBadgeClass} // Pass this down for SolutionInformation
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="w-6 h-6 text-purple-600" />
              <span>Generate Your Solution</span>
            </CardTitle>
            <CardDescription>
              Use AI to generate architecture, code, and implementation details for your solution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to build your solution?</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Describe your requirements and let AI generate a comprehensive solution with architecture diagrams, code examples, and implementation guidance.
              </p>
              <Button onClick={handleGenerateSolution} size="lg" className="bg-purple-600 hover:bg-purple-700">
                <Brain className="w-5 h-5 mr-2" />
                Start AI Generation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Datasource Dialog */}
      <Dialog open={addDatasourceDialogOpen} onOpenChange={setAddDatasourceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Datasources</DialogTitle>
            <DialogDescription>Select datasources to attach to this solution.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto py-2">
            {addingDatasource ? (
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
            <Button variant="outline" onClick={() => setAddDatasourceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAttachDatasources} disabled={selectedDatasources.length === 0}>
              Add Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resources Table */}
      {Array.isArray(solution.Resources) && solution.Resources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">ARN</th>
                  </tr>
                </thead>
                <tbody>
                  {solution.Resources.map((res: any, idx: number) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-3">{res.ResourceType}</td>
                      <td className="p-3">{res.ResourceName}</td>
                      <td className="p-3 break-all font-mono text-xs">{res.ResourceArn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SolutionDetails;
