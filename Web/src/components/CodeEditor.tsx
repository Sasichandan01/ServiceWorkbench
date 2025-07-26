import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import 'prismjs/components/prism-yaml';
import { ApiClient } from '@/lib/apiClient';
import { createWebSocketClient } from '@/lib/websocketClient';

// Add new types for folder/file structure
interface ScriptFile {
  id: string;
  name: string;
  content: string;
  language: string;
  folder: string; // 'code' or 'cft'
}

interface FolderTree {
  [folder: string]: ScriptFile[];
}

interface CodeEditorProps {
  workspaceId: string;
  solutionId: string;
  preloadedCodeFiles?: any;
}

const CodeEditor = ({ workspaceId, solutionId, preloadedCodeFiles }: CodeEditorProps) => {
  // Add custom CSS for syntax highlighting
  useEffect(() => {
    const styleId = 'syntax-highlighting-styles';
    let existingStyle = document.getElementById(styleId);
    
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .syntax-dark {
          color: #fff;
        }
        .syntax-light {
          color: #000;
        }
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
          color:rgb(191, 121, 45);
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
        
        /* Indentation guides */
        .indent-guide {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 1px;
          background-color: rgba(128, 128, 128, 0.2);
          pointer-events: none;
          z-index: 0;
        }
        
        /* Python-specific indentation guides */
        .python-indent-guide-4 { left: 4px; }
        .python-indent-guide-8 { left: 8px; }
        .python-indent-guide-12 { left: 12px; }
        .python-indent-guide-16 { left: 16px; }
        
        /* YAML-specific indentation guides */
        .yaml-indent-guide-2 { left: 2px; }
        .yaml-indent-guide-4 { left: 4px; }
        .yaml-indent-guide-6 { left: 6px; }
        .yaml-indent-guide-8 { left: 8px; }
        
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

        /* Custom scrollbar styles for the editor */
        .editor-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(121, 121, 121, 0.6) transparent;
        }
        
        .editor-scrollbar::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        
        .editor-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }
        
        .editor-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(121, 121, 121, 0.6);
          border-radius: 6px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        
        .editor-scrollbar::-webkit-scrollbar-thumb:hover {
         background: rgba(121, 121, 121, 0.8);
          background-clip: padding-box;
        }
        
        .editor-scrollbar::-webkit-scrollbar-thumb:active {
          background: rgba(121, 121, 121, 1);
          background-clip: padding-box;
        }
        
        .editor-scrollbar::-webkit-scrollbar-corner {
          background: transparent;
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

  const [folderTree, setFolderTree] = useState<FolderTree>({});
  // Track open files by id (id = folder + '/' + name)
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>("");
  const [isDarkMode, setIsDarkMode] = useState(false);
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
  const wsClientRef = useRef<ReturnType<typeof createWebSocketClient> | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  // Indentation settings
  const getIndentSize = (language: string): number => {
    switch (language) {
      case 'python': return 4;
      case 'yaml': return 2;
      default: return 2;
    }
  };

  const getIndentChar = (language: string): string => {
    return ' '; // Always use spaces for consistency
  };

  // Helper to get language from file name
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
      case 'yml': case 'yaml': return 'yaml';
      default: return 'text';
    }
  };

  // Add a helper to get ContentType for code files
  const getContentType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'text/x-python';
      case 'yaml':
      case 'yml': return 'text/yaml';
      case 'json': return 'application/json';
      case 'js': return 'application/javascript';
      case 'ts': return 'application/typescript';
      case 'sql': return 'application/sql';
      case 'java': return 'text/x-java-source';
      case 'c': return 'text/x-c';
      case 'cpp': return 'text/x-c++';
      case 'css': return 'text/css';
      case 'html': return 'text/html';
      case 'txt': return 'text/plain';
      default: return 'application/octet-stream';
    }
  };

  // Fetch scripts and file contents on mount or when workspaceId/solutionId changes
  useEffect(() => {
    if (!workspaceId || !solutionId) return;
    
    const fetchScripts = async () => {
      try {
        setFolderTree({});
        setOpenFileIds([]);
        setActiveFileId("");
        
        // Use preloaded data if available, otherwise fetch
        const data = preloadedCodeFiles || await (async () => {
          const apiUrl = `/workspaces/${workspaceId}/solutions/${solutionId}/scripts`;
          const resp = await ApiClient.get(apiUrl);
          if (!resp.ok) throw new Error('Failed to fetch scripts');
          return await resp.json();
        })();
        
        const preSigned = data?.PreSignedURLs || {};
        const newTree: FolderTree = {};
        let firstFile: ScriptFile | undefined = undefined;
        
        for (const folder of Object.keys(preSigned)) {
          if (Array.isArray(preSigned[folder])) {
            const files = await Promise.all(
              preSigned[folder].map(async (file: { FileName: string; Url: string }, idx: number) => {
                try {
                  const fileResp = await fetch(file.Url);
                  const content = await fileResp.ok ? await fileResp.text() : '';
                  const scriptFile: ScriptFile = {
                    id: `${folder}/${file.FileName}`,
                    name: file.FileName,
                    content,
                    language: getLanguageFromFileName(file.FileName),
                    folder,
                  };
                  if (!firstFile) firstFile = scriptFile;
                  return scriptFile;
                } catch {
                  const scriptFile: ScriptFile = {
                    id: `${folder}/${file.FileName}`,
                    name: file.FileName,
                    content: '',
                    language: getLanguageFromFileName(file.FileName),
                    folder,
                  };
                  if (!firstFile) firstFile = scriptFile;
                  return scriptFile;
                }
              })
            );
            newTree[folder] = files;
          }
        }
        setFolderTree(newTree);
        // Open the first file by default if available
        if (firstFile) {
          setOpenFileIds([firstFile.id]);
          setActiveFileId(firstFile.id);
        }
      } catch (err) {
        // Optionally show a toast
      }
    };
    fetchScripts();
  }, [workspaceId, solutionId, preloadedCodeFiles]);

  // Helper to get file by id
  const getFileById = (id: string): ScriptFile | undefined => {
    for (const folder of Object.keys(folderTree)) {
      const file = folderTree[folder].find(f => f.id === id);
      if (file) return file;
    }
    return undefined;
  };

  const activeFile = getFileById(activeFileId);
  const openFiles = openFileIds.map(getFileById).filter(Boolean) as ScriptFile[];

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeFileId, openFiles]); // Add dependencies to ensure latest state

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
        const containerWidth = window.innerWidth;
        const maxSidebarWidth = Math.min(600, containerWidth * 0.4);
        const deltaX = e.clientX - dragStartX;
        const newWidth = Math.max(200, Math.min(maxSidebarWidth, initialSidebarWidth + deltaX));
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
        const containerWidth = window.innerWidth;
        const maxChatWidth = Math.min(600, containerWidth * 0.5);
        const deltaX = dragStartX - e.clientX; // Reverse for chat panel
        const newWidth = Math.max(200, Math.min(maxChatWidth, initialChatWidth + deltaX));
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
    // This function is no longer directly used for saving, as saving is handled by the backend.
    // We keep it for potential local changes, but the 'isDirty' state will be managed by the backend.
    // For now, we'll just update the content in the state.
    setFolderTree(prev => {
      const newTree = { ...prev };
      const file = getFileById(activeFileId);
      if (file) {
        newTree[file.folder] = newTree[file.folder].map(f => 
          f.id === activeFileId ? { ...f, content } : f
        );
      }
      return newTree;
    });
  };

  // Handle indentation and special key behaviors
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const language = activeFile?.language || 'text';
    const indentSize = getIndentSize(language);
    const indentChar = getIndentChar(language);

    // Handle Tab key
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: Remove indentation
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = value.indexOf('\n', start);
        const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
        const line = value.substring(lineStart, lineEndPos);
        const indentMatch = line.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1] : '';
        
        if (currentIndent.length >= indentSize) {
          const newIndent = currentIndent.slice(indentSize);
          const newValue = value.substring(0, lineStart) + newIndent + value.substring(lineStart + currentIndent.length);
          const newCursorPos = start - indentSize;
          textarea.value = newValue;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
          handleContentChange(newValue);
        }
      } else {
        // Tab: Add indentation
        const indent = indentChar.repeat(indentSize);
        const newValue = value.substring(0, start) + indent + value.substring(end);
        const newCursorPos = start + indentSize;
        textarea.value = newValue;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        handleContentChange(newValue);
      }
      return;
    }

    // Handle Enter key with auto-indentation
    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const line = value.substring(lineStart, start);
      const indentMatch = line.match(/^(\s*)/);
      const currentIndent = indentMatch ? indentMatch[1] : '';
      
      let newIndent = currentIndent;
      
      // Python-specific auto-indentation
      if (language === 'python') {
        const trimmedLine = line.trim();
        if (trimmedLine.endsWith(':')) {
          // Increase indent after colon (if, for, while, def, class, etc.)
          newIndent += indentChar.repeat(indentSize);
        } else if (trimmedLine.startsWith('elif ') || trimmedLine.startsWith('else:') || trimmedLine.startsWith('except') || trimmedLine.startsWith('finally:')) {
          // Decrease indent for elif, else, except, finally
          if (newIndent.length >= indentSize) {
            newIndent = newIndent.slice(indentSize);
          }
        }
      }
      
      // YAML-specific auto-indentation
      if (language === 'yaml') {
        const trimmedLine = line.trim();
        if (trimmedLine.endsWith(':') && !trimmedLine.startsWith('#')) {
          // Increase indent after colon in YAML
          newIndent += indentChar.repeat(indentSize);
        }
      }
      
      const newValue = value.substring(0, start) + '\n' + newIndent + value.substring(end);
      const newCursorPos = start + 1 + newIndent.length;
      textarea.value = newValue;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      handleContentChange(newValue);
      
      // Auto-scroll to ensure the new line is visible (like standard code editors)
      setTimeout(() => {
        if (textarea.scrollHeight > textarea.clientHeight) {
          const cursorLinePosition = textarea.value.substring(0, newCursorPos).split('\n').length;
          const lineHeight = 24; // Line height as defined in the styles
          const scrollTop = (cursorLinePosition - 1) * lineHeight;
          const visibleHeight = textarea.clientHeight;
          const maxVisibleLines = Math.floor(visibleHeight / lineHeight);
          
          // If cursor is near the bottom of visible area, scroll to keep it in view
          if (scrollTop > textarea.scrollTop + visibleHeight - lineHeight * 3) {
            textarea.scrollTop = Math.max(0, scrollTop - visibleHeight + lineHeight * 3);
          }
        }
      }, 0);
      
      return;
    }

    // Handle auto-closing brackets and quotes
    const autoClosePairs: { [key: string]: string } = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'"
    };

    if (autoClosePairs[e.key]) {
      e.preventDefault();
      const closingChar = autoClosePairs[e.key];
      const newValue = value.substring(0, start) + e.key + closingChar + value.substring(end);
      const newCursorPos = start + 1;
      textarea.value = newValue;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      handleContentChange(newValue);
      return;
    }
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
      // 1. Get PreSignedURL for this file
      const postBody = {
        FileName: activeFile.name,
        ContentType: getContentType(activeFile.name)
      };
      const apiUrl = `/workspaces/${workspaceId}/solutions/${solutionId}/scripts`;
      const resp = await ApiClient.post(apiUrl, postBody);
      if (!resp.ok) throw new Error('Failed to get presigned URL');
      const data = await resp.json();
      const preSignedUrl = data?.PreSignedURL;
      if (!preSignedUrl) throw new Error('No PreSignedURL returned');

      // 2. PUT file content to the presigned URL
      const putResp = await fetch(preSignedUrl, {
        method: 'PUT',
        body: activeFile.content,
        headers: {
          'Content-Type': getContentType(activeFile.name)
        }
      });
      if (!putResp.ok) throw new Error('Failed to upload file to storage');

      // 3. Update local state (optional, for UI feedback)
      setFolderTree(prev => {
        const newTree = { ...prev };
        const file = getFileById(activeFileId);
        if (file) {
          newTree[file.folder] = newTree[file.folder].map(f => 
            f.id === activeFileId ? { ...f, content: activeFile.content } : f
          );
        }
        return newTree;
      });
      toast({
        title: 'File Saved',
        description: `${activeFile.name} has been saved successfully.`
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.data?.message || error?.message || (typeof error === 'string' ? error : 'An error occurred.'),
        variant: 'destructive'
      });
    }
  };

  const handleAddFile = () => {
    if (!newFileName.trim()) return;
    
    const newFile: ScriptFile = {
      id: `${activeFile?.folder || 'code'}/${Date.now().toString()}`,
      name: newFileName,
      content: "",
      language: getLanguageFromFileName(newFileName),
      folder: activeFile?.folder || 'code',
    };
    
    setFolderTree(prev => ({
      ...prev,
      [newFile.folder]: [...prev[newFile.folder], newFile]
    }));
    setOpenFileIds(prev => [...prev, newFile.id]);
    setActiveFileId(newFile.id);
    setNewFileName("");
    setShowNewFileInput(false);
  };

  const handleDeleteFile = (fileId: string) => {
    // Remove from both project files and open files
    setFolderTree(prev => {
      const [folder, fileName] = fileId.split('/');
      const newTree = { ...prev };
      const index = newTree[folder].findIndex(f => f.id === fileId);
      if (index !== -1) {
        newTree[folder].splice(index, 1);
      }
      return newTree;
    });
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

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = isDarkMode ? "w-4 h-4 text-blue-400" : "w-4 h-4 text-blue-600";
    return <FileText className={iconClass} />;
  };

  const filteredFiles = openFiles.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        // Handle AI response
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
          setChatMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content }]);
        }
      } catch (err) {
        setChatMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: String(event.data) }]);
      }
    });
    return () => {
      wsClient.close();
    };
  }, []);

  const handleSendMessage = () => {
    if (!chatInput.trim() || !wsClientRef.current || !wsConnected) return;
    const userMessage = { id: Date.now(), role: 'user' as const, content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    wsClientRef.current.send(JSON.stringify({ action: 'sendMessage', message: chatInput, workspaceId, solutionId }));
    setChatInput("");
  };

  // Calculate line numbers based on content
  const lines = activeFile?.content.split('\n') || [''];
  const lineCount = lines.length;

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-[600px]'} flex flex-col w-full max-w-full overflow-hidden ${isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
      {/* Main Content: Sidebar + Editor + Chat in horizontal layout */}
      <div className="flex-1 flex min-h-0 w-full max-w-full overflow-hidden">
        {/* Sidebar (left) */}
        {!sidebarCollapsed && (
          <div 
            className={`${isDarkMode ? 'bg-[#252526] border-r border-[#3c3c3c]' : 'bg-[#f3f3f3] border-r border-gray-300'} flex flex-col relative flex-shrink-0 max-w-[40%]`}
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
                {Object.keys(folderTree).map(folder => (
                  <div key={folder}>
                    <div className={`flex items-center px-2 py-1 text-xs font-semibold uppercase ${isDarkMode ? 'text-white' : ''}`}>
                      <Folder className="w-4 h-4 mr-1" />
                      {folder}
                    </div>
                    {folderTree[folder].map(file => (
                      <div
                        key={file.id}
                        className={`flex items-center space-x-2 px-4 py-1 rounded cursor-pointer text-sm group transition-colors ${
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

        {/* Main Editor Area (center) */}
        <div className="flex-1 flex flex-col min-w-0 w-0">
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
                {activeFile?.name
                  ? activeFile.name.split('/').map((part, idx, arr) => (
                      <span key={idx} className="flex items-center">
                        <span className={
                          idx === arr.length - 1
                            ? isDarkMode ? 'text-white font-semibold' : 'text-gray-900 font-semibold'
                            : undefined
                        }>{part}</span>
                        {idx < arr.length - 1 && (
                          <ChevronRight className="w-3 h-3 mx-1" />
                        )}
                      </span>
                    ))
                  : null}
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

          {/* File Tabs - Fixed to always stay visible */}
          {openFiles.length > 0 && (
            <div className={`${isDarkMode ? 'bg-[#2d2d30] border-b border-[#3c3c3c]' : 'bg-[#f8f8f8] border-b border-gray-300'}`}>
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex">
                  {openFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`flex items-center space-x-2 px-3 py-2 cursor-pointer text-sm border-r whitespace-nowrap transition-colors flex-shrink-0 ${
                        activeFileId === file.id
                          ? isDarkMode ? "bg-[#1e1e1e] text-white border-[#3c3c3c]" : "bg-white text-gray-900 border-gray-300"
                          : isDarkMode ? "bg-[#2d2d30] text-[#cccccc] hover:bg-[#37373d] border-[#3c3c3c]" : "bg-[#f8f8f8] text-gray-600 hover:bg-gray-100 border-gray-300"
                      }`}
                      onClick={() => setActiveFileId(file.id)}
                    >
                      {getFileIcon(file.name)}
                      <span className="text-xs">{file.name}</span>
                      {/* The isDirty state is no longer directly managed here,
                          as it's handled by the backend.
                          For now, we'll just show a placeholder or remove it if not needed.
                          Since the backend handles saving, we can't easily track local changes
                          without a more complex state management.
                          For now, we'll remove the isDirty indicator as it's not directly
                          tied to the backend's dirty state. */}
                      {/* {file.isDirty && (
                        <div className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-white' : 'bg-gray-900'}`} />
                      )} */}
                      <button
                        onClick={(e) => handleCloseFile(file.id, e)}
                        className={`ml-1 p-0.5 rounded hover:bg-gray-600/20 transition-colors ${isDarkMode ? 'hover:text-red-400' : 'hover:text-red-600'}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Editor Content */}
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
            <div className={`flex-1 flex ${isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white'} overflow-hidden min-w-0 w-full max-w-full`}>
              {/* Line Numbers - Fixed positioning and scrolling */}
              <div className={`w-12 ${isDarkMode ? 'bg-[#1e1e1e] border-r border-[#3c3c3c]' : 'bg-[#f8f8f8] border-r border-gray-300'} flex flex-col overflow-hidden`}>
                <div 
                  ref={lineNumbersRef}
                  className={`flex-1 py-4 px-2 font-mono text-xs select-none overflow-hidden ${isDarkMode ? 'text-[#858585]' : 'text-gray-500'}`}
                  style={{
                    lineHeight: '24px',
                    fontFamily: 'Fira Mono, JetBrains Mono, Menlo, Consolas, "Courier New", monospace'
                  }}
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i + 1} className="text-right h-6 leading-6 whitespace-nowrap">
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Code Editor with Syntax Highlighting - Enhanced scrolling */}
              <div className="flex-1 relative overflow-hidden min-w-0 w-full max-w-full">
                {/* Syntax Highlighting Layer */}
                <pre 
                  ref={highlightRef}
                  className={`absolute inset-0 p-4 font-mono text-sm leading-6 pointer-events-none select-none overflow-hidden whitespace-pre-wrap break-words w-full max-w-full min-w-0 ${
                    isDarkMode ? 'syntax-dark' : 'syntax-light'
                  }`}
                  style={{ 
                    lineHeight: '24px',
                    fontFamily: 'Fira Mono, JetBrains Mono, Menlo, Consolas, "Courier New", monospace',
                    zIndex: 1,
                    margin: 0,
                    background: 'transparent'
                  }}
                  aria-hidden="true"
                />
                
                {/* Editable Textarea - Enhanced with proper scrollbars */}
                <Textarea
                  ref={textareaRef}
                  value={activeFile?.content || ""}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={handleTextareaScroll}
                  className={`absolute inset-0 w-full h-full min-w-0 max-w-full resize-none border-none rounded-none font-mono text-sm leading-6 p-4 bg-transparent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 editor-scrollbar ${
                    isDarkMode ? 'text-[#d4d4d4] placeholder:text-[#6a6a6a]' : 'text-gray-900 placeholder:text-gray-500'
                  }`}
                  placeholder="Start typing your code..."
                  style={{ 
                    lineHeight: '24px',
                    fontFamily: 'Fira Mono, JetBrains Mono, Menlo, Consolas, "Courier New", monospace',
                    color: 'transparent',
                    caretColor: isDarkMode ? '#d4d4d4' : '#000000',
                    zIndex: 2,
                    background: 'transparent'
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* AI Chat Panel (right) */}
        {showChat && (
          <div 
            className={`${isDarkMode ? 'bg-[#252526] border-l border-[#3c3c3c]' : 'bg-[#f3f3f3] border-l border-gray-300'} flex flex-col relative flex-shrink-0 max-w-[50%]`}
            style={{ width: `${chatWidth}px` }}
          >
            <div className={`px-4 py-3 ${isDarkMode ? 'border-b border-[#3c3c3c]' : 'border-b border-gray-300'}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-medium ${isDarkMode ? 'text-[#cccccc]' : 'text-gray-700'}`}>AI Assistant</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChat(false)}
                  className={`h-5 w-5 p-0 ${isDarkMode ? 'hover:bg-[#2a2d2e] text-[#cccccc]' : 'hover:bg-gray-200'}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!wsConnected && (
                <div className="text-xs text-yellow-600 mb-2">Connecting to AI chat...</div>
              )}
              {wsError && (
                <div className="text-xs text-red-600 mb-2">{wsError}</div>
              )}
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
              className={`absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-500 cursor-col-resize z-20 ${isDraggingChat ? 'bg-blue-500' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setDragStartX(e.clientX);
                setInitialChatWidth(chatWidth);
                setIsDraggingChat(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Status Bar */}
      {activeFile && (
        <div className={`h-7 px-4 py-1 text-xs border-t flex items-center justify-between ${
          isDarkMode 
            ? 'bg-[#23272e] text-[#d4d4d4] border-[#23272e]' 
            : 'bg-[#f3f3f3] text-[#222] border-[#e5e7eb]'
        }`}>
          <div className="flex items-center space-x-4">
            <span className="text-inherit">Language: {activeFile.language}</span>
            <span className="text-inherit">Indent: {getIndentSize(activeFile.language)} spaces</span>
            {/* Fix: Move line calculation outside JSX */}
            {(() => {
              let lineNumber = 1;
              if (textareaRef.current) {
                const pos = textareaRef.current.selectionStart || 0;
                lineNumber = activeFile.content.substring(0, pos).split('\n').length;
              }
              return <span className="text-inherit">Line: {lineNumber}</span>;
            })()}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-inherit">Tab: {getIndentSize(activeFile.language)} spaces</span>
            <span className="text-inherit">Encoding: UTF-8</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;
