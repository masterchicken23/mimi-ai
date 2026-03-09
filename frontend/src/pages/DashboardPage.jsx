import { useEffect, useRef, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import Vapi from '@vapi-ai/web'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

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
        bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100/80 overflow-hidden
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
            <span className="text-[11px] text-gray-300 font-mono">••{data.mask}</span>
          )}
        </div>

        <p className="text-3xl font-bold text-gray-900 tracking-tight mt-1">
          {fmt(data.balance)}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">Available balance</p>
      </div>

      <div className="mx-5 border-t border-gray-100" />

      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            This month
          </p>
          <span className="text-xs font-semibold text-red-500">{fmt(data.monthlySpent)}</span>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
          <div
            className="bg-gradient-to-r from-blue-400 to-blue-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((data.monthlySpent / (data.balance || 1)) * 100, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-300 text-right">
          {((data.monthlySpent / (data.balance || 1)) * 100).toFixed(1)}% of balance
        </p>
      </div>

      <div className="mx-5 border-t border-gray-100" />

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
                        ? 'bg-emerald-50 text-emerald-500'
                        : 'bg-gray-50 text-gray-400'
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
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {txn.merchant || txn.name}
                    </p>
                    <p className="text-[10px] text-gray-300">{txn.date}</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold flex-shrink-0 ml-3 ${
                    isIncome ? 'text-emerald-500' : 'text-gray-700'
                  }`}
                >
                  {isIncome ? '+' : '-'}{fmt(txn.amount)}
                </span>
              </div>
            )
          })}
          {data.last5.length === 0 && (
            <p className="text-xs text-gray-300 text-center py-2">No transactions yet</p>
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
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100/80 overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Spending by Category
        </p>
        <p className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{fmt(total)}</p>
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
              contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}
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
                <span className="text-xs text-gray-600 truncate">{d.name}</span>
              </div>
              <span className="text-xs font-semibold text-gray-800 flex-shrink-0 ml-3">{fmt(d.value)}</span>
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
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100/80 overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Monthly Spending
        </p>
        <p className="text-[11px] text-gray-400 mt-1">Last {data.length} months</p>
      </div>

      <div className="px-2 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#D1D5DB' }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}k`}
              domain={[0, Math.ceil(max * 1.15)]}
            />
            <Tooltip
              formatter={(v) => fmt(v)}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={36}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === data.length - 1 ? '#3B82F6' : '#E5E7EB'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-col gap-1.5">
          {data.map((d, i) => (
            <div key={d.month} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{d.month}</span>
              <span
                className={`text-xs font-semibold ${i === data.length - 1 ? 'text-blue-600' : 'text-gray-600'}`}
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

const PLACEHOLDER_EMAILS = [
  { id: 1, sender: 'Dr. Sarah Chen', subject: 'Your appointment is confirmed for March 12', time: '10:32 AM', unread: true },
  { id: 2, sender: 'Chase Bank', subject: 'Your monthly statement is ready', time: '9:15 AM', unread: true },
  { id: 3, sender: 'Alex (Partner)', subject: 'Groceries list for tonight', time: 'Yesterday', unread: false },
  { id: 4, sender: 'Whole Foods Market', subject: 'Your receipt from March 7', time: 'Yesterday', unread: false },
  { id: 5, sender: 'CVS Pharmacy', subject: 'Prescription ready for pickup', time: 'Mar 6', unread: false },
  { id: 6, sender: 'Spotify', subject: 'Your weekly Discover playlist', time: 'Mar 5', unread: false },
  { id: 7, sender: 'Google Calendar', subject: 'Reminder: Physical therapy tomorrow', time: 'Mar 5', unread: false },
]

function EmailInbox() {
  const unreadCount = PLACEHOLDER_EMAILS.filter((e) => e.unread).length

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100/80 overflow-hidden w-full animate-fade-in">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
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

      <div className="flex flex-col">
        {PLACEHOLDER_EMAILS.map((email) => (
          <div
            key={email.id}
            className={`
              px-5 py-3 border-t border-gray-50 cursor-pointer
              hover:bg-violet-50/40 transition-colors
              ${email.unread ? 'bg-violet-50/20' : ''}
            `}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {email.unread && (
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                  )}
                  <p className={`text-xs truncate ${email.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
                    {email.sender}
                  </p>
                </div>
                <p className={`text-[11px] truncate mt-0.5 ${email.unread ? 'text-gray-700' : 'text-gray-400'}`}>
                  {email.subject}
                </p>
              </div>
              <span className="text-[10px] text-gray-300 flex-shrink-0 mt-0.5">{email.time}</span>
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
    const content = items
      .map((item) => JSON.stringify(item.data, null, 0))
      .join('\n')
    sections.push(`--- ${heading} ---\n${content}`)
  }

  return sections.join('\n\n')
}

export default function DashboardPage() {
  const { state } = useLocation()
  const userData = state?.userData || {}
  const userContext = useRef(buildContextString(userData))

  const vapiRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const [status, setStatus] = useState(STATUS.IDLE)
  const [isMuted, setIsMuted] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [transcript, setTranscript] = useState([])
  const [userName] = useState('User')

  const [panelView, setPanelView] = useState(PANEL_VIEWS.SUMMARY)

  const bankSummary = parseBankSummary(userData)
  const allTransactions = useMemo(() => {
    const entries = userData?.banking || []
    let txns = []
    for (const entry of entries) {
      if (entry.data?.transactions) txns = txns.concat(entry.data.transactions)
    }
    return txns
  }, [userData])
  const fileCount = Object.values(userData).reduce((sum, arr) => sum + arr.length, 0)

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
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setTranscript((prev) => [
          ...prev,
          { role: msg.role, text: msg.transcript },
        ])

        if (msg.role === 'user') {
          const spoken = msg.transcript.toLowerCase().trim()
          if (spoken.includes('end call') || spoken.includes('end this call')) {
            setStatus(STATUS.ENDING)
            vapi.stop()
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

    return () => {
      vapi.stop()
    }
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const startCall = async () => {
    setStatus(STATUS.CONNECTING)
    setTranscript([])

    const overrides = {
      variableValues: {
        userName,
        timeOfDay: getTimeOfDay(),
        userContext: userContext.current || '',
      },
    }

    await vapiRef.current.start(ASSISTANT_ID, overrides)
  }

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
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 bg-white/70 backdrop-blur-md border-b border-white/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-lg shadow-sm">
            🐿️
          </div>
          <span className="text-gray-900 font-semibold text-lg">Mimi</span>
        </div>
        <div className="flex items-center gap-4">
          {fileCount > 0 && (
            <span className="text-xs bg-blue-500/10 text-blue-600 px-3 py-1 rounded-full font-medium">
              {fileCount} file{fileCount !== 1 ? 's' : ''} loaded
            </span>
          )}
          <p className="text-gray-500 text-sm">
            Mimi — Personal Assistant to <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent font-medium">{userName}</span>
          </p>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-10">
        <div
          className={`
            flex gap-5 items-start justify-center transition-all duration-700 ease-in-out
            w-full
            ${bankSummary ? 'max-w-7xl' : hasStarted ? 'max-w-2xl' : 'max-w-md'}
            ${bankSummary ? 'flex-col lg:flex-row' : 'flex-col'}
          `}
        >
          {bankSummary && (
            <div
              className={`
                transition-all duration-700 ease-in-out flex-shrink-0
                w-full lg:w-72
              `}
            >
              <p className="text-gray-300 text-xs text-center mb-2">
              Toggle with your voice! Ask Mimi how to do it.
              </p>
              <div className="flex bg-white/80 backdrop-blur-sm rounded-xl border border-gray-100/80 p-0.5 mb-3 shadow-sm">
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
                        : 'text-gray-400 hover:text-gray-600'
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
            </div>
          )}

          <div
            className={`
              w-full transition-all duration-700 ease-in-out
              ${!bankSummary && hasStarted ? 'max-w-2xl' : !bankSummary ? 'max-w-md' : ''}
              ${bankSummary ? 'flex-1 min-w-0' : ''}
            `}
          >
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100/80 overflow-hidden">
            {/* Idle / Start state */}
            {!hasStarted && (
              <div className="flex flex-col items-center py-16 px-8 animate-fade-in">
                <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Ready when you are
                </h2>

                <p className="text-gray-400 text-sm mb-8 text-center max-w-xs">
                  Mimi is here to help. Press the button below to start.
                </p>

                <button
                  onClick={startCall}
                  className="
                    px-10 py-4 rounded-full bg-blue-500 text-white font-semibold text-base
                    shadow-lg shadow-blue-200 hover:bg-blue-600 hover:shadow-blue-300
                    active:scale-95 transition-all duration-200
                  "
                >
                  Start
                </button>

                <p className="text-gray-300 text-xs mt-4">
                  say <span className="italic">"end call"</span> to stop your conversation
                </p>
              </div>
            )}

            {/* Active / Connecting state */}
            {hasStarted && (
              <div className="flex flex-col animate-fade-in">
                {/* Voice visualizer bar */}
                <div className="px-6 pt-6 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isCallActive
                            ? 'bg-green-400 animate-pulse'
                            : isConnecting
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-gray-300 animate-pulse'
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
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
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
                        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all disabled:opacity-40"
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
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Transcript area */}
                <div className="border-t border-gray-100">
                  <div className="px-6 py-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Conversation
                    </p>
                  </div>
                  <div className="px-6 pb-6 max-h-96 overflow-y-auto flex flex-col gap-3 scroll-smooth">
                    {transcript.length === 0 && (
                      <p className="text-gray-300 text-sm text-center py-8">
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
                              : 'bg-gray-100 text-gray-800 rounded-bl-md'
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

          {bankSummary && (
            <div
              className={`
                transition-all duration-700 ease-in-out flex-shrink-0
                w-full lg:w-72
              `}
            >
              <EmailInbox />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 border-t border-white/40 bg-white/50 backdrop-blur-sm">
        <p className="text-gray-400 text-xs">
          Protected under HIPAA privacy regulations
        </p>
      </footer>
    </div>
  )
}
