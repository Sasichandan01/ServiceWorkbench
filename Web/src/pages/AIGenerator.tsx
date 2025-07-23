import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import SolutionBreadcrumb from "@/components/SolutionBreadcrumb";
import { WorkspaceService } from "../services/workspaceService";
import { SolutionService } from "../services/solutionService";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Brain,
  Send,
  User,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { createWebSocketClient } from "@/lib/websocketClient";
import Mermaid from "@/components/ui/Mermaid";

interface ThinkingStep {
  id: string;
  content: string;
  timestamp: Date;
}

interface Message {
  id: number;
  content: string;
  sender: "user" | "ai";
  timestamp: string;
  thinking?: ThinkingStep[];
  isCompleted?: boolean;
}

// Utility to check if a string is the structured solution JSON
function isStructuredSolutionJson(content: string): boolean {
  try {
    const obj = typeof content === "string" ? JSON.parse(content) : content;
    return (
      obj &&
      typeof obj === "object" &&
      "Summary" in obj &&
      "Requirements" in obj &&
      "Architecture" in obj &&
      "CostAnalysis" in obj &&
      "Diagram" in obj
    );
  } catch {
    return false;
  }
}

// Component to render the structured solution JSON
const AIChatSolutionMessage = ({ solutionJson }: { solutionJson: any }) => (
  <div>
    <div className="text-base text-gray-900 whitespace-pre-line">
      {solutionJson.Summary}
    </div>
    <h3 className="font-semibold mt-4 mb-1 text-gray-800 text-lg">
      Requirements
    </h3>
    <div className="text-gray-700 whitespace-pre-line">
      {solutionJson.Requirements}
    </div>
    <h3 className="font-semibold mt-4 mb-1 text-gray-800 text-lg">
      Architecture
    </h3>
    <div className="text-gray-700 whitespace-pre-line">
      {solutionJson.Architecture}
    </div>
    <h3 className="font-semibold mt-4 mb-1 text-gray-800 text-lg">
      Cost Analysis
    </h3>
    <div className="text-gray-700 whitespace-pre-line">
      {solutionJson.CostAnalysis}
    </div>
    {solutionJson.Diagram && (
      <>
        <h3 className="font-semibold mt-4 mb-1 text-gray-800 text-lg">
          Architecture Diagram
        </h3>
        <div className="w-full max-h-[70vh] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg overflow-auto">
          <Mermaid chart={solutionJson.Diagram} />
        </div>
      </>
    )}
  </div>
);

const AIGenerator = () => {
  const { workspaceId, solutionId } = useParams();
  const [workspaceName, setWorkspaceName] = useState("");
  const [solutionName, setSolutionName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentThinking, setCurrentThinking] = useState<ThinkingStep[]>([]);
  const [expandedThinking, setExpandedThinking] = useState<
    Record<string, boolean>
  >({});
  const [currentThinkingExpanded, setCurrentThinkingExpanded] = useState(true); // State for current thinking expansion
  const currentThinkingRef = useRef<ThinkingStep[]>([]);
  const wsClientRef = useRef<ReturnType<typeof createWebSocketClient> | null>(
    null
  );
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId) {
      WorkspaceService.getWorkspace(workspaceId).then((ws) =>
        setWorkspaceName(ws.WorkspaceName)
      );
    }
    if (workspaceId && solutionId) {
      SolutionService.getSolution(workspaceId, solutionId).then((sol) =>
        setSolutionName(sol.SolutionName)
      );
    }
  }, [workspaceId, solutionId]);

  useEffect(() => {
    const wsClient = createWebSocketClient();
    wsClientRef.current = wsClient;
    wsClient.connect();
    wsClient.on("open", () => {
      setWsConnected(true);
      setWsError(null);
    });
    wsClient.on("close", () => {
      setWsConnected(false);
    });
    wsClient.on("error", (e) => {
      setWsError("WebSocket error");
      setWsConnected(false);
    });
    wsClient.on("message", (event) => {
      console.log("[Chat] WebSocket message received:", event);
      console.log("[Chat] Raw event data:", event.data);

      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        console.log("[Chat] Parsed data:", data);

        // Ignore system messages like 'Endpoint request timed out'
        if (
          data &&
          typeof data.message === "string" &&
          data.message === "Endpoint request timed out"
        ) {
          console.log("[Chat] Ignored system message:", data.message);
          return;
        }
        // Handle the format: {"Metadata":{"IsComplete":false},"AITrace":"string"} or {"Metadata":{"IsComplete":true},"AIMessage":"string"}
        const metadata = data.Metadata || {};
        const aiTrace = data.AITrace;
        const aiMessage = data.AIMessage;

        if (aiTrace) {
          // This is an AITrace message - add to thinking
          const thinkingStep: ThinkingStep = {
            id: Date.now().toString() + Math.random(),
            content: aiTrace,
            timestamp: new Date(),
          };
          setCurrentThinking((prev) => {
            const newThinking = [...prev, thinkingStep];
            currentThinkingRef.current = newThinking;
            return newThinking;
          });
          setIsGenerating(true);
        } else if (aiMessage) {
          // This is the final AIMessage - create the complete message
          setMessages((prev) => {
            const aiMsg: Message = {
              id: prev.length + 1,
              content: aiMessage,
              sender: "ai",
              timestamp: new Date().toLocaleTimeString(),
              thinking:
                currentThinkingRef.current.length > 0
                  ? [...currentThinkingRef.current]
                  : undefined,
              isCompleted: metadata.IsComplete,
            };
            return [...prev, aiMsg];
          });
          setCurrentThinking([]);
          currentThinkingRef.current = [];
          setIsGenerating(false);
        } else {
          // Fallback for other message formats
          let content = "";
          if (typeof data === "string") {
            content = data;
          } else if (data && typeof data.response === "string") {
            content = data.response;
          } else if (data && typeof data.content === "string") {
            content = data.content;
          } else if (data && typeof data.message === "string") {
            content = data.message;
          } else if (data && typeof data.text === "string") {
            content = data.text;
          } else {
            content = JSON.stringify(data);
          }

          if (content.trim()) {
            setMessages((prev) => {
              const msg: Message = {
                id: prev.length + 1,
                content: content,
                sender: "ai" as const,
                timestamp: new Date().toLocaleTimeString(),
              };
              console.log("[Chat] Adding AI message:", msg);
              return [...prev, msg];
            });
            setIsGenerating(false);
          }
        }
      } catch (err) {
        console.error("[Chat] Error parsing message:", err);
        // Fallback: treat the raw data as string content
        const content =
          typeof event.data === "string" ? event.data : String(event.data);
        if (content.trim()) {
          setMessages((prev) => {
            const msg: Message = {
              id: prev.length + 1,
              content: content,
              sender: "ai" as const,
              timestamp: new Date().toLocaleTimeString(),
            };
            return [...prev, msg];
          });
          setIsGenerating(false);
        }
      }
    });
    return () => {
      wsClient.close();
    };
  }, []);

  useEffect(() => {
    // Auto-expand current thinking when first trace arrives
    if (currentThinking.length === 1 && isGenerating) {
      setCurrentThinkingExpanded(true);
    }
  }, [currentThinking.length, isGenerating]);

  useEffect(() => {
    // Auto-collapse thinking when AI message is complete
    if (!isGenerating && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (
        lastMsg.sender === "ai" &&
        lastMsg.thinking &&
        lastMsg.thinking.length > 0
      ) {
        // Auto-collapse the thinking section for the completed message
        setExpandedThinking((prev) => ({ ...prev, [lastMsg.id]: false }));
      }
      // Reset current thinking expansion state
      setCurrentThinkingExpanded(true);
    }
  }, [isGenerating, messages]);

  const handleSendMessage = async () => {
    console.log("[Chat] handleSendMessage called");
    if (!inputValue.trim() || !wsClientRef.current || !wsConnected) {
      console.log(
        "[Chat] Cannot send: input empty, wsClientRef",
        wsClientRef.current,
        "wsConnected",
        wsConnected
      );
      return;
    }
    const userMessage: Message = {
      id: messages.length + 1,
      content: inputValue,
      sender: "user" as const,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsGenerating(true);
    // Clear any previous thinking and reset expansion state
    setCurrentThinking([]);
    currentThinkingRef.current = [];
    setCurrentThinkingExpanded(true);

    // Send message via websocket using AWS API Gateway action format
    const payload = JSON.stringify({
      action: "sendMessage",
      userMessage: userMessage.content,
      workspaceid: workspaceId,
      solutionid: solutionId,
    });
    console.log("[Chat] Sending over websocket:", payload);
    wsClientRef.current.send(payload);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleThinking = (messageId: number) => {
    setExpandedThinking((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const toggleCurrentThinking = () => {
    setCurrentThinkingExpanded((prev) => !prev);
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Breadcrumb */}
      <SolutionBreadcrumb
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        solutionName={solutionName}
        solutionId={solutionId}
        extra="AI Generator"
      />

      {/* Chat Window */}
      <Card className="shadow-lg border-0 bg-gradient-to-br from-background via-background to-muted/20 flex-1 flex flex-col max-h-[83vh]">
        <CardContent className="p-0 h-screen">
          {wsError && (
            <div className="text-red-500 text-center">
              WebSocket error: {wsError}
            </div>
          )}
          {/* Initial Centered State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 animate-fade-in min-h-full">
              <div className="text-center space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Brain className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                    What can I help you build today?
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Describe your solution requirements and I'll help you create
                    something amazing.
                  </p>
                </div>

                {/* Centered Input */}
                <div className="w-full max-w-2xl space-y-4">
                  <div className="relative">
                    <Textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask anything..."
                      className="resize-none min-h-[80px] rounded-2xl border-2 bg-background/50 backdrop-blur-sm transition-all duration-300 focus:border-primary/50 focus:shadow-lg focus:shadow-primary/10"
                      disabled={isGenerating}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || isGenerating}
                      className="absolute right-3 bottom-3 h-12 w-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>

                  {isGenerating && (
                    <div className="flex items-center justify-center space-x-2 animate-fade-in">
                      <div className="flex space-x-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-3 h-3 bg-primary rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground ml-2">
                        AI is thinking...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages View */}
          {messages.length > 0 && (
            <div className="bg-gradient-to-b from-muted/10 to-background rounded-t-xl border-t overflow-hidden animate-fade-in flex flex-col h-[80vh] max-h-[80vh]">
              <div className="flex-1 flex flex-col min-h-0">
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-6 max-w-4xl mx-auto">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex items-start space-x-4 animate-fade-in ${
                          message.sender === "user"
                            ? "flex-row-reverse space-x-reverse"
                            : ""
                        }`}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-background shadow-lg">
                          <AvatarFallback
                            className={
                              message.sender === "user"
                                ? "bg-gradient-to-br from-primary to-primary/80"
                                : "bg-gradient-to-br from-secondary to-secondary/80"
                            }
                          >
                            {message.sender === "user" ? (
                              <User className="w-5 h-5 text-primary-foreground" />
                            ) : (
                              <Brain className="w-5 h-5 text-secondary-foreground" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={`flex-1 space-y-3 ${
                            message.sender === "user" ? "max-w-md" : "max-w-3xl"
                          }`}
                        >
                          {/* Thinking Section - Only for AI messages with thinking */}
                          {message.sender === "ai" &&
                            message.thinking &&
                            message.thinking.length > 0 && (
                              <div>
                                <Collapsible
                                  open={expandedThinking[message.id] || false}
                                  onOpenChange={() =>
                                    toggleThinking(message.id)
                                  }
                                >
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground mb-2 p-2 h-auto"
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span>Show thinking</span>
                                      </div>
                                      {expandedThinking[message.id] ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="space-y-2">
                                    <div className="border border-border/50 rounded-lg bg-muted/30 p-4 space-y-3">
                                      {message.thinking.map((step, index) => (
                                        <div
                                          key={step.id}
                                          className="space-y-1"
                                        >
                                          <p className="text-sm text-muted-foreground leading-relaxed">
                                            {step.content}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              </div>
                            )}

                          {/* Main Message */}
                          <div
                            className={`p-4 rounded-2xl transition-all duration-300 hover:shadow-md ${
                              message.sender === "user"
                                ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground ml-auto shadow-lg shadow-primary/20"
                                : "bg-card text-card-foreground border border-border/50 shadow-sm hover:border-border"
                            }`}
                          >
                            {typeof message.content === "string" &&
                            isStructuredSolutionJson(message.content) ? (
                              <AIChatSolutionMessage
                                solutionJson={JSON.parse(message.content)}
                              />
                            ) : (
                              <p className="leading-relaxed whitespace-pre-wrap">
                                {message.content}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground mt-2 block opacity-70">
                            {message.timestamp}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Current Thinking (while AI is processing) */}
                    {isGenerating && (
                      <div className="flex items-start space-x-4 animate-fade-in">
                        <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-background shadow-lg">
                          <AvatarFallback className="bg-gradient-to-br from-secondary to-secondary/80">
                            <Brain className="w-5 h-5 text-secondary-foreground" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 max-w-3xl">
                          {currentThinking.length > 0 ? (
                            <div className="space-y-3">
                              <Collapsible
                                open={currentThinkingExpanded}
                                onOpenChange={toggleCurrentThinking}
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
                                    {currentThinkingExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-2">
                                  <div className="border border-border/50 rounded-lg bg-muted/30 p-4 space-y-3">
                                    {currentThinking.map((step) => (
                                      <div
                                        key={step.id}
                                        className="space-y-1 animate-fade-in"
                                      >
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                          {step.content}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          ) : (
                            <div className="p-4 bg-card border border-border/50 rounded-2xl shadow-sm">
                              <div className="flex items-center space-x-3">
                                <div className="flex space-x-1">
                                  {[0, 1, 2].map((i) => (
                                    <div
                                      key={i}
                                      className="w-3 h-3 bg-primary rounded-full animate-bounce"
                                      style={{ animationDelay: `${i * 0.15}s` }}
                                    />
                                  ))}
                                </div>
                                <span className="text-sm text-muted-foreground ml-2">
                                  <Loader2 className="w-3 h-3 animate-spin inline-block mr-1" />
                                  AI is thinking...
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Bottom Input Area - Only show after any message */}
                {messages.length > 0 && (
                  <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm p-6">
                    <div className="flex items-end space-x-4 max-w-4xl mx-auto">
                      <div className="flex-1 relative">
                        <Textarea
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyPress}
                          placeholder="Continue the conversation..."
                          className="resize-none min-h-[60px] rounded-xl border-2 bg-background/50 backdrop-blur-sm transition-all duration-300 focus:border-primary/50 focus:shadow-md focus:shadow-primary/10"
                          disabled={isGenerating}
                        />
                      </div>
                      <Button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isGenerating}
                        className="h-[60px] px-6 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    </div>
                    <p className="text-center text-xs text-muted-foreground mt-3 opacity-70">
                      Press Enter to send
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AIGenerator;

// Add a type guard for Message
function isValidMessage(data: any): data is Message {
  return (
    typeof data === "object" &&
    typeof data.content === "string" &&
    (data.sender === "user" || data.sender === "ai")
  );
}
