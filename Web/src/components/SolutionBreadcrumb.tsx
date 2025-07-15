
import { 
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage
} from "@/components/ui/breadcrumb";
import { Link } from "react-router-dom";

interface SolutionBreadcrumbProps {
  workspaceName: string;
  workspaceId: string | undefined;
  solutionName: string;
  solutionId?: string;
  extra?: string;
}

const SolutionBreadcrumb = ({ workspaceName, workspaceId, solutionName, solutionId, extra }: SolutionBreadcrumbProps) => {
  // Fallbacks for loading state
  const displayWorkspaceName = workspaceName && workspaceName.trim() ? workspaceName : 'Loading...';
  const displaySolutionName = solutionName && solutionName.trim() ? solutionName : 'Loading...';
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/workspaces">Workspaces</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to={`/workspaces/${workspaceId}`}>{displayWorkspaceName}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {extra ? (
            <BreadcrumbLink asChild>
              <Link to={`/workspaces/${workspaceId}/solutions/${solutionId}`}>{displaySolutionName}</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{displaySolutionName}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {extra && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbPage>{extra}</BreadcrumbPage>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default SolutionBreadcrumb;
