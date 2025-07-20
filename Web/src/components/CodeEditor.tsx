import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Moon, Sun, Save, FileText, Plus, Trash2, Folder, FolderPlus, ChevronRight, ChevronDown, PanelLeftClose, PanelLeft, Search, X, MessageSquare, Send, Maximize, Minimize } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
// Load languages in correct dependency order
import 'prismjs/components/prism-c';           // C must be loaded before C++
import 'prismjs/components/prism-cpp';         // C++ extends C
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';

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
  // Add custom CSS for syntax highlighting
  useEffect(() => {
    const styleId = 'syntax-highlighting-styles';
    let existingStyle = document.getElementById(styleId);
    
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Dark theme syntax highlighting - VSCode like */
        .syntax-dark .token.comment,
        .syntax-dark .token.prolog,
        .syntax-dark .token.doctype,
        .syntax-dark .token.cdata {
          color: #6A9955;
          font-style: italic;
        }
        
        .syntax-dark .token.punctuation {
          color: #D4D4D4;
        }
        
        .syntax-dark .token.property,
        .syntax-dark .token.tag,
        .syntax-dark .token.boolean,
        .syntax-dark .token.number,
        .syntax-dark .token.constant,
        .syntax-dark .token.symbol,
        .syntax-dark .token.deleted {
          color: #B5CEA8;
        }
        
        .syntax-dark .token.selector,
        .syntax-dark .token.attr-name,
        .syntax-dark .token.string,
        .syntax-dark .token.char,
        .syntax-dark .token.builtin,
        .syntax-dark .token.inserted {
          color: #CE9178;
        }
        
        .syntax-dark .token.operator,
        .syntax-dark .token.entity,
        .syntax-dark .token.url,
        .syntax-dark .language-css .token.string,
        .syntax-dark .style .token.string {
          color: #D4D4D4;
        }
        
        .syntax-dark .token.atrule,
        .syntax-dark .token.attr-value,
        .syntax-dark .token.keyword {
          color: #569CD6;
        }
        
        .syntax-dark .token.function,
        .syntax-dark .token.class-name {
          color: #DCDCAA;
        }
        
        .syntax-dark .token.regex,
        .syntax-dark .token.important,
        .syntax-dark .token.variable {
          color: #9CDCFE;
        }
        
        /* Python-specific tokens */
        .syntax-dark .token.decorator,
        .syntax-dark .token.annotation {
          color: #FFD700;
        }
        
        .syntax-dark .token.builtin-name {
          color: #4EC9B0;
        }
        
        /* Special variables like __name__, __main__ */
        .syntax-dark .token.magic-variable {
          color:rgb(53, 145, 195);
          font-weight: bold;
        }
        
        /* Triple quoted strings */
        .syntax-dark .token.triple-quoted-string {
          color: #6A9955;
          font-style: italic;
        }
        
        /* Resize handles */
        .resize-handle {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 4px;
          cursor: col-resize;
          transition: background-color 0.2s;
        }
        
        .resize-handle:hover {
          background-color: rgba(59, 130, 246, 0.5);
        }
        
        .resize-handle.dragging {
          background-color: rgb(59, 130, 246);
        }
        
        /* Light theme syntax highlighting */
        .syntax-light .token.comment,
        .syntax-light .token.prolog,
        .syntax-light .token.doctype,
        .syntax-light .token.cdata {
          color: #008000;
        }
        
        .syntax-light .token.punctuation {
          color: #000000;
        }
        
        .syntax-light .token.property,
        .syntax-light .token.tag,
        .syntax-light .token.boolean,
        .syntax-light .token.number,
        .syntax-light .token.constant,
        .syntax-light .token.symbol,
        .syntax-light .token.deleted {
          color: #0070f3;
        }
        
        .syntax-light .token.selector,
        .syntax-light .token.attr-name,
        .syntax-light .token.string,
        .syntax-light .token.char,
        .syntax-light .token.builtin,
        .syntax-light .token.inserted {
          color: #a31515;
        }
        
        .syntax-light .token.operator,
        .syntax-light .token.entity,
        .syntax-light .token.url,
        .syntax-light .language-css .token.string,
        .syntax-light .style .token.string {
          color: #000000;
        }
        
        .syntax-light .token.atrule,
        .syntax-light .token.attr-value,
        .syntax-light .token.keyword {
          color: #0000ff;
        }
        
        .syntax-light .token.function,
        .syntax-light .token.class-name {
          color: #795e26;
        }
        
        .syntax-light .token.regex,
        .syntax-light .token.important,
        .syntax-light .token.variable {
          color: #d73a49;
        }
      `;
      document.head.appendChild(style);
    }
    
    return () => {
      const style = document.getElementById(styleId);
      if (style) {
        document.head.removeChild(style);
      }
    };
  }, []);
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
  const [sidebarWidth, setSidebarWidth] = useState(320); // Default 320px (w-80)
  const [chatWidth, setChatWidth] = useState(320); // Default 320px (w-80)
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const [initialSidebarWidth, setInitialSidebarWidth] = useState(320);
  const [initialChatWidth, setInitialChatWidth] = useState(320);
  const [dragStartX, setDragStartX] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
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

  // Update syntax highlighting
  useEffect(() => {
    if (activeFile && highlightRef.current) {
      updateHighlighting();
    }
  }, [activeFile?.content, activeFile?.language, isDarkMode]);

  // Handle sidebar dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar) {
        const deltaX = e.clientX - dragStartX;
        const newWidth = Math.max(200, Math.min(600, initialSidebarWidth + deltaX));
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    if (isDraggingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingSidebar, dragStartX, initialSidebarWidth]);

  // Handle chat panel dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingChat) {
        const deltaX = dragStartX - e.clientX; // Reverse for chat panel
        const newWidth = Math.max(200, Math.min(600, initialChatWidth + deltaX));
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingChat(false);
    };

    if (isDraggingChat) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingChat, dragStartX, initialChatWidth]);

  // Sync scroll between textarea, highlight layer, and line numbers
  const handleTextareaScroll = () => {
    if (textareaRef.current && lineNumbersRef.current && highlightRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      lineNumbersRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
  };

  const updateHighlighting = () => {
    if (!activeFile || !highlightRef.current) return;
    
    try {
      const language = activeFile.language === 'text' ? 'javascript' : activeFile.language;
      let highlighted = Prism.highlight(
        activeFile.content,
        Prism.languages[language] || Prism.languages.javascript,
        language
      );
      
      // Post-process for Python special variables like __name__, __main__, etc.
      if (activeFile.language === 'python') {
        highlighted = highlighted.replace(
          /\b(__\w+__)\b/g, 
          '<span class="token magic-variable">$1</span>'
        );
        
        // Handle decorators
        highlighted = highlighted.replace(
          /@(\w+)/g,
          '<span class="token decorator">@$1</span>'
        );
        
        // Handle built-in functions
        highlighted = highlighted.replace(
          /\b(print|len|range|type|str|int|float|list|dict|set|tuple|bool|input|open|enumerate|zip|map|filter|sorted|min|max|sum|any|all|abs|round|pow|divmod|hex|oct|bin|ord|chr|repr|eval|exec|compile|hasattr|getattr|setattr|delattr|isinstance|issubclass|super|vars|locals|globals|dir|help|id|hash|callable|iter|next|reversed|slice)\b/g,
          '<span class="token builtin-name">$1</span>'
        );
      }
      
      highlightRef.current.innerHTML = highlighted;
    } catch (error) {
      // Fallback to plain text if highlighting fails
      if (highlightRef.current) {
        highlightRef.current.textContent = activeFile.content;
      }
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
        <div 
          className={`${isDarkMode ? 'bg-[#252526] border-r border-[#3c3c3c]' : 'bg-[#f3f3f3] border-r border-gray-300'} flex flex-col relative`}
          style={{ width: `${sidebarWidth}px` }}
        >
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
                  className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
                >
                  <FolderPlus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarCollapsed(true)}
                  className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
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
          
          {/* Sidebar Resize Handle */}
          <div
            className={`resize-handle right-0 ${isDraggingSidebar ? 'dragging' : ''}`}
            onMouseDown={(e) => {
              setDragStartX(e.clientX);
              setInitialSidebarWidth(sidebarWidth);
              setIsDraggingSidebar(true);
            }}
          />
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
                className={`h-6 w-6 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
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
              className={`h-7 px-2 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 mr-1" /> : <Maximize className="w-4 h-4 mr-1" />}
              <span className="text-xs">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowChat(!showChat)}
              className={`h-7 px-2 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              <span className="text-xs">AI Chat</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`h-7 w-7 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSave} 
              className={`h-7 px-2 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white' : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'}`}
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
              
              {/* Code Editor with Syntax Highlighting */}
              <div className="flex-1 relative overflow-hidden">
                {/* Syntax Highlighting Layer */}
                <pre 
                  ref={highlightRef}
                  className={`absolute inset-0 p-4 font-mono text-sm leading-6 pointer-events-none select-none overflow-auto whitespace-pre-wrap break-words scrollbar-none ${
                    isDarkMode ? 'syntax-dark' : 'syntax-light'
                  }`}
                  style={{ 
                    lineHeight: '24px',
                    fontFamily: 'Consolas, "Courier New", monospace',
                    zIndex: 1,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    margin: 0,
                    background: 'transparent'
                  }}
                  aria-hidden="true"
                />
                
                {/* Editable Textarea (Transparent text) */}
                <Textarea
                  ref={textareaRef}
                  value={activeFile?.content || ""}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onScroll={handleTextareaScroll}
                  className={`absolute inset-0 w-full h-full resize-none border-none rounded-none font-mono text-sm leading-6 p-4 bg-transparent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-auto scrollbar-thin ${
                    isDarkMode ? 'scrollbar-thumb-gray-600 scrollbar-track-transparent caret-white' : 'scrollbar-thumb-gray-400 scrollbar-track-transparent caret-black'
                  }`}
                  placeholder="Start typing your code..."
                  style={{ 
                    lineHeight: '24px',
                    fontFamily: 'Consolas, "Courier New", monospace',
                    color: 'transparent',
                    zIndex: 2,
                    background: 'transparent'
                  }}
                />
              </div>
            </div>
          )}

          {/* AI Chat Panel */}
          {showChat && (
            <div 
              className={`${isDarkMode ? 'bg-[#252526] border-l border-[#3c3c3c]' : 'bg-[#f3f3f3] border-l border-gray-300'} flex flex-col relative`}
              style={{ width: `${chatWidth}px` }}
            >
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
              
              {/* Chat Panel Resize Handle */}
              <div
                className={`resize-handle left-0 ${isDraggingChat ? 'dragging' : ''}`}
                onMouseDown={(e) => {
                  setDragStartX(e.clientX);
                  setInitialChatWidth(chatWidth);
                  setIsDraggingChat(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;