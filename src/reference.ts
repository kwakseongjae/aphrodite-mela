import { makeBlock, uid, type Project, type Page, type HeroVariant, safeImage } from './model';
import {referenceDefaults} from './design/reference-defaults';

export type TextLine = { text: string; confidence: number; x: number; y: number; width: number; height: number };
export type ReferenceAnalysis = { engine: 'Apple Vision + pixels' | 'Pixels only'; warning: string; sourceFingerprint: string; width: number; height: number; lines: TextLine[]; palette: string[]; crop: string; cropBox: { x: number; y: number; width: number; height: number } | null; elapsedMs: number };
export const directions: { variant: HeroVariant; name: string; description: string }[] = [
  { variant: 'split', name: 'Editorial balance', description: 'Copy first. Image alongside. A familiar, clear introduction.' },
  { variant: 'image-left', name: 'Visual first', description: 'Lead with the image. Let the story follow.' },
  { variant: 'stacked', name: 'A bigger statement', description: 'Centered story. Full-width imagery. More room to breathe.' },
];
export function normalizeLines(input: unknown): TextLine[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is TextLine => v && typeof v.text === 'string' && v.text.length <= 2000 && ['confidence', 'x', 'y', 'width', 'height'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 1) && v.width > 0 && v.height > 0).slice(0, 200).sort((a, b) => a.y - b.y || a.x - b.x);
}
export function suggestCopy(lines: TextLine[], project: Project) {
  const usable = lines.filter(l => l.confidence >= .35 && l.y > .05 && l.y < .7 && l.text.trim().length > 3);
  const headline = [...usable].sort((a, b) => b.height - a.height)[0];
  if (!headline) return { title: project.name, text: project.brief || 'Describe what makes this project worth discovering.', label: 'Explore', eyebrow: 'YOUR NEXT CHAPTER' };
  const headlineLines = usable.filter(l => l.height >= headline.height * .72 && Math.abs(l.x - headline.x) < .12 && Math.abs(l.y - headline.y) < .16).sort((a, b) => a.y - b.y).slice(0, 3);
  const bottom = Math.max(...headlineLines.map(l => l.y + l.height));
  const body = usable.filter(l => l.y >= bottom && l.y < bottom + .16 && l.height < headline.height * .65 && Math.abs(l.x - headline.x) < .1 && l.text.length > 25).slice(0, 3);
  return { title: headlineLines.map(l => l.text).join('\n'), text: body.map(l => l.text).join('\n') || project.brief, label: 'Explore', eyebrow: 'A NEW PERSPECTIVE' };
}
export function composeDirections(project: Project, analysis: ReferenceAnalysis, copy: ReturnType<typeof suggestCopy>, useCrop: boolean): Page[] {
  return directions.map(direction => ({ id: uid(), name: direction.name,
    referenceEvidence: { engine: analysis.engine, sourceFingerprint: analysis.sourceFingerprint, textLines: analysis.lines.length, palette: analysis.palette, elapsedMs: analysis.elapsedMs, direction: direction.variant, mediaUsed: useCrop && !!analysis.crop },
    blocks: (['navigation', 'hero', 'features', 'cta', 'footer'] as const).map(kind => {
      const b = makeBlock(kind);
      if (kind === 'navigation') Object.assign(b, { title: project.name, text: 'Overview · Details · Contact', label: 'Explore', filled: true });
      if (kind === 'hero') Object.assign(b, copy, { variant: direction.variant, image: useCrop ? analysis.crop : '', filled: true });
      Object.assign(b, referenceDefaults[kind]);
      if (kind === 'footer') b.title = project.name;
      return b;
    }),
  }));
}
export async function analyzeReference(data: string): Promise<ReferenceAnalysis> {
  if (!safeImage(data)) throw new Error('유효한 래스터 레퍼런스가 필요합니다.');
  const start = performance.now();
  const image = new Image(); image.src = data; await image.decode();
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('이미지는 4천만 픽셀 이하여야 합니다.');
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = Math.max(1, Math.round(image.naturalHeight / image.naturalWidth * 160));
  if (canvas.height > 4000) throw new Error('이미지가 너무 깁니다. 첫 화면만 잘라 업로드해주세요.');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const histogram = new Map<string, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    const color = '#' + [pixels[i], pixels[i + 1], pixels[i + 2]].map(v => Math.min(255, Math.round(v / 24) * 24).toString(16).padStart(2, '0')).join('');
    histogram.set(color, (histogram.get(color) ?? 0) + 1);
  }
  const palette = [...histogram].sort((a, b) => b[1] - a[1]).slice(0, 6).map(v => v[0]);
  // Texture-based region proposal, deliberately not a semantic object detector.
  const regions = [{ x: .5, y: .07, width: .5, height: .42 }, { x: 0, y: .07, width: .5, height: .42 }, { x: .08, y: .35, width: .84, height: .35 }];
  const score = (r: typeof regions[number]) => {
    let changes = 0, n = 0;
    for (let y = Math.floor(r.y * canvas.height); y < (r.y + r.height) * canvas.height; y++) for (let x = Math.floor(r.x * 160) + 1; x < (r.x + r.width) * 160; x++) {
      const i = (y * 160 + x) * 4; const d = Math.abs(pixels[i] - pixels[i - 4]) + Math.abs(pixels[i + 1] - pixels[i - 3]) + Math.abs(pixels[i + 2] - pixels[i - 2]);
      if (d > 12 && d < 180) changes++; n++;
    }
    return changes / Math.max(1, n);
  };
  const region = [...regions].sort((a, b) => score(b) - score(a))[0];
  let crop = '', cropBox: ReferenceAnalysis['cropBox'] = null;
  if (score(region) > .12) {
    cropBox = region;
    const out = document.createElement('canvas'); out.width = Math.min(900, Math.round(image.naturalWidth * region.width)); out.height = Math.max(1, Math.round(out.width * image.naturalHeight * region.height / (image.naturalWidth * region.width)));
    out.getContext('2d')!.drawImage(image, region.x * image.naturalWidth, region.y * image.naturalHeight, region.width * image.naturalWidth, region.height * image.naturalHeight, 0, 0, out.width, out.height);
    crop = out.toDataURL('image/jpeg', .8);
  }
  let engine: ReferenceAnalysis['engine'] = 'Pixels only', lines: TextLine[] = [], warning = '브라우저에서는 색상·텍스처만 분석합니다. 문구는 프로젝트 설명에서 가져옵니다.';
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ lines: unknown }>('recognize_reference', { dataUrl: data });
      lines = normalizeLines(result.lines); engine = 'Apple Vision + pixels'; warning = lines.length ? 'OCR 문구와 영역 추정은 틀릴 수 있습니다. 선택 전에 확인해주세요.' : '읽을 수 있는 문구가 없습니다. 프로젝트 설명을 사용합니다.';
    } catch { warning = '네이티브 OCR을 완료하지 못했습니다. 색상·텍스처 분석만 사용합니다.'; }
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const sourceFingerprint = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  return { engine, warning, sourceFingerprint, width: image.naturalWidth, height: image.naturalHeight, lines, palette, crop, cropBox, elapsedMs: Math.round(performance.now() - start) };
}
