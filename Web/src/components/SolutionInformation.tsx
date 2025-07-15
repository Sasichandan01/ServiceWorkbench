
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";

interface SolutionData {
  CreatedBy: string;
  CreationTime: string;
  LastUpdatedBy: string;
  LastUpdationTime: string;
}

interface SolutionInformationProps {
  solutionData: SolutionData;
  getStatusBadgeClass: (status: string) => string;
}

const SolutionInformation = ({ solutionData }: SolutionInformationProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Solution Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-medium text-gray-700">Created By</label>
            <p className="mt-1 text-gray-900">{solutionData.CreatedBy}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Last Updated By</label>
            <p className="mt-1 text-gray-900">{solutionData.LastUpdatedBy}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Created At</label>
            <p className="mt-1 text-gray-900">{solutionData.CreationTime}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Last Updated At</label>
            <p className="mt-1 text-gray-900">{solutionData.LastUpdationTime}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SolutionInformation;

