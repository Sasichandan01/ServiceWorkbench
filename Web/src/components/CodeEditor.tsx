import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Moon, Sun, Save, FileText, Plus, Trash2, Folder, FolderPlus, ChevronRight, ChevronDown, PanelLeftClose, PanelLeft, Search, X, MessageSquare, Send, Maximize, Minimize } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CodeFile {
  id: string;
  name: string;
  content: string;
  language: string;
  isDirty?: boolean;
}

interface CodeEditorProps {
  workspaceId: string;
  solutionId: string;
}

const CodeEditor = ({ workspaceId, solutionId }: CodeEditorProps) => {
  const [files, setFiles] = useState<CodeFile[]>([
    {
      id: "1",
      name: "main.py",
      content: "# Main application file\nprint('Hello, World!')\n\n# Add your code here\nif __name__ == '__main__':\n    print('Starting application...')",
      language: "python",
      isDirty: false
    }
  ]);
  const [openFileIds, setOpenFileIds] = useState<string[]>(["1"]);
  const [activeFileId, setActiveFileId] = useState("1");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [newFileName, setNewFileName] = useState("");
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { id: 1, role: "assistant", content: "Hello! I'm here to help you with your code. Ask me anything!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const activeFile = files.find(f => f.id === activeFileId);
  const openFiles = files.filter(f => openFileIds.includes(f.id));

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync scroll between textarea and line numbers
  const handleTextareaScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleContentChange = (content: string) => {
    setFiles(prev => prev.map(file => 
      file.id === activeFileId ? { ...file, content, isDirty: true } : file
    ));
  };

  const handleCloseFile = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Remove from open files but keep in project files
    const newOpenFileIds = openFileIds.filter(id => id !== fileId);
    setOpenFileIds(newOpenFileIds);
    
    if (activeFileId === fileId) {
      if (newOpenFileIds.length > 0) {
        // Switch to another open file
        const fileIndex = openFileIds.indexOf(fileId);
        const nextFileIndex = fileIndex < newOpenFileIds.length ? fileIndex : fileIndex - 1;
        setActiveFileId(newOpenFileIds[nextFileIndex]);
      } else {
        // No files left open
        setActiveFileId("");
      }
    }
  };

  const handleSave = async () => {
    if (!activeFile) return;
    
    try {
      // TODO: Implement actual save API call
      setFiles(prev => prev.map(file => 
        file.id === activeFileId ? { ...file, isDirty: false } : file
      ));
      
      toast({
        title: "File Saved",
        description: `${activeFile.name} has been saved successfully.`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save file",
        variant: "destructive"
      });
    }
  };

  const handleAddFile = () => {
    if (!newFileName.trim()) return;
    
    const newFile: CodeFile = {
      id: Date.now().toString(),
      name: newFileName,
      content: "",
      language: getLanguageFromFileName(newFileName),
      isDirty: false
    };
    
    setFiles(prev => [...prev, newFile]);
    setOpenFileIds(prev => [...prev, newFile.id]);
    setActiveFileId(newFile.id);
    setNewFileName("");
    setShowNewFileInput(false);
  };

  const handleDeleteFile = (fileId: string) => {
    // Remove from both project files and open files
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setOpenFileIds(prev => prev.filter(id => id !== fileId));
    
    if (activeFileId === fileId) {
      const remainingOpenFiles = openFileIds.filter(id => id !== fileId);
      if (remainingOpenFiles.length > 0) {
        setActiveFileId(remainingOpenFiles[0]);
      } else {
        setActiveFileId("");
      }
    }
  };

  const getLanguageFromFileName = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'python';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'java': return 'java';
      case 'cpp': case 'c++': return 'cpp';
      case 'c': return 'c';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'json': return 'json';
      case 'xml': return 'xml';
      case 'sql': return 'sql';
      default: return 'text';
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = isDarkMode ? "w-4 h-4 text-blue-400" : "w-4 h-4 text-blue-600";
    return <FileText className={iconClass} />;
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    
    setChatMessages(prev => [...prev, 
      { id: Date.now(), role: "user", content: chatInput },
      { id: Date.now() + 1, role: "assistant", content: "I'll help you with that! This is a demo response." }
    ]);
    setChatInput("");
  };

  // Calculate line numbers based on content
  const lines = activeFile?.content.split('\n') || [''];
  const lineCount = lines.length;

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-[600px]'} flex ${isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
      {/* File Explorer Sidebar */}
      {!sidebarCollapsed && (
        <div className={`w-80 ${isDarkMode ? 'bg-[#252526] border-r border-[#3c3c3c]' : 'bg-[#f3f3f3] border-r border-gray-300'} flex flex-col`}>
          {/* Sidebar Header */}
          <div className={`px-4 py-2 ${isDarkMode ? 'border-b border-[#3c3c3c]' : 'border-b border-gray-300'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-[#cccccc]' : 'text-gray-600'}`}>
                Explorer
              </span>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewFileInput(true)}
                  className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
                >
                  <FolderPlus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarCollapsed(true)}
                  className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
                >
                  <PanelLeftClose className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Search */}
            <div className="relative mb-3">
              <Search className={`absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-7 h-7 text-xs ${isDarkMode ? 'bg-[#3c3c3c] border-[#3c3c3c] text-white placeholder:text-gray-400' : 'bg-white border-gray-300'}`}
              />
            </div>
            
            {showNewFileInput && (
              <div className="mb-2">
                <Input
                  placeholder="filename.ext"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddFile();
                    if (e.key === 'Escape') setShowNewFileInput(false);
                  }}
                  className={`h-7 text-xs ${isDarkMode ? 'bg-[#3c3c3c] border-[#3c3c3c] text-white' : 'bg-white border-gray-300'}`}
                  autoFocus
                />
              </div>
            )}
          </div>
          
          {/* File List */}
          <div className="flex-1 px-2 py-1 overflow-auto">
            <div className={`text-xs font-medium mb-2 flex items-center px-2 ${isDarkMode ? 'text-[#cccccc]' : 'text-gray-700'}`}>
              <ChevronDown className="w-3 h-3 mr-1" />
              PROJECT
            </div>
            <div className="space-y-0.5">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center space-x-2 px-2 py-1 rounded cursor-pointer text-sm group transition-colors ${
                    activeFileId === file.id
                      ? isDarkMode ? "bg-[#37373d] text-white" : "bg-blue-100 text-blue-900"
                      : isDarkMode ? "text-[#cccccc] hover:bg-[#2a2d2e]" : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => {
                    if (!openFileIds.includes(file.id)) {
                      setOpenFileIds(prev => [...prev, file.id]);
                    }
                    setActiveFileId(file.id);
                  }}
                >
                  {getFileIcon(file.name)}
                  <span className="flex-1 text-xs">{file.name}</span>
                  {openFileIds.includes(file.id) && <div className={`w-1 h-1 rounded-full ${isDarkMode ? 'bg-blue-400' : 'bg-blue-600'}`} />}
                  {file.isDirty && (
                    <div className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-white' : 'bg-gray-900'}`} />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id);
                    }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'hover:text-red-400' : 'hover:text-red-600'}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className={`flex items-center justify-between px-4 py-2 ${isDarkMode ? 'bg-[#2d2d30] border-b border-[#3c3c3c]' : 'bg-[#f8f8f8] border-b border-gray-300'}`}>
          <div className="flex items-center space-x-3">
            {sidebarCollapsed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarCollapsed(false)}
                className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            )}
            {/* Breadcrumbs */}
            <div className={`flex items-center space-x-1 text-sm ${isDarkMode ? 'text-[#cccccc]' : 'text-gray-600'}`}>
              <span>src</span>
              <ChevronRight className="w-3 h-3" />
              <span>pages</span>
              <ChevronRight className="w-3 h-3" />
              <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{activeFile?.name}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`h-7 px-2 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 mr-1" /> : <Maximize className="w-4 h-4 mr-1" />}
              <span className="text-xs">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowChat(!showChat)}
              className={`h-7 px-2 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              <span className="text-xs">AI Chat</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`h-7 w-7 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSave} 
              className={`h-7 px-2 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
            >
              <Save className="w-4 h-4 mr-1" />
              <span className="text-xs">Save</span>
            </Button>
          </div>
        </div>

        {/* File Tabs */}
        {openFiles.length > 0 && (
          <div className={`flex items-center ${isDarkMode ? 'bg-[#2d2d30] border-b border-[#3c3c3c]' : 'bg-[#f8f8f8] border-b border-gray-300'} overflow-x-auto`}>
            {openFiles.map((file) => (
              <div
                key={file.id}
                className={`flex items-center space-x-2 px-3 py-2 cursor-pointer text-sm border-r whitespace-nowrap transition-colors ${
                  activeFileId === file.id
                    ? isDarkMode ? "bg-[#1e1e1e] text-white border-[#3c3c3c]" : "bg-white text-gray-900 border-gray-300"
                    : isDarkMode ? "bg-[#2d2d30] text-[#cccccc] hover:bg-[#37373d] border-[#3c3c3c]" : "bg-[#f8f8f8] text-gray-600 hover:bg-gray-100 border-gray-300"
                }`}
                onClick={() => setActiveFileId(file.id)}
              >
                {getFileIcon(file.name)}
                <span className="text-xs">{file.name}</span>
                {file.isDirty && (
                  <div className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-white' : 'bg-gray-900'}`} />
                )}
                <button
                  onClick={(e) => handleCloseFile(file.id, e)}
                  className={`ml-1 p-0.5 rounded hover:bg-gray-600/20 transition-colors ${isDarkMode ? 'hover:text-red-400' : 'hover:text-red-600'}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Editor Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {openFiles.length === 0 ? (
            /* Empty State */
            <div className={`flex-1 flex items-center justify-center ${isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
              <div className="text-center">
                <FileText className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  No files open
                </h3>
                <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  Create a new file to start coding
                </p>
                <Button
                  onClick={() => setShowNewFileInput(true)}
                  className={`${isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New File
                </Button>
              </div>
            </div>
          ) : (
            <div className={`flex-1 flex ${isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
              {/* Line Numbers */}
              <div className={`w-12 ${isDarkMode ? 'bg-[#1e1e1e] border-r border-[#3c3c3c]' : 'bg-[#f8f8f8] border-r border-gray-300'} flex flex-col overflow-hidden`}>
                <div 
                  ref={lineNumbersRef}
                  className={`flex-1 py-4 px-2 font-mono text-xs select-none overflow-y-auto overflow-x-hidden scrollbar-none ${isDarkMode ? 'text-[#858585]' : 'text-gray-500'}`}
                  style={{
                    lineHeight: '24px',
                    fontFamily: 'Consolas, "Courier New", monospace',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                  }}
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i + 1} className="text-right h-6 leading-6 whitespace-nowrap">
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Code Editor */}
              <div className="flex-1 relative overflow-hidden">
                <Textarea
                  ref={textareaRef}
                  value={activeFile?.content || ""}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onScroll={handleTextareaScroll}
                  className={`w-full h-full resize-none border-none rounded-none font-mono text-sm leading-6 p-4 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-auto ${
                    isDarkMode 
                      ? 'bg-[#1e1e1e] text-[#d4d4d4] placeholder:text-[#6a6a6a]' 
                      : 'bg-white text-gray-900 placeholder:text-gray-500'
                  } scrollbar-thin ${isDarkMode ? 'scrollbar-thumb-gray-600 scrollbar-track-gray-800' : 'scrollbar-thumb-gray-400 scrollbar-track-gray-200'}`}
                  placeholder="Start typing your code..."
                  style={{ 
                    lineHeight: '24px',
                    fontFamily: 'Consolas, "Courier New", monospace'
                  }}
                />
              </div>
            </div>
          )}

          {/* AI Chat Panel */}
          {showChat && (
            <div className={`w-80 ${isDarkMode ? 'bg-[#252526] border-l border-[#3c3c3c]' : 'bg-[#f3f3f3] border-l border-gray-300'} flex flex-col`}>
              <div className={`px-4 py-3 ${isDarkMode ? 'border-b border-[#3c3c3c]' : 'border-b border-gray-300'}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-medium ${isDarkMode ? 'text-[#cccccc]' : 'text-gray-700'}`}>AI Assistant</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChat(false)}
                    className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((message) => (
                  <div key={message.id} className={`${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block max-w-[80%] p-3 rounded-lg text-sm ${
                      message.role === 'user'
                        ? isDarkMode ? 'bg-[#0e639c] text-white' : 'bg-blue-500 text-white'
                        : isDarkMode ? 'bg-[#2d2d30] text-[#cccccc] border border-[#3c3c3c]' : 'bg-white text-gray-900 border border-gray-300'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className={`p-4 ${isDarkMode ? 'border-t border-[#3c3c3c]' : 'border-t border-gray-300'}`}>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Ask me anything..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className={`flex-1 text-sm ${isDarkMode ? 'bg-[#3c3c3c] border-[#3c3c3c] text-white placeholder:text-gray-400' : 'bg-white border-gray-300'}`}
                  />
                  <Button
                    onClick={handleSendMessage}
                    size="sm"
                    className={`px-3 ${isDarkMode ? 'bg-[#0e639c] hover:bg-[#1177bb]' : 'bg-blue-500 hover:bg-blue-600'}`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;