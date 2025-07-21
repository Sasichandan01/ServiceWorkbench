
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";
import Mermaid from "./ui/Mermaid";

const diagram = `graph TD\n    A[Sales Team] -->|Upload Daily CSV| B[S3 Input Bucket]\n    B -->|Trigger| C[Lambda Validator]\n    C -->|Start Workflow| D[Step Functions Orchestrator]\n    D -->|Run ETL Job| E[Glue ETL Job]\n    E -->|Read Data| B\n    E -->|Clean & Process| F[S3 Processing Bucket]\n    E -->|Calculate Totals| G[S3 Output Bucket]\n    G -->|Access Reports| H[Reporting Team]\n\n    subgraph \"Error Handling\"\n    D -->|Failure| I[Lambda Error Handler]\n    I -->|Notification| J[Admin]\n    end\n\n    classDef s3 fill:#569A31,color:#fff,stroke:#3d6c23,stroke-width:2px\n    classDef lambda fill:#ff9900,color:#fff,stroke:#c77600,stroke-width:2px\n    classDef stepfunctions fill:#1D4ED8,color:#fff,stroke:#1e3a8a,stroke-width:2px\n    classDef glue fill:#6b21a8,color:#fff,stroke:#4c1d95,stroke-width:2px\n    classDef team fill:#facc15,color:#000,stroke:#b45309,stroke-width:2px\n    classDef error fill:#dc2626,color:#fff,stroke:#991b1b,stroke-width:2px\n\n    class B,F,G s3\n    class C,I lambda\n    class D stepfunctions\n    class E glue\n    class A,H,J team\n    class I error`;

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
