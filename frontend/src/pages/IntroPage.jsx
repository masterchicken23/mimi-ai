import { useNavigate } from 'react-router-dom'

export default function IntroPage() {
  const navigate = useNavigate()

  const skip = () => navigate('/select', { replace: true })

  return (
    <div
      onClick={skip}
      className="relative w-screen h-screen bg-black cursor-pointer select-none"
    >
      <video
        src="/intro_Mimi.mp4"
        autoPlay
        muted
        playsInline
        onEnded={skip}
        className="w-full h-full object-cover"
      />

      <span className="absolute bottom-8 right-8 text-white/70 text-sm font-medium hover:text-white transition-colors">
        Skip &rarr;
      </span>
    </div>
  )
}
