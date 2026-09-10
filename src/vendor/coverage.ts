/** Single source of truth for official-library kind coverage. */
export const coverage = {
  mui: [
    'button','input','cards','tabs','table','notice','stats',
    'select','checkbox','switch','textarea','badge','avatar',
    'breadcrumb','pagination','progress','skeleton','accordion',
    'chips','slider','stepper','toggle',
  ],
  astryx: [
    'button','input','textarea','select','checkbox','switch',
    'cards','tabs','table','notice','stats','badge','avatar',
    'breadcrumb','pagination','progress','skeleton','accordion',
    'chips','slider','stepper','toggle',
  ],
  seed: [
    'button','input','textarea','select','checkbox','switch',
    'tabs','notice','badge','avatar','skeleton','accordion',
    'chips','slider','progress','toggle',
  ],
  shadcn: ['button'],
} as const;

export type CoverageProvider = keyof typeof coverage;
export type OfficialKind = (typeof coverage)[CoverageProvider][number];
