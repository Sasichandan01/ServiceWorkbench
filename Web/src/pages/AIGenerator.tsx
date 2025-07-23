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
import { Brain, Send, User, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createWebSocketClient } from "@/lib/websocketClient";

interface ThinkingStep {
  id: string;
  content: string;
  timestamp: Date;
}

interface Message {
  id: number;
  content: string;
  sender: 'user' | 'ai';
  timestamp: string;
  thinking?: ThinkingStep[];
  isCompleted?: boolean;
}

const AIGenerator = () => {
  const { workspaceId, solutionId } = useParams();
  const [workspaceName, setWorkspaceName] = useState("");
  const [solutionName, setSolutionName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentThinking, setCurrentThinking] = useState<ThinkingStep[]>([]);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const currentThinkingRef = useRef<ThinkingStep[]>([]);
  const wsClientRef = useRef<ReturnType<typeof createWebSocketClient> | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId) {
      WorkspaceService.getWorkspace(workspaceId).then(ws => setWorkspaceName(ws.WorkspaceName));
    }
    if (workspaceId && solutionId) {
      SolutionService.getSolution(workspaceId, solutionId).then(sol => setSolutionName(sol.SolutionName));
    }
  }, [workspaceId, solutionId]);

  useEffect(() => {
    const wsClient = createWebSocketClient();
    wsClientRef.current = wsClient;
    wsClient.connect();
    wsClient.on('open', () => {
      setWsConnected(true);
      setWsError(null);
    });
    wsClient.on('close', () => {
      setWsConnected(false);
    });
    wsClient.on('error', (e) => {
      setWsError('WebSocket error');
      setWsConnected(false);
    });
    wsClient.on('message', (event) => {
      console.log('[Chat] WebSocket message received:', event);
      console.log('[Chat] Raw event data:', event.data);
      
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        console.log('[Chat] Parsed data:', data);
        
        // Check if this is the new AITrace/AIMessage format
        const messageType = Object.keys(data)[0];
        const messageContent = data[messageType];
        const metadata = data.metadata || {};

        if (messageType === "AITrace") {
          // Add to current thinking
          const thinkingStep: ThinkingStep = {
            id: Date.now().toString(),
            content: messageContent,
            timestamp: new Date()
          };
          setCurrentThinking(prev => {
            const newThinking = [...prev, thinkingStep];
            currentThinkingRef.current = newThinking;
            return newThinking;
          });
          setIsGenerating(true); // Set to true on AITrace/intermediate
        } else if (messageType === "AIMessage") {
          // Final AI response - use ref to get current thinking
          setMessages(prev => {
            const aiMessage: Message = {
              id: prev.length + 1,
              content: messageContent,
              sender: 'ai',
              timestamp: new Date().toLocaleTimeString(),
              thinking: currentThinkingRef.current.length > 0 ? [...currentThinkingRef.current] : undefined,
              isCompleted: metadata.isCompleted
            };
            return [...prev, aiMessage];
          });
          setCurrentThinking([]);
          currentThinkingRef.current = [];
          setIsGenerating(false); // Set to false on final message
        } else {
          // Fallback for other message formats
          let content = '';
          if (typeof data === 'string') {
            content = data;
          } else if (data && typeof data.response === 'string') {
            content = data.response;
          } else if (data && typeof data.content === 'string') {
            content = data.content;
          } else if (data && typeof data.message === 'string') {
            content = data.message;
          } else if (data && typeof data.text === 'string') {
            content = data.text;
          } else {
            content = JSON.stringify(data);
          }
          
          if (content.trim()) {
            setMessages(prev => {
              const msg: Message = {
                id: prev.length + 1,
                content: content,
                sender: 'ai' as const,
                timestamp: new Date().toLocaleTimeString(),
              };
              console.log('[Chat] Adding AI message:', msg);
              return [...prev, msg];
            });
            setIsGenerating(false);
          }
        }
      } catch (err) {
        console.error('[Chat] Error parsing message:', err);
        // Fallback: treat the raw data as string content
        const content = typeof event.data === 'string' ? event.data : String(event.data);
        if (content.trim()) {
          setMessages(prev => {
            const msg: Message = {
              id: prev.length + 1,
              content: content,
              sender: 'ai' as const,
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
    // Auto-expand on first trace
    if (currentThinking.length === 1 && isGenerating) {
      // Find the last AI message (if any) to expand its thinking
      const lastAiMsg = messages.filter(m => m.sender === 'ai').slice(-1)[0];
      if (lastAiMsg) {
        setExpandedThinking(prev => ({ ...prev, [lastAiMsg.id]: true }));
      }
    }
  }, [currentThinking.length, isGenerating]);

  useEffect(() => {
    // Auto-collapse on final AI message
    if (!isGenerating && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === 'ai' && lastMsg.thinking) {
        setExpandedThinking(prev => ({ ...prev, [lastMsg.id]: false }));
      }
    }
  }, [isGenerating, messages]);

  const handleSendMessage = async () => {
    console.log('[Chat] handleSendMessage called');
    if (!inputValue.trim() || !wsClientRef.current || !wsConnected) {
      console.log('[Chat] Cannot send: input empty, wsClientRef', wsClientRef.current, 'wsConnected', wsConnected);
      return;
    }
    const userMessage: Message = {
      id: messages.length + 1,
      content: inputValue,
      sender: 'user' as const,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsGenerating(true); // Set to true when sending
    // Send message via websocket using AWS API Gateway action format
    const payload = JSON.stringify({
      action: "sendMessage",
      userMessage: userMessage.content,
      workspaceid: workspaceId,
      solutionid: solutionId
    });
    console.log('[Chat] Sending over websocket:', payload);
    wsClientRef.current.send(payload);
    // setIsGenerating(false); // REMOVE THIS LINE
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

      {/* Header (removed workspace/solution name and subtitle) */}
      {/* <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{solutionName || "AI Solution Generator"}</h1>
          <p className="text-muted-foreground mt-1">Generate comprehensive solutions with AI assistance</p>
        </div>
      </div> */}

      {/* Chat Window */}
      <Card className="shadow-lg  border-0 bg-gradient-to-br from-background via-background to-muted/20 flex-1 flex flex-col max-h-[83vh]">
        <CardContent className="p-0 h-screen">
          {wsError && (
            <div className="text-red-500 text-center">WebSocket error: {wsError}</div>
          )}
          {/* Initial Centered State */}
          {messages.length === 0 && (
            <div className=" flex flex-col items-center justify-center p-8 animate-fade-in min-h-full">
              <div className="text-center space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Brain className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                    What can I help you build today?
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Describe your solution requirements and I'll help you create something amazing.
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
                      <span className="text-sm text-muted-foreground ml-2">AI is thinking...</span>
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
                          message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                        }`}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-background shadow-lg">
                          <AvatarFallback className={
                            message.sender === 'user' 
                              ? 'bg-gradient-to-br from-primary to-primary/80' 
                              : 'bg-gradient-to-br from-secondary to-secondary/80'
                          }>
                            {message.sender === 'user' ? (
                              <User className="w-5 h-5 text-primary-foreground" />
                            ) : (
                              <Brain className="w-5 h-5 text-secondary-foreground" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex-1 space-y-3 ${message.sender === 'user' ? 'max-w-md' : 'max-w-3xl'}`}>
                          {/* Thinking Section */}
                          {message.sender === 'ai' && message.thinking && message.thinking.length > 0 && (
                            <div>
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
                          <div
                            className={`p-4 rounded-2xl transition-all duration-300 hover:shadow-md ${
                              message.sender === 'user'
                                ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground ml-auto shadow-lg shadow-primary/20'
                                : 'bg-card text-card-foreground border border-border/50 shadow-sm hover:border-border'
                            }`}
                          >
                            <p className="leading-relaxed">{message.content}</p>
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
                              <div className="flex items-center space-x-2">
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
                                <span className="text-sm text-muted-foreground ml-2">AI is thinking...</span>
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
    typeof data === 'object' &&
    typeof data.content === 'string' &&
    (data.sender === 'user' || data.sender === 'ai')
  );
}
