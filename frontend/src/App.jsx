import { useEffect, useRef, useState } from 'react'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY
const ASSISTANT_ID = '998c3e7f-ed8c-4afb-a49c-40cf6649911c'

const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
}

export default function App() {
  const vapiRef = useRef(null)
  const [status, setStatus] = useState(STATUS.IDLE)
  const [isMuted, setIsMuted] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [transcript, setTranscript] = useState([])

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

  const startCall = async () => {
    setStatus(STATUS.CONNECTING)
    setTranscript([])
    await vapiRef.current.start(ASSISTANT_ID)
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
  const isConnecting = status === STATUS.CONNECTING || status === STATUS.ENDING

  const barCount = 12
  const bars = Array.from({ length: barCount }, (_, i) => {
    const threshold = (i + 1) / barCount
    return volumeLevel >= threshold
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-800 rounded-3xl shadow-2xl overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 text-4xl">
            🐿️
          </div>
          <h1 className="text-white text-2xl font-bold">Mimi</h1>
          <p className="text-teal-100 text-sm mt-1">Ur personal assistant</p>
        </div>

        {/* Status indicator */}
        <div className="px-6 pt-6 flex items-center justify-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isCallActive
                ? 'bg-green-400 animate-pulse'
                : isConnecting
                ? 'bg-yellow-400 animate-pulse'
                : 'bg-slate-500'
            }`}
          />
          <span className="text-slate-300 text-sm">
            {status === STATUS.IDLE && 'Ready to connect'}
            {status === STATUS.CONNECTING && 'Connecting…'}
            {status === STATUS.ACTIVE && 'Call in progress'}
            {status === STATUS.ENDING && 'Ending call…'}
          </span>
        </div>

        {/* Volume visualizer */}
        <div className="px-6 py-4 flex items-end justify-center gap-1 h-16">
          {bars.map((active, i) => (
            <div
              key={i}
              style={{ height: `${((i % 4) + 1) * 10 + 8}px` }}
              className={`w-2 rounded-full transition-colors duration-75 ${
                active ? 'bg-teal-400' : 'bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="px-6 pb-6 flex flex-col gap-3">
          {!isCallActive && !isConnecting ? (
            <button
              onClick={startCall}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-lg shadow-lg hover:from-teal-400 hover:to-cyan-400 active:scale-95 transition-all"
            >
              Start Call
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={toggleMute}
                disabled={!isCallActive}
                className={`flex-1 py-4 rounded-2xl font-semibold text-base transition-all active:scale-95 ${
                  isMuted
                    ? 'bg-yellow-500 text-white'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                } disabled:opacity-50`}
              >
                {isMuted ? '🔇 Unmute' : '🎙️ Mute'}
              </button>
              <button
                onClick={endCall}
                disabled={!isCallActive}
                className="flex-1 py-4 rounded-2xl bg-red-600 text-white font-semibold text-base hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50"
              >
                End Call
              </button>
            </div>
          )}
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="border-t border-slate-700 mx-4 mb-4" />
        )}
        {transcript.length > 0 && (
          <div className="px-4 pb-4 max-h-64 overflow-y-auto flex flex-col gap-2">
            {transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                    entry.role === 'user'
                      ? 'bg-teal-600 text-white rounded-br-sm'
                      : 'bg-slate-700 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-slate-500 text-xs mt-4">
        Protected under HIPAA privacy regulations
      </p>
    </div>
  )
}
