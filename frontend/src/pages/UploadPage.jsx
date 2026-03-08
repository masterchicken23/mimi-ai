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
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-10 pt-10 pb-3">
          <h1 className="text-3xl font-semibold text-gray-900">Upload your data</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Skip to dashboard"
          >
            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="20" y1="8" x2="8" y2="20" />
              <line x1="8" y1="8" x2="20" y2="20" />
            </svg>
          </button>
        </div>

        <p className="px-10 text-lg text-gray-600 pb-5">
          Add your JSON files — conversation history, search data, bank transactions, calendar, and more.
        </p>

        <div className="px-10 pb-3">
          {/* Primary action: large file picker button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="
              w-full flex items-center justify-center gap-3
              px-8 py-5 rounded-2xl
              bg-blue-500 text-white text-xl font-semibold
              hover:bg-blue-600 active:scale-[0.98]
              shadow-md shadow-blue-200 hover:shadow-blue-300
              transition-all duration-200
              focus:outline-none focus:ring-4 focus:ring-blue-300
              min-h-[68px]
            "
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Select JSON files
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Optional drag-and-drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed
              py-16 transition-all duration-200
              ${isDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-gray-50'
              }
            `}
            role="region"
            aria-label="Optional drag and drop area"
          >
            <svg className={`mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-300'}`} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className={`text-lg ${isDragging ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
              {isDragging ? 'Drop files here' : 'Or drag and drop files here'}
            </p>
          </div>

          {/* Error message */}
          {parseError && (
            <div className="mt-5 flex items-start gap-3 p-5 rounded-2xl bg-red-50 border border-red-200" role="alert">
              <svg className="flex-shrink-0 mt-0.5 text-red-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-base text-red-700">{parseError}</p>
            </div>
          )}

          {/* Status line */}
          <div className="flex justify-between text-base text-gray-600 mt-5 px-1">
            <span>Supported format: JSON</span>
            <span className="font-medium">
              {files.length} file{files.length !== 1 ? 's' : ''} loaded
            </span>
          </div>
        </div>

        {/* File list — vertical with large remove buttons */}
        {files.length > 0 && (
          <div className="px-10 pt-3 pb-5">
            <ul className="flex flex-col gap-4" aria-label="Loaded files">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100"
                >
                  <span className={`flex-shrink-0 text-base font-medium px-4 py-1.5 rounded-full ${CATEGORY_COLORS[f.category]}`}>
                    {CATEGORY_LABELS[f.category]}
                  </span>
                  <span className="flex-1 text-base text-gray-800 truncate">{f.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="
                      flex-shrink-0 min-w-[56px] min-h-[52px]
                      flex items-center justify-center gap-2
                      rounded-xl text-base font-medium
                      text-red-600 bg-red-50 hover:bg-red-100
                      px-4 transition-colors
                      focus:outline-none focus:ring-2 focus:ring-red-300
                    "
                    aria-label={`Remove ${f.name}`}
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="14" y1="6" x2="6" y2="14" />
                      <line x1="6" y1="6" x2="14" y2="14" />
                    </svg>
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {/* Category summary */}
            <div className="flex flex-wrap gap-3 mt-5">
              {Object.entries(
                files.reduce((acc, f) => {
                  acc[f.category] = (acc[f.category] || 0) + 1
                  return acc
                }, {})
              ).map(([cat, count]) => (
                <span
                  key={cat}
                  className={`text-base px-4 py-1.5 rounded-full ${CATEGORY_COLORS[cat]}`}
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Example section */}
        <div className="px-10 py-3">
          <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-5 py-4 border border-gray-100">
            <svg className="flex-shrink-0 text-blue-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <p className="flex-1 text-base text-gray-600">
              Need examples? Download sample JSON files.
            </p>
            <button className="flex-shrink-0 min-h-[48px] px-6 py-2.5 rounded-xl border border-gray-200 text-base font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300">
              Download
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-10 py-7 border-t border-gray-100">
          <button className="min-h-[52px] text-lg text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300 rounded-xl px-4">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="11" />
              <text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="14" stroke="none">?</text>
            </svg>
            Help Center
          </button>
          <div className="flex gap-5">
            <button
              onClick={() => navigate('/dashboard')}
              className="min-h-[56px] px-9 py-3.5 rounded-2xl border border-gray-200 text-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              disabled={files.length === 0}
              className="min-h-[56px] px-9 py-3.5 rounded-2xl bg-blue-500 text-white text-lg font-medium hover:bg-blue-600 transition-colors shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
