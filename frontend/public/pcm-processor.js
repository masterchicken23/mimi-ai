/**
 * AudioWorklet processor that captures PCM audio, converts Float32 → Int16,
 * and posts the raw buffer back to the main thread for streaming to Gemini.
 *
 * Chunk size of 2048 samples at 16 kHz ≈ 128 ms — half the latency of the
 * old ScriptProcessor (4096 / 16 kHz = 256 ms) while still being efficient.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = new Float32Array(0)
    this._chunkSize = 2048
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true

    const next = new Float32Array(this._buffer.length + input.length)
    next.set(this._buffer)
    next.set(input, this._buffer.length)
    this._buffer = next

    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize)
      this._buffer = this._buffer.slice(this._chunkSize)

      const int16 = new Int16Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      this.port.postMessage(int16.buffer, [int16.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
