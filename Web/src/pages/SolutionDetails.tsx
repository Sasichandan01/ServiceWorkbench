
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import SolutionBreadcrumb from "@/components/SolutionBreadcrumb";
import SolutionOverviewCards from "@/components/SolutionOverviewCards";
import SolutionInformation from "@/components/SolutionInformation";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import RunHistory from "@/components/RunHistory";
import { Play, Brain } from "lucide-react";

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

  // Mock solution data - in a real app, this would come from an API
  const solutionData = {
    id: solutionId,
    name: "Customer Segmentation",
    description: "Advanced ML model for customer segmentation based on behavioral patterns and purchase history",
    type: "ML Model",
    status: "Development",
    owner: "Sarah Chen",
    created: "2024-01-15",
    lastModified: "Just now",
    version: "v1.0.0",
    totalRuns: 0,
  };

  const workspaceName = "Analytics Team";

  // Mock run history data - empty for new solution
  const [allRunHistory] = useState<RunHistoryItem[]>([]);

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

  const isNewSolution = solutionData.totalRuns === 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <SolutionBreadcrumb 
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        solutionName={solutionData.name}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{solutionData.name}</h1>
          <p className="text-gray-600 mt-1">{solutionData.description}</p>
        </div>
        <div className="flex items-center space-x-3">
          {isNewSolution && (
            <Button onClick={handleGenerateSolution} variant="outline">
              <Brain className="w-4 h-4 mr-2" />
              Generate Solution
            </Button>
          )}
          <Button onClick={handleRunSolution} disabled={isNewSolution}>
            <Play className="w-4 h-4 mr-2" />
            Run Solution
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <SolutionOverviewCards solutionData={solutionData} />

      {/* Solution Information */}
      <SolutionInformation solutionData={solutionData} getStatusBadgeClass={getStatusBadgeClass} />

      {/* Architecture Diagram - only show if not a new solution */}
      {!isNewSolution && <ArchitectureDiagram />}

      {/* Run History - only show if not a new solution */}
      {!isNewSolution && <RunHistory allRunHistory={allRunHistory} getStatusBadgeClass={getStatusBadgeClass} />}

      {/* Generate Solution Card - show for new solutions */}
      {isNewSolution && (
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
    </div>
  );
};

export default SolutionDetails;
