import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY
const ASSISTANT_ID = '998c3e7f-ed8c-4afb-a49c-40cf6649911c'

const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
}

function buildContextString(userData) {
  if (!userData || Object.keys(userData).length === 0) return ''

  const sections = []
  const labels = {
    conversations: 'CONVERSATION HISTORY',
    search: 'INTERNET SEARCH HISTORY',
    banking: 'BANK TRANSACTIONS',
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

    const overrides = {}
    if (userContext.current) {
      overrides.variableValues = {
        userName,
        userContext: userContext.current,
      }
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-lg">
            🐿️
          </div>
          <span className="text-gray-900 font-semibold text-lg">Mimi</span>
        </div>
        <div className="flex items-center gap-4">
          {fileCount > 0 && (
            <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full">
              {fileCount} file{fileCount !== 1 ? 's' : ''} loaded
            </span>
          )}
          <p className="text-gray-500 text-sm">
            Mimi — Personal Assistant to <span className="text-gray-800 font-medium">{userName}</span>
          </p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div
          className={`
            w-full transition-all duration-700 ease-in-out
            ${hasStarted ? 'max-w-2xl' : 'max-w-md'}
          `}
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                  Mimi is here to help. Press the button below or just say <span className="italic text-gray-500">"Hello Mimi"</span> to start.
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
                  or say <span className="italic">"Hello Mimi"</span> to start
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
      </main>

      {/* Footer */}
      <footer className="text-center py-4 border-t border-gray-100 bg-white">
        <p className="text-gray-300 text-xs">
          Protected under HIPAA privacy regulations
        </p>
      </footer>
    </div>
  )
}
