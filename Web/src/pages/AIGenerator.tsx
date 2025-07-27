import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import SolutionBreadcrumb from "@/components/SolutionBreadcrumb";
import { WorkspaceService } from "../services/workspaceService";
import { SolutionService } from "../services/solutionService";
import { ChatService, ChatMessage } from "../services/chatService";
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
  Copy,
  FileCode,
  Pause,
  Trash2,
} from "lucide-react";
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createWebSocketClient } from "@/lib/websocketClient";
import Mermaid from "@/components/ui/Mermaid";
import { useToast } from "@/hooks/use-toast";

interface ThinkingStep {
  id: string;
  content: string;
  timestamp: Date;
}

interface Message {
  id: number;
  content: string | object;
  sender: "user" | "ai";
  timestamp: string;
  thinking?: ThinkingStep[];
  isCompleted?: boolean;
  chatId?: string; // Store the original chat ID for API calls
  tracesLoaded?: boolean; // Track if traces have been loaded
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

// Utility to parse plain text into structured solution object
function parsePlainTextSolution(content: string) {
  // Regexes for section headings
  const summaryMatch = content.match(/Summary:(.*?)(Requirements:|Key Requirements Addressed:|Proposed Architecture Details:|$)/s);
  const requirementsMatch = content.match(/(Requirements:|Key Requirements Addressed:)(.*?)(Architecture:|Proposed Architecture Details:|Cost Analysis:|Estimated Cost Analysis:|$)/s);
  const architectureMatch = content.match(/(Architecture:|Proposed Architecture Details:)(.*?)(Cost Analysis:|Estimated Cost Analysis:|Diagram:|Architecture Diagram:|Architecture Diagram\:|mermaid\n|$)/s);
  const costMatch = content.match(/(Cost Analysis:|Estimated Cost Analysis:)(.*?)(Diagram:|Architecture Diagram:|Architecture Diagram\:|mermaid\n|$)/s);
  // Mermaid diagram block
  let diagram = '';
  // Try to find a mermaid code block
  const mermaidBlock = content.match(/mermaid\n([\s\S]+)/);
  if (mermaidBlock) {
    // Only take lines that look like diagram code, stop at first blank line or line that looks like non-diagram text
    const lines = mermaidBlock[1].split(/\r?\n/);
    const diagramLines = [];
    for (const line of lines) {
      if (
        line.trim() === '' ||
        /^Do you approve|^Additionally|^Please confirm|^\d+\./i.test(line.trim())
      ) {
        break;
      }
      diagramLines.push(line);
    }
    diagram = diagramLines.join('\n').trim();
  } else {
    // Try to find 'Architecture Diagram:' followed by a code block
    const archBlock = content.match(/Architecture Diagram:?\s*```mermaid([\s\S]+?)```/);
    if (archBlock) diagram = archBlock[1].trim();
  }
  // If we have at least a summary and a diagram, treat as structured
  if (summaryMatch || requirementsMatch || architectureMatch || costMatch || diagram) {
    return {
      Summary: summaryMatch ? summaryMatch[1].trim() : '',
      Requirements: requirementsMatch ? requirementsMatch[2].trim() : '',
      Architecture: architectureMatch ? architectureMatch[2].trim() : '',
      CostAnalysis: costMatch ? costMatch[2].trim() : '',
      Diagram: diagram,
    };
  }
  return null;
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [loadingTraces, setLoadingTraces] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  // Function to load chat history
  const loadChatHistory = async () => {
    if (!workspaceId || !solutionId) return;
    
    try {
      setIsLoadingHistory(true);
      const response = await ChatService.getChatHistory(workspaceId, solutionId);
      
      // Convert API response to component message format
      const historyMessages: Message[] = response.ChatHistory
        .filter((chatMsg: ChatMessage) => {
          // Filter out messages with empty content or only whitespace
          return chatMsg.Message && chatMsg.Message.trim().length > 0;
        })
        .map((chatMsg: ChatMessage, index: number) => ({
          id: index + 1,
          content: chatMsg.Message,
          sender: chatMsg.Sender.toLowerCase() === 'user' ? 'user' : 'ai',
          timestamp: new Date(chatMsg.TimeStamp).toLocaleTimeString(),
          chatId: chatMsg.ChatId, // Store the original chat ID
          tracesLoaded: false, // Mark traces as not loaded initially
          thinking: undefined // Don't load traces initially
        }));
      
      setMessages(historyMessages);
    } catch (error) {
      console.error('Failed to load chat history:', error);
      // Don't show error to user for now, just log it
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Function to load traces for a specific message
  const loadMessageTraces = async (messageId: number, chatId: string) => {
    if (!workspaceId || !solutionId || !chatId) return;
    
    try {
      setLoadingTraces(prev => ({ ...prev, [messageId]: true }));
      const chatMessage = await ChatService.getChatMessageDetails(workspaceId, solutionId, chatId);
      
      // Update the message with traces
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            thinking: chatMessage.Trace && chatMessage.Trace.length > 0 
              ? chatMessage.Trace.map((trace, traceIndex) => ({
                  id: `${chatMessage.MessageId}-trace-${traceIndex}`,
                  content: trace,
                  timestamp: new Date(chatMessage.TimeStamp)
                }))
              : undefined,
            tracesLoaded: true
          };
        }
        return msg;
      }));
    } catch (error) {
      console.error('Failed to load message traces:', error);
      toast({
        title: "Error",
        description: "Failed to load thinking steps. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingTraces(prev => ({ ...prev, [messageId]: false }));
    }
  };

  // Function to clear chat history
  const handleClearChat = async () => {
    if (!workspaceId || !solutionId) return;
    
    try {
      setIsClearingChat(true);
      await ChatService.clearChatHistory(workspaceId, solutionId);
      setMessages([]);
      setCurrentThinking([]);
      currentThinkingRef.current = [];
      toast({
        title: "Chat cleared",
        description: "All chat history has been cleared successfully.",
      });
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      toast({
        title: "Error",
        description: "Failed to clear chat history. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsClearingChat(false);
    }
  };

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
      // Load chat history when workspace and solution are available
      loadChatHistory();
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
            content: Array.isArray(aiTrace) 
              ? aiTrace.map(item => typeof item === 'object' ? `${item.Dataset}/${item.Domain}/${item.File}` : String(item)).join(', ')
              : typeof aiTrace === 'object' ? JSON.stringify(aiTrace, null, 2) : String(aiTrace),
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
        } else if (data && data.Metadata && data.Metadata.IsCode === true) {
          // Handle code messages as part of thinking process
          const thinkingStep: ThinkingStep = {
            id: Date.now().toString() + Math.random(),
            content: data, // Keep the entire code object as content
            timestamp: new Date(),
          };
          setCurrentThinking((prev) => {
            const newThinking = [...prev, thinkingStep];
            currentThinkingRef.current = newThinking;
            return newThinking;
          });
          setIsGenerating(true);
        } else {
          // Fallback for other message formats
          let content: any = "";
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

          if ((typeof content === "string" && content.trim()) || typeof content === "object") {
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

  const handlePauseGeneration = () => {
    if (wsClientRef.current) {
      wsClientRef.current.close();
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleThinking = async (messageId: number) => {
    const message = messages.find(msg => msg.id === messageId);
    const isCurrentlyExpanded = expandedThinking[messageId];
    
    // If we're expanding and traces haven't been loaded yet, load them
    if (!isCurrentlyExpanded && message && message.sender === 'ai' && !message.tracesLoaded && message.chatId) {
      await loadMessageTraces(messageId, message.chatId);
    }
    
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
          
          {/* Loading Chat History State */}
          {isLoadingHistory && (
            <div className="flex flex-col items-center justify-center p-8 animate-fade-in min-h-full">
              <div className="text-center space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center mx-auto">
                    <Loader2 className="w-8 h-8 text-primary-foreground animate-spin" />
                  </div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                    Loading chat history...
                  </h2>
                  <p className="text-muted-foreground">
                    Retrieving your previous conversations
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Initial Centered State */}
          {messages.length === 0 && !isLoadingHistory && (
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
                  <div className="flex items-center space-x-4">
                    <Textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask anything..."
                      className="resize-none min-h-[80px] rounded-2xl border-2 bg-background/50 backdrop-blur-sm transition-all duration-300 focus:border-primary/50 focus:shadow-lg focus:shadow-primary/10 flex-1"
                      disabled={isGenerating}
                    />
                    {isGenerating ? (
                      <Button
                        onClick={handlePauseGeneration}
                        className="h-12 w-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                        variant="default"
                      >
                        <Pause className="w-5 h-5" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isGenerating}
                        className="h-12 w-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    )}
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
          {messages.length > 0 && !isLoadingHistory && (
            <div className="bg-gradient-to-b from-muted/10 to-background rounded-t-xl border-t overflow-hidden animate-fade-in flex flex-col h-[80vh] max-h-[80vh]">
              {/* Chat Header with Clear Button */}
              <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/80 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-foreground">Chat History</h3>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center space-x-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isClearingChat}
                    >
                      {isClearingChat ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      <span>Clear Chat</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear Chat History</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to clear all chat history? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearChat}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear Chat
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-6 max-w-4xl mx-auto">
                    {messages
                      .filter((message) => {
                        // Filter out messages with empty content
                        return message.content && (typeof message.content !== 'string' || message.content.trim().length > 0);
                      })
                      .map((message) => (
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
                          {/* Thinking Section - Only for AI messages */}
                          {message.sender === "ai" && (
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
                                    disabled={loadingTraces[message.id]}
                                  >
                                    <div className="flex items-center space-x-2">
                                      {loadingTraces[message.id] ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : null}
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
                                    {loadingTraces[message.id] ? (
                                      <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        <span className="text-sm text-muted-foreground">Loading thinking steps...</span>
                                      </div>
                                    ) : message.thinking && message.thinking.length > 0 ? (
                                      message.thinking.map((step, index) => (
                                        <div
                                          key={step.id}
                                          className="space-y-1"
                                        >
                                          <p className="text-sm text-muted-foreground leading-relaxed">
                                            {step.content}
                                          </p>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-sm text-muted-foreground py-2">
                                        No thinking steps available for this message.
                                      </div>
                                    )}
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
                            {(() => {
                              // Handle code response with filename
                              function hasMetadata(obj: any): obj is { Metadata: { IsCode: boolean } } {
                                return obj && typeof obj === 'object' && 'Metadata' in obj;
                              }
                              if (typeof message.content === "object" && message.content !== null) {
                                const contentObj: any = message.content;
                                // Check if it's a code response
                                if (
                                  contentObj &&
                                  hasMetadata(contentObj) &&
                                  contentObj.Metadata.IsCode === true
                                ) {
                                  const keys = Object.keys(contentObj).filter((k) => k !== "Metadata");
                                  if (keys.length > 0) {
                                    return (
                                      <div className="space-y-4">
                                        {keys.map((filename: string) => {
                                          const codeContent = contentObj[filename];
                                          
                                          // Detect language from filename
                                          const getLanguageFromFilename = (filename: string): string => {
                                            const ext = filename.split('.').pop()?.toLowerCase();
                                            switch (ext) {
                                              case 'py': return 'python';
                                              case 'js': return 'javascript';
                                              case 'ts': return 'typescript';
                                              case 'json': return 'json';
                                              case 'sh': return 'bash';
                                              case 'yml':
                                              case 'yaml': return 'yaml';
                                              case 'sql': return 'sql';
                                              default: return 'text';
                                            }
                                          };

                                          const language = getLanguageFromFilename(filename);
                                          const codeId = `code-${filename}`;
                                          
                                          // Apply syntax highlighting
                                          let highlightedCode = codeContent;
                                          try {
                                            if (Prism.languages[language]) {
                                              highlightedCode = Prism.highlight(codeContent, Prism.languages[language], language);
                                            }
                                          } catch (error) {
                                            console.warn(`Failed to highlight ${language} code:`, error);
                                          }

                                          return (
                                            <div key={filename} className="group">
                                              <div className="bg-[#2d2d2d] border border-[#404040] rounded-lg overflow-hidden shadow-sm">
                                                {/* Header - ChatGPT style */}
                                                <div className="flex items-center justify-between bg-[#343434] px-4 py-3 border-b border-[#404040]">
                                                  <div className="flex items-center">
                                                    <span className="text-sm font-medium text-[#e5e5e5]">{filename}</span>
                                                  </div>
                                                  <div className="flex items-center space-x-2">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-auto px-3 py-1.5 text-[#e5e5e5] hover:bg-[#404040] transition-colors text-sm"
                                                      onClick={() => {
                                                        navigator.clipboard.writeText(codeContent);
                                                      }}
                                                    >
                                                      <Copy className="w-4 h-4 mr-1" />
                                                      Copy
                                                    </Button>
                                                  </div>
                                                </div>
                                                
                                                {/* Code content */}
                                                <div className="relative bg-[#1e1e1e]">
                                                  <pre className="p-4 overflow-x-auto text-sm font-mono text-[#e5e5e5] leading-relaxed">
                                                    <code 
                                                      className={`language-${language} block whitespace-pre`}
                                                      dangerouslySetInnerHTML={{ __html: highlightedCode }}
                                                    />
                                                  </pre>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  }
                                }
                                // If not a code response, render as JSON
                                return <pre className="whitespace-pre-wrap">{JSON.stringify(contentObj, null, 2)}</pre>;
                              }
                              if (typeof message.content === "string" && isStructuredSolutionJson(message.content)) {
                                return <AIChatSolutionMessage solutionJson={JSON.parse(message.content)} />;
                              }
                              if (typeof message.content === "string") {
                                // Handle empty or whitespace-only content
                                if (!message.content || message.content.trim().length === 0) {
                                  return <p className="text-muted-foreground italic">No content available</p>;
                                }
                                
                                const parsed = parsePlainTextSolution(message.content);
                                if (parsed && (parsed.Summary || parsed.Diagram)) {
                                  return <AIChatSolutionMessage solutionJson={parsed} />;
                                }
                                return <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>;
                              }
                              // Fallback for unknown types - ensure objects are stringified
                              if (typeof message.content === 'object' && message.content !== null) {
                                return <pre className="whitespace-pre-wrap">{JSON.stringify(message.content, null, 2)}</pre>;
                              }
                              // Final fallback for any other type
                              return <pre className="whitespace-pre-wrap">{String(message.content)}</pre>;
                            })()}
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
                {messages.length > 0 && !isLoadingHistory && (
                  <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm p-6">
                    <div className="flex items-center space-x-4 max-w-4xl mx-auto">
                      <Textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Continue the conversation..."
                        className="resize-none min-h-[60px] rounded-xl border-2 bg-background/50 backdrop-blur-sm transition-all duration-300 focus:border-primary/50 focus:shadow-md focus:shadow-primary/10 flex-1"
                        disabled={isGenerating}
                      />
                      {isGenerating ? (
                        <Button
                          onClick={handlePauseGeneration}
                          className="h-[60px] px-6 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                          variant="default"
                        >
                          <Pause className="w-5 h-5" />
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSendMessage}
                          disabled={!inputValue.trim() || isGenerating}
                          className="h-[60px] px-6 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                        >
                          <Send className="w-5 h-5" />
                        </Button>
                      )}
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
    (typeof data.content === "string" || typeof data.content === "object") &&
    (data.sender === "user" || data.sender === "ai")
  );
}
