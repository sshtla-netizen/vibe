'use client';

import { useEffect, useRef, useState } from 'react';
import { Crop, Download, FileImage, Gauge, ImageDown, LockKeyhole, Maximize2, Repeat, Rewind, RotateCw, Scissors, Sparkles, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';

type UploadedGif = { file: File; url: string };
type GifMetadata = { width: number; height: number; frames: number; fps: number | null; duration: number | null };
const tools = [
  { icon: Maximize2, title: 'Resize', detail: 'Change width and height' },
  { icon: Crop, title: 'Crop', detail: 'Trim the visible area' },
  { icon: ImageDown, title: 'Downsizing', detail: 'Reduce dimensions and file size' },
  { icon: Repeat, title: 'Format Convert', detail: 'Convert to another format' },
  { icon: RotateCw, title: 'Rotate', detail: 'Turn or flip the image' },
  { icon: Sparkles, title: 'Optimize', detail: 'Improve GIF efficiency' },
  { icon: Rewind, title: 'Reverse', detail: 'Play frames in reverse' },
  { icon: Gauge, title: 'Speed', detail: 'Change playback speed' },
  { icon: Scissors, title: 'Cut', detail: 'Trim the animation range' },
];
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function parseGifMetadata(buffer: ArrayBuffer): GifMetadata {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (!signature.startsWith('GIF') || bytes.length < 13) throw new Error('Invalid GIF');

  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  let position = 13;
  let frames = 0;
  const delays: number[] = [];
  const globalColorTable = bytes[10] & 0x80;
  if (globalColorTable) position += 3 * 2 ** ((bytes[10] & 0x07) + 1);

  const skipSubBlocks = () => {
    while (position < bytes.length) {
      const size = bytes[position++];
      if (size === 0) break;
      position += size;
    }
  };

  while (position < bytes.length) {
    const marker = bytes[position++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[position++];
      if (label === 0xf9) {
        const size = bytes[position++];
        if (size >= 4 && position + size <= bytes.length) delays.push(view.getUint16(position + 1, true) * 10);
        position += size + 1;
      } else {
        skipSubBlocks();
      }
      continue;
    }
    if (marker === 0x2c) {
      frames += 1;
      if (position + 9 > bytes.length) break;
      const packed = bytes[position + 8];
      position += 9;
      if (packed & 0x80) position += 3 * 2 ** ((packed & 0x07) + 1);
      position += 1;
      skipSubBlocks();
      continue;
    }
    break;
  }

  const durationMs = delays.reduce((sum, delay) => sum + delay, 0);
  return {
    width,
    height,
    frames,
    duration: durationMs ? durationMs / 1000 : null,
    fps: durationMs && frames ? frames / (durationMs / 1000) : null,
  };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<UploadedGif | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState<GifMetadata | null>(null);

  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.url); }, [uploaded]);

  const loadFile = async (file?: File) => {
    setError('');
    if (!file) return;
    if (!(file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))) {
      setError('Please choose a GIF file.');
      return;
    }
    setMetadata(null);
    setUploaded({ file, url: URL.createObjectURL(file) });
    try {
      setMetadata(parseGifMetadata(await file.arrayBuffer()));
    } catch {
      setMetadata(null);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/gif,.gif"
        onChange={(event) => loadFile(event.target.files?.[0])}
      />
      <header className="flex h-20 items-center justify-between border-b border-border/80 bg-white/80 px-5 backdrop-blur-xl sm:px-10 lg:px-14">
        <a
          className="brand-mark"
          href="https://www.jinju.go.kr/00130/02730/00138.web?amode=view&gcode=1004&idx=39612749&artiSno="
          aria-label="Visit the linked Jinju City page"
        >
          <img src="/logo.png" alt="Smart GIF Studio" />
        </a>
        <div className="text-right">
          <p className="text-base font-bold tracking-[-0.02em] sm:text-lg">Smart GIF Studio</p>
          <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">Private by design</p>
        </div>
      </header>

      {!uploaded ? (
        <section className="mx-auto flex w-full max-w-[980px] flex-col items-center px-5 pb-16 pt-14 text-center sm:px-8 sm:pt-20">
          <div className="eyebrow"><span />Browser-based GIF toolkit</div>
          <h1 className="mt-5 max-w-3xl text-balance text-[clamp(2.65rem,7vw,5.6rem)] font-black leading-[0.94] tracking-[-0.065em]">
            Free GIF <span className="text-primary">Editor</span>
          </h1>
          <p className="mt-7 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            Edit GIF files for free! Resize, downscale, crop, adjust FPS, and enjoy a variety of powerful tools at no cost.
          </p>
          <p className="mt-3 flex max-w-2xl items-start justify-center gap-2 text-balance text-sm leading-6 text-muted-foreground/80">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
            All data is processed locally in your browser. Nothing is sent outside your device, so you can work safely without worrying about data leaks.
          </p>
          <div
            className={`upload-zone mt-10 w-full ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}
          >
            <div className="upload-icon"><UploadCloud className="size-8" /></div>
            <h2 className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">Drop your GIF here</h2>
            <p className="mt-2 text-sm text-muted-foreground">One GIF at a time · Processed on this device</p>
            <Button size="lg" className="mt-6 h-12 rounded-full px-7 text-[15px] font-bold shadow-[0_10px_28px_rgba(84,74,246,0.28)]" onClick={() => inputRef.current?.click()}>
              <FileImage className="size-4" /> Choose File
            </Button>
            {error && <p className="mt-4 text-sm font-semibold text-destructive" role="alert">{error}</p>}
          </div>
        </section>
      ) : (
        <section className="editor-shell mx-auto grid w-full max-w-[1280px] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.75fr)] lg:px-10 lg:py-10">
          <section className="preview-card min-w-0" aria-label="GIF preview">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{uploaded.file.name}</p>
                <p className="mt-0.5 text-xs text-white/50">GIF · {formatSize(uploaded.file.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a className="download-button" href={uploaded.url} download={uploaded.file.name}><Download /> Download</a>
                <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => {
                  if (inputRef.current) inputRef.current.value = '';
                  inputRef.current?.click();
                }}><FileImage /> Choose Another File</Button>
              </div>
            </div>
            <div className="preview-stage"><div className="checkerboard"><img src={uploaded.url} alt={`Preview of ${uploaded.file.name}`} /></div></div>
            <div className="gif-info">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9e97ff]">Original GIF</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">File information</h2>
              </div>
              <dl className="metadata-grid">
                <div><dt>File size</dt><dd>{formatSize(uploaded.file.size)}</dd></div>
                <div><dt>Resolution</dt><dd>{metadata ? `${metadata.width} × ${metadata.height}` : '—'}</dd></div>
                <div><dt>Frame rate</dt><dd>{metadata?.fps ? `${metadata.fps.toFixed(1)} FPS` : '—'}</dd></div>
                <div><dt>Total frames</dt><dd>{metadata ? metadata.frames.toLocaleString() : '—'}</dd></div>
                <div><dt>Duration</dt><dd>{metadata?.duration ? `${metadata.duration.toFixed(2)} sec` : '—'}</dd></div>
                <div><dt>Format</dt><dd>GIF</dd></div>
              </dl>
            </div>
          </section>
          <aside className="panel-card" aria-label="GIF editing panel">
            <div className="border-b border-border px-5 py-5 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Editing tools</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Shape your GIF</h2>
              <p className="mt-1 text-sm text-muted-foreground">Select a tool to start editing.</p>
            </div>
            <div className="grid gap-3 p-4 sm:p-5">
              {tools.map(({ icon: Icon, title, detail }) => (
                <button key={title} className="tool-row" type="button">
                  <span className="tool-icon"><Icon /></span>
                  <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
                  <span className="text-lg text-muted-foreground/50">›</span>
                </button>
              ))}
            </div>
            <div className="mx-5 mb-5 rounded-2xl bg-secondary p-4"><p className="flex items-center gap-2 text-xs font-semibold text-secondary-foreground"><LockKeyhole className="size-3.5 text-primary" /> Your file stays on this device</p></div>
          </aside>
        </section>
      )}
    </main>
  );
}
