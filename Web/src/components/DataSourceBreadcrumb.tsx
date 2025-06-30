
import { Link, useParams } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface DataSourceBreadcrumbProps {
  dataSourceName?: string;
}

const DataSourceBreadcrumb = ({ dataSourceName }: DataSourceBreadcrumbProps) => {
  const { id } = useParams();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/data-sources">Data Sources</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {id && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{dataSourceName || `Data Source ${id}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default DataSourceBreadcrumb;
