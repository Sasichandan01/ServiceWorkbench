
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AIGeneratorBreadcrumb from "@/components/AIGeneratorBreadcrumb";
import { Brain, Send, User, Sparkles } from "lucide-react";

interface Message {
  id: number;
  content: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

const AIGenerator = () => {
  const { workspaceId, solutionId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const workspaceName = "Analytics Team";
  const solutionName = "Customer Segmentation";

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      content: inputValue,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsGenerating(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: messages.length + 2,
        content: "I'll help you generate a comprehensive solution for customer segmentation. Based on your requirements, I'll create an ML model that analyzes behavioral patterns and purchase history to segment customers effectively. Let me break this down into components: data preprocessing, feature engineering, model training, and deployment architecture.",
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsGenerating(false);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 p-6 sticky top-0 z-10">
        <AIGeneratorBreadcrumb 
          workspaceName={workspaceName}
          workspaceId={workspaceId}
          solutionName={solutionName}
          solutionId={solutionId}
        />
        <div className="mt-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent flex items-center">
            <Brain className="w-6 h-6 text-purple-600 mr-3" />
            AI Solution Generator
          </h1>
          <p className="text-gray-600 mt-1">Generate comprehensive solutions with AI assistance</p>
        </div>
      </div>

      {/* Chat Container */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 overflow-hidden">
          {messages.length === 0 ? (
            // Simplified Welcome Screen
            <div className="p-8 text-center">
              <div className="relative inline-block mb-6">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <Sparkles className="w-4 h-4 text-yellow-400 absolute -top-1 -right-1 animate-pulse" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Welcome to AI Generator
              </h2>
              <p className="text-gray-600 mb-6 max-w-lg mx-auto">
                Describe your solution requirements and I'll help you generate comprehensive architecture and implementation guidance.
              </p>
              
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                {[
                  { title: "Architecture", icon: "🏗️" },
                  { title: "Code Gen", icon: "💻" },
                  { title: "Best Practices", icon: "⭐" },
                  { title: "Deployment", icon: "🚀" }
                ].map((feature) => (
                  <div 
                    key={feature.title}
                    className="p-3 bg-gray-50 rounded-lg border hover:shadow-md transition-all duration-200"
                  >
                    <div className="text-xl mb-1">{feature.icon}</div>
                    <p className="text-sm font-medium text-gray-700">{feature.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Chat Messages
            <div className="h-[500px] flex flex-col">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex items-start space-x-3 animate-fade-in ${
                        message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                      }`}
                    >
                      <Avatar className={`w-8 h-8 flex-shrink-0 ${
                        message.sender === 'user' ? '' : ''
                      }`}>
                        <AvatarFallback className={`${
                          message.sender === 'user' 
                            ? 'bg-blue-500' 
                            : 'bg-purple-500'
                        }`}>
                          {message.sender === 'user' ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Brain className="w-4 h-4 text-white" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className={`flex-1 ${message.sender === 'user' ? 'max-w-xs' : 'max-w-2xl'}`}>
                        <div
                          className={`p-3 rounded-2xl ${
                            message.sender === 'user'
                              ? 'bg-blue-500 text-white ml-auto'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{message.content}</p>
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">
                          {message.timestamp}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {isGenerating && (
                    <div className="flex items-start space-x-3 animate-fade-in">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-purple-500">
                          <Brain className="w-4 h-4 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 max-w-2xl">
                        <div className="p-3 bg-gray-100 rounded-2xl">
                          <div className="flex items-center space-x-2">
                            <div className="flex space-x-1">
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
                                  style={{ animationDelay: `${i * 0.1}s` }}
                                />
                              ))}
                            </div>
                            <span className="text-sm text-gray-600">AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Simplified Input Area */}
          <div className="border-t border-gray-200/50 bg-white/50 backdrop-blur-sm p-4">
            <div className="flex items-end space-x-3 max-w-3xl mx-auto">
              <div className="flex-1 relative">
                <Textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Describe your solution requirements..."
                  className="resize-none min-h-[60px] border-gray-300 focus:border-purple-500 focus:ring-purple-500/20 rounded-xl bg-white placeholder:text-gray-500"
                  disabled={isGenerating}
                />
              </div>
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isGenerating}
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 h-[60px] px-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-gray-500 mt-2">
              Press Enter to send
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIGenerator;
