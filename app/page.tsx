'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Crop, Download, FileImage, Gauge, Image as ImageIcon, ImageDown, LoaderCircle, Lock, LockOpen, LockKeyhole, Maximize2, Repeat, Rewind, RotateCw, Scissors, Sparkles, UploadCloud, Video } from 'lucide-react';
import ffmpegCoreUrl from '@ffmpeg/core?url';
import ffmpegWasmUrl from '@ffmpeg/core/wasm?url';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';

type UploadedGif = { file: File; url: string };
type GifMetadata = { width: number; height: number; frames: number; fps: number | null; duration: number | null };
type ResultGif = { blob: Blob; url: string; metadata: GifMetadata };
type ConvertedFile = { blob: Blob; url: string; format: 'MP4' | 'JPG'; filename: string };
const cropRatios = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:4', value: 3 / 4 },
  { label: '9:16', value: 9 / 16 },
];
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
  const [activeTool, setActiveTool] = useState<'tools' | 'resize' | 'crop' | 'downsize' | 'convert'>('tools');
  const [resizeWidth, setResizeWidth] = useState(1);
  const [resizeHeight, setResizeHeight] = useState(1);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [resized, setResized] = useState<ResultGif | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeError, setResizeError] = useState('');
  const [cropRatio, setCropRatio] = useState('1:1');
  const [cropMode, setCropMode] = useState<'cover' | 'fill'>('cover');
  const [cropColor, setCropColor] = useState('#ffffff');
  const [cropped, setCropped] = useState<ResultGif | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropError, setCropError] = useState('');
  const [reduceSize, setReduceSize] = useState(true);
  const [sizePercent, setSizePercent] = useState(70);
  const [removeFrames, setRemoveFrames] = useState(false);
  const [frameStep, setFrameStep] = useState(2);
  const [reduceColors, setReduceColors] = useState(false);
  const [colorCount, setColorCount] = useState(128);
  const [downsized, setDownsized] = useState<ResultGif | null>(null);
  const [isDownsizing, setIsDownsizing] = useState(false);
  const [downsizeError, setDownsizeError] = useState('');
  const [convertFormat, setConvertFormat] = useState<'mp4' | 'jpg'>('mp4');
  const [jpgQuality, setJpgQuality] = useState(90);
  const [converted, setConverted] = useState<ConvertedFile | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [convertError, setConvertError] = useState('');

  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.url); }, [uploaded]);
  useEffect(() => () => { if (resized) URL.revokeObjectURL(resized.url); }, [resized]);
  useEffect(() => () => { if (cropped) URL.revokeObjectURL(cropped.url); }, [cropped]);
  useEffect(() => () => { if (downsized) URL.revokeObjectURL(downsized.url); }, [downsized]);
  useEffect(() => () => { if (converted) URL.revokeObjectURL(converted.url); }, [converted]);

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
    setCropped(null);
    setDownsized(null);
    setConverted(null);
    setResizeError('');
    setCropError('');
    setDownsizeError('');
    setConvertError('');
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

  const openCrop = () => {
    if (!metadata) return;
    setCropRatio('1:1');
    setCropMode('cover');
    setCropColor('#ffffff');
    setCropError('');
    setActiveTool('crop');
  };

  const openDownsize = () => {
    if (!metadata) return;
    setReduceSize(true);
    setSizePercent(70);
    setRemoveFrames(false);
    setFrameStep(2);
    setReduceColors(false);
    setColorCount(128);
    setDownsizeError('');
    setActiveTool('downsize');
  };

  const openConvert = () => {
    setConvertFormat('mp4');
    setJpgQuality(90);
    setConvertProgress(0);
    setConvertError('');
    setActiveTool('convert');
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

  const runCrop = async () => {
    if (!uploaded || !metadata) return;
    setIsCropping(true);
    setCropError('');
    try {
      const { decode, decodeFrames, encode } = await import('modern-gif');
      const source = await uploaded.file.arrayBuffer();
      const gif = decode(source);
      const frames = decodeFrames(source, { gif });
      const ratio = cropRatios.find((item) => item.label === cropRatio)?.value ?? 1;
      let outputWidth: number;
      let outputHeight: number;
      if (gif.width / gif.height > ratio) {
        outputHeight = gif.height;
        outputWidth = Math.max(1, Math.round(outputHeight * ratio));
      } else {
        outputWidth = gif.width;
        outputHeight = Math.max(1, Math.round(outputWidth / ratio));
      }

      const sourceCanvas = document.createElement('canvas');
      const targetCanvas = document.createElement('canvas');
      sourceCanvas.width = gif.width;
      sourceCanvas.height = gif.height;
      targetCanvas.width = outputWidth;
      targetCanvas.height = outputHeight;
      const sourceContext = sourceCanvas.getContext('2d');
      const targetContext = targetCanvas.getContext('2d');
      if (!sourceContext || !targetContext) throw new Error('Canvas is unavailable');

      const outputFrames = frames.map((frame) => {
        sourceContext.clearRect(0, 0, gif.width, gif.height);
        sourceContext.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
        targetContext.clearRect(0, 0, outputWidth, outputHeight);
        const scale = cropMode === 'cover'
          ? Math.max(outputWidth / gif.width, outputHeight / gif.height)
          : Math.min(outputWidth / gif.width, outputHeight / gif.height);
        const drawWidth = gif.width * scale;
        const drawHeight = gif.height * scale;
        const drawX = (outputWidth - drawWidth) / 2;
        const drawY = (outputHeight - drawHeight) / 2;
        if (cropMode === 'fill') {
          targetContext.fillStyle = cropColor;
          targetContext.fillRect(0, 0, outputWidth, outputHeight);
        }
        targetContext.imageSmoothingEnabled = true;
        targetContext.imageSmoothingQuality = 'high';
        targetContext.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
        return { data: targetContext.getImageData(0, 0, outputWidth, outputHeight).data, delay: frame.delay };
      });

      const blob = await encode({
        format: 'blob', width: outputWidth, height: outputHeight, frames: outputFrames,
        looped: gif.looped, loopCount: gif.loopCount, maxColors: 255, dither: 'floyd-steinberg',
      });
      const resultMetadata = parseGifMetadata(await blob.arrayBuffer());
      setCropped({ blob, url: URL.createObjectURL(blob), metadata: resultMetadata });
      setShowOriginal(false);
    } catch {
      setCropError('The GIF could not be cropped. Please try another option.');
    } finally {
      setIsCropping(false);
    }
  };

  const runDownsize = async () => {
    if (!uploaded || !metadata || (!reduceSize && !removeFrames && !reduceColors)) return;
    setIsDownsizing(true);
    setDownsizeError('');
    try {
      const { decode, decodeFrames, encode } = await import('modern-gif');
      const source = await uploaded.file.arrayBuffer();
      const gif = decode(source);
      const frames = decodeFrames(source, { gif });
      const scale = reduceSize ? sizePercent / 100 : 1;
      const outputWidth = Math.max(1, Math.round(gif.width * scale));
      const outputHeight = Math.max(1, Math.round(gif.height * scale));
      const sourceCanvas = document.createElement('canvas');
      const targetCanvas = document.createElement('canvas');
      sourceCanvas.width = gif.width;
      sourceCanvas.height = gif.height;
      targetCanvas.width = outputWidth;
      targetCanvas.height = outputHeight;
      const sourceContext = sourceCanvas.getContext('2d');
      const targetContext = targetCanvas.getContext('2d');
      if (!sourceContext || !targetContext) throw new Error('Canvas is unavailable');

      const encodedFrames: Array<{ data: Uint8ClampedArray; delay: number }> = [];
      frames.forEach((frame, index) => {
        const shouldKeep = !removeFrames || index % frameStep === 0;
        if (!shouldKeep) {
          if (encodedFrames.length) encodedFrames[encodedFrames.length - 1].delay += frame.delay;
          return;
        }
        sourceContext.clearRect(0, 0, gif.width, gif.height);
        sourceContext.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
        targetContext.clearRect(0, 0, outputWidth, outputHeight);
        targetContext.imageSmoothingEnabled = true;
        targetContext.imageSmoothingQuality = 'high';
        targetContext.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
        encodedFrames.push({ data: targetContext.getImageData(0, 0, outputWidth, outputHeight).data, delay: frame.delay });
      });

      const blob = await encode({
        format: 'blob', width: outputWidth, height: outputHeight, frames: encodedFrames,
        looped: gif.looped, loopCount: gif.loopCount,
        maxColors: reduceColors ? colorCount : 255,
        dither: 'floyd-steinberg',
      });
      const resultMetadata = parseGifMetadata(await blob.arrayBuffer());
      setDownsized({ blob, url: URL.createObjectURL(blob), metadata: resultMetadata });
      setShowOriginal(false);
    } catch {
      setDownsizeError('The GIF could not be downsized. Please try different settings.');
    } finally {
      setIsDownsizing(false);
    }
  };

  const runConvert = async () => {
    if (!uploaded || !metadata) return;
    setIsConverting(true);
    setConvertProgress(0);
    setConvertError('');
    try {
      const baseName = uploaded.file.name.replace(/\.gif$/i, '');
      if (convertFormat === 'jpg') {
        const { decode, decodeFrames } = await import('modern-gif');
        const source = await uploaded.file.arrayBuffer();
        const gif = decode(source);
        const firstFrame = decodeFrames(source, { gif, range: [0, 1] })[0];
        const frameCanvas = document.createElement('canvas');
        const outputCanvas = document.createElement('canvas');
        frameCanvas.width = gif.width;
        frameCanvas.height = gif.height;
        outputCanvas.width = gif.width;
        outputCanvas.height = gif.height;
        const frameContext = frameCanvas.getContext('2d');
        const outputContext = outputCanvas.getContext('2d');
        if (!firstFrame || !frameContext || !outputContext) throw new Error('Canvas is unavailable');
        frameContext.putImageData(new ImageData(firstFrame.data, firstFrame.width, firstFrame.height), 0, 0);
        outputContext.fillStyle = '#ffffff';
        outputContext.fillRect(0, 0, gif.width, gif.height);
        outputContext.drawImage(frameCanvas, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => outputCanvas.toBlob((result) => result ? resolve(result) : reject(new Error('JPG conversion failed')), 'image/jpeg', jpgQuality / 100));
        setConverted({ blob, url: URL.createObjectURL(blob), format: 'JPG', filename: `Converted_${baseName}.jpg` });
        setConvertProgress(100);
      } else {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const ffmpeg = new FFmpeg();
        ffmpeg.on('progress', ({ progress }) => setConvertProgress(Math.min(99, Math.max(0, Math.round(progress * 100)))));
        await ffmpeg.load({ coreURL: ffmpegCoreUrl, wasmURL: ffmpegWasmUrl });
        await ffmpeg.writeFile('input.gif', new Uint8Array(await uploaded.file.arrayBuffer()));
        const exitCode = await ffmpeg.exec(['-i', 'input.gif', '-vf', 'scale=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'output.mp4']);
        if (exitCode !== 0) throw new Error('MP4 conversion failed');
        const data = await ffmpeg.readFile('output.mp4');
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const blob = new Blob([bytes], { type: 'video/mp4' });
        ffmpeg.terminate();
        setConverted({ blob, url: URL.createObjectURL(blob), format: 'MP4', filename: `Converted_${baseName}.mp4` });
        setConvertProgress(100);
      }
      setShowOriginal(false);
    } catch {
      setConvertError('The file could not be converted. Please try again with another GIF.');
    } finally {
      setIsConverting(false);
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

            {cropped && (
              <section className="preview-card min-w-0" aria-label="Cropped GIF">
                <div className="preview-header">
                  <span className="result-badge"><Crop /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e97ff]">Cropped GIF</p>
                    <p className="truncate text-sm font-semibold text-white">Cropped_{uploaded.file.name}</p>
                  </div>
                  <a className="download-button" href={cropped.url} download={`Cropped_${uploaded.file.name}`}><Download /> Download</a>
                </div>
                <div className="preview-stage"><div className="checkerboard"><img src={cropped.url} alt={`Cropped preview of ${uploaded.file.name}`} /></div></div>
                <div className="gif-info">
                  <h2 className="text-xl font-black tracking-[-0.03em] text-white">File information</h2>
                  <dl className="metadata-grid">
                    <div><dt>File size</dt><dd>{formatSize(cropped.blob.size)}</dd></div>
                    <div><dt>Resolution</dt><dd>{cropped.metadata.width} × {cropped.metadata.height}</dd></div>
                    <div><dt>Frame rate</dt><dd>{cropped.metadata.fps ? `${cropped.metadata.fps.toFixed(1)} FPS` : '—'}</dd></div>
                    <div><dt>Total frames</dt><dd>{cropped.metadata.frames.toLocaleString()}</dd></div>
                    <div><dt>Duration</dt><dd>{cropped.metadata.duration ? `${cropped.metadata.duration.toFixed(2)} sec` : '—'}</dd></div>
                    <div><dt>Format</dt><dd>GIF</dd></div>
                  </dl>
                </div>
              </section>
            )}

            {downsized && (
              <section className="preview-card min-w-0" aria-label="Downsized GIF">
                <div className="preview-header">
                  <span className="result-badge"><ImageDown /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e97ff]">Downsized GIF</p>
                    <p className="truncate text-sm font-semibold text-white">Downsized_{uploaded.file.name}</p>
                  </div>
                  <a className="download-button" href={downsized.url} download={`Downsized_${uploaded.file.name}`}><Download /> Download</a>
                </div>
                <div className="preview-stage"><div className="checkerboard"><img src={downsized.url} alt={`Downsized preview of ${uploaded.file.name}`} /></div></div>
                <div className="gif-info">
                  <h2 className="text-xl font-black tracking-[-0.03em] text-white">File information</h2>
                  <dl className="metadata-grid">
                    <div><dt>File size</dt><dd>{formatSize(downsized.blob.size)}</dd></div>
                    <div><dt>Resolution</dt><dd>{downsized.metadata.width} × {downsized.metadata.height}</dd></div>
                    <div><dt>Reduction</dt><dd>{Math.max(0, Math.round((1 - downsized.blob.size / uploaded.file.size) * 100))}%</dd></div>
                    <div><dt>Total frames</dt><dd>{downsized.metadata.frames.toLocaleString()}</dd></div>
                    <div><dt>Duration</dt><dd>{downsized.metadata.duration ? `${downsized.metadata.duration.toFixed(2)} sec` : '—'}</dd></div>
                    <div><dt>Format</dt><dd>GIF</dd></div>
                  </dl>
                </div>
              </section>
            )}

            {converted && (
              <section className="preview-card min-w-0" aria-label={`Converted ${converted.format}`}>
                <div className="preview-header">
                  <span className="result-badge">{converted.format === 'MP4' ? <Video /> : <ImageIcon />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e97ff]">Converted {converted.format}</p>
                    <p className="truncate text-sm font-semibold text-white">{converted.filename}</p>
                  </div>
                  <a className="download-button" href={converted.url} download={converted.filename}><Download /> Download</a>
                </div>
                <div className="preview-stage">
                  <div className="checkerboard">
                    {converted.format === 'MP4'
                      ? <video className="converted-video" src={converted.url} controls loop playsInline aria-label={`MP4 preview of ${uploaded.file.name}`} />
                      : <img src={converted.url} alt={`JPG preview of ${uploaded.file.name}`} />}
                  </div>
                </div>
                <div className="gif-info">
                  <h2 className="text-xl font-black tracking-[-0.03em] text-white">File information</h2>
                  <dl className="metadata-grid">
                    <div><dt>File size</dt><dd>{formatSize(converted.blob.size)}</dd></div>
                    <div><dt>Resolution</dt><dd>{metadata ? `${metadata.width} × ${metadata.height}` : '—'}</dd></div>
                    <div><dt>Format</dt><dd>{converted.format}</dd></div>
                    <div><dt>Content</dt><dd>{converted.format === 'MP4' ? 'Animation' : 'First frame'}</dd></div>
                    <div><dt>Duration</dt><dd>{converted.format === 'MP4' && metadata?.duration ? `${metadata.duration.toFixed(2)} sec` : '—'}</dd></div>
                    <div><dt>Source</dt><dd>GIF</dd></div>
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
                    <button key={title} className="tool-row" type="button" onClick={title === 'Resize' ? openResize : title === 'Crop' ? openCrop : title === 'Downsizing' ? openDownsize : title === 'Format Convert' ? openConvert : undefined}>
                      <span className="tool-icon"><Icon /></span>
                      <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
                      <span className="text-lg text-muted-foreground/50">›</span>
                    </button>
                  ))}
                </div>
                <div className="mx-5 mb-5 rounded-2xl bg-secondary p-4"><p className="flex items-center gap-2 text-xs font-semibold text-secondary-foreground"><LockKeyhole className="size-3.5 text-primary" /> Your file stays on this device</p></div>
              </>
            ) : activeTool === 'resize' ? (
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
            ) : activeTool === 'crop' ? (
              <>
                <div className="border-b border-border px-5 py-5 sm:px-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Crop tool</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Crop your GIF</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Choose a ratio and how the frame should be filled.</p>
                </div>
                <div className="crop-controls">
                  <fieldset>
                    <legend>Aspect ratio</legend>
                    <div className="ratio-grid">
                      {cropRatios.map((ratio) => (
                        <button key={ratio.label} className={cropRatio === ratio.label ? 'is-selected' : ''} type="button" onClick={() => setCropRatio(ratio.label)}>{ratio.label}</button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Fill method</legend>
                    <div className="mode-grid">
                      <button className={cropMode === 'cover' ? 'is-selected' : ''} type="button" onClick={() => setCropMode('cover')}>
                        <Maximize2 /><span><b>Fill frame</b><small>Zoom and crop edges</small></span>
                      </button>
                      <button className={cropMode === 'fill' ? 'is-selected' : ''} type="button" onClick={() => setCropMode('fill')}>
                        <Sparkles /><span><b>Solid color</b><small>Keep the whole image</small></span>
                      </button>
                    </div>
                  </fieldset>
                  {cropMode === 'fill' && (
                    <label className="color-field">
                      <span>Background color</span>
                      <span><input type="color" value={cropColor} onChange={(event) => setCropColor(event.target.value)} /><output>{cropColor.toUpperCase()}</output></span>
                    </label>
                  )}
                  <div className="crop-note">
                    <Crop /><p><b>Centered crop</b><span>The subject stays centered in every frame.</span></p>
                  </div>
                  {cropError && <p className="text-sm font-semibold text-destructive" role="alert">{cropError}</p>}
                </div>
                <div className="panel-actions">
                  <Button variant="outline" size="lg" className="h-11 flex-1" disabled={isCropping} onClick={() => setActiveTool('tools')}><ArrowLeft /> Back</Button>
                  <Button size="lg" className="h-11 flex-1 font-bold" disabled={isCropping || !metadata} onClick={runCrop}>
                    {isCropping ? <><LoaderCircle className="animate-spin" /> Processing</> : <>Go!</>}
                  </Button>
                </div>
              </>
            ) : activeTool === 'downsize' ? (
              <>
                <div className="border-b border-border px-5 py-5 sm:px-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Downsizing tool</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Make your GIF lighter</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Check one or more reduction methods.</p>
                </div>
                <div className="downsize-controls">
                  <div className={`method-card ${reduceSize ? 'is-selected' : ''}`}>
                    <label><Checkbox checked={reduceSize} onCheckedChange={(checked) => setReduceSize(Boolean(checked))} /><span><b>Size reduction</b><small>Scale width and height together</small></span></label>
                    {reduceSize && (
                      <div className="method-settings">
                        <div><span>Scale</span><output>{sizePercent}%</output></div>
                        <Slider min={10} max={90} step={5} value={[sizePercent]} onValueChange={(value) => setSizePercent(Array.isArray(value) ? value[0] : value)} />
                        <small>{metadata ? `${Math.round(metadata.width * sizePercent / 100)} × ${Math.round(metadata.height * sizePercent / 100)} px` : ''}</small>
                      </div>
                    )}
                  </div>

                  <div className={`method-card ${removeFrames ? 'is-selected' : ''}`}>
                    <label><Checkbox checked={removeFrames} onCheckedChange={(checked) => setRemoveFrames(Boolean(checked))} /><span><b>Frame deletion</b><small>Keep every Nth frame</small></span></label>
                    {removeFrames && (
                      <div className="method-settings">
                        <div><span>Keep interval</span><output>1 / {frameStep}</output></div>
                        <Slider min={2} max={5} step={1} value={[frameStep]} onValueChange={(value) => setFrameStep(Array.isArray(value) ? value[0] : value)} />
                        <small>Playback duration is preserved</small>
                      </div>
                    )}
                  </div>

                  <div className={`method-card ${reduceColors ? 'is-selected' : ''}`}>
                    <label><Checkbox checked={reduceColors} onCheckedChange={(checked) => setReduceColors(Boolean(checked))} /><span><b>Lower resolution</b><small>Reduce the GIF color palette</small></span></label>
                    {reduceColors && (
                      <div className="palette-options">
                        {[32, 64, 128].map((colors) => <button key={colors} type="button" className={colorCount === colors ? 'is-selected' : ''} onClick={() => setColorCount(colors)}>{colors} colors</button>)}
                      </div>
                    )}
                  </div>

                  {!reduceSize && !removeFrames && !reduceColors && <p className="method-warning">Select at least one method.</p>}
                  {downsizeError && <p className="text-sm font-semibold text-destructive" role="alert">{downsizeError}</p>}
                </div>
                <div className="panel-actions">
                  <Button variant="outline" size="lg" className="h-11 flex-1" disabled={isDownsizing} onClick={() => setActiveTool('tools')}><ArrowLeft /> Back</Button>
                  <Button size="lg" className="h-11 flex-1 font-bold" disabled={isDownsizing || !metadata || (!reduceSize && !removeFrames && !reduceColors)} onClick={runDownsize}>
                    {isDownsizing ? <><LoaderCircle className="animate-spin" /> Processing</> : <>Go!</>}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border px-5 py-5 sm:px-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Format convert</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Convert your GIF</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Choose MP4 animation or a JPG still image.</p>
                </div>
                <div className="convert-controls">
                  <div className="format-grid">
                    <button type="button" className={convertFormat === 'mp4' ? 'is-selected' : ''} onClick={() => setConvertFormat('mp4')}>
                      <Video /><span><b>MP4</b><small>Keep the animation</small></span>
                    </button>
                    <button type="button" className={convertFormat === 'jpg' ? 'is-selected' : ''} onClick={() => setConvertFormat('jpg')}>
                      <ImageIcon /><span><b>JPG</b><small>Export the first frame</small></span>
                    </button>
                  </div>
                  {convertFormat === 'jpg' ? (
                    <div className="method-settings convert-quality">
                      <div><span>JPG quality</span><output>{jpgQuality}%</output></div>
                      <Slider min={40} max={100} step={5} value={[jpgQuality]} onValueChange={(value) => setJpgQuality(Array.isArray(value) ? value[0] : value)} />
                      <small>Transparent areas are filled with white.</small>
                    </div>
                  ) : (
                    <div className="convert-note">
                      <Video /><p><b>Browser-based MP4 conversion</b><span>The converter loads locally and your GIF is never uploaded.</span></p>
                    </div>
                  )}
                  {isConverting && (
                    <div className="convert-progress" aria-live="polite">
                      <span><b>Converting</b><output>{convertProgress}%</output></span>
                      <div><i style={{ width: `${convertProgress}%` }} /></div>
                      <small>{convertFormat === 'mp4' ? 'The first MP4 conversion may take a moment.' : 'Creating JPG image…'}</small>
                    </div>
                  )}
                  {convertError && <p className="text-sm font-semibold text-destructive" role="alert">{convertError}</p>}
                </div>
                <div className="panel-actions">
                  <Button variant="outline" size="lg" className="h-11 flex-1" disabled={isConverting} onClick={() => setActiveTool('tools')}><ArrowLeft /> Back</Button>
                  <Button size="lg" className="h-11 flex-1 font-bold" disabled={isConverting || !metadata} onClick={runConvert}>
                    {isConverting ? <><LoaderCircle className="animate-spin" /> Processing</> : <>Go!</>}
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
