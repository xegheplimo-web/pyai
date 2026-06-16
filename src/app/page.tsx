'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Zap, Brain, Server, Globe, Terminal,
  Send, RotateCcw, Sparkles, Layers, Code2, Wrench,
  Search, Bot, Eye, Image, Mic,
  CheckCircle2, XCircle, Clock, FolderOpen, FileText,
  RefreshCw, ChevronDown, ChevronRight, X,
  MapPin, ExternalLink, Phone, Building2,
  BookOpen, Lightbulb, Loader2, Command,
  Wifi, WifiOff, Cpu, HardDrive, Settings,
  Trash2, ArrowUp, Hash
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import dynamic from 'next/dynamic';

// Dynamic import for Leaflet map (no SSR)
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[250px] rounded-xl bg-slate-800/50 flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
    </div>
  ),
});

// ─── Types ───────────────────────────────────────────────
interface HermesStatus {
  connected: boolean;
  health: any;
  models: any;
  capabilities: any;
  skills: any;
  sessions: any;
  apiBaseUrl: string;
}

interface Skill {
  name: string;
  description: string;
  category: string;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  status: string;
}

interface SearchSource {
  id: number;
  url: string;
  name: string;
  snippet: string;
  host_name?: string;
  date?: string;
}

interface SearchPlace {
  id: number | string;
  name: string;
  fullAddress: string;
  lat: number;
  lon: number;
  type?: string;
  category?: string;
  phone?: string | null;
  website?: string | null;
  openingHours?: string | null;
}

interface SearchResult {
  answer: string;
  sources: SearchSource[];
  places: SearchPlace[];
  query: string;
}

// Extended message type for rich content
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: 'text' | 'search' | 'skills' | 'sessions' | 'help' | 'architecture';
  data?: any;
  timestamp: number;
}

// ─── Models Config ───────────────────────────────────────
const AVAILABLE_MODELS = [
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'Alibaba Cloud',
    description: 'Model nhanh, đa ngôn ngữ',
    icon: Cpu,
    color: 'from-orange-500 to-amber-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    textColor: 'text-orange-400',
  },
  {
    id: 'hermes-agent',
    name: 'Hermes Agent',
    provider: 'Nous Research (Local)',
    description: 'Agent tự trị, trí nhớ bền vững',
    icon: Brain,
    color: 'from-violet-500 to-purple-500',
    bgColor: 'bg-violet-500/10 border-violet-500/30',
    textColor: 'text-violet-400',
  },
];

// Category config
const categoryIcons: Record<string, any> = {
  filesystem: FolderOpen, execution: Terminal, web: Globe,
  browser: Eye, media: Image, agent: Bot,
};
const categoryColors: Record<string, string> = {
  filesystem: 'text-amber-500 bg-amber-500/10',
  execution: 'text-red-500 bg-red-500/10',
  web: 'text-cyan-500 bg-cyan-500/10',
  browser: 'text-purple-500 bg-purple-500/10',
  media: 'text-pink-500 bg-pink-500/10',
  agent: 'text-emerald-500 bg-emerald-500/10',
};

// ─── Main Component ──────────────────────────────────────
export default function Home() {
  // State
  const [hermesStatus, setHermesStatus] = useState<HermesStatus | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [selectedModel, setSelectedModel] = useState('qwen3.5-flash');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedSearchPlace, setSelectedSearchPlace] = useState<SearchPlace | null>(null);
  const [showMapForMessage, setShowMapForMessage] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const currentModel = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];
  const isConnected = hermesStatus?.connected ?? false;

  // Sync AI messages to chat messages - using useChat's onFinish callback
  const { messages: aiMessages, isLoading: isAiLoading, append, reload, setMessages: setAiMessages } = useChat({
    api: '/api/chat',
    body: { model: selectedModel },
    onFinish: (message) => {
      if (message.role === 'assistant' && message.content) {
        setChatMessages(prev => {
          const lastChatMsg = prev[prev.length - 1];
          if (lastChatMsg?.role === 'assistant' && lastChatMsg?.type === 'text') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: message.content } : m);
          }
          return prev;
        });
      }
    },
    onError: (err) => console.error('Chat error:', err),
  });

  // Fetch Hermes status
  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/hermes/status');
      const data = await res.json();
      setHermesStatus(data);
    } catch {
      setHermesStatus({ connected: false, health: null, models: null, capabilities: null, skills: null, sessions: null, apiBaseUrl: 'http://127.0.0.1:8642' });
    }
    setIsLoadingStatus(false);
  }, []);

  // Fetch skills & sessions
  const fetchData = useCallback(async () => {
    try {
      const [skillsRes, sessionsRes] = await Promise.all([
        fetch('/api/hermes/skills'),
        fetch('/api/hermes/sessions'),
      ]);
      const skillsData = await skillsRes.json();
      const sessionsData = await sessionsRes.json();
      setSkills(skillsData.skills || []);
      setSessions(sessionsData.sessions || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      await Promise.all([fetchStatus(), fetchData()]);
    };
    loadInitial();
    const interval = setInterval(() => { fetchStatus(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, aiMessages]);

  // Close model picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showModelPicker && !(e.target as HTMLElement).closest('[data-model-picker]')) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelPicker]);

  // ─── Command Handlers ──────────────────────────────────
  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, newMsg]);
    return newMsg.id;
  }, []);

  // Handle smart search
  const handleSearch = useCallback(async (query: string) => {
    const userMsgId = addMessage({ role: 'user', content: query, type: 'text' });
    setIsProcessing(true);

    const loadingId = addMessage({ role: 'assistant', content: '', type: 'search', data: { loading: true, query } });

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      setChatMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          ...m,
          content: data.answer || 'Không tìm thấy kết quả.',
          data: { sources: data.sources || [], places: data.places || [], query },
        } : m
      ));
    } catch {
      setChatMessages(prev => prev.map(m =>
        m.id === loadingId ? { ...m, content: 'Lỗi khi tìm kiếm. Vui lòng thử lại.', data: { error: true } } : m
      ));
    }
    setIsProcessing(false);
  }, [addMessage]);

  // Handle AI chat
  const handleChat = useCallback(async (text: string) => {
    addMessage({ role: 'user', content: text, type: 'text' });

    const aiMsgId = addMessage({ role: 'assistant', content: '', type: 'text' });

    try {
      await append({ role: 'user', content: text });

      // Wait for AI response and update the message
      const checkInterval = setInterval(() => {
        const lastAi = aiMessages[aiMessages.length - 1];
        if (lastAi?.role === 'assistant' && lastAi.content) {
          setChatMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: lastAi.content } : m
          ));
        }
      }, 300);

      setTimeout(() => clearInterval(checkInterval), 60000);
    } catch {
      setChatMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: 'Không thể kết nối đến AI. Vui lòng thử lại.' } : m
      ));
    }
  }, [addMessage, append, aiMessages]);

  // Show skills
  const handleShowSkills = useCallback(() => {
    const skillsByCategory = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
      const cat = skill.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(skill);
      return acc;
    }, {});

    addMessage({
      role: 'assistant',
      content: `Đang hiển thị ${skills.length} kỹ năng của Hermes Agent`,
      type: 'skills',
      data: { skillsByCategory, total: skills.length },
    });
  }, [skills, addMessage]);

  // Show sessions
  const handleShowSessions = useCallback(() => {
    addMessage({
      role: 'assistant',
      content: `Đang hiển thị ${sessions.length} phiên làm việc`,
      type: 'sessions',
      data: { sessions },
    });
  }, [sessions, addMessage]);

  // Show architecture
  const handleShowArchitecture = useCallback(() => {
    addMessage({
      role: 'assistant',
      content: 'Kiến trúc hệ thống Hermes + Vercel AI SDK',
      type: 'architecture',
      data: {},
    });
  }, [addMessage]);

  // Show help
  const handleShowHelp = useCallback(() => {
    addMessage({
      role: 'assistant',
      content: 'Danh sách lệnh và hướng dẫn sử dụng',
      type: 'help',
      data: {},
    });
  }, [addMessage]);

  // Main input handler - detect commands
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isProcessing || isAiLoading) return;

    setInputValue('');
    setShowCommandPalette(false);

    // Command detection
    const lowerText = text.toLowerCase();

    if (lowerText.startsWith('/search ') || lowerText.startsWith('/s ')) {
      const query = text.replace(/^\/(search|s)\s+/i, '');
      if (query) { await handleSearch(query); return; }
    }
    if (lowerText.startsWith('/skills') || lowerText.startsWith('/sk')) {
      handleShowSkills(); return;
    }
    if (lowerText.startsWith('/sessions') || lowerText.startsWith('/ss')) {
      handleShowSessions(); return;
    }
    if (lowerText.startsWith('/help') || lowerText.startsWith('/h') || lowerText === '/?') {
      handleShowHelp(); return;
    }
    if (lowerText.startsWith('/arch') || lowerText.startsWith('/architecture')) {
      handleShowArchitecture(); return;
    }
    if (lowerText.startsWith('/clear') || lowerText.startsWith('/c')) {
      setChatMessages([]);
      setAiMessages([]);
      return;
    }
    if (lowerText.startsWith('/model ') || lowerText.startsWith('/m ')) {
      const modelArg = text.replace(/^\/(model|m)\s+/i, '').trim().toLowerCase();
      const found = AVAILABLE_MODELS.find(m => m.id.includes(modelArg) || m.name.toLowerCase().includes(modelArg));
      if (found) {
        setSelectedModel(found.id);
        addMessage({ role: 'system', content: `Đã chuyển sang model: ${found.name}`, type: 'text' });
      } else {
        addMessage({ role: 'system', content: `Không tìm thấy model "${modelArg}". Dùng: /model qwen hoặc /model hermes`, type: 'text' });
      }
      return;
    }

    // Auto-detect search intent
    const searchKeywords = ['tìm', 'search', 'tìm kiếm', 'tra cứu', 'lookup', 'google', 'nào hay', 'gì về', 'cho tôi biết về', 'where is', 'ở đâu', 'nhà hàng', 'quán', 'cửa hàng', 'bệnh viện', 'phòng khám', 'cafe', 'coffee', 'quán ăn', 'địa chỉ', 'vị trí'];
    const isSearchIntent = searchKeywords.some(kw => lowerText.includes(kw));

    if (isSearchIntent && !lowerText.startsWith('/chat')) {
      await handleSearch(text);
    } else {
      await handleChat(text);
    }
  }, [inputValue, isProcessing, isAiLoading, handleSearch, handleChat, handleShowSkills, handleShowSessions, handleShowHelp, handleShowArchitecture, addMessage, setAiMessages]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && inputValue === '') {
      setShowCommandPalette(true);
    }
    if (e.key === 'Escape') {
      setShowCommandPalette(false);
      setShowSidebar(false);
    }
  }, [handleSend, inputValue]);

  // ─── Render Helpers ────────────────────────────────────

  // Render search result card
  const renderSearchCard = (msg: ChatMessage) => {
    const data = msg.data || {};
    if (data.loading) {
      return (
        <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span>Đang tìm kiếm &quot;{data.query}&quot;...</span>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${70 + i * 10}%` }} />
            ))}
          </div>
        </div>
      );
    }

    if (data.error) {
      return (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-300">{msg.content}</p>
        </div>
      );
    }

    const sources: SearchSource[] = data.sources || [];
    const places: SearchPlace[] = data.places || [];
    const hasPlaces = places.length > 0;
    const showMap = showMapForMessage === msg.id;

    return (
      <div className="space-y-3">
        {/* AI Answer */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-medium text-orange-400 uppercase tracking-wider">Kết quả tìm kiếm</span>
          </div>
          <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-1">Nguồn tham khảo</p>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {sources.slice(0, 6).map(src => (
                <a
                  key={src.id}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <span className="text-[10px] text-orange-400 font-mono mt-0.5 shrink-0">[{src.id}]</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-300 group-hover:text-white truncate">{src.name}</p>
                    <p className="text-[10px] text-slate-500 line-clamp-2">{src.snippet}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Places */}
        {hasPlaces && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Địa điểm ({places.length})</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-slate-500 hover:text-white"
                onClick={() => setShowMapForMessage(showMap ? null : msg.id)}
              >
                <MapPin className="w-3 h-3 mr-1" />
                {showMap ? 'Ẩn bản đồ' : 'Xem bản đồ'}
              </Button>
            </div>
            <div className="space-y-1">
              {places.slice(0, 5).map((place, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSearchPlace(selectedSearchPlace?.id === place.id ? null : place)}
                  className={`w-full text-left p-2 rounded-lg transition-colors ${
                    selectedSearchPlace?.id === place.id ? 'bg-orange-500/10 border border-orange-500/30' : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-200">{place.name}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{place.fullAddress?.split(',').slice(0, 3).join(',')}</p>
                      <div className="flex gap-3 mt-0.5">
                        {place.phone && <span className="text-[10px] text-slate-500 flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{place.phone}</span>}
                        {place.website && <span className="text-[10px] text-cyan-500 flex items-center gap-0.5"><ExternalLink className="w-2.5 h-2.5" />Website</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {showMap && (
              <div className="h-[300px] rounded-xl overflow-hidden border border-white/10">
                <MapComponent places={places} selectedPlace={selectedSearchPlace} onPlaceSelect={setSelectedSearchPlace} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render skills card
  const renderSkillsCard = (msg: ChatMessage) => {
    const data = msg.data || {};
    const skillsByCategory: Record<string, Skill[]> = data.skillsByCategory || {};

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Skills ({data.total || 0})</span>
        </div>
        <div className="max-h-80 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {Object.entries(skillsByCategory).map(([category, catSkills]) => {
            const CatIcon = categoryIcons[category] || Wrench;
            const catColor = categoryColors[category] || 'text-slate-400 bg-slate-500/10';
            return (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${catColor}`}>
                    <CatIcon className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-medium text-slate-300 capitalize">{category}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-white/10 text-slate-500">{catSkills.length}</Badge>
                </div>
                <div className="ml-7 space-y-1">
                  {catSkills.map((skill: Skill) => (
                    <div key={skill.name} className="flex items-start gap-2 py-1">
                      <span className="text-[10px] text-emerald-500/60 font-mono mt-0.5">●</span>
                      <div>
                        <p className="text-xs font-medium text-slate-300">{skill.name}</p>
                        <p className="text-[10px] text-slate-500">{skill.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render sessions card
  const renderSessionsCard = (msg: ChatMessage) => {
    const data = msg.data || {};
    const sessList: Session[] = data.sessions || [];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-medium text-cyan-400 uppercase tracking-wider">Sessions ({sessList.length})</span>
        </div>
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
          {sessList.map((session, i) => (
            <div key={session.id} className="p-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200 truncate">{session.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {session.message_count} tin nhắn · {new Date(session.updated_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 ${
                  session.status === 'active' ? 'border-emerald-500/30 text-emerald-400' : 'border-slate-600 text-slate-500'
                }`}>
                  {session.status === 'active' ? 'Active' : 'Completed'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render architecture card
  const renderArchitectureCard = () => {
    const nodes = [
      { icon: MessageSquare, label: 'Bạn', sublabel: 'Chat UI', color: 'from-blue-500 to-blue-600' },
      { icon: Layers, label: 'Vercel AI SDK', sublabel: 'useChat / streamText', color: 'from-cyan-500 to-cyan-600' },
      { icon: Code2, label: 'Next.js API', sublabel: '/api/chat', color: 'from-emerald-500 to-emerald-600' },
      { icon: Brain, label: 'Hermes Agent', sublabel: 'Agent Loop', color: 'from-violet-500 to-violet-600' },
      { icon: Wrench, label: 'MCP / Skills', sublabel: 'Tools System', color: 'from-rose-500 to-rose-600' },
      { icon: HardDrive, label: 'Memory', sublabel: 'Persistent Store', color: 'from-teal-500 to-teal-600' },
    ];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Layers className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-medium text-violet-400 uppercase tracking-wider">Kiến trúc hệ thống</span>
        </div>
        <div className="relative p-4">
          {/* Flow */}
          <div className="flex flex-col items-center gap-2">
            {nodes.map((node, i) => {
              const Icon = node.icon;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-white/5 w-full max-w-[260px]">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${node.color} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-200">{node.label}</p>
                      <p className="text-[10px] text-slate-500">{node.sublabel}</p>
                    </div>
                  </div>
                  {i < nodes.length - 1 && (
                    <div className="flex flex-col items-center py-0.5">
                      <div className="w-px h-3 bg-white/20" />
                      <ChevronDown className="w-3 h-3 text-white/30" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Render help card
  const renderHelpCard = () => {
    const commands = [
      { cmd: '/search <query>', alias: '/s', desc: 'Tìm kiếm thông tin trên web (kiểu Perplexity)', icon: Search, color: 'text-orange-400' },
      { cmd: '/skills', alias: '/sk', desc: 'Xem danh sách kỹ năng của Hermes Agent', icon: Zap, color: 'text-emerald-400' },
      { cmd: '/sessions', alias: '/ss', desc: 'Xem các phiên làm việc', icon: Clock, color: 'text-cyan-400' },
      { cmd: '/architecture', alias: '/arch', desc: 'Xem kiến trúc hệ thống', icon: Layers, color: 'text-violet-400' },
      { cmd: '/model <name>', alias: '/m', desc: 'Chuyển đổi model (qwen/hermes)', icon: Cpu, color: 'text-amber-400' },
      { cmd: '/clear', alias: '/c', desc: 'Xóa toàn bộ cuộc trò chuyện', icon: Trash2, color: 'text-red-400' },
      { cmd: '/help', alias: '/h', desc: 'Hiển thị hướng dẫn này', icon: BookOpen, color: 'text-blue-400' },
    ];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Command className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Lệnh & Hướng dẫn</span>
        </div>
        <div className="space-y-1.5">
          {commands.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <Icon className={`w-3.5 h-3.5 ${cmd.color} shrink-0 mt-0.5`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-white bg-white/5 px-1.5 py-0.5 rounded">{cmd.cmd}</code>
                    {cmd.alias && <code className="text-[10px] font-mono text-slate-500 bg-white/5 px-1 py-0.5 rounded">{cmd.alias}</code>}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{cmd.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
          <p className="text-[10px] text-slate-400">
            <Lightbulb className="w-3 h-3 inline mr-1 text-violet-400" />
            Bạn cũng có thể nhập bình thường — hệ thống sẽ tự động nhận diện khi bạn muốn tìm kiếm (ví dụ: &quot;nhà hàng ở đâu&quot;, &quot;tìm quán cafe&quot;).
            Nhấn <kbd className="px-1 py-0.5 rounded bg-white/10 text-[9px] font-mono">/</kbd> để mở bảng lệnh nhanh.
          </p>
        </div>
      </div>
    );
  };

  // Render a single message
  const renderMessage = (msg: ChatMessage, index: number) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';

    if (isSystem) {
      return (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400">
            {msg.content}
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02 }}
        className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        {!isUser && (
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${currentModel.color} flex items-center justify-center shrink-0 mt-1`}>
            {msg.type === 'search' ? <Search className="w-3.5 h-3.5 text-white" /> :
             msg.type === 'skills' ? <Zap className="w-3.5 h-3.5 text-white" /> :
             msg.type === 'sessions' ? <Clock className="w-3.5 h-3.5 text-white" /> :
             msg.type === 'help' ? <BookOpen className="w-3.5 h-3.5 text-white" /> :
             msg.type === 'architecture' ? <Layers className="w-3.5 h-3.5 text-white" /> :
             <currentModel.icon className="w-3.5 h-3.5 text-white" />}
          </div>
        )}

        <div className={`max-w-[85%] ${isUser ? '' : 'w-full max-w-[600px]'}`}>
          {isUser ? (
            <div className="rounded-2xl px-4 py-2.5 bg-violet-500/20 border border-violet-500/30 text-sm text-white leading-relaxed">
              {msg.content}
            </div>
          ) : msg.type === 'search' ? (
            renderSearchCard(msg)
          ) : msg.type === 'skills' ? (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              {renderSkillsCard(msg)}
            </div>
          ) : msg.type === 'sessions' ? (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              {renderSessionsCard(msg)}
            </div>
          ) : msg.type === 'architecture' ? (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              {renderArchitectureCard()}
            </div>
          ) : msg.type === 'help' ? (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              {renderHelpCard()}
            </div>
          ) : (
            <div className="rounded-2xl px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
              {msg.content || (
                <div className="flex gap-1.5 py-1">
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          )}
        </div>

        {isUser && (
          <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 mt-1">
            <MessageSquare className="w-3.5 h-3.5 text-slate-300" />
          </div>
        )}
      </motion.div>
    );
  };

  // ─── Welcome Screen ────────────────────────────────────
  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mx-auto mb-5">
          <Sparkles className="w-8 h-8 text-violet-400" />
        </div>
        <h2 className="text-xl font-bold mb-1.5 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
          Hermes Chat
        </h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Chat AI · Tìm kiếm web · Kỹ năng · Tất cả trong một
        </p>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
          {[
            { icon: Search, text: 'Tìm kiếm', prompt: '/search xu hướng AI 2026', color: 'text-orange-400 bg-orange-500/10' },
            { icon: Zap, text: 'Xem Skills', prompt: '/skills', color: 'text-emerald-400 bg-emerald-500/10' },
            { icon: Brain, text: 'Chat AI', prompt: 'Giúp tôi viết một API endpoint bằng Next.js', color: 'text-violet-400 bg-violet-500/10' },
            { icon: BookOpen, text: 'Hướng dẫn', prompt: '/help', color: 'text-blue-400 bg-blue-500/10' },
          ].map((action, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              onClick={() => {
                setInputValue(action.prompt);
                setTimeout(() => {
                  const ev = { key: 'Enter', shiftKey: false, preventDefault: () => {} } as any;
                  // Directly call the command
                  setInputValue(action.prompt);
                }, 50);
              }}
              className="flex items-center gap-2.5 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group"
            >
              <div className={`w-8 h-8 rounded-lg ${action.color} flex items-center justify-center shrink-0`}>
                <action.icon className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-300 group-hover:text-white transition-colors">{action.text}</span>
            </motion.button>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-600">
          <Hash className="w-3 h-3" />
          <span>Nhấn <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono">/</kbd> để xem lệnh nhanh</span>
        </div>
      </motion.div>
    </div>
  );

  // ─── Command Palette ───────────────────────────────────
  const renderCommandPalette = () => (
    <AnimatePresence>
      {showCommandPalette && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute bottom-full left-0 right-0 mb-2 mx-4 z-50"
        >
          <div className="rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2">Lệnh nhanh</p>
            </div>
            <div className="p-1 max-h-60 overflow-y-auto">
              {[
                { cmd: '/search', desc: 'Tìm kiếm web', icon: Search, color: 'text-orange-400' },
                { cmd: '/skills', desc: 'Xem kỹ năng', icon: Zap, color: 'text-emerald-400' },
                { cmd: '/sessions', desc: 'Phiên làm việc', icon: Clock, color: 'text-cyan-400' },
                { cmd: '/architecture', desc: 'Kiến trúc hệ thống', icon: Layers, color: 'text-violet-400' },
                { cmd: '/model', desc: 'Chuyển model', icon: Cpu, color: 'text-amber-400' },
                { cmd: '/clear', desc: 'Xóa cuộc trò chuyện', icon: Trash2, color: 'text-red-400' },
                { cmd: '/help', desc: 'Hướng dẫn', icon: BookOpen, color: 'text-blue-400' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInputValue(item.cmd + ' ');
                    setShowCommandPalette(false);
                    inputRef.current?.focus();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                >
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <div className="flex-1">
                    <span className="text-xs font-mono text-white">{item.cmd}</span>
                    <span className="text-[10px] text-slate-500 ml-2">{item.desc}</span>
                  </div>
                  <ArrowUp className="w-3 h-3 text-slate-600" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ─── Sidebar ───────────────────────────────────────────
  const renderSidebar = () => (
    <AnimatePresence>
      {showSidebar && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Cài đặt</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setShowSidebar(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-5">
                {/* Model Selection */}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Model AI</p>
                  <div className="space-y-1.5">
                    {AVAILABLE_MODELS.map(model => {
                      const Icon = model.icon;
                      const isSelected = model.id === selectedModel;
                      return (
                        <button
                          key={model.id}
                          onClick={() => setSelectedModel(model.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                            isSelected ? model.bgColor : 'hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${model.color} flex items-center justify-center shrink-0`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white">{model.name}</p>
                            <p className="text-[10px] text-slate-500">{model.provider}</p>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Connection Status */}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Trạng thái kết nối</p>
                  <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Hermes Agent</span>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${
                        isConnected ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
                      }`}>
                        {isConnected ? <Wifi className="w-2.5 h-2.5 mr-1" /> : <WifiOff className="w-2.5 h-2.5 mr-1" />}
                        {isConnected ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Qwen API</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/30 text-emerald-400">
                        <Wifi className="w-2.5 h-2.5 mr-1" />Online
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Thống kê</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg border border-white/10 bg-white/5 text-center">
                      <p className="text-lg font-bold text-white">{skills.length}</p>
                      <p className="text-[10px] text-slate-500">Skills</p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-white/10 bg-white/5 text-center">
                      <p className="text-lg font-bold text-white">{sessions.length}</p>
                      <p className="text-[10px] text-slate-500">Sessions</p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-white/10 bg-white/5 text-center">
                      <p className="text-lg font-bold text-white">{chatMessages.length}</p>
                      <p className="text-[10px] text-slate-500">Tin nhắn</p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-white/10 bg-white/5 text-center">
                      <p className="text-lg font-bold text-white">{chatMessages.filter(m => m.type === 'search').length}</p>
                      <p className="text-[10px] text-slate-500">Tìm kiếm</p>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Thao tác nhanh</p>
                  <div className="space-y-1.5">
                    {[
                      { icon: Zap, label: 'Xem Skills', action: () => { handleShowSkills(); setShowSidebar(false); } },
                      { icon: Clock, label: 'Xem Sessions', action: () => { handleShowSessions(); setShowSidebar(false); } },
                      { icon: Layers, label: 'Kiến trúc', action: () => { handleShowArchitecture(); setShowSidebar(false); } },
                      { icon: RefreshCw, label: 'Làm mới', action: () => { fetchStatus(); fetchData(); } },
                      { icon: Trash2, label: 'Xóa chat', action: () => { setChatMessages([]); setAiMessages([]); } },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={item.action}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                      >
                        <item.icon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-300">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // ─── Main Render ───────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
        {/* Header */}
        <header className="border-b border-white/10 backdrop-blur-xl bg-black/20 shrink-0">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Brain className="w-4.5 h-4.5 text-white" />
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              </div>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Hermes Chat
                </h1>
                <p className="text-[10px] text-slate-500">AI · Search · Skills — All in One</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Model Badge */}
              <div className="relative z-50" data-model-picker>
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-all ${currentModel.bgColor} hover:opacity-80`}
                >
                  <currentModel.icon className="w-3 h-3" />
                  <span className={`font-medium ${currentModel.textColor}`}>{currentModel.name}</span>
                  <ChevronDown className={`w-2.5 h-2.5 ${currentModel.textColor} transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showModelPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-1.5">
                        {AVAILABLE_MODELS.map(model => {
                          const Icon = model.icon;
                          const isSelected = model.id === selectedModel;
                          return (
                            <button
                              key={model.id}
                              onClick={() => { setSelectedModel(model.id); setShowModelPicker(false); }}
                              className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg transition-all text-left ${
                                isSelected ? model.bgColor : 'hover:bg-white/5'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${model.color} flex items-center justify-center shrink-0`}>
                                <Icon className="w-3.5 h-3.5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium text-white">{model.name}</span>
                                  {isSelected && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                                </div>
                                <p className="text-[10px] text-slate-500">{model.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connection */}
              <Badge
                variant="outline"
                className={`gap-1 text-[10px] px-2 py-0.5 hidden sm:flex ${
                  isConnected ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'
                }`}
              >
                {isConnected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                {isConnected ? 'Hermes' : 'Offline'}
              </Badge>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => { fetchStatus(); fetchData(); }}>
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Làm mới</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setShowSidebar(true)}>
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cài đặt</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto px-4 py-4">
              {chatMessages.length === 0 ? (
                renderWelcome()
              ) : (
                <div className="space-y-4 pb-4">
                  {chatMessages.map((msg, i) => renderMessage(msg, i))}
                  {isAiLoading && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
                    <div className="flex gap-3 justify-start">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${currentModel.color} flex items-center justify-center shrink-0`}>
                        <currentModel.icon className="w-3.5 h-3.5 text-white animate-pulse" />
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5">
                        <div className="flex gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>
        </main>

        {/* Input Area */}
        <footer className="border-t border-white/10 bg-black/30 backdrop-blur-xl shrink-0">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {/* Command Palette */}
            {renderCommandPalette()}

            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="relative flex items-end gap-2"
            >
              {/* Slash button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-slate-500 hover:text-white rounded-xl shrink-0"
                    onClick={() => setShowCommandPalette(!showCommandPalette)}
                  >
                    <Command className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Lệnh nhanh (/)</TooltipContent>
              </Tooltip>

              {/* Input */}
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef as any}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Nhập tin nhắn hoặc / để xem lệnh... (${currentModel.name})`}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 resize-none min-h-[44px] max-h-32"
                  rows={1}
                  disabled={isProcessing || isAiLoading}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 shrink-0">
                {chatMessages.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-slate-400 hover:text-white rounded-xl"
                        onClick={() => setChatMessages([])}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Xóa chat</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  type="submit"
                  disabled={isProcessing || isAiLoading || !inputValue.trim()}
                  className="h-11 px-4 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 text-white shadow-lg shadow-violet-500/20 transition-all"
                >
                  {isProcessing || isAiLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </form>

            {/* Footer hint */}
            <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px] text-slate-600">
              <span>/search · /skills · /sessions · /help</span>
              <span>·</span>
              <span>Nhập tự do để chat AI hoặc tìm kiếm</span>
            </div>
          </div>
        </footer>

        {/* Sidebar */}
        {renderSidebar()}
      </div>
    </TooltipProvider>
  );
}
