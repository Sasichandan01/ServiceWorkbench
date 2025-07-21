import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const [svg, setSvg] = useState<string>("");
  const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let diagram = chart;
    if (diagram.includes("\\n")) {
      diagram = diagram.replace(/\\n/g, "\n");
    }
    mermaid.initialize({ startOnLoad: false });
    mermaid
      .render(idRef.current, diagram)
      .then(({ svg }) => setSvg(svg))
      .catch((err) => setSvg(`<pre style=\"color:red;\">${err?.message || err}</pre>`));
  }, [chart]);

  return <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
};

export default Mermaid; 