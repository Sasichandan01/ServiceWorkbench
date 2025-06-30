
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";

const ArchitectureDiagram = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Architecture Diagram</CardTitle>
        <CardDescription>Visual representation of the solution architecture</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-96 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">Architecture Diagram</p>
            <p className="text-gray-400 text-sm mt-2">Interactive diagram will be displayed here</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArchitectureDiagram;
