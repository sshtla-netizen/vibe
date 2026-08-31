'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Crop, Download, FileImage, Gauge, ImageDown, LoaderCircle, Lock, LockOpen, LockKeyhole, Maximize2, Repeat, Rewind, RotateCw, Scissors, Sparkles, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type UploadedGif = { file: File; url: string };
type GifMetadata = { width: number; height: number; frames: number; fps: number | null; duration: number | null };
type ResizedGif = { blob: Blob; url: string; metadata: GifMetadata };
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
  const [activeTool, setActiveTool] = useState<'tools' | 'resize'>('tools');
  const [resizeWidth, setResizeWidth] = useState(1);
  const [resizeHeight, setResizeHeight] = useState(1);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [resized, setResized] = useState<ResizedGif | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeError, setResizeError] = useState('');

  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.url); }, [uploaded]);
  useEffect(() => () => { if (resized) URL.revokeObjectURL(resized.url); }, [resized]);

  const loadFile = async (file?: File) => {
    setError('');
    if (!file) return;
    if (!(file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))) {
      setError('Please choose a GIF file.');
      return;
    }
    setMetadata(null);
    setActiveTool('tools');
    setShowOriginal(true);
    setResized(null);
    setResizeError('');
    setUploaded({ file, url: URL.createObjectURL(file) });
    try {
      const nextMetadata = parseGifMetadata(await file.arrayBuffer());
      setMetadata(nextMetadata);
      setResizeWidth(nextMetadata.width);
      setResizeHeight(nextMetadata.height);
    } catch {
      setMetadata(null);
    }
  };

  const openResize = () => {
    if (!metadata) return;
    setResizeWidth(metadata.width);
    setResizeHeight(metadata.height);
    setAspectLocked(true);
    setResizeError('');
    setActiveTool('resize');
  };

  const updateWidth = (value: number) => {
    setResizeWidth(value);
    if (aspectLocked && metadata) setResizeHeight(Math.max(1, Math.round(value * metadata.height / metadata.width)));
  };

  const updateHeight = (value: number) => {
    setResizeHeight(value);
    if (aspectLocked && metadata) setResizeWidth(Math.max(1, Math.round(value * metadata.width / metadata.height)));
  };

  const runResize = async () => {
    if (!uploaded || !metadata) return;
    setIsResizing(true);
    setResizeError('');
    try {
      const { decode, decodeFrames, encode } = await import('modern-gif');
      const source = await uploaded.file.arrayBuffer();
      const gif = decode(source);
      const frames = decodeFrames(source, { gif });
      const sourceCanvas = document.createElement('canvas');
      const targetCanvas = document.createElement('canvas');
      sourceCanvas.width = gif.width;
      sourceCanvas.height = gif.height;
      targetCanvas.width = resizeWidth;
      targetCanvas.height = resizeHeight;
      const sourceContext = sourceCanvas.getContext('2d');
      const targetContext = targetCanvas.getContext('2d');
      if (!sourceContext || !targetContext) throw new Error('Canvas is unavailable');

      const outputFrames = frames.map((frame) => {
        sourceContext.clearRect(0, 0, gif.width, gif.height);
        sourceContext.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
        targetContext.clearRect(0, 0, resizeWidth, resizeHeight);
        targetContext.imageSmoothingEnabled = true;
        targetContext.imageSmoothingQuality = 'high';
        targetContext.drawImage(sourceCanvas, 0, 0, resizeWidth, resizeHeight);
        return { data: targetContext.getImageData(0, 0, resizeWidth, resizeHeight).data, delay: frame.delay };
      });

      const blob = await encode({
        format: 'blob',
        width: resizeWidth,
        height: resizeHeight,
        frames: outputFrames,
        looped: gif.looped,
        loopCount: gif.loopCount,
        maxColors: 255,
        dither: 'floyd-steinberg',
      });
      const resultMetadata = parseGifMetadata(await blob.arrayBuffer());
      setResized({ blob, url: URL.createObjectURL(blob), metadata: resultMetadata });
      setShowOriginal(false);
    } catch {
      setResizeError('The GIF could not be resized. Please try another file or size.');
    } finally {
      setIsResizing(false);
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
          <div className="result-stack min-w-0">
            <section className="preview-card min-w-0" aria-label="Original GIF">
              <div className="preview-header">
                <button className="collapse-button" type="button" onClick={() => setShowOriginal((visible) => !visible)} aria-expanded={showOriginal} aria-label={`${showOriginal ? 'Collapse' : 'Expand'} Original GIF`}>
                  {showOriginal ? <ChevronDown /> : <ChevronRight />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e97ff]">Original GIF</p>
                  <p className="truncate text-sm font-semibold text-white">{uploaded.file.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a className="download-button" href={uploaded.url} download={uploaded.file.name}><Download /> Download</a>
                  <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => {
                    if (inputRef.current) inputRef.current.value = '';
                    inputRef.current?.click();
                  }}><FileImage /> Choose Another File</Button>
                </div>
              </div>
              {showOriginal && (
                <>
                  <div className="preview-stage"><div className="checkerboard"><img src={uploaded.url} alt={`Preview of ${uploaded.file.name}`} /></div></div>
                  <div className="gif-info">
                    <h2 className="text-xl font-black tracking-[-0.03em] text-white">File information</h2>
                    <dl className="metadata-grid">
                      <div><dt>File size</dt><dd>{formatSize(uploaded.file.size)}</dd></div>
                      <div><dt>Resolution</dt><dd>{metadata ? `${metadata.width} × ${metadata.height}` : '—'}</dd></div>
                      <div><dt>Frame rate</dt><dd>{metadata?.fps ? `${metadata.fps.toFixed(1)} FPS` : '—'}</dd></div>
                      <div><dt>Total frames</dt><dd>{metadata ? metadata.frames.toLocaleString() : '—'}</dd></div>
                      <div><dt>Duration</dt><dd>{metadata?.duration ? `${metadata.duration.toFixed(2)} sec` : '—'}</dd></div>
                      <div><dt>Format</dt><dd>GIF</dd></div>
                    </dl>
                  </div>
                </>
              )}
            </section>

            {resized && (
              <section className="preview-card min-w-0" aria-label="Resized GIF">
                <div className="preview-header">
                  <span className="result-badge"><Maximize2 /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e97ff]">Resized GIF</p>
                    <p className="truncate text-sm font-semibold text-white">Resized_{uploaded.file.name}</p>
                  </div>
                  <a className="download-button" href={resized.url} download={`Resized_${uploaded.file.name}`}><Download /> Download</a>
                </div>
                <div className="preview-stage"><div className="checkerboard"><img src={resized.url} alt={`Resized preview of ${uploaded.file.name}`} /></div></div>
                <div className="gif-info">
                  <h2 className="text-xl font-black tracking-[-0.03em] text-white">File information</h2>
                  <dl className="metadata-grid">
                    <div><dt>File size</dt><dd>{formatSize(resized.blob.size)}</dd></div>
                    <div><dt>Resolution</dt><dd>{resized.metadata.width} × {resized.metadata.height}</dd></div>
                    <div><dt>Frame rate</dt><dd>{resized.metadata.fps ? `${resized.metadata.fps.toFixed(1)} FPS` : '—'}</dd></div>
                    <div><dt>Total frames</dt><dd>{resized.metadata.frames.toLocaleString()}</dd></div>
                    <div><dt>Duration</dt><dd>{resized.metadata.duration ? `${resized.metadata.duration.toFixed(2)} sec` : '—'}</dd></div>
                    <div><dt>Format</dt><dd>GIF</dd></div>
                  </dl>
                </div>
              </section>
            )}
          </div>
          <aside className="panel-card" aria-label="GIF editing panel">
            {activeTool === 'tools' ? (
              <>
                <div className="border-b border-border px-5 py-5 sm:px-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Editing tools</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Shape your GIF</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Select a tool to start editing.</p>
                </div>
                <div className="grid gap-3 p-4 sm:p-5">
                  {tools.map(({ icon: Icon, title, detail }) => (
                    <button key={title} className="tool-row" type="button" onClick={title === 'Resize' ? openResize : undefined}>
                      <span className="tool-icon"><Icon /></span>
                      <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
                      <span className="text-lg text-muted-foreground/50">›</span>
                    </button>
                  ))}
                </div>
                <div className="mx-5 mb-5 rounded-2xl bg-secondary p-4"><p className="flex items-center gap-2 text-xs font-semibold text-secondary-foreground"><LockKeyhole className="size-3.5 text-primary" /> Your file stays on this device</p></div>
              </>
            ) : (
              <>
                <div className="border-b border-border px-5 py-5 sm:px-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Resize tool</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Resize your GIF</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Adjust output dimensions in pixels.</p>
                </div>
                {metadata && (
                  <div className="resize-controls">
                    <div className="axis-heading">
                      <span className="axis-badge">X</span>
                      <button className="aspect-lock" type="button" onClick={() => setAspectLocked((locked) => !locked)} aria-pressed={aspectLocked} aria-label={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}>
                        {aspectLocked ? <Lock /> : <LockOpen />}
                      </button>
                      <span className="axis-badge">Y</span>
                    </div>

                    <label className="slider-field">
                      <span><b>X axis</b><output>{resizeWidth} px</output></span>
                      <Slider min={Math.max(1, Math.floor(metadata.width * 0.05))} max={Math.max(1, Math.ceil(metadata.width * 3))} step={1} value={[resizeWidth]} onValueChange={(value) => updateWidth(Array.isArray(value) ? value[0] : value)} />
                      <small>{Math.max(1, Math.floor(metadata.width * 0.05))} px <span>{Math.ceil(metadata.width * 3)} px</span></small>
                    </label>

                    <label className="slider-field">
                      <span><b>Y axis</b><output>{resizeHeight} px</output></span>
                      <Slider min={Math.max(1, Math.floor(metadata.height * 0.05))} max={Math.max(1, Math.ceil(metadata.height * 3))} step={1} value={[resizeHeight]} onValueChange={(value) => updateHeight(Array.isArray(value) ? value[0] : value)} />
                      <small>{Math.max(1, Math.floor(metadata.height * 0.05))} px <span>{Math.ceil(metadata.height * 3)} px</span></small>
                    </label>

                    <div className="resize-summary">
                      <span>Output size</span><strong>{resizeWidth} × {resizeHeight}</strong>
                      <small>{aspectLocked ? 'Aspect ratio locked' : 'Independent dimensions'}</small>
                    </div>
                    {resizeError && <p className="text-sm font-semibold text-destructive" role="alert">{resizeError}</p>}
                  </div>
                )}
                <div className="panel-actions">
                  <Button variant="outline" size="lg" className="h-11 flex-1" disabled={isResizing} onClick={() => setActiveTool('tools')}><ArrowLeft /> Back</Button>
                  <Button size="lg" className="h-11 flex-1 font-bold" disabled={isResizing || !metadata} onClick={runResize}>
                    {isResizing ? <><LoaderCircle className="animate-spin" /> Processing</> : <>Go!</>}
                  </Button>
                </div>
              </>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
