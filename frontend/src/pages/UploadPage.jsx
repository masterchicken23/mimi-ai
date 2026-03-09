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
  other: 'bg-gray-100 text-gray-600',
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
        w-full flex items-center gap-4 bg-emerald-50 rounded-xl p-4 border border-emerald-100
        hover:bg-emerald-100 transition-all cursor-pointer text-left
        disabled:opacity-60 disabled:cursor-wait
      "
    >
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-emerald-900">
          {loading ? 'Connecting…' : 'Connect Bank Account'}
        </p>
        <p className="text-xs text-emerald-600 mt-0.5">
          Securely link your bank to import balance and transactions via Plaid
        </p>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
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

    const alreadyConnected = await checkOutlookStatus()
    if (alreadyConnected) {
      setLoading(false)
      onConnecting?.(false)
      return
    }

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
        w-full flex items-center gap-4 bg-blue-50 rounded-xl p-4 border border-blue-100
        hover:bg-blue-100 transition-all cursor-pointer text-left
        disabled:opacity-60 disabled:cursor-wait
      "
    >
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-900">
          {loading ? 'Connecting…' : 'Connect Email (Outlook)'}
        </p>
        <p className="text-xs text-blue-600 mt-0.5">
          Link your Outlook account to let Mimi read and send emails on your behalf
        </p>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-2">
          <h1 className="text-2xl font-semibold text-gray-900">Upload your data</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Skip"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="px-8 text-sm text-gray-400 pb-4">
          Import your data so Mimi can give you personalized advice — drop JSON files, connect your bank account, or link your email.
        </p>

        {/* Drop zone */}
        <div className="px-8 pb-2">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed
              cursor-pointer transition-all duration-200
              ${files.length > 0 ? 'py-6' : 'py-12'}
              ${isDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
              }
            `}
          >
            {files.length === 0 ? (
              <>
                <div className="mb-3">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect x="12" y="8" width="24" height="32" rx="3" fill="#E5E7EB" />
                    <path d="M20 22h8M20 27h8M20 32h5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="36" cy="36" r="8" fill="#3B82F6" />
                    <path d="M36 32v8M32 36h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm">
                  Drag and Drop JSON files here or{' '}
                  <span className="text-gray-900 font-medium underline underline-offset-2">
                    Choose files
                  </span>
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 justify-center px-4 mb-3">
                  {files.map((f, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${CATEGORY_COLORS[f.category]}`}
                    >
                      {f.name}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(i)
                        }}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${f.name}`}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="10" y1="4" x2="4" y2="10" />
                          <line x1="4" y1="4" x2="10" y2="10" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-gray-400 text-xs">
                  Drop more files or{' '}
                  <span className="text-gray-600 underline underline-offset-2">browse</span>
                </p>
              </>
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
            <p className="text-red-500 text-xs mt-2 px-1">{parseError}</p>
          )}

          <div className="flex justify-between text-xs text-gray-400 mt-2 px-1">
            <span>Supported format: JSON</span>
            <span>{files.length} file{files.length !== 1 ? 's' : ''} loaded</span>
          </div>
        </div>

        {/* Bank connection */}
        <div className="px-8 py-4">
          {bankData ? (
            <div className="flex items-center gap-4 bg-emerald-50 rounded-xl p-4 border border-emerald-200">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-900">Bank Connected</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {bankData.accounts?.length || 0} account{(bankData.accounts?.length || 0) !== 1 ? 's' : ''} · {bankData.transactions?.length || 0} transaction{(bankData.transactions?.length || 0) !== 1 ? 's' : ''} imported
                </p>
              </div>
              <button
                onClick={() => setBankData(null)}
                className="text-emerald-400 hover:text-red-500 transition-colors flex-shrink-0"
                aria-label="Remove bank connection"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="14" y1="4" x2="4" y2="14" />
                  <line x1="4" y1="4" x2="14" y2="14" />
                </svg>
              </button>
            </div>
          ) : (
            <PlaidLinkButton
              onSuccess={handleBankSuccess}
              onConnecting={setBankConnecting}
            />
          )}
        </div>

        {/* Email connection */}
        <div className="px-8 py-4">
          {outlookData ? (
            <div className="flex items-center gap-4 bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900">Email Connected</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {outlookData.displayName || outlookData.email} · {outlookData.recentEmails?.length || 0} recent email{(outlookData.recentEmails?.length || 0) !== 1 ? 's' : ''} loaded
                </p>
              </div>
              <button
                onClick={() => setOutlookData(null)}
                className="text-blue-400 hover:text-red-500 transition-colors flex-shrink-0"
                aria-label="Remove email connection"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="14" y1="4" x2="4" y2="14" />
                  <line x1="4" y1="4" x2="14" y2="14" />
                </svg>
              </button>
            </div>
          ) : (
            <OutlookConnectButton
              onSuccess={handleOutlookSuccess}
              onConnecting={setOutlookConnecting}
            />
          )}
        </div>

        {/* Category legend */}
        {(files.length > 0 || bankData || outlookData) && (
          <div className="px-8 py-2">
            <div className="flex flex-wrap gap-2">
              {Object.entries(
                files.reduce((acc, f) => {
                  acc[f.category] = (acc[f.category] || 0) + 1
                  return acc
                }, {
                  ...(bankData ? { banking: 1 } : {}),
                  ...(outlookData ? { email: 1 } : {}),
                })
              ).map(([cat, count]) => (
                <span
                  key={cat}
                  className={`text-xs px-2.5 py-1 rounded-full ${CATEGORY_COLORS[cat]}`}
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Example section */}
        <div className="px-8 py-4">
          <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">Example JSON files</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Download sample files to see the expected format for each data type.
              </p>
            </div>
            <button className="flex-shrink-0 px-5 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
              Download
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-8 py-6 border-t border-gray-100">
          <p className="text-xs text-gray-300">
            {totalSources > 0
              ? `${totalSources} data source${totalSources !== 1 ? 's' : ''} ready`
              : 'No data loaded yet'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              disabled={bankConnecting || outlookConnecting}
              className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
