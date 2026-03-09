import { useEffect, useRef, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import Vapi from '@vapi-ai/web'
import { usePlaidLink } from 'react-plaid-link'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080'
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY
const ASSISTANT_ID = '998c3e7f-ed8c-4afb-a49c-40cf6649911c'

const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
}

function getTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function parseBankSummary(userData) {
  const bankingEntries = userData?.banking || []
  let accounts = []
  let transactions = []

  for (const entry of bankingEntries) {
    if (entry.data?.accounts) accounts = accounts.concat(entry.data.accounts)
    if (entry.data?.transactions) transactions = transactions.concat(entry.data.transactions)
  }

  const checking = accounts.find((a) => a.subtype === 'checking') || accounts[0]
  if (!checking) return null

  const sorted = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const last5 = sorted.slice(0, 5)

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthlySpent = transactions
    .filter((t) => t.amount > 0 && (t.date || '').startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount, 0)

  return {
    accountName: checking.name || 'Checking',
    mask: checking.mask,
    balance: checking.balances?.current ?? checking.balances?.available ?? 0,
    last5,
    monthlySpent,
  }
}

function BankSummary({ data, compact }) {
  const fmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

  return (
    <div
      className={`
        bg-white/[0.06] backdrop-blur-md rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden
        transition-all duration-700 ease-in-out w-full
        ${compact ? 'max-h-[520px]' : ''}
      `}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            {data.accountName}
          </p>
          {data.mask && (
            <span className="text-[11px] text-gray-500 font-mono">••{data.mask}</span>
          )}
        </div>

        <p className="text-3xl font-bold text-white tracking-tight mt-1">
          {fmt(data.balance)}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">Available balance</p>
      </div>

      <div className="mx-5 border-t border-white/[0.06]" />

      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            This month
          </p>
          <span className="text-xs font-semibold text-red-500">{fmt(data.monthlySpent)}</span>
        </div>

        <div className="w-full bg-white/[0.08] rounded-full h-1.5 mb-1">
          <div
            className="bg-gradient-to-r from-blue-400 to-blue-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((data.monthlySpent / (data.balance || 1)) * 100, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 text-right">
          {((data.monthlySpent / (data.balance || 1)) * 100).toFixed(1)}% of balance
        </p>
      </div>

      <div className="mx-5 border-t border-white/[0.06]" />

      <div className="px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Recent transactions
        </p>
        <div className="flex flex-col gap-2.5">
          {data.last5.map((txn, i) => {
            const isIncome = txn.amount < 0
            return (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isIncome
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-white/[0.05] text-gray-500'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      {isIncome ? (
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      ) : (
                        <path d="M12 5v14M5 12l7 7 7-7" />
                      )}
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-200 truncate">
                      {txn.merchant || txn.name}
                    </p>
                    <p className="text-[10px] text-gray-500">{txn.date}</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold flex-shrink-0 ml-3 ${
                    isIncome ? 'text-emerald-500' : 'text-gray-400'
                  }`}
                >
                  {isIncome ? '+' : '-'}{fmt(txn.amount)}
                </span>
              </div>
            )
          })}
          {data.last5.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">No transactions yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intent → View mapping
// ---------------------------------------------------------------------------

const PANEL_VIEWS = {
  SUMMARY: 'summary',
  CATEGORY: 'category',
  MONTHLY: 'monthly',
}

const INTENT_RULES = [
  {
    view: PANEL_VIEWS.CATEGORY,
    keywords: ['transaction insight', 'spending by category', 'category breakdown', 'where am i spending', 'spending categories'],
  },
  {
    view: PANEL_VIEWS.MONTHLY,
    keywords: ['spending per month', 'monthly spending', 'monthly breakdown', 'month by month', 'last few months'],
  },
  {
    view: PANEL_VIEWS.SUMMARY,
    keywords: ['go back', 'show summary', 'back to summary', 'account summary', 'show my balance'],
  },
]

function detectPanelIntent(spoken) {
  const lower = spoken.toLowerCase()
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.view
  }
  return null
}

// ---------------------------------------------------------------------------
// Data crunchers
// ---------------------------------------------------------------------------

const CATEGORY_PALETTE = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#06B6D4', '#F43F5E', '#6366F1', '#14B8A6', '#EAB308',
]

function buildCategoryData(transactions) {
  const map = {}
  for (const t of transactions) {
    if (t.amount <= 0) continue
    const cat = t.category || 'Other'
    map[cat] = (map[cat] || 0) + t.amount
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
}

function buildMonthlyData(transactions) {
  const map = {}
  for (const t of transactions) {
    if (t.amount <= 0) continue
    const month = (t.date || '').slice(0, 7)
    if (!month) continue
    map[month] = (map[month] || 0) + t.amount
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-5)
    .map(([month, total]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: Math.round(total * 100) / 100,
    }))
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

function CategoryChart({ transactions }) {
  const data = useMemo(() => buildCategoryData(transactions), [transactions])
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Spending by Category
        </p>
        <p className="text-2xl font-bold text-white tracking-tight mt-1">{fmt(total)}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Total spending</p>
      </div>

      <div className="px-2">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => fmt(v)}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.4)', background: '#1e1e2a', color: '#e5e7eb' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-col gap-2">
          {data.slice(0, 6).map((d, i) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }}
                />
                <span className="text-xs text-gray-400 truncate">{d.name}</span>
              </div>
              <span className="text-xs font-semibold text-gray-200 flex-shrink-0 ml-3">{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MonthlyChart({ transactions }) {
  const data = useMemo(() => buildMonthlyData(transactions), [transactions])
  const max = Math.max(...data.map((d) => d.total), 1)

  return (
    <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Monthly Spending
        </p>
        <p className="text-[11px] text-gray-400 mt-1">Last {data.length} months</p>
      </div>

      <div className="px-2 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#6B7280' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#4B5563' }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}k`}
              domain={[0, Math.ceil(max * 1.15)]}
            />
            <Tooltip
              formatter={(v) => fmt(v)}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.4)', background: '#1e1e2a', color: '#e5e7eb' }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={36}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === data.length - 1 ? '#3B82F6' : 'rgba(255,255,255,0.08)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-col gap-1.5">
          {data.map((d, i) => (
            <div key={d.month} className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{d.month}</span>
              <span
                className={`text-xs font-semibold ${i === data.length - 1 ? 'text-blue-600' : 'text-gray-400'}`}
              >
                {fmt(d.total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatEmailTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  if (isYesterday) return 'Yesterday'
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function mapApiEmailToView(msg) {
  return {
    id: msg.id,
    sender: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
    subject: msg.subject || '(No subject)',
    preview: msg.bodyPreview || '',
    time: formatEmailTime(msg.receivedAt),
    receivedAtRaw: msg.receivedAt,
    unread: !msg.isRead,
  }
}

function mapUserDataEmailToView(email) {
  return {
    id: email.from + email.receivedAt,
    sender: email.fromName || email.from || 'Unknown',
    subject: email.subject || '(No subject)',
    preview: email.preview || '',
    time: formatEmailTime(email.receivedAt),
    receivedAtRaw: email.receivedAt,
    unread: !email.isRead,
  }
}

function extractUserDataEmails(userData) {
  const emailEntries = userData?.email || []
  const emails = []
  for (const entry of emailEntries) {
    const recentEmails = entry.data?.recentEmails || []
    for (const em of recentEmails) {
      emails.push(mapUserDataEmailToView(em))
    }
  }
  return emails
}

function EmailInbox({ emails, loading, error }) {
  const unreadCount = emails.filter((e) => e.unread).length

  return (
    <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Inbox
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="text-[10px] font-bold bg-violet-500 text-white px-2 py-0.5 rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>

      {loading && (
        <div className="px-5 py-8 text-center">
          <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">Loading inbox…</p>
        </div>
      )}

      {error && !loading && emails.length === 0 && (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-gray-400">Could not load emails</p>
        </div>
      )}

      {!loading && emails.length === 0 && !error && (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-gray-400">Inbox is empty</p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div className="flex flex-col max-h-[220px] overflow-y-auto">
          {emails.map((email) => (
            <div
              key={email.id}
              className={`
                px-5 py-3 border-t border-white/[0.04] cursor-pointer
                hover:bg-violet-500/[0.08] transition-colors
                ${email.unread ? 'bg-violet-500/[0.06]' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {email.unread && (
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                    )}
                    <p className={`text-xs truncate ${email.unread ? 'font-semibold text-white' : 'font-medium text-gray-400'}`}>
                      {email.sender}
                    </p>
                  </div>
                  <p className={`text-[11px] truncate mt-0.5 ${email.unread ? 'text-gray-300' : 'text-gray-400'}`}>
                    {email.subject}
                  </p>
                </div>
                <span className="text-[10px] text-gray-500 flex-shrink-0 mt-0.5">{email.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatEventDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  const diffDays = Math.floor((d - now) / (1000 * 60 * 60 * 24))
  if (diffDays >= 0 && diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** Format time as it appears in the JSON (no timezone conversion). ISO string e.g. "2026-03-09T19:00:00-05:00" -> "7:00 PM" */
function fmtTimeFromIso(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return ''
  const m = isoStr.match(/T(\d{1,2}):(\d{2})/)
  if (!m) return ''
  const hour = parseInt(m[1], 10)
  const minute = m[2]
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${minute} ${period}`
}

function mapApiCalendarToView(evt) {
  const start = evt.start?.dateTime ? new Date(evt.start.dateTime) : null
  const end = evt.end?.dateTime ? new Date(evt.end.dateTime) : null
  let time = 'All day'
  if (!evt.isAllDay && start && end) time = `${fmtTime(start)} – ${fmtTime(end)}`
  return {
    id: evt.id,
    title: evt.subject || '(No title)',
    time,
    date: formatEventDate(evt.start?.dateTime),
    startRaw: evt.start?.dateTime || null,
  }
}

function mapDemoCalendarToView(evt) {
  const start = evt.start ? new Date(evt.start) : null
  const end = evt.end ? new Date(evt.end) : null
  let time = 'All day'
  // Use times as stored in JSON (no timezone conversion) so dashboard matches maya_calendar.json
  if (!evt.isAllDay && evt.start && evt.end) {
    time = `${fmtTimeFromIso(evt.start)} – ${fmtTimeFromIso(evt.end)}`
  }
  return {
    id: evt.id,
    title: evt.title || '(No title)',
    time,
    date: formatEventDate(evt.start),
    startRaw: evt.start || null,
  }
}

function extractUserDataCalendar(userData) {
  const entries = userData?.calendar || []
  const events = []
  for (const entry of entries) {
    for (const evt of (entry.data?.calendarEvents || [])) {
      events.push(mapDemoCalendarToView(evt))
    }
  }
  events.sort((a, b) => new Date(a.startRaw || 0) - new Date(b.startRaw || 0))
  return events
}

function CalendarCard({ events }) {
  const upcoming = events.slice(0, 4)

  return (
    <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Calendar
          </p>
        </div>
        <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
          {upcoming.length} upcoming
        </span>
      </div>

      <div className="flex flex-col max-h-[220px] overflow-y-auto">
        {upcoming.map((evt) => (
          <div
            key={evt.id}
            className="px-5 py-2.5 border-t border-white/[0.04] hover:bg-emerald-500/[0.06] transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-200 truncate">
                  {evt.title}
                </p>
                <p className="text-[11px] text-emerald-400/70 mt-0.5">
                  {evt.time}
                </p>
              </div>
              <span className="text-[10px] text-gray-500 flex-shrink-0 mt-0.5">
                {evt.date}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildContextString(userData) {
  if (!userData || Object.keys(userData).length === 0) return ''

  const sections = []
  const labels = {
    conversations: 'CONVERSATION HISTORY',
    search: 'INTERNET SEARCH HISTORY',
    banking: 'BANK TRANSACTIONS',
    email: 'RECENT EMAILS',
    calendar: 'CALENDAR & EVENTS',
    other: 'OTHER DATA',
  }

  for (const [category, items] of Object.entries(userData)) {
    const heading = labels[category] || category.toUpperCase()
    let content
    if (category === 'calendar') {
      // Merge all calendar events and sort chronologically so the assistant sees "next" events in order
      const allEvents = []
      for (const item of items) {
        const events = item.data?.calendarEvents || []
        allEvents.push(...events)
      }
      allEvents.sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0))
      content = JSON.stringify({ calendarEvents: allEvents }, null, 0)
    } else {
      content = items
        .map((item) => JSON.stringify(item.data, null, 0))
        .join('\n')
    }
    sections.push(`--- ${heading} ---\n${content}`)
  }

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Keyboard zones & tips
// ---------------------------------------------------------------------------

const LEFT_KEYS = new Set([
  'q','w','e','r','a','s','d','f','z','x','c','v',
  '1','2','3','4','`',
  'tab','capslock','shift',
])

const RIGHT_KEYS = new Set([
  't','g','b','y','u','i','o','p','h','j','k','l','n','m',
  '5','6','7','8','9','0','-','=',
  '[',']','\\',';',"'",',','.','/','backspace','enter',
])

const IGNORED_KEYS = new Set([
  'Control','Alt','Meta','Escape',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
])

const tipsTips = [
  'Ask Mimi to summarize your recent spending habits.',
  'Ask Mimi to toggle the financial dashboard view',
  'Ask Mimi to read your most recent email',
  'Ask Mimi what your next calendar appointment is',
]

export default function DashboardPage() {
  const { state } = useLocation()
  const demoMode = state?.demoMode || false
  const [userData, setUserData] = useState(state?.userData || {})
  const [outlookUserId, setOutlookUserId] = useState(state?.outlookUserId || null)
  const userContext = useRef(buildContextString(userData))

  useEffect(() => {
    userContext.current = buildContextString(userData)
  }, [userData])

  const vapiRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const [status, setStatus] = useState(STATUS.IDLE)
  const [isMuted, setIsMuted] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [transcript, setTranscript] = useState([])
  const [userName] = useState(state?.userName || 'User')

  const [panelView, setPanelView] = useState(PANEL_VIEWS.SUMMARY)
  const [inboxEmails, setInboxEmails] = useState([])
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [emailsError, setEmailsError] = useState(null)
  const [outlookConnected, setOutlookConnected] = useState(false)
  const [tipIndex] = useState(() => Math.floor(Math.random() * tipsTips.length))

  // Inline Plaid bank connection
  const [bankLinkToken, setBankLinkToken] = useState(null)
  const [bankLoading, setBankLoading] = useState(false)

  const fetchBankLinkToken = async () => {
    setBankLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/plaid/create-link-token`, { method: 'POST' })
      const data = await res.json()
      setBankLinkToken(data.link_token)
    } catch (err) {
      console.error('Failed to get link token:', err)
      setBankLoading(false)
    }
  }

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: bankLinkToken,
    onSuccess: async (publicToken) => {
      setBankLoading(true)
      try {
        const exchangeRes = await fetch(`${API_BASE}/api/plaid/exchange-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken }),
        })
        const { item_id } = await exchangeRes.json()
        const dataRes = await fetch(`${API_BASE}/api/plaid/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id }),
        })
        const bankData = await dataRes.json()
        setUserData((prev) => {
          const next = { ...prev }
          if (!next.banking) next.banking = []
          next.banking = [...next.banking, { filename: 'plaid-bank-connection', data: bankData }]
          return next
        })
      } catch (err) {
        console.error('Failed to fetch bank data:', err)
      }
      setBankLoading(false)
    },
    onExit: () => setBankLoading(false),
  })

  useEffect(() => {
    if (bankLinkToken && plaidReady) openPlaid()
  }, [bankLinkToken, plaidReady, openPlaid])

  // Inline Outlook email connection
  const [emailConnectLoading, setEmailConnectLoading] = useState(false)

  const connectOutlook = async () => {
    setEmailConnectLoading(true)
    const width = 500, height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      `${API_BASE}/auth/outlook/login`,
      'outlook-login',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
    )

    const pollInterval = setInterval(async () => {
      if (!popup || popup.closed) {
        clearInterval(pollInterval)
        try {
          const res = await fetch(`${API_BASE}/auth/outlook/status`, { credentials: 'include' })
          const data = await res.json()
          if (data.authenticated) setOutlookUserId(data.userId)
        } catch (err) {
          console.error('Outlook connection failed:', err)
        }
        setEmailConnectLoading(false)
      }
    }, 500)
  }

  const disconnectOutlook = async () => {
    setEmailConnectLoading(true)
    try {
      await fetch(`${API_BASE}/auth/outlook/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (err) {
      console.error('Failed to logout Outlook session:', err)
    } finally {
      setOutlookUserId(null)
      setInboxEmails([])
      setOutlookConnected(false)
      setEmailsError(null)
      setEmailsLoading(false)
      setEmailConnectLoading(false)
    }
  }

  const bankSummary = parseBankSummary(userData)
  const hasEmailData = outlookConnected || inboxEmails.length > 0 || emailsLoading
  const allTransactions = useMemo(() => {
    const entries = userData?.banking || []
    let txns = []
    for (const entry of entries) {
      if (entry.data?.transactions) txns = txns.concat(entry.data.transactions)
    }
    return txns
  }, [userData])

  // VAPI
  useEffect(() => {
    const vapi = new Vapi(VAPI_PUBLIC_KEY)
    vapiRef.current = vapi

    vapi.on('call-start', () => setStatus(STATUS.ACTIVE))
    vapi.on('call-end', () => {
      setStatus(STATUS.IDLE)
      setVolumeLevel(0)
      setIsMuted(false)
    })
    vapi.on('volume-level', (level) => setVolumeLevel(level))
    vapi.on('message', (msg) => {
      // VAPI's endCall tool fires this — the AI decided the user wants to leave
      if (
        msg.type === 'function-call' &&
        msg.functionCall?.name === 'endCall'
      ) {
        setStatus(STATUS.ENDING)
        return
      }

      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setTranscript((prev) => [
          ...prev,
          { role: msg.role, text: msg.transcript },
        ])

        if (msg.role === 'user') {
          const spoken = msg.transcript.toLowerCase().trim()

          // Fallback client-side end-call detection (safety net)
          const END_PHRASES = [
            'end this call', 'goodbye', 'good bye',
            'bye bye', 'bye mimi', 'bye-bye', 'bye'
          ]
          const isExactBye = spoken === 'bye' || spoken === 'thanks bye'
          if (isExactBye || END_PHRASES.some((p) => spoken.includes(p))) {
            setStatus(STATUS.ENDING)
            vapi.stop()
            return
          }

          const intent = detectPanelIntent(spoken)
          if (intent) setPanelView(intent)
        }
      }
    })
    vapi.on('error', (err) => {
      console.error('VAPI error:', err)
      setStatus(STATUS.IDLE)
    })

    return () => { vapi.stop() }
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Email fetch
  useEffect(() => {
    if (!outlookUserId) {
      const fallback = extractUserDataEmails(userData)
      if (fallback.length > 0) setInboxEmails(fallback)
      return
    }

    let cancelled = false
    setOutlookConnected(true)

    async function fetchInbox() {
      setEmailsLoading(true)
      setEmailsError(null)
      try {
        const res = await fetch(`${API_BASE}/api/email/messages?top=15`, {
          credentials: 'include',
          headers: { 'X-Outlook-User-Id': outlookUserId },
        })
        if (!res.ok) throw new Error('Failed to fetch emails')
        const data = await res.json()

        if (!cancelled) {
          setInboxEmails((data.messages || []).map(mapApiEmailToView))
        }
      } catch (err) {
        console.error('Email fetch error:', err)
        if (!cancelled) {
          setEmailsError(err.message)
          const fallback = extractUserDataEmails(userData)
          if (fallback.length > 0) setInboxEmails(fallback)
        }
      } finally {
        if (!cancelled) setEmailsLoading(false)
      }
    }

    fetchInbox()
    return () => { cancelled = true }
  }, [outlookUserId])

  // Calendar fetch
  const [calendarEvents, setCalendarEvents] = useState([])
  const [calendarError, setCalendarError] = useState(false)

  useEffect(() => {
    if (demoMode) {
      setCalendarEvents(extractUserDataCalendar(userData).slice(0, 4))
      return
    }
    if (!outlookUserId) return

    let cancelled = false

    async function fetchCalendar() {
      try {
        const res = await fetch(
          `${API_BASE}/api/calendar/events?top=10&orderBy=start/dateTime`,
          {
            credentials: 'include',
            headers: { 'X-Outlook-User-Id': outlookUserId },
          },
        )
        if (!res.ok) throw new Error('Calendar fetch failed')
        const data = await res.json()
        if (!cancelled) {
          const upcoming = (data.events || [])
            .map(mapApiCalendarToView)
            .filter((e) => e.date)
            .slice(0, 4)
          setCalendarEvents(upcoming)
          setCalendarError(false)
        }
      } catch (err) {
        console.error('Calendar fetch error:', err)
        if (!cancelled) setCalendarError(true)
      }
    }

    fetchCalendar()
    return () => { cancelled = true }
  }, [outlookUserId, demoMode, userData])

  const startCall = async () => {
    setStatus(STATUS.CONNECTING)
    setTranscript([])

    const bankConnected = Boolean(bankSummary)
    const emailConnected = inboxEmails.length > 0

    // Start from the base context (uploaded JSON files)
    let context = userContext.current || ''

    // Append live Outlook inbox so VAPI can actually read emails
    if (emailConnected) {
      const sortedEmails = [...inboxEmails].sort((a, b) => {
        const aTime = a.receivedAtRaw ? new Date(a.receivedAtRaw).getTime() : 0
        const bTime = b.receivedAtRaw ? new Date(b.receivedAtRaw).getTime() : 0
        return bTime - aTime
      })

      const emailLines = sortedEmails
        .map((e, i) => {
          const iso = e.receivedAtRaw ? new Date(e.receivedAtRaw).toISOString() : 'unknown'
          const relative = e.time || ''
          return `${i + 1}. [${e.unread ? 'UNREAD' : 'read'}] From: ${e.sender} | Subject: ${e.subject} | Received: ${iso}${
            relative ? ` (${relative})` : ''
          }${e.preview ? ` | Preview: "${e.preview}"` : ''}`
        })
        .join('\n')

      context +=
        `\n\n--- EMAIL INBOX ---\n` +
        `Emails are listed from most recent (1) to oldest.\n` +
        emailLines
    }

    // Append live bank summary so VAPI has structured numbers
    if (bankConnected) {
      const fmt = (n) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
      const s = bankSummary
      const txnLines = s.last5
        .map((t) => `  - ${t.date} | ${t.name} | ${fmt(t.amount)}${t.category ? ` (${t.category})` : ''}`)
        .join('\n')
      context +=
        `\n\n--- BANK ACCOUNT SUMMARY ---\n` +
        `Account: ${s.accountName}${s.mask ? ` (••${s.mask})` : ''}\n` +
        `Balance: ${fmt(s.balance)}\n` +
        `Spent this month: ${fmt(s.monthlySpent)}\n` +
        `Recent transactions:\n${txnLines}`
    }

    const overrides = {
      variableValues: {
        userName,
        timeOfDay: getTimeOfDay(),
        userContext: context,
        bankConnected: bankConnected ? 'yes' : 'no',
        emailConnected: emailConnected ? 'yes' : 'no',
      },
    }

    await vapiRef.current.start(ASSISTANT_ID, overrides)
  }

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (IGNORED_KEYS.has(e.key)) return
      const key = e.key.toLowerCase()

      if (key === ' ' && status === STATUS.IDLE) {
        e.preventDefault()
        startCall()
        return
      }

      if (!demoMode && LEFT_KEYS.has(key) && !bankSummary && !bankLoading) {
        e.preventDefault()
        fetchBankLinkToken()
        return
      }

      if (!demoMode && RIGHT_KEYS.has(key) && !hasEmailData && !emailConnectLoading) {
        e.preventDefault()
        connectOutlook()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status, bankSummary, hasEmailData, bankLoading, emailConnectLoading])

  const endCall = () => {
    setStatus(STATUS.ENDING)
    vapiRef.current.stop()
  }

  const toggleMute = () => {
    const next = !isMuted
    vapiRef.current.setMuted(next)
    setIsMuted(next)
  }

  const isCallActive = status === STATUS.ACTIVE
  const isConnecting = status === STATUS.CONNECTING
  const isEnding = status === STATUS.ENDING
  const hasStarted = isCallActive || isConnecting || isEnding

  const barCount = 24
  const bars = Array.from({ length: barCount }, (_, i) => {
    const center = barCount / 2
    const distFromCenter = Math.abs(i - center) / center
    const baseHeight = (1 - distFromCenter * 0.6) * 100
    const active = volumeLevel > 0.05
    const randomFactor = active ? 0.4 + Math.random() * 0.6 : 0.15
    return { height: baseHeight * randomFactor }
  })

  return (
    <div className="min-h-screen dashboard-bg flex flex-col">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 bg-white/[0.04] backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/15 flex items-center justify-center text-lg shadow-sm">
            🐿️
          </div>
          <span className="text-white font-semibold text-lg">Mimi</span>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-gray-400 text-sm">
            Mimi — The Personal Assistant{userName && userName !== 'User' && (
              <>
                {' to '}
                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent font-medium">
                  {userName}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Main — always 3-column */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="flex gap-5 items-start justify-center transition-all duration-700 ease-in-out w-full max-w-7xl flex-col lg:flex-row">

          {/* LEFT — Bank */}
          <div className="transition-all duration-700 ease-in-out flex-shrink-0 w-full lg:w-72">
            {bankSummary ? (
              <>
                <p className="text-gray-400 text-xs text-center mb-2">
                  Toggle with your voice! Ask Mimi how to do it.
                </p>
                <div className="flex bg-white/[0.06] backdrop-blur-md rounded-xl border border-white/[0.08] p-0.5 mb-3 shadow-sm">
                  {[
                    { id: PANEL_VIEWS.SUMMARY, icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    ), label: 'Summary' },
                    { id: PANEL_VIEWS.CATEGORY, icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                      </svg>
                    ), label: 'Categories' },
                    { id: PANEL_VIEWS.MONTHLY, icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                    ), label: 'Monthly' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setPanelView(tab.id)}
                      className={`
                        flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium
                        transition-all duration-200
                        ${panelView === tab.id
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                        }
                      `}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {panelView === PANEL_VIEWS.SUMMARY && (
                  <BankSummary data={bankSummary} compact={hasStarted} />
                )}
                {panelView === PANEL_VIEWS.CATEGORY && (
                  <CategoryChart transactions={allTransactions} />
                )}
                {panelView === PANEL_VIEWS.MONTHLY && (
                  <MonthlyChart transactions={allTransactions} />
                )}
              </>
            ) : (
              <div
                onClick={() => !demoMode && !bankLoading && fetchBankLinkToken()}
                className="bg-white/[0.06] backdrop-blur-md rounded-2xl border border-white/[0.08] overflow-hidden animate-fade-in cursor-pointer hover:bg-white/[0.08] transition-colors"
              >
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">Bank Account</p>
                      <p className="text-gray-500 text-[10px]">{bankLoading ? 'Connecting…' : 'Not connected'}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Link your bank to unlock balance tracking, transaction history, and spending insights.
                  </p>
                </div>
                <div className="px-6 py-3 flex justify-center">
                  <img src="/keyboardL.png" alt="Left-hand keys" className="w-full h-auto rounded-lg opacity-40" />
                </div>
                <div className="px-5 pb-5 text-center">
                  <p className="text-[11px] text-gray-500">
                    Press any <span className="text-emerald-400 font-medium">key on the green zone</span> to set up
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* CENTER — Conversation */}
          <div className="w-full flex-1 min-w-0 transition-all duration-700 ease-in-out">
            <div className="bg-white/[0.06] backdrop-blur-md rounded-2xl shadow-sm border border-white/[0.08] overflow-hidden">
              {/* Idle / Start state */}
              {!hasStarted && (
                <div className="flex flex-col items-center py-12 px-8 animate-fade-in">
                  <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-5">
                    <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </div>
                  </div>

                  <h2 className="text-xl font-semibold text-white mb-2">
                    Ready when you are
                  </h2>

                  <p className="text-gray-400 text-sm mb-3 text-center max-w-sm leading-relaxed">
                    Mimi is here for you — ready to help with finances, emails, scheduling, and anything you need.
                  </p>

                  <p className="text-gray-500 text-xs mb-5 text-center">
                    Press <span className="text-green-400/70 font-medium">space</span> or tap below to begin.
                  </p>

                  <button
                    onClick={startCall}
                    className="
                      px-10 py-4 rounded-full bg-blue-500 text-white font-semibold text-base
                      shadow-lg shadow-blue-500/20 hover:bg-blue-600 hover:shadow-blue-500/30
                      active:scale-95 transition-all duration-200
                    "
                  >
                    Start Conversation
                  </button>

                  <p className="text-gray-500 text-xs mt-7">
                    say <span className="text-red-400/70 font-medium">"bye bye"</span> to stop conversation
                  </p>
                </div>
              )}

              {/* Active / Connecting state */}
              {hasStarted && (
                <div className="flex flex-col animate-fade-in">
                  <div className="px-6 pt-6 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isCallActive
                              ? 'bg-green-400 animate-pulse'
                              : isConnecting
                              ? 'bg-amber-400 animate-pulse'
                              : 'bg-gray-500 animate-pulse'
                          }`}
                        />
                        <span className="text-xs text-gray-400 font-medium">
                          {isConnecting && 'Connecting…'}
                          {isCallActive && (isMuted ? 'Muted' : 'Listening…')}
                          {isEnding && 'Ending…'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={toggleMute}
                          disabled={!isCallActive}
                          className={`
                            p-2 rounded-lg text-xs transition-all
                            ${isMuted
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.1]'
                            }
                            disabled:opacity-40
                          `}
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="1" y1="1" x2="23" y2="23" />
                              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .87-.16 1.7-.44 2.47" />
                              <line x1="12" y1="19" x2="12" y2="23" />
                              <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                              <line x1="12" y1="19" x2="12" y2="23" />
                              <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={endCall}
                          disabled={!isCallActive}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40"
                          aria-label="End call"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                            <line x1="23" y1="1" x2="1" y2="23" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Waveform */}
                    <div className="flex items-center justify-center gap-[3px] h-16 px-4">
                      {bars.map((bar, i) => (
                        <div
                          key={i}
                          style={{
                            height: `${Math.max(bar.height, 8)}%`,
                            transition: 'height 0.15s ease',
                          }}
                          className={`w-1 rounded-full ${
                            isCallActive && volumeLevel > 0.05
                              ? 'bg-blue-400'
                              : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Transcript area */}
                  <div className="border-t border-white/[0.06]">
                    <div className="px-6 py-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        Conversation
                      </p>
                    </div>
                    <div className="px-6 pb-6 max-h-96 overflow-y-auto flex flex-col gap-3 scroll-smooth">
                      {transcript.length === 0 && (
                        <p className="text-gray-500 text-sm text-center py-8">
                          {isConnecting
                            ? 'Connecting to Mimi…'
                            : 'Conversation will appear here…'}
                        </p>
                      )}
                      {transcript.map((entry, i) => (
                        <div
                          key={i}
                          className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`
                              max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed
                              ${entry.role === 'user'
                                ? 'bg-blue-500 text-white rounded-br-md'
                                : 'bg-white/[0.08] text-gray-200 rounded-bl-md'
                              }
                            `}
                          >
                            {entry.text}
                          </div>
                        </div>
                      ))}
                      <div ref={transcriptEndRef} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Email */}
          <div className="transition-all duration-700 ease-in-out flex-shrink-0 w-full lg:w-72">
            {hasEmailData ? (
              <div className="space-y-3">
                <EmailInbox emails={inboxEmails} loading={emailsLoading} error={emailsError} />
                {!calendarError && calendarEvents.length > 0 && (
                  <CalendarCard events={calendarEvents} />
                )}
                {!demoMode && (
                  <button
                    onClick={disconnectOutlook}
                    disabled={emailConnectLoading}
                    className="w-full px-4 py-2 rounded-xl border border-white/[0.08] text-[11px] font-medium text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
                  >
                    Disconnect Outlook
                  </button>
                )}
              </div>
            ) : (
              <div
                onClick={() => !demoMode && !emailConnectLoading && connectOutlook()}
                className="bg-white/[0.06] backdrop-blur-md rounded-2xl border border-white/[0.08] overflow-hidden animate-fade-in cursor-pointer hover:bg-white/[0.08] transition-colors"
              >
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">Email & Calendar</p>
                      <p className="text-gray-500 text-[10px]">{emailConnectLoading ? 'Connecting…' : 'Not connected'}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Connect your Outlook inbox so Mimi can help you read your emails and see your calendar.
                  </p>
                </div>
                <div className="px-6 py-3 flex justify-center">
                  <img src="/keyboardR.png" alt="Right-hand keys" className="w-full h-auto rounded-lg opacity-40" />
                </div>
                <div className="px-5 pb-5 text-center">
                  <p className="text-[11px] text-gray-500">
                    Press any <span className="text-blue-400 font-medium">key on the red zone</span> to set up
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs">
            <span className="text-gray-400 font-medium">Tip:</span>{' '}
            {tipsTips[tipIndex]}
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 border-t border-white/[0.06] bg-white/[0.03] backdrop-blur-sm">
        <p className="text-gray-400 text-xs">
          Protected under HIPAA privacy regulations
        </p>
      </footer>
    </div>
  )
}
