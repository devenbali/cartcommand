import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles } from 'lucide-react';
import { askInventory, type ChatMessage } from '../../lib/openrouter';
import type { InventoryItem } from '../../types';

const SUGGESTIONS = [
  'What items are out of stock?',
  'What is low on inventory right now?',
  'How many ECO4 frames do we have?',
  'List all seat components below minimum',
];

interface Props {
  inventory: InventoryItem[];
}

export default function InventoryChat({ inventory }: Props) {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    setError('');

    const updated: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(updated);
    setLoading(true);

    try {
      const reply = await askInventory(updated, inventory);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Request failed. Check your OpenRouter API key.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl font-medium text-sm transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0d1117' }}
        >
          <Sparkles size={16} />
          Ask AI
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 380,
            height: 520,
            background: '#161b27',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
               style={{ background: '#1c2333', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                   style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                <Bot size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#e6edf3' }}>Inventory Assistant</p>
                <p className="text-xs" style={{ color: '#7d8590' }}>{inventory.length} items loaded</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5"
                    style={{ color: '#7d8590' }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-center" style={{ color: '#7d8590' }}>
                  Ask anything about current stock levels.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left px-3 py-2 rounded-xl text-xs transition-all hover:opacity-80"
                      style={{ background: '#1c2333', color: '#7d8590', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap"
                  style={
                    m.role === 'user'
                      ? { background: 'rgba(34,197,94,0.15)', color: '#e6edf3', border: '1px solid rgba(34,197,94,0.2)' }
                      : { background: '#1c2333', color: '#e6edf3', border: '1px solid rgba(255,255,255,0.06)' }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
                     style={{ background: '#1c2333', color: '#7d8590', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Loader2 size={12} className="animate-spin" />
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-center px-3" style={{ color: '#f85149' }}>{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 px-3 py-3"
               style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#1c2333' }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                 style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask about inventory…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                disabled={loading}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: '#e6edf3' }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="p-1 rounded-lg transition-opacity disabled:opacity-30"
                style={{ color: '#22c55e' }}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
