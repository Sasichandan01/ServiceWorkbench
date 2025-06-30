
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import WorkspaceBreadcrumb from "@/components/WorkspaceBreadcrumb";
import AISolutionGenerator from "@/components/AISolutionGenerator";
import { ArrowLeft, Save, Wand2 } from "lucide-react";

const CreateSolution = () => {
  const { id } = useParams(); // workspace id
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [solutionName, setSolutionName] = useState("");
  const [solutionDescription, setSolutionDescription] = useState("");
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  // Mock workspace data - in a real app, this would come from an API
  const workspaceName = "Analytics Team"; // This would be fetched based on workspace id

  const handleSaveSolution = () => {
    if (!solutionName.trim()) {
      toast({
        title: "Error",
        description: "Solution name is required.",
        variant: "destructive",
      });
      return;
    }

    // Here you would save the solution to your backend
    toast({
      title: "Success",
      description: "Solution created successfully!",
    });
    
    // Navigate back to workspace details
    navigate(`/workspaces/${id}`);
  };

  const handleGoBack = () => {
    navigate(`/workspaces/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2">
        <WorkspaceBreadcrumb workspaceName={workspaceName} />
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">Create Solution</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={handleGoBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Workspace
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create New Solution</h1>
            <p className="text-gray-600 mt-1">Define your solution and use AI to generate implementation details</p>
          </div>
        </div>
      </div>

      {/* Solution Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Solution Overview</CardTitle>
          <CardDescription>
            Provide basic information about your solution
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="solution-name">
              Solution Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="solution-name"
              placeholder="Enter solution name (e.g., Customer Churn Prediction)"
              value={solutionName}
              onChange={(e) => setSolutionName(e.target.value)}
              className="text-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="solution-description">
              Description
            </Label>
            <Textarea
              id="solution-description"
              placeholder="Describe what this solution aims to achieve, the problem it solves, and its expected outcomes..."
              value={solutionDescription}
              onChange={(e) => setSolutionDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex items-center space-x-4 pt-4">
            <Button onClick={handleSaveSolution} size="lg">
              <Save className="w-4 h-4 mr-2" />
              Save Solution
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => setShowAIGenerator(true)}
              disabled={!solutionName.trim()}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Generate with AI
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Solution Generator */}
      {showAIGenerator && (
        <AISolutionGenerator 
          solutionName={solutionName}
          solutionDescription={solutionDescription}
          onClose={() => setShowAIGenerator(false)}
        />
      )}
    </div>
  );
};

export default CreateSolution;
