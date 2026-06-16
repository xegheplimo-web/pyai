'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Zap, Brain, Server, Globe, Terminal,
  ChevronRight, Activity, Cpu, HardDrive, Wifi, WifiOff,
  Send, RotateCcw, Sparkles, Layers, Code2, Shield,
  Eye, Image, Mic, Search, Wrench, Bot, ArrowRight,
  CheckCircle2, XCircle, Clock, FolderOpen, FileText,
  LayoutDashboard, Settings, RefreshCw, ChevronDown, CpuIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Types
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

interface Toolset {
  name: string;
  description: string;
  tools: string[];
}

// Available models configuration
const AVAILABLE_MODELS = [
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'Alibaba Cloud (DashScope)',
    description: 'Model nhanh và mạnh mẽ từ Alibaba, hỗ trợ đa ngôn ngữ',
    icon: Cpu,
    color: 'from-orange-500 to-amber-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    textColor: 'text-orange-400',
    apiBaseUrl: 'https://ws-09yuoi7zzbynceax.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'hermes-agent',
    name: 'Hermes Agent',
    provider: 'Nous Research (Local)',
    description: 'Agent tự trị có trí nhớ bền vững, chạy cục bộ',
    icon: Brain,
    color: 'from-violet-500 to-purple-500',
    bgColor: 'bg-violet-500/10 border-violet-500/30',
    textColor: 'text-violet-400',
    apiBaseUrl: 'http://127.0.0.1:8642/v1',
  },
];

// Category icon mapping
const categoryIcons: Record<string, any> = {
  filesystem: FolderOpen,
  execution: Terminal,
  web: Globe,
  browser: Eye,
  media: Image,
  agent: Bot,
};

const categoryColors: Record<string, string> = {
  filesystem: 'text-amber-500 bg-amber-500/10',
  execution: 'text-red-500 bg-red-500/10',
  web: 'text-cyan-500 bg-cyan-500/10',
  browser: 'text-purple-500 bg-purple-500/10',
  media: 'text-pink-500 bg-pink-500/10',
  agent: 'text-emerald-500 bg-emerald-500/10',
};

// Architecture flow nodes
const archNodes = [
  { id: 'user', label: 'Người dùng', icon: MessageSquare, x: 50, y: 50, color: 'from-blue-500 to-blue-600' },
  { id: 'vercel', label: 'Vercel AI SDK', icon: Layers, x: 50, y: 180, color: 'from-cyan-500 to-cyan-600' },
  { id: 'nextjs', label: 'Next.js API', icon: Code2, x: 200, y: 180, color: 'from-emerald-500 to-emerald-600' },
  { id: 'hermes-api', label: 'Hermes API\n(:8642)', icon: Server, x: 200, y: 310, color: 'from-orange-500 to-orange-600' },
  { id: 'hermes-agent', label: 'Hermes Agent', icon: Brain, x: 50, y: 310, color: 'from-violet-500 to-violet-600' },
  { id: 'mcp', label: 'MCP Server', icon: Wrench, x: 50, y: 440, color: 'from-rose-500 to-rose-600' },
  { id: 'memory', label: 'Persistent\nMemory', icon: HardDrive, x: 200, y: 440, color: 'from-teal-500 to-teal-600' },
  { id: 'skills', label: 'Skills\nSystem', icon: Sparkles, x: 350, y: 310, color: 'from-amber-500 to-amber-600' },
];

const archConnections = [
  { from: 'user', to: 'vercel', label: 'useChat' },
  { from: 'vercel', to: 'nextjs', label: 'streamText' },
  { from: 'nextjs', to: 'hermes-api', label: 'OpenAI API' },
  { from: 'hermes-api', to: 'hermes-agent', label: 'Agent Loop' },
  { from: 'hermes-agent', to: 'mcp', label: 'MCP Protocol' },
  { from: 'hermes-agent', to: 'memory', label: 'Read/Write' },
  { from: 'hermes-agent', to: 'skills', label: 'Create/Execute' },
];

export default function Home() {
  const [hermesStatus, setHermesStatus] = useState<HermesStatus | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [toolsets, setToolsets] = useState<Toolset[]>([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('qwen3.5-flash');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentModel = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];

  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages } = useChat({
    api: '/api/chat',
    initialMessages: [],
    body: { model: selectedModel },
    onError: (err) => {
      console.error('Chat error:', err);
    },
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

  // Fetch skills, sessions, toolsets
  const fetchData = useCallback(async () => {
    try {
      const [skillsRes, sessionsRes, toolsetsRes] = await Promise.all([
        fetch('/api/hermes/skills'),
        fetch('/api/hermes/sessions'),
        fetch('/api/hermes/toolsets'),
      ]);
      const skillsData = await skillsRes.json();
      const sessionsData = await sessionsRes.json();
      const toolsetsData = await toolsetsRes.json();
      setSkills(skillsData.skills || []);
      setSessions(sessionsData.sessions || []);
      setToolsets(toolsetsData.toolsets || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchData();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchData]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close model picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showModelPicker) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-model-picker]')) {
          setShowModelPicker(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelPicker]);

  const isConnected = hermesStatus?.connected ?? false;

  // Group skills by category
  const skillsByCategory = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        {/* Header */}
        <header className="border-b border-white/10 backdrop-blur-xl bg-black/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 bg-emerald-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Hermes + Vercel AI SDK
                </h1>
                <p className="text-xs text-slate-400">Autonomous Agent · Web Interface</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Model Picker */}
              <div className="relative z-50" data-model-picker>
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${currentModel.bgColor} hover:opacity-80`}
                >
                  <currentModel.icon className="w-3.5 h-3.5" />
                  <span className={`font-medium ${currentModel.textColor}`}>{currentModel.name}</span>
                  <ChevronDown className={`w-3 h-3 ${currentModel.textColor} transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {showModelPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 z-50 overflow-hidden"
                    >
                      <div className="p-2 border-b border-white/5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2">Chọn Model</p>
                      </div>
                      <div className="p-1.5">
                        {AVAILABLE_MODELS.map((model) => {
                          const ModelIcon = model.icon;
                          const isSelected = model.id === selectedModel;
                          return (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModel(model.id);
                                setShowModelPicker(false);
                              }}
                              className={`w-full flex items-start gap-3 p-2.5 rounded-lg transition-all text-left ${
                                isSelected
                                  ? model.bgColor
                                  : 'hover:bg-white/5'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${model.color} flex items-center justify-center shrink-0 mt-0.5`}>
                                <ModelIcon className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-white">{model.name}</span>
                                  {isSelected && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500">{model.provider}</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">{model.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connection status - Hermes */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2"
              >
                <Badge
                  variant="outline"
                  className={`gap-1.5 text-xs px-3 py-1 ${
                    isConnected
                      ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                      : 'border-red-500/50 text-red-400 bg-red-500/10'
                  }`}
                >
                  {isConnected ? (
                    <Wifi className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {isConnected ? 'Hermes Online' : 'Hermes Offline'}
                </Badge>
              </motion.div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-white"
                    onClick={() => { fetchStatus(); fetchData(); }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Làm mới trạng thái</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="bg-white/5 border border-white/10 w-fit mb-4">
              <TabsTrigger value="chat" className="gap-1.5 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300">
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="skills" className="gap-1.5 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300">
                <Zap className="w-3.5 h-3.5" />
                Skills
              </TabsTrigger>
              <TabsTrigger value="architecture" className="gap-1.5 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300">
                <Layers className="w-3.5 h-3.5" />
                Kiến trúc
              </TabsTrigger>
              <TabsTrigger value="sessions" className="gap-1.5 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300">
                <Clock className="w-3.5 h-3.5" />
                Sessions
              </TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent value="chat" className="flex-1 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-180px)]">
                {/* Chat Panel - Main */}
                <div className="lg:col-span-3 flex flex-col rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm overflow-hidden">
                  {/* Chat Messages */}
                  <ScrollArea className="flex-1 p-4">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                        >
                          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mx-auto mb-6">
                            <Sparkles className="w-10 h-10 text-violet-400" />
                          </div>
                          <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                            Hermes Agent Dashboard
                          </h2>
                          <p className="text-slate-400 max-w-md mb-8">
                            Kết nối Vercel AI SDK với Hermes Agent — giao diện web hiện đại cho agent tự trị có trí nhớ bền vững
                          </p>
                          
                          {/* Quick Actions */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                            {[
                              { icon: Search, text: 'Tìm kiếm thông tin trên web', prompt: 'Tìm kiếm thông tin về xu hướng AI năm 2026' },
                              { icon: Code2, text: 'Phân tích và viết code', prompt: 'Giúp tôi viết một API endpoint bằng Next.js' },
                              { icon: Brain, text: 'Phân tích dữ liệu', prompt: 'Phân tích dữ liệu và đưa ra nhận định' },
                              { icon: FileText, text: 'Tạo tài liệu', prompt: 'Tạo tài liệu kỹ thuật cho dự án' },
                            ].map((action, i) => (
                              <motion.button
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                                onClick={() => {
                                  handleInputChange({ target: { value: action.prompt } } as any);
                                  setTimeout(() => {
                                    const form = document.querySelector('form');
                                    if (form) form.requestSubmit();
                                  }, 100);
                                }}
                                className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group"
                              >
                                <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                                  <action.icon className="w-4 h-4 text-violet-400" />
                                </div>
                                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{action.text}</span>
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      </div>
                    ) : (
                      <div className="space-y-4 pb-4">
                        {messages.map((message, i) => (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {message.role === 'assistant' && (
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentModel.color} flex items-center justify-center shrink-0 mt-1`}>
                                <currentModel.icon className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                message.role === 'user'
                                  ? 'bg-violet-500/20 border border-violet-500/30 text-white'
                                  : 'bg-white/5 border border-white/10 text-slate-200'
                              }`}
                            >
                              <div className="whitespace-pre-wrap">{message.content}</div>
                            </div>
                            {message.role === 'user' && (
                              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                                <MessageSquare className="w-4 h-4 text-slate-300" />
                              </div>
                            )}
                          </motion.div>
                        ))}
                        {isLoading && (
                          <div className="flex gap-3">
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentModel.color} flex items-center justify-center shrink-0`}>
                              <currentModel.icon className="w-4 h-4 text-white animate-pulse" />
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
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
                  </ScrollArea>

                  {/* Chat Input */}
                  <div className="border-t border-white/10 p-4 bg-black/20">
                    <form onSubmit={handleSubmit} className="flex gap-3 items-end">
                      <div className="flex-1 relative">
                        <textarea
                          ref={inputRef as any}
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmit(e as any);
                            }
                          }}
                          placeholder={selectedModel === 'hermes-agent' 
                            ? (isConnected ? 'Nhập tin nhắn cho Hermes Agent...' : 'Hermes Agent đang offline — nhắn tin sẽ không được xử lý')
                            : 'Nhập tin nhắn cho Qwen 3.5 Flash...'
                          }
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 resize-none min-h-[44px] max-h-32"
                          rows={1}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="flex gap-2">
                        {messages.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 text-slate-400 hover:text-white rounded-xl"
                                onClick={() => reload()}
                                disabled={isLoading}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Gửi lại tin nhắn cuối</TooltipContent>
                          </Tooltip>
                        )}
                        <Button
                          type="submit"
                          disabled={isLoading || !input?.trim()}
                          className="h-11 px-5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 text-white shadow-lg shadow-violet-500/20 transition-all"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </form>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className={`flex items-center gap-1 ${currentModel.textColor}`}>
                        <currentModel.icon className="w-3 h-3" />
                        {currentModel.name}
                      </span>
                      <span>·</span>
                      <span>API: <span className="text-slate-400">{currentModel.apiBaseUrl}</span></span>
                      <span>·</span>
                      <span>Protocol: <span className="text-slate-400">OpenAI-compatible</span></span>
                    </div>
                  </div>
                </div>

                {/* Right Sidebar - Quick Info */}
                <div className="hidden lg:flex flex-col gap-4">
                  {/* Connection Status Card */}
                  <Card className="bg-black/30 border-white/10 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Trạng thái kết nối
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Model hiện tại</span>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0 ${currentModel.bgColor} ${currentModel.textColor}`}>
                          {currentModel.name}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Provider</span>
                        <span className="text-[10px] text-slate-300">{currentModel.provider}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Hermes Gateway</span>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0 ${isConnected ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}>
                          {isConnected ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Protocol</span>
                        <span className="text-xs text-slate-300">OpenAI API</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Sessions</span>
                        <span className="text-xs text-slate-300">{sessions.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Skills</span>
                        <span className="text-xs text-slate-300">{skills.length}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Integration Models */}
                  <Card className="bg-black/30 border-white/10 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-violet-400" />
                        Mô hình kết nối
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Server className="w-3.5 h-3.5 text-violet-400" />
                          <span className="text-xs font-medium text-violet-300">Model Provider</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Hermes làm endpoint LLM, Vercel AI SDK gọi như OpenAI API
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-xs font-medium text-cyan-300">Tool Executor (MCP)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Web UI gọi skill/tool của Hermes qua MCP protocol
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Sessions */}
                  <Card className="bg-black/30 border-white/10 backdrop-blur-sm flex-1">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400" />
                        Phiên gần đây
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-48">
                        <div className="space-y-2">
                          {sessions.slice(0, 5).map((session) => (
                            <button
                              key={session.id}
                              onClick={() => setSelectedSession(session.id)}
                              className={`w-full text-left p-2 rounded-lg border transition-all text-xs ${
                                selectedSession === session.id
                                  ? 'border-violet-500/50 bg-violet-500/10'
                                  : 'border-white/5 bg-white/5 hover:bg-white/10'
                              }`}
                            >
                              <div className="font-medium text-slate-300 truncate">{session.title}</div>
                              <div className="flex items-center gap-2 mt-1 text-slate-500">
                                <span>{session.message_count} tin nhắn</span>
                                <span>·</span>
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                                  session.status === 'active' ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-500/50 text-slate-400'
                                }`}>
                                  {session.status}
                                </Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Skills Tab */}
            <TabsContent value="skills" className="mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Hermes Skills & Tools</h2>
                    <p className="text-sm text-slate-400 mt-1">Các kỹ năng và công cụ mà Hermes Agent sở hữu, có thể gọi từ giao diện web</p>
                  </div>
                  <Badge variant="outline" className="border-violet-500/50 text-violet-400 px-3">
                    {skills.length} Skills
                  </Badge>
                </div>

                {/* Toolsets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {toolsets.map((toolset) => (
                    <motion.div
                      key={toolset.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="bg-black/30 border-white/10 backdrop-blur-sm h-full hover:border-violet-500/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
                              <Wrench className="w-4 h-4 text-violet-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-white">{toolset.name}</h3>
                              <p className="text-[10px] text-slate-500">{toolset.tools.length} tools</p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 mb-3">{toolset.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {toolset.tools.slice(0, 4).map((tool) => (
                              <Badge key={tool} variant="outline" className="text-[9px] px-1.5 py-0 border-white/10 text-slate-400">
                                {tool}
                              </Badge>
                            ))}
                            {toolset.tools.length > 4 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/10 text-slate-500">
                                +{toolset.tools.length - 4}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Skills by Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(skillsByCategory).map(([category, catSkills]) => {
                    const Icon = categoryIcons[category] || Wrench;
                    const colorClass = categoryColors[category] || 'text-slate-500 bg-slate-500/10';
                    return (
                      <motion.div
                        key={category}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Card className="bg-black/30 border-white/10 backdrop-blur-sm h-full">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorClass}`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="capitalize text-slate-200">{category}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto border-white/10 text-slate-400">
                                {catSkills.length}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {catSkills.map((skill) => (
                                <div key={skill.name} className="flex items-start gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                                  <ChevronRight className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                                  <div>
                                    <div className="text-xs font-medium text-slate-300">{skill.name}</div>
                                    <div className="text-[10px] text-slate-500">{skill.description}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* Architecture Tab */}
            <TabsContent value="architecture" className="mt-0">
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold">Kiến trúc Kết hợp</h2>
                  <p className="text-sm text-slate-400 mt-1">Vercel AI SDK là "cơ thể" giao diện web, Hermes Agent là "bộ não" tự trị</p>
                </div>

                {/* Architecture Diagram */}
                <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-6 overflow-x-auto">
                  <div className="min-w-[500px]">
                    <svg width="100%" viewBox="0 0 500 520" className="mx-auto">
                      {/* Connections */}
                      {archConnections.map((conn, i) => {
                        const from = archNodes.find(n => n.id === conn.from)!;
                        const to = archNodes.find(n => n.id === conn.to)!;
                        const x1 = from.x + 60;
                        const y1 = from.y + 25;
                        const x2 = to.x + 60;
                        const y2 = to.y + 25;
                        
                        return (
                          <g key={i}>
                            <line
                              x1={x1} y1={y1} x2={x2} y2={y2}
                              stroke="rgba(139,92,246,0.3)"
                              strokeWidth="2"
                              strokeDasharray="6,4"
                            />
                            <text
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2 - 8}
                              textAnchor="middle"
                              fill="rgba(148,163,184,0.7)"
                              fontSize="10"
                            >
                              {conn.label}
                            </text>
                          </g>
                        );
                      })}

                      {/* Nodes */}
                      {archNodes.map((node) => {
                        const Icon = node.icon;
                        return (
                          <g key={node.id}>
                            <rect
                              x={node.x}
                              y={node.y}
                              width="120"
                              height="50"
                              rx="12"
                              fill="rgba(15,23,42,0.8)"
                              stroke="rgba(255,255,255,0.1)"
                              strokeWidth="1"
                            />
                            <defs>
                              <linearGradient id={`grad-${node.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={node.color.includes('violet') ? '#8b5cf6' : node.color.includes('cyan') ? '#06b6d4' : node.color.includes('emerald') ? '#10b981' : node.color.includes('orange') ? '#f97316' : node.color.includes('rose') ? '#f43f5e' : node.color.includes('teal') ? '#14b8a6' : node.color.includes('amber') ? '#f59e0b' : node.color.includes('blue') ? '#3b82f6' : '#8b5cf6'} />
                                <stop offset="100%" stopColor={node.color.includes('violet') ? '#7c3aed' : node.color.includes('cyan') ? '#0891b2' : node.color.includes('emerald') ? '#059669' : node.color.includes('orange') ? '#ea580c' : node.color.includes('rose') ? '#e11d48' : node.color.includes('teal') ? '#0d9488' : node.color.includes('amber') ? '#d97706' : node.color.includes('blue') ? '#2563eb' : '#7c3aed'} />
                              </linearGradient>
                            </defs>
                            <rect
                              x={node.x}
                              y={node.y}
                              width="120"
                              height="50"
                              rx="12"
                              fill={`url(#grad-${node.id})`}
                              opacity="0.15"
                            />
                            {/* Icon placeholder */}
                            <foreignObject x={node.x + 10} y={node.y + 12} width="26" height="26">
                              <div className="flex items-center justify-center w-full h-full">
                                <Icon className="w-5 h-5 text-white opacity-80" />
                              </div>
                            </foreignObject>
                            <text
                              x={node.x + 42}
                              y={node.y + (node.label.includes('\n') ? 22 : 30)}
                              fill="white"
                              fontSize="11"
                              fontWeight="500"
                            >
                              {node.label.split('\n')[0]}
                            </text>
                            {node.label.includes('\n') && (
                              <text
                                x={node.x + 42}
                                y={node.y + 36}
                                fill="rgba(148,163,184,0.8)"
                                fontSize="10"
                              >
                                {node.label.split('\n')[1]}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Two Connection Models */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Model 1: Model Provider */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <Card className="bg-black/30 border-violet-500/20 backdrop-blur-sm h-full">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center">
                            <Server className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Mô hình 1: Model Provider</CardTitle>
                            <p className="text-xs text-slate-400 mt-0.5">Hermes là endpoint LLM cho Vercel AI SDK</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 font-mono text-xs text-slate-300 leading-relaxed">
                          <span className="text-violet-400">import</span> {'{ createOpenAI }'} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;@ai-sdk/openai&apos;</span>;{'\n'}
                          <span className="text-violet-400">import</span> {'{ streamText }'} <span className="text-violet-400">from</span> <span className="text-emerald-400">&apos;ai&apos;</span>;{'\n\n'}
                          <span className="text-violet-400">const</span> <span className="text-cyan-400">hermes</span> = <span className="text-amber-400">createOpenAI</span>({'{'}
                          {'\n'}  baseURL: <span className="text-emerald-400">&apos;http://localhost:8642/v1&apos;</span>,
                          {'\n'}  apiKey: <span className="text-emerald-400">&apos;hermes-local&apos;</span>
                          {'\n'}{'}'});{'\n\n'}
                          <span className="text-violet-400">const</span> result = <span className="text-amber-400">streamText</span>({'{'}
                          {'\n'}  model: hermes(<span className="text-emerald-400">&apos;hermes-agent&apos;</span>),
                          {'\n'}  messages,
                          {'\n'}  headers: {'{'}
                          {'\n'}    <span className="text-emerald-400">&apos;X-Hermes-Session-Id&apos;</span>: sessionId
                          {'\n'}  {'}'}
                          {'\n'}{'}'});
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-slate-300">Lợi ích</h4>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">Ứng dụng web có ngay trí nhớ dài hạn từ Hermes</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">Streaming UI mượt mà với useChat hook</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">Tương thích mọi frontend hỗ trợ OpenAI API</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Model 2: Tool Executor (MCP) */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <Card className="bg-black/30 border-cyan-500/20 backdrop-blur-sm h-full">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
                            <Wrench className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Mô hình 2: Tool Executor (MCP)</CardTitle>
                            <p className="text-xs text-slate-400 mt-0.5">Hermes thực thi công cụ qua MCP protocol</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 font-mono text-xs text-slate-300 leading-relaxed">
                          <span className="text-slate-500"># ~/.hermes/config.yaml</span>{'\n'}
                          <span className="text-cyan-400">mcp_servers</span>:{'\n'}
                          {'  '}<span className="text-amber-400">web-tools</span>:{'\n'}
                          {'    '}<span className="text-cyan-400">command</span>: npx{'\n'}
                          {'    '}<span className="text-cyan-400">args</span>:{'\n'}
                          {'      '}- <span className="text-emerald-400">&quot;-y&quot;</span>{'\n'}
                          {'      '}- <span className="text-emerald-400">&quot;@modelcontextprotocol/server-web-tools&quot;</span>
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-slate-300">Lợi ích</h4>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">Tận dụng skill hệ sinh thái phong phú của Hermes từ web UI</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">Chạy shell, duyệt web, gửi email trực tiếp từ dashboard</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">MCP protocol linh hoạt — dễ thêm server mới</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>

                {/* API Endpoints Reference */}
                <Card className="bg-black/30 border-white/10 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Code2 className="w-5 h-5 text-violet-400" />
                      Hermes API Endpoints
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { method: 'POST', path: '/v1/chat/completions', desc: 'OpenAI Chat Completions', color: 'text-emerald-400' },
                        { method: 'POST', path: '/v1/responses', desc: 'OpenAI Responses API', color: 'text-emerald-400' },
                        { method: 'GET', path: '/v1/models', desc: 'Danh sách models', color: 'text-cyan-400' },
                        { method: 'GET', path: '/v1/skills', desc: 'Danh sách skills', color: 'text-cyan-400' },
                        { method: 'GET', path: '/v1/toolsets', desc: 'Danh sách toolsets', color: 'text-cyan-400' },
                        { method: 'GET', path: '/v1/capabilities', desc: 'Khả năng API', color: 'text-cyan-400' },
                        { method: 'GET', path: '/api/sessions', desc: 'Danh sách sessions', color: 'text-amber-400' },
                        { method: 'POST', path: '/v1/runs', desc: 'Chạy tác vụ async', color: 'text-emerald-400' },
                        { method: 'GET', path: '/health/detailed', desc: 'Health check', color: 'text-cyan-400' },
                      ].map((ep, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                          <span className={`text-[10px] font-bold ${ep.color} shrink-0 w-10`}>{ep.method}</span>
                          <code className="text-[10px] text-slate-300 truncate flex-1">{ep.path}</code>
                          <span className="text-[10px] text-slate-500 shrink-0">{ep.desc}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Sessions Tab */}
            <TabsContent value="sessions" className="mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Phiên làm việc</h2>
                    <p className="text-sm text-slate-400 mt-1">Các phiên hội thoại với Hermes Agent, được lưu trữ bền vững</p>
                  </div>
                  <Badge variant="outline" className="border-violet-500/50 text-violet-400 px-3">
                    {sessions.length} Phiên
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sessions.map((session, i) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="bg-black/30 border-white/10 backdrop-blur-sm hover:border-violet-500/30 transition-colors cursor-pointer group">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center group-hover:border-violet-500/30 transition-colors">
                              <MessageSquare className="w-5 h-5 text-violet-400" />
                            </div>
                            <Badge variant="outline" className={`text-[10px] px-2 py-0 ${
                              session.status === 'active' ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-500/50 text-slate-400'
                            }`}>
                              {session.status}
                            </Badge>
                          </div>
                          <h3 className="text-sm font-medium text-white mb-1 group-hover:text-violet-300 transition-colors">
                            {session.title}
                          </h3>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {session.message_count} tin nhắn
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(session.updated_at).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white">
                              Tiếp tục
                              <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white">
                              Fork
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Setup Guide when no sessions */}
                {sessions.length === 0 && (
                  <Card className="bg-black/30 border-white/10 backdrop-blur-sm">
                    <CardContent className="p-8 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                        <Bot className="w-8 h-8 text-violet-400" />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">Chưa có phiên nào</h3>
                      <p className="text-sm text-slate-400 mb-4">Khởi động Hermes Gateway để bắt đầu tạo phiên hội thoại</p>
                      <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5 font-mono text-xs text-slate-300 inline-block">
                        $ hermes gateway
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black/20 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {isConnected ? 'Hermes Gateway kết nối' : 'Hermes Gateway ngắt kết nối'}
              </span>
              <span>·</span>
              <span>Built with Next.js 16 + Vercel AI SDK</span>
            </div>
            <div className="text-xs text-slate-600">
              Hermes Agent + Vercel AI SDK
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
