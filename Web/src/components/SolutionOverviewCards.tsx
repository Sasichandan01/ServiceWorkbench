
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Database } from "lucide-react";

interface SolutionData {
  totalRuns: number;
  version: string;
}

interface SolutionOverviewCardsProps {
  solutionData: SolutionData;
}

const SolutionOverviewCards = ({ solutionData }: SolutionOverviewCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{solutionData.totalRuns}</p>
              <p className="text-sm text-gray-600">Total Runs</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <Database className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{solutionData.version}</p>
              <p className="text-sm text-gray-600">Version</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SolutionOverviewCards;
