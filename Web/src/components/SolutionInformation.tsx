
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";

interface SolutionData {
  owner: string;
  status: string;
  created: string;
  lastModified: string;
}

interface SolutionInformationProps {
  solutionData: SolutionData;
  getStatusBadgeClass: (status: string) => string;
}

const SolutionInformation = ({ solutionData, getStatusBadgeClass }: SolutionInformationProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Solution Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="text-sm font-medium text-gray-700">Owner</label>
            <p className="mt-1 text-gray-900">{solutionData.owner}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Status</label>
            <div className="mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(solutionData.status)}`}>
                {solutionData.status}
              </span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Created</label>
            <div className="mt-1 flex items-center space-x-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <p className="text-gray-900">{solutionData.created}</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Last Modified</label>
            <div className="mt-1 flex items-center space-x-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <p className="text-gray-900">{solutionData.lastModified}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SolutionInformation;
