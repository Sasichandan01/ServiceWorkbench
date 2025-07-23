
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createWebSocketClient } from "@/lib/websocketClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  Bot, 
  User, 
  Copy, 
  Download, 
  Sparkles,
  X,
  Loader2,
  ChevronDown,
  ChevronRight
} from "lucide-react";

interface ThinkingStep {
  id: string;
  content: string;
  timestamp: Date;
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  thinking?: ThinkingStep[];
  isCompleted?: boolean;
}

interface AISolutionGeneratorProps {
  solutionName: string;
  solutionDescription: string;
  onClose: () => void;
}

const AISolutionGenerator = ({ solutionName, solutionDescription, onClose }: AISolutionGeneratorProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentThinking, setCurrentThinking] = useState<ThinkingStep[]>([]);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Initial AI greeting
    const initialMessage: Message = {
      id: "initial",
      type: 'ai',
      content: `Hello! I'm your AI solution assistant. I can see you're working on "${solutionName}". ${solutionDescription ? `Based on your description: "${solutionDescription}", ` : ''}I'm here to help you generate implementation details, suggest architectures, create code snippets, and provide guidance for your solution. What would you like to explore first?`,
      timestamp: new Date()
    };
    setMessages([initialMessage]);
  }, [solutionName, solutionDescription]);

  const processWebSocketMessage = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      const messageType = Object.keys(parsed)[0];
      const content = parsed[messageType];
      const metadata = parsed.metadata || {};

      if (messageType === "AITrace") {
        // Add to current thinking
        const thinkingStep: ThinkingStep = {
          id: Date.now().toString(),
          content: content,
          timestamp: new Date()
        };
        setCurrentThinking(prev => [...prev, thinkingStep]);
      } else if (messageType === "AIMessage") {
        // Final AI response
        const aiResponse: Message = {
          id: Date.now().toString(),
          type: 'ai',
          content: content,
          timestamp: new Date(),
          thinking: currentThinking.length > 0 ? [...currentThinking] : undefined,
          isCompleted: metadata.isCompleted
        };
        setMessages(prev => [...prev, aiResponse]);
        setCurrentThinking([]);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    setCurrentThinking([]);

    // Simulate WebSocket responses for demo
    simulateWebSocketResponse(inputMessage);
  };

  const simulateWebSocketResponse = (userInput: string) => {
    // Simulate real WebSocket message format as shown in the user's image
    // First, simulate the initial "Generating..." trace
    setTimeout(() => {
      processWebSocketMessage(JSON.stringify({
        "AITrace": "Generating...",
        "metadata": { "isCompleted": false }
      }));
    }, 300);

    // Then simulate thinking steps
    const thinkingSteps = [
      "Outlining The Requirements",
      "I'm currently focused on defining the initial scope. I need to figure out a processing method for these daily CSV files, which are about 10MB each and contain customer transaction data, for the sales team.",
      "Clarifying the Objectives", 
      "I'm now fully immersed in the details of the problem statement. The sales team needs a streamlined way to analyze daily CSV files containing customer transactions. My initial plan involves cleaning the data, calculating daily totals, and presenting the results in a user-friendly format for reporting. Cost-effectiveness is a primary driver. I'm leaning toward a serverless approach for its flexibility and affordability, particularly for the relatively small daily data volume.",
      "Mapping Out The Architecture",
      "I've been mapping out the solution's architecture. I'm focusing on a cost-effective, serverless design using object storage (S3) for raw files and results, alongside a serverless function (Lambda) for processing. The function will clean and aggregate the data. Initial output will be formatted reports, likely CSV or JSON, stored back in S3 for easy access by the sales team."
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < thinkingSteps.length) {
        processWebSocketMessage(JSON.stringify({
          "AITrace": thinkingSteps[stepIndex],
          "metadata": { "isCompleted": false }
        }));
        stepIndex++;
      } else {
        clearInterval(interval);
        // Send final response
        setTimeout(() => {
          processWebSocketMessage(JSON.stringify({
            "AIMessage": generateAIResponse(userInput, solutionName, solutionDescription),
            "metadata": { "isCompleted": true }
          }));
        }, 500);
      }
    }, 800);
  };

  const generateAIResponse = (userInput: string, solName: string, solDesc: string): string => {
    // This is a mock AI response generator
    // In a real application, you'd integrate with OpenAI, Anthropic, or similar services
    const responses = [
      `For your ${solName} solution, I recommend starting with a machine learning approach using Python and scikit-learn. Here's a high-level architecture:

1. **Data Collection Layer**: Gather customer interaction data, transaction history, and behavioral metrics
2. **Feature Engineering**: Create relevant features like recency, frequency, monetary value (RFM)
3. **Model Training**: Use Random Forest or Gradient Boosting for initial baseline
4. **Prediction Pipeline**: Real-time scoring system for new customers
5. **Monitoring Dashboard**: Track model performance and business metrics

Would you like me to elaborate on any of these components or provide code examples?`,

      `Based on your query about ${solName}, here are some key considerations:

**Technical Stack Recommendations:**
- **Backend**: Python/FastAPI or Node.js/Express
- **Database**: PostgreSQL for structured data, Redis for caching
- **ML Framework**: TensorFlow/Keras or PyTorch
- **Deployment**: Docker containers on AWS/GCP
- **Monitoring**: MLflow for model tracking, Grafana for metrics

**Implementation Steps:**
1. Data preprocessing and validation
2. Exploratory data analysis
3. Feature selection and engineering
4. Model training and validation
5. API development for predictions
6. Integration with existing systems

What specific aspect would you like to dive deeper into?`,

      `Great question! For implementing ${solName}, let me suggest a phased approach:

**Phase 1: Foundation (Week 1-2)**
- Set up data pipeline
- Basic exploratory analysis
- Establish baseline metrics

**Phase 2: Model Development (Week 3-4)**
- Feature engineering
- Model experimentation
- Performance optimization

**Phase 3: Production (Week 5-6)**
- API development
- Integration testing
- Deployment and monitoring

**Code Example - Data Pipeline:**
\`\`\`python
import pandas as pd
from sklearn.model_selection import train_test_split

def prepare_data(df):
    # Feature engineering logic
    df['days_since_last_purchase'] = (datetime.now() - df['last_purchase_date']).dt.days
    return df

# Usage
data = prepare_data(raw_data)
X_train, X_test, y_train, y_test = train_test_split(data.drop('target', axis=1), data['target'])
\`\`\`

Would you like me to provide more detailed code examples for any specific component?`
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "Message copied to clipboard",
    });
  };

  const handleDownloadChat = () => {
    const chatContent = messages.map(msg => 
      `${msg.type.toUpperCase()}: ${msg.content}\n\n`
    ).join('');
    
    const blob = new Blob([chatContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${solutionName.replace(/\s+/g, '_')}_AI_Chat.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Chat history downloaded successfully",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <div>
              <CardTitle>AI Solution Generator</CardTitle>
              <CardDescription>
                Get AI-powered assistance for your solution development
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={handleDownloadChat}>
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="flex flex-col h-[600px]">
          {/* Messages Area */}
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="space-y-3">
                  <div className={`flex items-start space-x-3 ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      message.type === 'user' 
                        ? 'bg-blue-100 text-blue-600' 
                        : 'bg-purple-100 text-purple-600'
                    }`}>
                      {message.type === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`flex-1 max-w-3xl ${message.type === 'user' ? 'text-right' : ''}`}>
                      {/* Thinking Section */}
                      {message.type === 'ai' && message.thinking && message.thinking.length > 0 && (
                        <div className="mb-3">
                          <Collapsible 
                            open={expandedThinking[message.id]} 
                            onOpenChange={(open) => setExpandedThinking(prev => ({...prev, [message.id]: open}))}
                          >
                            <CollapsibleTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground mb-2 p-2 h-auto"
                              >
                                <div className="flex items-center space-x-2">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Show thinking</span>
                                </div>
                                {expandedThinking[message.id] ? 
                                  <ChevronDown className="w-4 h-4" /> : 
                                  <ChevronRight className="w-4 h-4" />
                                }
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-2">
                              <div className="border border-border/50 rounded-lg bg-muted/30 p-4 space-y-3">
                                {message.thinking.map((step, index) => (
                                  <div key={step.id} className="space-y-1">
                                    {index % 2 === 0 ? (
                                      <h4 className="font-medium text-sm text-foreground/80">{step.content}</h4>
                                    ) : (
                                      <p className="text-sm text-muted-foreground leading-relaxed pl-4 border-l-2 border-border/30">
                                        {step.content}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      )}

                      {/* Main Message */}
                      <div className={`inline-block p-4 rounded-lg ${
                        message.type === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-50 text-gray-900 border'
                      }`}>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-2">
                        <span className="text-xs text-gray-500">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                        {message.type === 'ai' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1 text-gray-400 hover:text-gray-600"
                            onClick={() => handleCopyMessage(message.content)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Current Thinking (while AI is processing) */}
              {isLoading && (
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    {currentThinking.length > 0 ? (
                      <div className="mb-3">
                        <div className="flex items-center space-x-2 mb-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span className="text-sm text-muted-foreground">Thinking...</span>
                        </div>
                        <div className="border border-border/50 rounded-lg bg-muted/30 p-4 space-y-3">
                          {currentThinking.map((step, index) => (
                            <div key={step.id} className="space-y-1 animate-fade-in">
                              {index % 2 === 0 ? (
                                <h4 className="font-medium text-sm text-foreground/80">{step.content}</h4>
                              ) : (
                                <p className="text-sm text-muted-foreground leading-relaxed pl-4 border-l-2 border-border/30">
                                  {step.content}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="inline-block p-4 rounded-lg bg-gray-50 border">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm text-gray-600">AI is thinking...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-gray-50 p-4">
            <div className="flex items-end space-x-2">
              <textarea
                placeholder="Ask about implementation details, architecture, code examples..."
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  // Auto-resize textarea
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading}
                rows={1}
                style={{
                  resize: 'none',
                  minHeight: '40px',
                  maxHeight: '120px',
                  height: '40px',
                  overflowY: 'auto',
                }}
                className="flex-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all duration-200"
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={!inputMessage.trim() || isLoading}
                size="sm"
                className="self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">
                Press Enter to send, Shift+Enter for new line
              </p>
              <p className="text-xs text-gray-500">
                {messages.length - 1} messages
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AISolutionGenerator;
