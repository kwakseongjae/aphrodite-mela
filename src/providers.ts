import { coverage } from './vendor/coverage';
export const providers = {
  own: { name: 'Aphrodite · own patterns', source: 'Project-owned HTML/CSS', kinds: ['button','input','cards','tabs','table','calendar','stats','notice'] },
  mui: { name: 'MUI · official React', source: '@mui/material 9.4.0 · MIT', kinds: coverage.mui },
  astryx: { name: 'Astryx · official React', source: '@astryxdesign/core 0.5.4 · MIT · beta', kinds: coverage.astryx },
  seed: { name: 'SEED · official React', source: '@seed-design/react 2.4.1 · Apache-2.0', kinds: coverage.seed },
  shadcn: { name: 'shadcn · adapted open source', source: 'new-york Button source · MIT · Aphrodite token mapping', kinds: coverage.shadcn },
} as const;
export type Provider = keyof typeof providers;
export function supportsProvider(provider: string, kind: string): provider is Provider {
  return provider in providers && (provider === 'own' || (providers[provider as Provider].kinds as readonly string[]).includes(kind));
}
