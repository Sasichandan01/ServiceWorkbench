import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, Play, Network, Database, Plus, Trash2, BarChart3 } from "lucide-react";
import ArchitectureDiagram from "./ArchitectureDiagram";
import ExecutionHistory from "./ExecutionHistory";
import CodeEditor from "./CodeEditor";
import SolutionOverviewCards from "./SolutionOverviewCards";
import { Button } from "@/components/ui/button";
import SolutionInformation from "./SolutionInformation";

interface SolutionTabsProps {
  workspaceId: string;
  solutionId: string;
  solution: any;
  isReadySolution: boolean;
  onRunSolution: () => void;
  onOpenAddDatasource: () => void;
  onDetachDatasource: (datasourceId: string) => void;
  getStatusBadgeClass: (status: string) => string;
}

const SolutionTabs = ({ 
  workspaceId, 
  solutionId, 
  solution, 
  isReadySolution, 
  onRunSolution,
  onOpenAddDatasource,
  onDetachDatasource,
  getStatusBadgeClass
}: SolutionTabsProps) => {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview" className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4" />
          <span>Overview</span>
        </TabsTrigger>
        <TabsTrigger value="codes" className="flex items-center space-x-2">
          <Code className="w-4 h-4" />
          <span>Codes</span>
        </TabsTrigger>
        <TabsTrigger value="runs" className="flex items-center space-x-2">
          <Play className="w-4 h-4" />
          <span>Runs</span>
        </TabsTrigger>
        <TabsTrigger value="architecture" className="flex items-center space-x-2">
          <Network className="w-4 h-4" />
          <span>Architecture</span>
        </TabsTrigger>
        <TabsTrigger value="datasources" className="flex items-center space-x-2">
          <Database className="w-4 h-4" />
          <span>Datasources</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <SolutionOverviewCards solutionData={solution} />
        <div className="mt-6">
          <SolutionInformation solutionData={solution} getStatusBadgeClass={getStatusBadgeClass} />
        </div>
      </TabsContent>

      <TabsContent value="codes" className="mt-6">
        <CodeEditor workspaceId={workspaceId} solutionId={solutionId} />
      </TabsContent>

      <TabsContent value="runs" className="mt-6">
        {isReadySolution ? (
          <ExecutionHistory 
            workspaceId={workspaceId} 
            solutionId={solutionId}
            onRunSolution={onRunSolution}
            isReadySolution={isReadySolution}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Execution History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Solution must be in "READY" status to view execution history.
              </div>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="architecture" className="mt-6">
        <ArchitectureDiagram />
      </TabsContent>

      <TabsContent value="datasources" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Datasources</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(solution.Datasources) && solution.Datasources.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">ID</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solution.Datasources.map((ds: any, idx: number) => (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        <td className="p-3">{ds.DatasourceName}</td>
                        <td className="p-3 font-mono text-xs">{ds.DatasourceId}</td>
                        <td className="p-3">
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => onDetachDatasource(ds.DatasourceId)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Detach
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Database className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No datasources attached to this solution.</p>
                <Button onClick={onOpenAddDatasource}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Datasource
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default SolutionTabs;