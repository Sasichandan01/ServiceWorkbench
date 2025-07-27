
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Database, Loader2 } from "lucide-react";
import { CostService } from "@/services/costService";

interface SolutionData {
  Cost?: string;
  totalRuns?: number;
  version?: string;
  Tags?: string[];
  SolutionId?: string;
}

interface SolutionOverviewCardsProps {
  solutionData: SolutionData;
  solutionId?: string;
}

const SolutionOverviewCards = ({ solutionData, solutionId }: SolutionOverviewCardsProps) => {
  const [solutionCost, setSolutionCost] = useState<number>(0);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState<string | null>(null);

  // Fetch solution cost data
  const fetchSolutionCost = async () => {
    if (!solutionId) {
      setCostLoading(false);
      return;
    }

    try {
      setCostLoading(true);
      setCostError(null);
      const response = await CostService.getCostBySolutionId(solutionId);
      setSolutionCost(response.cost);
    } catch (err: any) {
      console.error('Error fetching solution cost:', err);
      setCostError(err.message || 'Failed to fetch cost data');
      setSolutionCost(0);
    } finally {
      setCostLoading(false);
    }
  };

  useEffect(() => {
    fetchSolutionCost();
  }, [solutionId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {costLoading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : costError ? (
                  <span className="text-red-600">Error</span>
                ) : (
                  `$${solutionCost.toLocaleString()}`
                )}
              </p>
              <p className="text-sm text-gray-600">Cost</p>
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
                solutionData.Tags.map((tag: any, idx: number) => (
                  <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full border border-blue-200">
                    {typeof tag === 'string' ? tag : tag?.Value || tag?.Key || 'Unknown'}
                  </span>
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
