import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles, Check, AlertTriangle, ChevronDown } from 'lucide-react';
import { askAssistant, type ChatMessage, type ParsedToolCall } from '../lib/openrouter';
import { updateUserRole, setUserActive, updateCartStatus, updateInventoryQty, addScrapLogEntry, addDealer, createCartManual } from '../lib/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { InventoryItem, Cart, AppUser, Dealer } from '../types';

const SUGGESTIONS = [
  'What items are low or out of stock?',
  'How many carts are in each status?',
  'Add a new ECO4 White cart with Black seats',
  'Set Frame: Eco 4 quantity to 20',
  'Log 2 scrapped red front shells — shipping damage',
  'What is the average build time this month?',
];

interface Props {
  inventory: InventoryItem[];
  carts: Cart[];
  users: AppUser[];
  dealers: Dealer[];
}

type MessageEntry =
  | { type: 'chat'; role: 'user' | 'assistant'; content: string }
  | { type: 'tool_pending'; calls: ParsedToolCall[]; resolvedAt?: number }
  | { type: 'tool_result'; success: boolean; text: string };

// ─── Confirmation card ────────────────────────────────────────────────────────

function ToolConfirmCard({
  calls, onConfirm, onCancel, executing,
}: {
  calls: ParsedToolCall[];
  onConfirm: () => void;
  onCancel: () => void;
  executing: boolean;
}) {
  function describe(call: ParsedToolCall): string {
    switch (call.name) {
      case 'update_employee_role':  return `Change ${call.employeeName}'s role → ${call.role}`;
      case 'deactivate_employee':   return `Deactivate ${call.employeeName}`;
      case 'activate_employee':     return `Activate ${call.employeeName}`;
      case 'update_cart_status':    return `${call.vin}: set status → ${call.newStatus}${call.qcFailReason ? ` ("${call.qcFailReason}")` : ''}`;
      case 'update_inventory_qty':  return `${call.itemName}: set qty → ${call.newQty}`;
      case 'log_scrap':             return `Log scrap: ${call.quantity}× ${call.itemName} — "${call.problemInfo}"`;
      case 'add_dealer':            return `Add dealer: ${call.dealerName}`;
      case 'add_cart':              return `Add cart: ${call.vin} | ${call.model} | ${call.shellColor}/${call.seatColor} | ${call.dealerName} | ${call.status}`;
      default: return 'Unknown action';
    }
  }

  return (
    <div className="rounded-xl p-3 text-sm" style={{ background: '#1c2333', border: '1px solid rgba(210,153,34,0.3)' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: '#d29922' }}>
        <AlertTriangle size={13} />
        <span className="font-semibold text-xs uppercase tracking-wide">Confirm Action</span>
      </div>
      <ul className="mb-3 space-y-1">
        {calls.map((c, i) => (
          <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: '#e6edf3' }}>
            <span style={{ color: '#d29922' }}>•</span>
            {describe(c)}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={executing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
        >
          {executing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          {executing ? 'Executing…' : 'Confirm'}
        </button>
        <button
          onClick={onCancel}
          disabled={executing}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'rgba(248,81,73,0.1)', color: '#f85149', border: '1px solid rgba(248,81,73,0.25)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AIAssistant({ inventory, carts, users, dealers }: Props) {
  const { user } = useAuth();
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<MessageEntry[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError]         = useState('');
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const chatHistory: ChatMessage[] = messages
    .filter((m): m is Extract<MessageEntry, { type: 'chat' }> => m.type === 'chat')
    .map(m => ({ role: m.role, content: m.content }));

  useEffect(() => {
    if (open && !minimized) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages, open, minimized]);

  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus();
  }, [open, minimized]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    setError('');

    setMessages(prev => [...prev, { type: 'chat', role: 'user', content }]);
    setLoading(true);

    try {
      const history: ChatMessage[] = [...chatHistory, { role: 'user', content }];
      const result = await askAssistant(history, inventory, carts, users, dealers);

      if (result.toolCalls.length > 0) {
        if (result.content) {
          setMessages(prev => [...prev, { type: 'chat', role: 'assistant', content: result.content }]);
        }
        setMessages(prev => [...prev, { type: 'tool_pending', calls: result.toolCalls }]);
      } else {
        setMessages(prev => [...prev, { type: 'chat', role: 'assistant', content: result.content || 'No response.' }]);
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Request failed. Check your OpenRouter API key.');
    } finally {
      setLoading(false);
    }
  }

  async function executeTool(calls: ParsedToolCall[], msgIdx: number) {
    if (!user) return;
    setExecuting(true);
    const results: string[] = [];

    try {
      for (const call of calls) {
        switch (call.name) {
          case 'update_employee_role':
            await updateUserRole(call.uid, call.role);
            results.push(`✓ ${call.employeeName}'s role → ${call.role}`);
            break;

          case 'deactivate_employee':
            await setUserActive(call.uid, false);
            results.push(`✓ ${call.employeeName} deactivated`);
            break;

          case 'activate_employee':
            await setUserActive(call.uid, true);
            results.push(`✓ ${call.employeeName} activated`);
            break;

          case 'update_cart_status':
            await updateCartStatus(call.cartId, call.newStatus, user.uid, user.name, call.qcFailReason);
            results.push(`✓ ${call.vin} → ${call.newStatus}`);
            break;

          case 'update_inventory_qty':
            await updateInventoryQty(call.itemId, call.newQty, user.uid, user.name);
            results.push(`✓ ${call.itemName} qty → ${call.newQty}`);
            break;

          case 'log_scrap':
            await addScrapLogEntry({
              itemName:      call.itemName,
              problemInfo:   call.problemInfo,
              quantity:      call.quantity,
              partNumber:    call.partNumber,
              associatedVin: call.associatedVin,
              loggedBy:      user.uid,
              loggedByName:  user.name,
            });
            results.push(`✓ Scrap logged: ${call.quantity}× ${call.itemName}`);
            break;

          case 'add_dealer':
            await addDealer(call.dealerName);
            results.push(`✓ Dealer added: ${call.dealerName}`);
            break;

          case 'add_cart':
            await createCartManual({
              vin:           call.vin,
              model:         call.model,
              shellColor:    call.shellColor,
              seatColor:     call.seatColor,
              dealerId:      call.dealerId,
              dealerName:    call.dealerName,
              status:        call.status,
              createdBy:     user.uid,
              createdByName: user.name,
            });
            results.push(`✓ Cart added: ${call.vin} (${call.model} · ${call.shellColor})`);
            break;
        }
      }

      setMessages(prev => {
        const next = [...prev];
        next[msgIdx] = { type: 'tool_pending', calls, resolvedAt: Date.now() };
        next.push({ type: 'tool_result', success: true, text: results.join('\n') });
        return next;
      });
    } catch (e: unknown) {
      setMessages(prev => {
        const next = [...prev];
        next[msgIdx] = { ...(next[msgIdx] as any), resolvedAt: Date.now() };
        next.push({ type: 'tool_result', success: false, text: `Failed: ${(e as Error).message}` });
        return next;
      });
    } finally {
      setExecuting(false);
    }
  }

  function cancelTool(msgIdx: number) {
    setMessages(prev => {
      const next = [...prev];
      next[msgIdx] = { ...(next[msgIdx] as any), resolvedAt: Date.now() };
      next.push({ type: 'tool_result', success: false, text: 'Cancelled.' });
      return next;
    });
  }

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl font-medium text-sm transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0d1117' }}
        >
          <Sparkles size={16} />
          AI Assistant
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden bottom-[88px] md:bottom-5 right-4 left-4 md:left-auto"
          style={{
            maxWidth: 440,
            marginLeft: 'auto',
            height: minimized ? 56 : 'min(580px, calc(100dvh - 160px))',
            background: '#161b27',
            border: '1px solid rgba(255,255,255,0.08)',
            transition: 'height 0.2s ease',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0 cursor-pointer select-none"
            style={{ background: '#1c2333', borderBottom: minimized ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
            onClick={() => setMinimized(m => !m)}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                   style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                <Bot size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#e6edf3' }}>V-Carts Assistant</p>
                <p className="text-xs" style={{ color: '#7d8590' }}>
                  {inventory.length} parts · {carts.length} carts · {users.length} staff · {dealers.length} dealers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); setMinimized(m => !m); }}
                      className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: '#7d8590' }}>
                <ChevronDown size={15} style={{ transform: minimized ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              <button onClick={e => { e.stopPropagation(); setOpen(false); }}
                      className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: '#7d8590' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
                {messages.length === 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-center pb-1" style={{ color: '#7d8590' }}>
                      Ask questions or give commands — I can read and write all production data.
                    </p>
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
                )}

                {messages.map((m, i) => {
                  if (m.type === 'chat') {
                    return (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className="max-w-[88%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap"
                          style={
                            m.role === 'user'
                              ? { background: 'rgba(34,197,94,0.15)', color: '#e6edf3', border: '1px solid rgba(34,197,94,0.2)' }
                              : { background: '#1c2333', color: '#e6edf3', border: '1px solid rgba(255,255,255,0.06)' }
                          }
                        >
                          {m.content}
                        </div>
                      </div>
                    );
                  }

                  if (m.type === 'tool_pending' && m.resolvedAt === undefined) {
                    return (
                      <ToolConfirmCard
                        key={i}
                        calls={m.calls}
                        onConfirm={() => executeTool(m.calls, i)}
                        onCancel={() => cancelTool(i)}
                        executing={executing}
                      />
                    );
                  }

                  if (m.type === 'tool_result') {
                    return (
                      <div key={i} className="flex justify-start">
                        <div
                          className="max-w-[88%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap"
                          style={
                            m.success
                              ? { background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }
                              : { background: 'rgba(125,133,144,0.08)', color: '#7d8590', border: '1px solid rgba(255,255,255,0.06)' }
                          }
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}

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
                    placeholder="Ask or command anything…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && send()}
                    disabled={loading || executing}
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: '#e6edf3' }}
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || loading || executing}
                    className="p-1 rounded-lg transition-opacity disabled:opacity-30"
                    style={{ color: '#22c55e' }}
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
