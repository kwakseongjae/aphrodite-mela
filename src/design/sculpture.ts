/** Decorative artwork, never the source of task/approval state. */
export const sculptureStates = [
  ['idle', '기본'], ['welcome', '환영'], ['assembling', '조립 중'],
  ['get-vibe', 'Get Vibe'], ['awaiting-review', '사용자 승인 대기'],
  ['success', '작업 성공'], ['recoverable-error', '복구 가능한 오류'], ['export', '내보내기'],
] as const;
export type SculptureState = typeof sculptureStates[number][0];
export const sculptureAssetRoot = '/brand/sculpture-v2';
export function sculptureImage(state: SculptureState): string {
  return `${sculptureAssetRoot}/${state}.png`;
}
