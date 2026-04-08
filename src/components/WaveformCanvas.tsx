import { useRef, useEffect, useCallback } from 'react';

interface WaveformCanvasProps {
  audioData: Float32Array | null;
  sampleRate: number;
  qsjSegments?: Array<{ start: number; end: number; kept: boolean }>;
  label: string;
  color?: string;
  height?: number;
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
}

export function WaveformCanvas({
  audioData,
  sampleRate,
  qsjSegments,
  label,
  color = '#22d3ee',
  height = 120,
  currentTime = 0,
  duration = 0,
  onSeek,
}: WaveformCanvasProps) {
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw waveform ONCE when audioData changes (not on every currentTime update)
  useEffect(() => {
    const canvas = waveCanvasRef.current;
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
    const totalDuration = audioData.length / sampleRate;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, h);

    // Draw QSJ cut segments in red background
    if (qsjSegments && qsjSegments.length > 0) {
      for (const seg of qsjSegments) {
        if (!seg.kept) {
          const x1 = (seg.start / totalDuration) * width;
          const x2 = (seg.end / totalDuration) * width;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fillRect(x1, 0, x2 - x1, h);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1, 0); ctx.lineTo(x1, h);
          ctx.stroke();
        }
      }
    }

    // Draw waveform
    const samplesPerPixel = Math.ceil(audioData.length / width);
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x++) {
      const startSample = Math.floor(x * samplesPerPixel);
      const endSample = Math.min(startSample + samplesPerPixel, audioData.length);

      let min = 1, max = -1;
      for (let i = startSample; i < endSample; i++) {
        if (audioData[i] < min) min = audioData[i];
        if (audioData[i] > max) max = audioData[i];
      }

      // Color cut segments red
      let isCut = false;
      if (qsjSegments) {
        const timeAtX = (x / width) * totalDuration;
        for (const seg of qsjSegments) {
          if (!seg.kept && timeAtX >= seg.start && timeAtX < seg.end) { isCut = true; break; }
        }
      }

      ctx.strokeStyle = isCut ? '#ef4444' : color;
      ctx.beginPath();
      ctx.moveTo(x, mid + min * mid);
      ctx.lineTo(x, mid + max * mid);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(width, mid);
    ctx.stroke();
  }, [audioData, sampleRate, qsjSegments, color, height]);

  // Draw cursor on a SEPARATE overlay canvas (lightweight, 60fps)
  useEffect(() => {
    const canvas = cursorCanvasRef.current;
    if (!canvas || !audioData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const h = height;
    const totalDuration = duration || audioData.length / sampleRate;

    ctx.clearRect(0, 0, width, h);

    if (totalDuration > 0 && currentTime > 0) {
      const cursorX = (currentTime / totalDuration) * width;

      // Cursor line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();

      // Cursor head
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cursorX - 5, 0);
      ctx.lineTo(cursorX + 5, 0);
      ctx.lineTo(cursorX, 7);
      ctx.closePath();
      ctx.fill();
    }
  }, [currentTime, duration, audioData, sampleRate, height]);

  // Seek on click - immediate, no heavy computation
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || !containerRef.current || !audioData) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const totalDuration = duration || audioData.length / sampleRate;
    onSeek(ratio * totalDuration);
  }, [onSeek, duration, audioData, sampleRate]);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = (t % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  const totalDuration = audioData ? audioData.length / sampleRate : 0;
  const displayDuration = duration || totalDuration;

  return (
    <div className="space-y-1" ref={containerRef}>
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
        {displayDuration > 0 && (
          <span className="text-xs font-mono text-slate-500">
            {formatTime(currentTime)} / {formatTime(displayDuration)}
          </span>
        )}
      </div>
      <div className="relative" style={{ height: `${height}px` }}>
        {/* Waveform layer (redraws only when audio data changes) */}
        <canvas
          ref={waveCanvasRef}
          className="absolute inset-0 w-full h-full rounded-lg border border-slate-700"
          style={{ height: `${height}px` }}
        />
        {/* Cursor layer (redraws on every frame, lightweight) */}
        <canvas
          ref={cursorCanvasRef}
          className={`absolute inset-0 w-full h-full rounded-lg ${onSeek ? 'cursor-pointer' : ''}`}
          style={{ height: `${height}px` }}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}
