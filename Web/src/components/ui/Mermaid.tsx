import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let diagram = chart;
    if (diagram.includes("\\n")) {
      diagram = diagram.replace(/\\n/g, "\n");
    }
    
    setError(null); // Clear previous errors
    
    mermaid.initialize({ startOnLoad: false });
    mermaid
      .render(idRef.current, diagram)
      .then(({ svg }) => {
        setSvg(svg);
        setError(null);
      })
      .catch((err) => {
        const errorMessage = err?.message || err || "Unknown diagram error";
        setError(errorMessage);
        setSvg(""); // Clear SVG on error
      });
  }, [chart]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 border-2 border-dashed border-red-200 rounded-lg p-4">
        <div className="text-center">
          <div className="text-red-600 font-medium mb-2">Diagram Error</div>
          <div className="text-sm text-gray-600 max-w-md">
            {error.includes("Parse error") 
              ? "The diagram contains syntax errors and cannot be displayed."
              : error}
          </div>
        </div>
      </div>
    );
  }

  return <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
};

export default Mermaid; 