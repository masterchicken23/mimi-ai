import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const CATEGORY_LABELS = {
  conversations: 'Conversation History',
  search: 'Internet Search',
  banking: 'Bank Transactions',
  calendar: 'Calendar',
  other: 'Other',
}

const CATEGORY_COLORS = {
  conversations: 'bg-purple-100 text-purple-700',
  search: 'bg-sky-100 text-sky-700',
  banking: 'bg-emerald-100 text-emerald-700',
  calendar: 'bg-amber-100 text-amber-700',
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

export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [parseError, setParseError] = useState(null)

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

  const handleNext = () => {
    const userData = {}
    for (const f of files) {
      if (!userData[f.category]) userData[f.category] = []
      userData[f.category].push({ filename: f.name, data: f.data })
    }
    navigate('/dashboard', { state: { userData } })
  }

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

        <p className="px-8 text-sm text-gray-400 pb-2">
          Drop your JSON files — conversation history, search data, bank transactions, calendar, and more.
        </p>

        {/* Drop zone */}
        <div className="px-8 pt-2 pb-2">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed
              cursor-pointer transition-all duration-200
              ${files.length > 0 ? 'py-8' : 'py-14'}
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

          <div className="flex justify-between text-xs text-gray-400 mt-3 px-1">
            <span>Supported format: JSON</span>
            <span>{files.length} file{files.length !== 1 ? 's' : ''} loaded</span>
          </div>
        </div>

        {/* Category legend */}
        {files.length > 0 && (
          <div className="px-8 py-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(
                files.reduce((acc, f) => {
                  acc[f.category] = (acc[f.category] || 0) + 1
                  return acc
                }, {})
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
          <button className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="7" />
              <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="10" stroke="none">?</text>
            </svg>
            Help Center
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
