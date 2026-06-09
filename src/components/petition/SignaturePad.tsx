// ================================================================
// components/petition/SignaturePad.tsx
// Canvas-based digital signature component (no external deps needed)
// Falls back gracefully if react-signature-canvas isn't installed
// ================================================================
import { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2, PenTool } from 'lucide-react';

interface Props {
  onSign: (dataUrl: string) => void;
  onClear?: () => void;
  label?: string;
}

export default function SignaturePad({ onSign, onClear, label = 'ลงนามที่นี่' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getCtx = () => canvasRef.current?.getContext('2d');

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas internal resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio || rect.width;
    canvas.height = rect.height * window.devicePixelRatio || rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    const pos = getPos(e.nativeEvent as any, canvas);
    lastPos.current = pos;
    const ctx = getCtx();
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx || !lastPos.current) return;

    const pos = getPos(e.nativeEvent as any, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }, [drawing]);

  const stopDraw = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    setHasSignature(true);
    lastPos.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onSign(dataUrl);
    }
  }, [drawing, onSign]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onClear?.();
    onSign('');
  }, [onClear, onSign]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <PenTool className="w-4 h-4 text-orange-500" />
          <span>{label}</span>
          <span className="text-rose-500">*</span>
        </div>
        {hasSignature && (
          <button onClick={clear} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-rose-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> ล้าง
          </button>
        )}
      </div>

      <div
        className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
          hasSignature ? 'border-emerald-400 dark:border-emerald-600' : 'border-dashed border-neutral-300 dark:border-neutral-600'
        }`}
        style={{ background: '#ffffff', touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '120px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <PenTool className="w-6 h-6 text-neutral-300 mb-1" />
            <span className="text-xs text-neutral-400">วาดลายเซ็นในกล่องนี้</span>
          </div>
        )}
        {hasSignature && (
          <div className="absolute bottom-1 right-2 pointer-events-none">
            <span className="text-[10px] text-emerald-500 font-medium">✓ ลงนามแล้ว</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-neutral-400">
        ลายเซ็นจะถูกเข้ารหัสและบันทึกในระบบอย่างปลอดภัย
      </p>
    </div>
  );
}
