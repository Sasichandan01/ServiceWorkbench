
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";
import Mermaid from "./ui/Mermaid";

const diagram = `graph TD\n    A[CSV File Upload] -->|Trigger| B[S3 Input Bucket]\n    B -->|Invoke| C[Lambda Trigger]\n    C -->|Start| D[Step Functions Workflow]\n    D -->|Execute| E[Glue ETL Job]\n    E -->|Read| B\n    E -->|Write| F[S3 Output Bucket]\n    D -->|On Completion| G[SNS Notification]\n    D -->|On Failure| H[SNS Error Notification]\n\n    classDef s3 fill:#569A31,color:#fff,stroke:#3d6c23,stroke-width:2px\n    classDef lambda fill:#ff9900,color:#fff,stroke:#c77600,stroke-width:2px\n    classDef stepfunctions fill:#1D4ED8,color:#fff,stroke:#1e3a8a,stroke-width:2px\n    classDef glue fill:#6b21a8,color:#fff,stroke:#4c1d95,stroke-width:2px\n    classDef sns fill:#facc15,color:#000,stroke:#b45309,stroke-width:2px\n    classDef error fill:#dc2626,color:#fff,stroke:#991b1b,stroke-width:2px\n\n    class B,F s3\n    class C lambda\n    class D stepfunctions\n    class E glue\n    class G,H sns\n    class H error`;

const ArchitectureDiagram = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Architecture Diagram</CardTitle>
        <CardDescription>Visual representation of the solution architecture</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full max-h-[70vh] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg overflow-auto">
          <Mermaid chart={diagram} />
        </div>
      </CardContent>
    </Card>
  );
};

export default ArchitectureDiagram;
