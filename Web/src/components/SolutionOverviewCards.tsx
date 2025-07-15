
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Database } from "lucide-react";

interface SolutionData {
  Cost?: string;
  totalRuns?: number;
  version?: string;
  Tags?: string[];
}

interface SolutionOverviewCardsProps {
  solutionData: SolutionData;
}

const SolutionOverviewCards = ({ solutionData }: SolutionOverviewCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{solutionData.Cost || 'N/A'}</p>
              <p className="text-sm text-gray-600">Cost</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{solutionData.totalRuns ?? 'N/A'}</p>
              <p className="text-sm text-gray-600">Runs</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <Database className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{solutionData.version || 'N/A'}</p>
              <p className="text-sm text-gray-600">Version</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div>
            <p className="text-sm text-gray-600 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1">
              {Array.isArray(solutionData.Tags) && solutionData.Tags.length > 0 ? (
                solutionData.Tags.map((tag: string, idx: number) => (
                  <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full border border-blue-200">{tag}</span>
                ))
              ) : (
                <span className="text-gray-400 text-xs">No tags</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SolutionOverviewCards;
