
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";
import Mermaid from "./ui/Mermaid";

const diagram = `graph TD
    A[User] -->|Invoke| D[Glue ETL Job]
    D -->|Read| E[S3 Input Bucket]
    D -->|Write| E
    D -->|Send Completion Status| A
    subgraph "Data Processing"
    D -->|1. Clean Data| D1[Clean Data]
    D1 -->|2. Calculate Returns| D2[Calculate Returns]
    D2 -->|3. Compute SMA| D3[Compute SMA]
    end
    classDef s3 fill:#569A31,color:#fff,stroke:#3d6c23,stroke-width:2px
    classDef lambda fill:#ff9900,color:#fff,stroke:#c77600,stroke-width:2px
    classDef stepfunctions fill:#1D4ED8,color:#fff,stroke:#1e3a8a,stroke-width:2px
    classDef glue fill:#6b21a8,color:#fff,stroke:#4c1d95,stroke-width:2px
    classDef user fill:#facc15,color:#000,stroke:#b45309,stroke-width:2px
    class E s3
    class D,D1,D2,D3 glue
    class A user`;

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
