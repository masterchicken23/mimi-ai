import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaidLink } from 'react-plaid-link'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080'

const CATEGORY_LABELS = {
  conversations: 'Conversation History',
  search: 'Internet Search',
  banking: 'Bank Transactions',
  calendar: 'Calendar',
  email: 'Email',
  other: 'Other',
}

const CATEGORY_COLORS = {
  conversations: 'bg-purple-100 text-purple-700',
  search: 'bg-sky-100 text-sky-700',
  banking: 'bg-emerald-100 text-emerald-700',
  calendar: 'bg-amber-100 text-amber-700',
  email: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-500',
}

function guessCategory(filename, data) {
  const lower = filename.toLowerCase()
  if (lower.includes('conversation') || lower.includes('chat') || lower.includes('message'))
    return 'conversations'
  if (lower.includes('search') || lower.includes('browse') || lower.includes('history'))
    return 'search'
  if (lower.includes('bank') || lower.includes('transaction') || lower.includes('finance'))
    return 'banking'
  if (lower.includes('calendar') || lower.includes('event') || lower.includes('schedule'))
    return 'calendar'

  const json = typeof data === 'string' ? data : JSON.stringify(data)
  if (/transaction|balance|debit|credit|amount/i.test(json)) return 'banking'
  if (/event|calendar|start_time|end_time|attendee/i.test(json)) return 'calendar'
  if (/query|search|url|visited/i.test(json)) return 'search'
  if (/message|chat|role|content|assistant|user/i.test(json)) return 'conversations'

  return 'other'
}

function PlaidLinkButton({ onSuccess, onConnecting }) {
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchLinkToken = async () => {
    setLoading(true)
    onConnecting?.(true)
    try {
      const res = await fetch(`${API_BASE}/api/plaid/create-link-token`, { method: 'POST' })
      const data = await res.json()
      setLinkToken(data.link_token)
    } catch (err) {
      console.error('Failed to get link token:', err)
      onConnecting?.(false)
    }
    setLoading(false)
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken) => {
      onConnecting?.(true)
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
        onSuccess(bankData)
      } catch (err) {
        console.error('Failed to fetch bank data:', err)
      }
      onConnecting?.(false)
    },
    onExit: () => onConnecting?.(false),
  })

  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  return (
    <button
      onClick={fetchLinkToken}
      disabled={loading}
      className="
        w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4
        bg-emerald-50 border border-emerald-200
        hover:bg-emerald-100 transition-all cursor-pointer
        disabled:opacity-50 disabled:cursor-wait
      "
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
      <span className="text-sm font-medium text-emerald-700">
        {loading ? 'Connecting…' : 'Connect with Plaid'}
      </span>
    </button>
  )
}

function OutlookConnectButton({ onSuccess, onConnecting }) {
  const [loading, setLoading] = useState(false)

  const fetchRecentEmails = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/email/messages?top=10`, {
        credentials: 'include',
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.messages || []).map((m) => ({
        subject: m.subject,
        from: m.from?.emailAddress?.address || '',
        fromName: m.from?.emailAddress?.name || '',
        preview: m.bodyPreview,
        receivedAt: m.receivedAt,
        isRead: m.isRead,
      }))
    } catch (err) {
      console.error('Failed to fetch recent emails:', err)
      return []
    }
  }

  const checkOutlookStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/outlook/status`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.authenticated) {
        const recentEmails = await fetchRecentEmails()
        onSuccess({
          displayName: data.displayName,
          email: data.email,
          userId: data.userId,
          recentEmails,
        })
        return true
      }
    } catch (err) {
      console.error('Failed to check Outlook status:', err)
    }
    return false
  }

  const handleConnect = async () => {
    setLoading(true)
    onConnecting?.(true)

    const width = 500
    const height = 700
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
        const connected = await checkOutlookStatus()
        if (!connected) {
          console.log('Outlook login popup closed without completing auth')
        }
        setLoading(false)
        onConnecting?.(false)
      }
    }, 500)
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="
        w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4
        bg-blue-50 border border-blue-200
        hover:bg-blue-100 transition-all cursor-pointer
        disabled:opacity-50 disabled:cursor-wait
      "
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      <span className="text-sm font-medium text-blue-700">
        {loading ? 'Connecting…' : 'Connect Outlook'}
      </span>
    </button>
  )
}

export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [bankData, setBankData] = useState(null)
  const [bankConnecting, setBankConnecting] = useState(false)
  const [outlookData, setOutlookData] = useState(null)
  const [outlookConnecting, setOutlookConnecting] = useState(false)

  const processFiles = useCallback(async (fileList) => {
    setParseError(null)
    const newFiles = []

    for (const file of fileList) {
      if (!file.name.endsWith('.json')) {
        setParseError(`"${file.name}" is not a JSON file`)
        continue
      }
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const category = guessCategory(file.name, parsed)
        newFiles.push({ name: file.name, data: parsed, category })
      } catch {
        setParseError(`Failed to parse "${file.name}" — not valid JSON`)
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles])
    }
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    processFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileChange = (e) => {
    processFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setParseError(null)
  }

  const handleBankSuccess = (data) => {
    setBankData(data)
  }

  const handleOutlookSuccess = (data) => {
    setOutlookData(data)
  }

  const handleOutlookDisconnect = async () => {
    try {
      await fetch(`${API_BASE}/auth/outlook/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (err) {
      console.error('Failed to logout Outlook session:', err)
    }
    setOutlookData(null)
  }

  const handleNext = () => {
    const userData = {}
    for (const f of files) {
      if (!userData[f.category]) userData[f.category] = []
      userData[f.category].push({ filename: f.name, data: f.data })
    }

    if (bankData) {
      if (!userData.banking) userData.banking = []
      userData.banking.push({
        filename: 'plaid-bank-connection',
        data: bankData,
      })
    }

    if (outlookData) {
      if (!userData.email) userData.email = []
      userData.email.push({
        filename: 'outlook-recent-emails',
        data: {
          account: { displayName: outlookData.displayName, email: outlookData.email },
          recentEmails: outlookData.recentEmails || [],
        },
      })
    }

    navigate('/dashboard', { state: { userData, outlookUserId: outlookData?.userId || null } })
  }

  const totalSources = files.length + (bankData ? 1 : 0) + (outlookData ? 1 : 0)
  const stepsCompleted = (files.length > 0 ? 1 : 0) + (bankData ? 1 : 0) + (outlookData ? 1 : 0)

  return (
    <div className="min-h-screen dashboard-bg flex flex-col items-center justify-center p-6 relative overflow-hidden">

      <div className="w-full max-w-5xl relative z-10">
        {/* Welcome header */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 border border-white/60 mb-5">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-gray-500">Step 1 of 2 — Set up your data</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3 tracking-tight">
            Let's get Mimi up to speed
          </h1>
          <p className="text-gray-500 text-base max-w-xl mx-auto leading-relaxed">
            Connect your accounts or upload data files so Mimi can give you
            personalized, context-aware assistance.
          </p>
        </div>

        {/* Three-column cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 animate-fade-in">

          {/* Card 1 — Upload Files */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 overflow-hidden flex flex-col">
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <polyline points="9 15 12 12 15 15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-gray-800 font-semibold text-sm">Upload Data Files</h3>
                  <p className="text-gray-400 text-[11px]">JSON format</p>
                </div>
              </div>

              <p className="text-gray-500 text-xs leading-relaxed mb-5">
                Drop exported data from other apps — conversations, search history, calendar events, or any structured JSON. Mimi auto-detects the type.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  flex-1 min-h-[120px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                  cursor-pointer transition-all duration-200
                  ${isDragging
                    ? 'border-amber-400 bg-amber-50/50'
                    : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                {files.length === 0 ? (
                  <div className="text-center px-4 py-6">
                    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" className="mx-auto mb-2 opacity-60">
                      <rect x="12" y="8" width="24" height="32" rx="3" fill="rgba(0,0,0,0.04)" />
                      <path d="M20 22h8M20 27h8M20 32h5" stroke="rgba(0,0,0,0.12)" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="36" cy="36" r="8" fill="#F59E0B" />
                      <path d="M36 32v8M32 36h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <p className="text-gray-400 text-xs">
                      Drop files or{' '}
                      <span className="text-amber-600 font-medium underline underline-offset-2">browse</span>
                    </p>
                  </div>
                ) : (
                  <div className="px-3 py-4 w-full">
                    <div className="flex flex-wrap gap-1.5 justify-center mb-2">
                      {files.map((f, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full ${CATEGORY_COLORS[f.category]}`}
                        >
                          {f.name.length > 18 ? f.name.slice(0, 15) + '...' : f.name}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                            className="opacity-50 hover:opacity-100"
                            aria-label={`Remove ${f.name}`}
                          >
                            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="8" y1="2" x2="2" y2="8" />
                              <line x1="2" y1="2" x2="8" y2="8" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="text-gray-400 text-[10px] text-center">
                      <span className="text-amber-600 underline underline-offset-2 cursor-pointer">Add more</span>
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {parseError && (
                <p className="text-red-400 text-[10px] mt-2">{parseError}</p>
              )}
            </div>

            {/* Card footer */}
            <div className="px-6 py-3 border-t border-gray-200/60 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">
                {files.length} file{files.length !== 1 ? 's' : ''} loaded
              </span>
              {files.length > 0 && (
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg width="10" height="10" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 5.5 3.5 8 9 2" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Card 2 — Bank Account */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 overflow-hidden flex flex-col">
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-gray-800 font-semibold text-sm">Bank Account</h3>
                  <p className="text-gray-400 text-[11px]">Via Plaid (secure)</p>
                </div>
              </div>

              <p className="text-gray-500 text-xs leading-relaxed mb-5">
                Securely link your checking or savings account. Mimi will see your balance and recent transactions to help with budgeting and spending insights.
              </p>

              <div className="flex-1 flex flex-col justify-end">
                {bankData ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 8 5.5 12.5 15 3" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-700">Connected</p>
                        <p className="text-[11px] text-emerald-600/70">
                          {bankData.accounts?.length || 0} account{(bankData.accounts?.length || 0) !== 1 ? 's' : ''} · {bankData.transactions?.length || 0} txns
                        </p>
                      </div>
                      <button
                        onClick={() => setBankData(null)}
                        className="text-emerald-400 hover:text-red-400 transition-colors"
                        aria-label="Disconnect"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="11" y1="3" x2="3" y2="11" />
                          <line x1="3" y1="3" x2="11" y2="11" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <PlaidLinkButton
                    onSuccess={handleBankSuccess}
                    onConnecting={setBankConnecting}
                  />
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-200/60 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">
                {bankData ? 'Account linked' : 'Not connected'}
              </span>
              {bankData && (
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg width="10" height="10" fill="none" stroke="#34A853" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 5.5 3.5 8 9 2" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Card 3 — Email */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 overflow-hidden flex flex-col">
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-gray-800 font-semibold text-sm">Email & Calendar</h3>
                  <p className="text-gray-400 text-[11px]">Microsoft Outlook</p>
                </div>
              </div>

              <p className="text-gray-500 text-xs leading-relaxed mb-5">
                Connect Outlook so Mimi can read your recent emails, keep track of important messages and see your calendar.
              </p>

              <div className="flex-1 flex flex-col justify-end">
                {outlookData ? (
                  <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 8 5.5 12.5 15 3" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-700">Connected</p>
                        <p className="text-[11px] text-blue-600/70 truncate">
                          {outlookData.email || outlookData.displayName}
                        </p>
                      </div>
                      <button
                        onClick={handleOutlookDisconnect}
                        className="text-blue-400 hover:text-red-400 transition-colors"
                        aria-label="Disconnect"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="11" y1="3" x2="3" y2="11" />
                          <line x1="3" y1="3" x2="11" y2="11" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <OutlookConnectButton
                    onSuccess={handleOutlookSuccess}
                    onConnecting={setOutlookConnecting}
                  />
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-200/60 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">
                {outlookData ? 'Inbox linked' : 'Not connected'}
              </span>
              {outlookData && (
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg width="10" height="10" fill="none" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 5.5 3.5 8 9 2" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-4">
            {/* Progress dots */}
            <div className="flex items-center gap-2">
              {[files.length > 0, !!bankData, !!outlookData].map((done, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    done ? 'bg-blue-500 scale-110' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {totalSources > 0
                ? `${totalSources} source${totalSources !== 1 ? 's' : ''} connected`
                : 'No data added yet — you can always do this later'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 rounded-xl border border-gray-200/60 text-sm font-medium text-gray-500 bg-white/50 hover:bg-white/70 transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleNext}
              disabled={bankConnecting || outlookConnecting}
              className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-semibold hover:brightness-105 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
