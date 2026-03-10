'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Search, 
  Plus, 
  Trash2, 
  RefreshCw, 
  MessageSquare,
  Tag,
  Users,
  TrendingUp,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

interface Memory {
  id: number;
  source: string;
  raw_text: string;
  summary: string;
  entities: string[];
  topics: string[];
  connections: { linked_to: number; relationship: string }[];
  importance: number;
  created_at: string;
  consolidated: boolean;
}

interface MemoryStats {
  total_memories: number;
  unconsolidated: number;
  consolidations: number;
}

interface Consolidation {
  id: number;
  source_ids: number[];
  summary: string;
  insight: string;
  created_at: string;
}

export default function MemoryDashboard() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [consolidations, setConsolidations] = useState<Consolidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ingest' | 'query' | 'memories'>('memories');
  
  // Ingest state
  const [ingestText, setIngestText] = useState('');
  const [ingestSource, setIngestSource] = useState('');
  const [ingesting, setIngesting] = useState(false);
  
  // Query state
  const [queryText, setQueryText] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [querying, setQuerying] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, memoriesRes, consolidationsRes] = await Promise.all([
        fetch(`${API_URL}/api/memory/status`),
        fetch(`${API_URL}/api/memory/memories?limit=50`),
        fetch(`${API_URL}/api/memory/consolidations?limit=10`),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (memoriesRes.ok) {
        const data = await memoriesRes.json();
        setMemories(data.memories || []);
      }
      if (consolidationsRes.ok) {
        const data = await consolidationsRes.json();
        setConsolidations(data.consolidations || []);
      }
      setError(null);
    } catch (err) {
      setError('Failed to connect to memory service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleIngest = async () => {
    if (!ingestText.trim()) return;
    setIngesting(true);
    try {
      const res = await fetch(`${API_URL}/api/memory/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ingestText, source: ingestSource || 'dashboard' }),
      });
      if (res.ok) {
        setIngestText('');
        setIngestSource('');
        fetchData();
      }
    } catch (err) {
      setError('Failed to ingest memory');
    } finally {
      setIngesting(false);
    }
  };

  const handleQuery = async () => {
    if (!queryText.trim()) return;
    setQuerying(true);
    try {
      const res = await fetch(`${API_URL}/api/memory/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText }),
      });
      if (res.ok) {
        setQueryResult(await res.json());
      }
    } catch (err) {
      setError('Failed to query memories');
    } finally {
      setQuerying(false);
    }
  };

  const handleConsolidate = async () => {
    try {
      await fetch(`${API_URL}/api/memory/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_ids: [], summary: '', insight: '' }),
      });
      fetchData();
    } catch (err) {
      setError('Failed to consolidate');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/memory/memories/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      setError('Failed to delete memory');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL memories? This cannot be undone.')) return;
    try {
      await fetch(`${API_URL}/api/memory/clear`, { method: 'POST' });
      fetchData();
    } catch (err) {
      setError('Failed to clear memories');
    }
  };

  const filteredMemories = searchQuery
    ? memories.filter(m => 
        m.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.entities.some(e => e.toLowerCase().includes(searchQuery.toLowerCase())) ||
        m.topics.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : memories;

  const getImportanceColor = (importance: number) => {
    if (importance >= 0.7) return 'border-green-500';
    if (importance >= 0.4) return 'border-yellow-500';
    return 'border-gray-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="inline-block text-6xl mb-4"
        >
          🧠
        </motion.div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          Memory Dashboard
        </h1>
        <p className="text-gray-400 mt-2">
          Always-on memory layer for AetherTest
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Status</p>
              <p className={`text-2xl font-bold ${stats ? 'text-green-400' : 'text-red-400'}`}>
                {stats ? '● Online' : '● Offline'}
              </p>
            </div>
            <Zap className={stats ? 'text-green-400' : 'text-red-400'} size={32} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Memories</p>
              <p className="text-2xl font-bold text-purple-400">{stats?.total_memories || 0}</p>
            </div>
            <Brain className="text-purple-400" size={32} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Pending</p>
              <p className="text-2xl font-bold text-yellow-400">{stats?.unconsolidated || 0}</p>
            </div>
            <Clock className="text-yellow-400" size={32} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Consolidations</p>
              <p className="text-2xl font-bold text-blue-400">{stats?.consolidations || 0}</p>
            </div>
            <TrendingUp className="text-blue-400" size={32} />
          </div>
        </motion.div>
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6 flex items-center gap-3"
          >
            <AlertTriangle className="text-red-400" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
              <XCircle size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['ingest', 'query', 'memories'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tab === 'ingest' && <Plus className="inline mr-2" size={16} />}
            {tab === 'query' && <Search className="inline mr-2" size={16} />}
            {tab === 'memories' && <Brain className="inline mr-2" size={16} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button
          onClick={fetchData}
          className="ml-auto px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-all"
        >
          <RefreshCw className={`inline ${loading ? 'animate-spin' : ''}`} size={16} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-gray-800/30 backdrop-blur border border-gray-700 rounded-xl p-6">
        {/* Ingest Tab */}
        {activeTab === 'ingest' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Plus className="text-purple-400" /> Ingest Information
            </h2>
            <p className="text-gray-400 text-sm">
              Feed information into memory. The system will extract entities, topics, and create a summary.
            </p>
            <textarea
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="Paste text here..."
              className="w-full h-40 bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
            />
            <input
              type="text"
              value={ingestSource}
              onChange={(e) => setIngestSource(e.target.value)}
              placeholder="Source (optional)"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={handleIngest}
              disabled={ingesting || !ingestText.trim()}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-semibold hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {ingesting ? 'Processing...' : '⚡ Process into Memory'}
            </button>

            {/* Sample texts */}
            <div className="mt-6">
              <p className="text-gray-500 text-sm mb-3">Or try a sample:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { title: '📰 AI Testing Trends', text: 'AI-powered testing tools are becoming mainstream. Vision-based element identification eliminates selector maintenance. Self-healing tests adapt to UI changes automatically.' },
                  { title: '📧 Test Strategy Notes', text: 'Focus on critical user journeys first. Login, checkout, and search are highest priority. Aim for 80% coverage of happy paths before edge cases.' },
                  { title: '📄 Bug Pattern Analysis', text: 'Most failures occur in form validation and async operations. Common issues: race conditions, timeout errors, and state management bugs.' },
                  { title: '💡 Automation Best Practices', text: 'Keep tests independent and idempotent. Use data factories for test data. Implement retry logic for flaky tests. Monitor test execution time.' },
                ].map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => { setIngestText(sample.text); setIngestSource(sample.title); }}
                    className="text-left p-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-purple-500 transition-all"
                  >
                    <span className="text-sm">{sample.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Query Tab */}
        {activeTab === 'query' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="text-blue-400" /> Query Memories
            </h2>
            <p className="text-gray-400 text-sm">
              Ask questions about stored memories. The system will search and synthesize answers.
            </p>
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              placeholder="What do you know about...?"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleQuery}
              disabled={querying || !queryText.trim()}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-semibold hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {querying ? 'Searching...' : '🔍 Search Memories'}
            </button>

            {/* Sample questions */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {[
                'What are the main themes across everything?',
                'What patterns do you see?',
                'Summarize in 3 bullet points',
                'What should I focus on?',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQueryText(q)}
                  className="text-left p-2 text-sm bg-gray-900 border border-gray-700 rounded-lg hover:border-blue-500 transition-all"
                >
                  💬 {q}
                </button>
              ))}
            </div>

            {/* Query Result */}
            {queryResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg"
              >
                <p className="text-gray-400 text-sm mb-2">Found {queryResult.total_found} relevant memories</p>
                {queryResult.relevant_memories?.map((m: Memory) => (
                  <div key={m.id} className="p-3 bg-gray-900/50 rounded-lg mb-2">
                    <p className="text-sm text-gray-300">{m.summary}</p>
                    <p className="text-xs text-gray-500 mt-1">Memory #{m.id}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Memories Tab */}
        {activeTab === 'memories' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Brain className="text-purple-400" /> Memory Bank
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleConsolidate}
                  className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-600 text-yellow-400 rounded-lg text-sm hover:bg-yellow-600/30 transition-all"
                >
                  <RefreshCw className="inline mr-1" size={14} /> Consolidate
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 bg-red-600/20 border border-red-600 text-red-400 rounded-lg text-sm hover:bg-red-600/30 transition-all"
                >
                  <Trash2 className="inline mr-1" size={14} /> Clear All
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search memories..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Memory List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {filteredMemories.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Brain className="mx-auto mb-4 opacity-50" size={48} />
                  <p>No memories yet. Ingest some information to get started.</p>
                </div>
              ) : (
                filteredMemories.map((memory) => (
                  <motion.div
                    key={memory.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-4 bg-gray-900/50 border-l-4 ${getImportanceColor(memory.importance)} rounded-r-lg`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-200">Memory #{memory.id}</span>
                          {memory.consolidated && (
                            <span className="px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded-full">
                              Consolidated
                            </span>
                          )}
                          {memory.source && (
                            <span className="text-xs text-gray-500">{memory.source}</span>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm mb-2">{memory.summary}</p>
                        <div className="flex flex-wrap gap-1">
                          {memory.topics.map((topic, i) => (
                            <span key={i} className="px-2 py-0.5 bg-purple-900/30 text-purple-300 text-xs rounded-full">
                              <Tag className="inline mr-1" size={10} />{topic}
                            </span>
                          ))}
                          {memory.entities.slice(0, 3).map((entity, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-900/30 text-blue-300 text-xs rounded-full">
                              <Users className="inline mr-1" size={10} />{entity}
                            </span>
                          ))}
                        </div>
                        {memory.connections.length > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            🔗 {memory.connections.length} connections
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(memory.id)}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      {new Date(memory.created_at).toLocaleString()}
                    </p>
                  </motion.div>
                ))
              )}
            </div>

            {/* Consolidations */}
            {consolidations.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="text-blue-400" /> Recent Insights
                </h3>
                <div className="space-y-2">
                  {consolidations.map((c) => (
                    <div key={c.id} className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                      <p className="text-sm text-blue-200">{c.insight}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        From {c.source_ids.length} memories
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center mt-8 text-gray-600 text-sm">
        <p>Memory Layer powered by AWS Bedrock • Local SQLite / AgentCore Memory</p>
      </div>
    </div>
  );
}
