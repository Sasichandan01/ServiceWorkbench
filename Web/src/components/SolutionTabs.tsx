import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Code, Play, Network, Database, Plus, Trash2, BarChart3, Brain } from "lucide-react";
import ArchitectureDiagram from "./ArchitectureDiagram";
import ExecutionHistory from "./ExecutionHistory";
import CodeEditor from "./CodeEditor";
import SolutionOverviewCards from "./SolutionOverviewCards";
import SolutionInformation from "./SolutionInformation";
import { Button } from "@/components/ui/button";
import AISolutionGenerator from "./AISolutionGenerator";

interface SolutionTabsProps {
  workspaceId: string;
  solutionId: string;
  solution: any;
  isReadySolution: boolean;
  onRunSolution: () => void;
  onOpenAddDatasource: () => void;
  onDetachDatasource: (datasourceId: string) => void;
  getStatusBadgeClass: (status: string) => string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isNewSolution?: boolean;
  onGenerateSolution?: () => void;
  preloadedCodeFiles?: any;
  loadingCodeFiles?: boolean;
  renderUsersTab?: () => React.ReactNode;
}

const SolutionTabs = ({ 
  workspaceId, 
  solutionId, 
  solution, 
  isReadySolution, 
  onRunSolution,
  onOpenAddDatasource,
  onDetachDatasource,
  getStatusBadgeClass,
  activeTab,
  onTabChange,
  isNewSolution = false,
  onGenerateSolution,
  preloadedCodeFiles,
  loadingCodeFiles,
  renderUsersTab
}: SolutionTabsProps) => {
  return (
    <>
      <Tabs 
        value={activeTab || "overview"} 
        onValueChange={onTabChange}
        className="w-full"
      >
        <TabsList className={`grid w-full ${isNewSolution ? 'grid-cols-2' : 'grid-cols-6'}`}>
          <TabsTrigger value="overview" className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4" />
            <span>Overview</span>
          </TabsTrigger>
          {!isNewSolution && (
            <TabsTrigger value="codes" className="flex items-center space-x-2">
              <Code className="w-4 h-4" />
              <span>Codes</span>
            </TabsTrigger>
          )}
          {!isNewSolution && (
            <TabsTrigger value="runs" className="flex items-center space-x-2">
              <Play className="w-4 h-4" />
              <span>Runs</span>
            </TabsTrigger>
          )}
          {!isNewSolution && (
            <TabsTrigger value="architecture" className="flex items-center space-x-2">
              <Network className="w-4 h-4" />
              <span>Architecture</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="datasources" className="flex items-center space-x-2">
            <Database className="w-4 h-4" />
            <span>Datasources</span>
          </TabsTrigger>
          {isReadySolution && (
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Users</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <SolutionOverviewCards solutionData={solution} solutionId={solutionId} />
          <SolutionInformation solutionData={solution} getStatusBadgeClass={getStatusBadgeClass} />
        </TabsContent>

        {!isNewSolution && (
          <TabsContent value="codes" className="mt-6">
            {loadingCodeFiles ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading code files...</p>
                </div>
              </div>
            ) : (
              <CodeEditor 
                workspaceId={workspaceId} 
                solutionId={solutionId} 
                preloadedCodeFiles={preloadedCodeFiles}
              />
            )}
          </TabsContent>
        )}

        {!isNewSolution && (
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
        )}

        {!isNewSolution && (
          <TabsContent value="architecture" className="mt-6">
            <ArchitectureDiagram />
          </TabsContent>
        )}

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
        {isReadySolution && (
          <TabsContent value="users" className="mt-6">
            {renderUsersTab && renderUsersTab()}
          </TabsContent>
        )}
      </Tabs>
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
            <Button onClick={onGenerateSolution} size="lg" className="bg-purple-600 hover:bg-purple-700">
              <Brain className="w-5 h-5 mr-2" />
              Start AI Generation
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </>
  );
};

export default SolutionTabs;