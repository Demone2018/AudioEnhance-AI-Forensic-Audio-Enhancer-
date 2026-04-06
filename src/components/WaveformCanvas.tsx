import { useRef, useEffect } from 'react';

interface WaveformCanvasProps {
  audioData: Float32Array | null;
  sampleRate: number;
  qsjSegments?: Array<{ start: number; end: number; kept: boolean }>;
  label: string;
  color?: string;
  height?: number;
}

export function WaveformCanvas({
  audioData,
  sampleRate,
  qsjSegments,
  label,
  color = '#22d3ee',
  height = 120,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioData || audioData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const h = height;
    const mid = h / 2;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, h);

    // Draw QSJ cut segments in red background
    if (qsjSegments && qsjSegments.length > 0) {
      const totalDuration = audioData.length / sampleRate;
      for (const seg of qsjSegments) {
        if (!seg.kept) {
          const x1 = (seg.start / totalDuration) * width;
          const x2 = (seg.end / totalDuration) * width;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fillRect(x1, 0, x2 - x1, h);
        }
      }
    }

    // Draw waveform
    const samplesPerPixel = Math.ceil(audioData.length / width);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const startSample = Math.floor(x * samplesPerPixel);
      const endSample = Math.min(startSample + samplesPerPixel, audioData.length);

      let min = 1;
      let max = -1;
      for (let i = startSample; i < endSample; i++) {
        const val = audioData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const y1 = mid + min * mid;
      const y2 = mid + max * mid;

      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
  }, [audioData, sampleRate, qsjSegments, color, height]);

  return (
    <div className="space-y-1">
      <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-slate-700"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}
