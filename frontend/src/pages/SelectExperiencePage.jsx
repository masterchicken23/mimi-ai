import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import demoFinancialRaw from '../demo/maya_financial.json'
import demoEmailRaw from '../demo/maya_email.json'

function buildDemoUserData() {
  const accounts = demoFinancialRaw.override_accounts.map((acc) => {
    const txnSum = acc.transactions.reduce((s, t) => s + t.amount, 0)
    return {
      name: acc.subtype === 'checking' ? 'Checking Account' : 'Savings Account',
      type: acc.type,
      subtype: acc.subtype,
      balances: { current: acc.starting_balance - txnSum },
      mask: null,
    }
  })

  const transactions = demoFinancialRaw.override_accounts.flatMap((acc) =>
    acc.transactions.map((t) => ({
      date: t.date_transacted,
      name: t.description,
      amount: t.amount,
      category: null,
      merchant: null,
    })),
  )

  return {
    banking: [{ filename: 'maya-demo-banking', data: { accounts, transactions } }],
    email: [{ filename: 'maya-demo-email', data: demoEmailRaw }],
  }
}

const DEMO_BULLETS = [
  {
    label: 'Who she is',
    text: "Maya Patel is a 26-year-old Internal Medicine resident living in Austin, balancing long hospital shifts, student debt, and the demands of early medical career training.",
  },
  {
    label: 'Banking situation',
    text: "Maya keeps roughly $40k in assets across checking and savings, using her accounts to manage rent, groceries, and monthly transfers to savings while living on a resident's salary.",
  },
  {
    label: 'Health challenge',
    text: "Maya has early-stage Parkinson's, and the tremors have recently started making simple phone gestures like swiping difficult.",
  },
  {
    label: 'Digital frustration',
    text: 'Internet banking has become stressful for her because she struggles to swipe on mobile apps and cannot control the mouse precisely, making routine tasks like checking transactions frustrating.',
  },
  {
    label: 'Emotional impact',
    text: 'She feels quietly embarrassed about these difficulties, which sometimes prevents her from asking for help even though it is affecting her daily digital tasks.',
  },
]

const SANDBOX_BULLETS = [
  'Connect your bank account using Plaid Sandbox.',
  'Credentials:',
  'Bank: choose any',
  'Username: user_good',
  'Password: pass_good',
  'Connect any Outlook email.',
  'Upload any other JSON you want.',
]

export default function SelectExperiencePage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)

  const handleContinue = () => {
    if (!selected) return
    if (selected === 'demo') {
      navigate('/dashboard', {
        state: { userData: buildDemoUserData(), demoMode: true, userName: 'Maya' },
      })
    } else {
      navigate('/upload', { state: { experience: 'sandbox' } })
    }
  }

  return (
    <div className="min-h-screen dashboard-bg flex flex-col">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-center px-8 py-5 bg-white/[0.04] backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/15 flex items-center justify-center text-lg shadow-sm">
            🐿️
          </div>
          <span className="text-white font-semibold text-lg">Mimi</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-10">
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
          Select your experience
        </h1>
        <p className="text-gray-400 text-sm mb-10">
          Choose how you'd like to explore Mimi.
        </p>

        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl items-stretch">
          {/* LEFT — Demo card */}
          <div
            onClick={() => setSelected('demo')}
            className={`
              flex-1 rounded-2xl border-2 cursor-pointer transition-all duration-200
              bg-white/[0.04] backdrop-blur-md overflow-hidden
              hover:bg-white/[0.06]
              ${selected === 'demo'
                ? 'border-violet-500 shadow-lg shadow-violet-500/10'
                : 'border-white/[0.08]'
              }
            `}
          >
            <div className="px-7 pt-7 pb-2">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-violet-400">Demo</span>
                  <h2 className="text-xl font-bold text-white leading-tight">Maya Patel</h2>
                </div>
              </div>
            </div>

            <div className="px-7 pb-3">
              <div className="flex flex-col gap-3.5">
                {DEMO_BULLETS.map((b, i) => (
                  <div key={i}>
                    <p className="text-gray-200 text-[13px] leading-relaxed">
                      <span className="text-violet-400 font-semibold">{b.label}:</span>{' '}
                      {b.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-7 border-t border-white/[0.06]" />

            <div className="px-7 py-4">
              <p className="text-gray-500 text-xs leading-relaxed italic">
                Maya is a fictional person with Parkinson's. Limit the use of your hands and try using your voice to control the website.
              </p>
            </div>

            {selected === 'demo' && (
              <div className="px-7 pb-5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-violet-300 text-sm font-medium">Selected</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Sandbox card */}
          <div
            onClick={() => setSelected('sandbox')}
            className={`
              flex-1 rounded-2xl border-2 cursor-pointer transition-all duration-200
              bg-white/[0.04] backdrop-blur-md overflow-hidden
              hover:bg-white/[0.06]
              ${selected === 'sandbox'
                ? 'border-emerald-500 shadow-lg shadow-emerald-500/10'
                : 'border-white/[0.08]'
              }
            `}
          >
            <div className="px-7 pt-7 pb-2">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 3h-8l-2 4h12z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-400">Real Sandbox</span>
                  <h2 className="text-xl font-bold text-white leading-tight">Mimi will understand who you are</h2>
                </div>
              </div>
            </div>

            <div className="px-7 pb-5">
              <div className="flex flex-col gap-3">
                <p className="text-gray-200 text-[13px] leading-relaxed">
                  Connect your bank account using <span className="text-emerald-400 font-medium">Plaid Sandbox</span>.
                </p>

                <div className="bg-white/[0.04] rounded-xl px-4 py-3 border border-white/[0.06]">
                  <p className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold mb-2">Credentials</p>
                  <div className="flex flex-col gap-1">
                    <p className="text-gray-300 text-[13px]">
                      Bank: <span className="text-gray-400">choose any</span>
                    </p>
                    <p className="text-gray-300 text-[13px]">
                      Username: <span className="text-emerald-300 font-mono font-medium">user_good</span>
                    </p>
                    <p className="text-gray-300 text-[13px]">
                      Password: <span className="text-emerald-300 font-mono font-medium">pass_good</span>
                    </p>
                  </div>
                </div>

                <p className="text-gray-200 text-[13px] leading-relaxed">
                  Connect any <span className="text-emerald-400 font-medium">Outlook email</span>.
                </p>

                <p className="text-gray-200 text-[13px] leading-relaxed">
                  Upload any other JSON you want.
                </p>
              </div>
            </div>

            {selected === 'sandbox' && (
              <div className="px-7 pb-5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-emerald-300 text-sm font-medium">Selected</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!selected}
          className={`
            mt-10 px-12 py-3.5 rounded-full font-semibold text-sm transition-all duration-200
            ${selected
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-95 cursor-pointer'
              : 'bg-white/[0.06] text-gray-500 cursor-not-allowed'
            }
          `}
        >
          Continue
        </button>
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
