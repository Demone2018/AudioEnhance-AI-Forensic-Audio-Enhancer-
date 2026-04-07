import { useRef, useEffect, useState, useCallback } from 'react';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Draw the waveform
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
          // Strong red background for cut segments
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fillRect(x1, 0, x2 - x1, h);
          // Red top/bottom border lines
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1, 0);
          ctx.lineTo(x1, h);
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

      let min = 1;
      let max = -1;
      for (let i = startSample; i < endSample; i++) {
        const val = audioData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      // Check if this x position falls in a cut segment
      let isCut = false;
      if (qsjSegments) {
        const timeAtX = (x / width) * totalDuration;
        for (const seg of qsjSegments) {
          if (!seg.kept && timeAtX >= seg.start && timeAtX < seg.end) {
            isCut = true;
            break;
          }
        }
      }

      ctx.strokeStyle = isCut ? '#ef4444' : color;
      ctx.beginPath();
      const y1 = mid + min * mid;
      const y2 = mid + max * mid;
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // Draw playback cursor
    if (duration > 0 && currentTime >= 0) {
      const cursorX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();

      // Cursor head (small triangle)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cursorX - 5, 0);
      ctx.lineTo(cursorX + 5, 0);
      ctx.lineTo(cursorX, 7);
      ctx.closePath();
      ctx.fill();
    }

    // Draw hover indicator
    if (hoverX !== null && onSeek) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Time label at hover position
      const hoverTime = (hoverX / width) * (duration || totalDuration);
      const mins = Math.floor(hoverTime / 60);
      const secs = (hoverTime % 60).toFixed(1);
      const timeLabel = `${mins}:${secs.padStart(4, '0')}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const textWidth = ctx.measureText(timeLabel).width + 8;
      const labelX = Math.min(hoverX - textWidth / 2, width - textWidth);
      ctx.fillRect(Math.max(0, labelX), h - 22, textWidth, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(timeLabel, Math.max(4, labelX + 4), h - 8);
    }
  }, [audioData, sampleRate, qsjSegments, color, height, currentTime, duration, hoverX, onSeek]);

  // Seek handler
  const handleSeek = useCallback(
    (clientX: number) => {
      if (!onSeek || !containerRef.current || !audioData) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const totalDuration = duration || audioData.length / sampleRate;
      onSeek(ratio * totalDuration);
    },
    [onSeek, duration, audioData, sampleRate]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek) return;
      setIsDragging(true);
      handleSeek(e.clientX);
    },
    [onSeek, handleSeek]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setHoverX(e.clientX - rect.left);
      if (isDragging) {
        handleSeek(e.clientX);
      }
    },
    [isDragging, handleSeek]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setIsDragging(false);
  }, []);

  // Format current time display
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
      <canvas
        ref={canvasRef}
        className={`w-full rounded-lg border border-slate-700 ${onSeek ? 'cursor-crosshair' : ''}`}
        style={{ height: `${height}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
