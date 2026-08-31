'use client';

import { useEffect, useRef, useState } from 'react';
import { Crop, FileImage, Gauge, ImageDown, LockKeyhole, Maximize2, RotateCcw, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';

type UploadedGif = { file: File; url: string };
const tools = [
  { icon: Maximize2, title: 'Resize', detail: 'Change width and height' },
  { icon: ImageDown, title: 'Downscale', detail: 'Reduce GIF file size' },
  { icon: Crop, title: 'Crop', detail: 'Trim the visible area' },
  { icon: Gauge, title: 'Frame rate', detail: 'Adjust playback FPS' },
];
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<UploadedGif | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.url); }, [uploaded]);

  const loadFile = (file?: File) => {
    setError('');
    if (!file) return;
    if (!(file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))) {
      setError('Please choose a GIF file.');
      return;
    }
    setUploaded({ file, url: URL.createObjectURL(file) });
  };

  const reset = () => {
    setUploaded(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
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
            <input ref={inputRef} className="sr-only" type="file" accept="image/gif,.gif" onChange={(event) => loadFile(event.target.files?.[0])} />
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
              <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={reset}><RotateCcw /> Replace</Button>
            </div>
            <div className="preview-stage"><div className="checkerboard"><img src={uploaded.url} alt={`Preview of ${uploaded.file.name}`} /></div></div>
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
