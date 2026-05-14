import type { InventoryItem, Cart, AppUser, CartStatus, CartModel, ShellColor, SeatColor, Dealer } from '../types';

const API_KEY: string = import.meta.env.VITE_OPENROUTER_API_KEY ?? '';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-3.5-sonnet';
const VIN_SCAN_MODEL = 'openai/gpt-4o';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

// ─── Tool types ───────────────────────────────────────────────────────────────

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ParsedToolCall =
  // Employee management
  | { name: 'update_employee_role'; uid: string; employeeName: string; role: 'worker' | 'administration' | 'manager' }
  | { name: 'deactivate_employee';  uid: string; employeeName: string }
  | { name: 'activate_employee';    uid: string; employeeName: string }
  // Cart management
  | { name: 'update_cart_status'; cartId: string; vin: string; newStatus: CartStatus; qcFailReason?: string }
  // Inventory management
  | { name: 'update_inventory_qty'; itemId: string; itemName: string; newQty: number }
  // Scrap log
  | { name: 'log_scrap'; itemName: string; problemInfo: string; quantity: number; partNumber?: string; associatedVin?: string }
  // Dealers
  | { name: 'add_dealer'; dealerName: string }
  // Carts
  | { name: 'add_cart'; vin: string; model: CartModel; shellColor: ShellColor; seatColor: SeatColor; dealerId: string; dealerName: string; status: CartStatus };

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  // ── Employee tools ──
  {
    type: 'function',
    function: {
      name: 'update_employee_role',
      description: "Change an employee's role. Requires confirmation.",
      parameters: {
        type: 'object',
        properties: {
          uid:          { type: 'string', description: "Employee's Firestore UID from the EMPLOYEES list" },
          employeeName: { type: 'string', description: "Employee's display name" },
          role:         { type: 'string', enum: ['worker', 'administration', 'manager'] },
        },
        required: ['uid', 'employeeName', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deactivate_employee',
      description: 'Deactivate an employee account, revoking their login access. Requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          uid:          { type: 'string' },
          employeeName: { type: 'string' },
        },
        required: ['uid', 'employeeName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'activate_employee',
      description: 'Re-activate a deactivated employee account.',
      parameters: {
        type: 'object',
        properties: {
          uid:          { type: 'string' },
          employeeName: { type: 'string' },
        },
        required: ['uid', 'employeeName'],
      },
    },
  },
  // ── Cart tools ──
  {
    type: 'function',
    function: {
      name: 'update_cart_status',
      description: 'Move a cart to the next status in the production workflow. Requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          cartId:       { type: 'string', description: 'Firestore cart document ID from the CARTS list' },
          vin:          { type: 'string', description: 'Cart VIN for display in confirmation' },
          newStatus:    { type: 'string', enum: ['built', 'in_queue', 'qc_pass', 'qc_fail', 'painted', 'ready_to_ship', 'incomplete'], description: 'New status to set' },
          qcFailReason: { type: 'string', description: 'Required when newStatus is qc_fail — describe the problem' },
        },
        required: ['cartId', 'vin', 'newStatus'],
      },
    },
  },
  // ── Inventory tools ──
  {
    type: 'function',
    function: {
      name: 'update_inventory_qty',
      description: 'Set the quantity on hand for an inventory item. Requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          itemId:   { type: 'string', description: 'Firestore inventory document ID from the INVENTORY list' },
          itemName: { type: 'string', description: 'Item name for display in confirmation' },
          newQty:   { type: 'number', description: 'New quantity on hand (must be >= 0)' },
        },
        required: ['itemId', 'itemName', 'newQty'],
      },
    },
  },
  // ── Scrap log tools ──
  {
    type: 'function',
    function: {
      name: 'log_scrap',
      description: 'Log a scrapped or damaged part in the scrap log. Requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          itemName:      { type: 'string', description: 'Name of the scrapped item — can be any free-text name, does NOT need to match an inventory item' },
          problemInfo:   { type: 'string', description: 'Description of the problem or reason for scrapping' },
          quantity:      { type: 'number', description: 'Number of units scrapped' },
          partNumber:    { type: 'string', description: 'Part number if known (optional)' },
          associatedVin: { type: 'string', description: 'VIN of associated cart if applicable (optional)' },
        },
        required: ['itemName', 'problemInfo', 'quantity'],
      },
    },
  },
  // ── Cart creation tool ──
  {
    type: 'function',
    function: {
      name: 'add_cart',
      description: 'Add a new cart to the master carts list. Use this when the user wants to enter an existing or new cart manually. Requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          vin:        { type: 'string', description: 'Cart VIN number (uppercase, e.g. VC-2024-0099)' },
          model:      { type: 'string', enum: ['ECO2', 'ECO4', 'ECO6', 'LIFTED4', 'LIFTED6', 'F4'] },
          shellColor: { type: 'string', enum: ['Red', 'White', 'Blue', 'Black', 'Matte Grey', 'Cloud Blue', 'Burgundy', 'Silver'] },
          seatColor:  { type: 'string', enum: ['Brown', 'Black', 'Grey'] },
          dealerId:   { type: 'string', description: 'Firestore dealer document ID from the DEALERS list, or "unknown" if not known' },
          dealerName: { type: 'string', description: 'Dealer display name, or "Unknown / TBD"' },
          status:     { type: 'string', enum: ['intake', 'built', 'in_queue', 'qc_pass', 'qc_fail', 'painted', 'ready_to_ship', 'shipped', 'incomplete'], description: 'Initial status — use "intake" unless the cart is already partway through production' },
        },
        required: ['vin', 'model', 'shellColor', 'seatColor', 'dealerId', 'dealerName', 'status'],
      },
    },
  },
  // ── Dealer tools ──
  {
    type: 'function',
    function: {
      name: 'add_dealer',
      description: 'Add a new dealer to the system. Requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          dealerName: { type: 'string', description: 'Name of the dealer to add' },
        },
        required: ['dealerName'],
      },
    },
  },
];

// ─── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(inventory: InventoryItem[], carts: Cart[], users: AppUser[], dealers: Dealer[]): string {
  const now = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Include IDs so AI can use them in tool calls
  const inventoryRows = inventory.map(item =>
    `id:${item.id} | ${item.name} | ${item.category} | qty:${item.quantityOnHand} | min:${item.minimumStockLevel} | ${
      item.quantityOnHand === 0 ? 'OUT_OF_STOCK' : item.quantityOnHand <= item.minimumStockLevel ? 'LOW_STOCK' : 'OK'
    }`
  ).join('\n');

  const cartRows = carts.map(c => {
    const base = `id:${c.id} | VIN:${c.vin} | ${c.model} | ${c.shellColor}/${c.seatColor} | ${c.status} | dealer:${c.dealerName} | created:${formatDate(c.createdAt)}`;
    return c.status === 'qc_fail' && c.qcFailReason
      ? `${base} | FAIL_REASON:"${c.qcFailReason}"`
      : base;
  }).join('\n');

  const userRows = users.map(u =>
    `uid:${u.uid} | ${u.name} | ${u.email} | role:${u.role} | active:${u.active}`
  ).join('\n');

  const dealerRows = dealers.map(d => `id:${d.id} | ${d.name}`).join('\n');

  return `You are an expert AI operations assistant for V-Carts IPPS, a golf cart production management system. Today is ${now}.

You have FULL read and write access to all company databases. You are highly capable — answer questions analytically and execute actions precisely.

INVENTORY (${inventory.length} items):
${inventoryRows || '(empty)'}

ACTIVE PRODUCTION CARTS (${carts.length} carts):
${cartRows || '(empty)'}
Full workflow: intake → built → in_queue → qc_pass | qc_fail → painted → ready_to_ship → shipped
Any active status can also transition to incomplete (missing parts / repair needed) → back to in_queue after repair.
qc_fail carts need rework then re-enter in_queue. FAIL_REASON shown when available.
Models: ECO2, ECO4, ECO6, LIFTED4, LIFTED6, F4
Shell colors: Red, White, Blue, Black, Matte Grey, Cloud Blue, Burgundy, Silver
Seat colors: Brown, Black, Grey

EMPLOYEES (${users.length} users):
${userRows || '(empty)'}
Roles: worker < administration < manager

DEALERS (${dealers.length}):
${dealerRows || '(empty)'}

WRITE CAPABILITIES (all require user confirmation before executing):
- add_cart: create a new cart entry in the master list
- update_cart_status: advance or update a cart's workflow status
- update_inventory_qty: set quantity on hand for any inventory item
- log_scrap: add a scrap/damage entry to the scrap log
- add_dealer: add a new dealer to the system
- update_employee_role: change an employee's role
- deactivate_employee / activate_employee: toggle employee access

RULES:
- Use ONLY data from the lists above — never invent IDs, names, or quantities
- Exception: log_scrap itemName is always free-text — accept whatever part name the user provides
- Always use the correct Firestore id/uid from the lists when calling tools
- For qc_fail status, always include a qcFailReason
- For add_cart: if dealer is unknown, use dealerId="unknown" and dealerName="Unknown / TBD"
- For adding NEW employees: new users must sign in first; then use update_employee_role
- Be concise but thorough. Use bullet points for lists. Show calculations when relevant.`;
}

function formatDate(val: unknown): string {
  if (!val) return '?';
  if (typeof (val as any).toDate === 'function') return (val as any).toDate().toLocaleDateString();
  return new Date(val as string).toLocaleDateString();
}

// ─── Audit Flag Explanations ──────────────────────────────────────────────────

export async function generateFlagExplanations(
  flags: { id: string; type: string; userName: string; date: string; clockInTime?: string; clockOutTime?: string }[]
): Promise<Record<string, string>> {
  if (!flags.length || !API_KEY) return {};

  // Use numeric indices so the AI doesn't need to reproduce long Firestore IDs
  const flagDescriptions = flags.map((f, i) => {
    let detail = '';
    if (f.clockInTime)  detail = ` (clocked in at ${f.clockInTime})`;
    if (f.clockOutTime) detail = ` (clocked out at ${f.clockOutTime})`;
    return `${i}: type=${f.type}, worker=${f.userName}, date=${f.date}${detail}`;
  }).join('\n');

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'V-Carts IPPS',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a time-tracking assistant for a golf cart production manager. Write brief, neutral, plain-English explanations of time audit flags (1–2 sentences each). The company works Mon–Fri, 8am–5pm with a 1-hour lunch break.',
        },
        {
          role: 'user',
          content: `Write a short explanation for each numbered flag below. Return ONLY valid JSON: an object where each key is the flag number (as a string) and the value is the explanation.\n\nFlag types:\n- open_shift: clocked in but never clocked out\n- no_lunch: worked 6+ hours through the lunch window with no break\n- long_shift: shift exceeded 10 hours\n- overlapping: two records overlap for the same worker\n- short_punch: clocked in/out in under 5 minutes (likely accidental)\n- invalid_times: clock-out is at or before clock-in (data error)\n- early_clockin: clocked in more than 15 min before the 8am shift start\n- suspicious_overtime: clocked out after 9pm\n\nFlags:\n${flagDescriptions}\n\nReturn JSON only, example: {"0":"explanation","1":"explanation"}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    }),
  });

  if (!res.ok) return {};
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const indexed = JSON.parse(jsonMatch[0]) as Record<string, string>;
    // Map numeric indices back to flag IDs
    const result: Record<string, string> = {};
    for (const [idx, explanation] of Object.entries(indexed)) {
      const flag = flags[Number(idx)];
      if (flag && typeof explanation === 'string') {
        result[flag.id] = explanation;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ─── VIN Extraction from photo ────────────────────────────────────────────────

export async function extractVinFromPhoto(file: File): Promise<string | null> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const mimeType = file.type || 'image/jpeg';

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'V-Carts IPPS',
    },
    body: JSON.stringify({
      model: VIN_SCAN_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            {
              type: 'text',
              text: 'This is a VIN tag photo from a golf cart. Extract the VIN number. A VIN is typically 17 characters containing only letters and numbers (no I, O, or Q). Reply with ONLY the VIN number, nothing else. If you cannot clearly read a VIN number, reply with exactly: UNREADABLE',
            },
          ],
        },
      ],
      max_tokens: 32,
      temperature: 0,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text || text === 'UNREADABLE' || text.length < 5) return null;
  // Strip any surrounding whitespace/punctuation and uppercase
  return text.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase() || null;
}

// ─── API call ──────────────────────────────────────────────────────────────────

export type AIResponse = {
  content: string;
  toolCalls: ParsedToolCall[];
};

export async function askAssistant(
  messages: ChatMessage[],
  inventory: InventoryItem[],
  carts: Cart[],
  users: AppUser[],
  dealers: Dealer[]
): Promise<AIResponse> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'V-Carts IPPS',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(inventory, carts, users, dealers) },
        ...messages,
      ],
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const content: string = msg?.content ?? '';

  const toolCalls: ParsedToolCall[] = [];
  if (Array.isArray(msg?.tool_calls)) {
    for (const tc of msg.tool_calls as ToolCall[]) {
      try {
        const args = JSON.parse(tc.function.arguments);
        toolCalls.push({ name: tc.function.name as any, ...args });
      } catch {
        // skip malformed
      }
    }
  }

  return { content, toolCalls };
}
