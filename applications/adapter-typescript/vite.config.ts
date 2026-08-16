import { CliBuildConfig } from '../../presets/typescript/vite';

// The TypeScript compiler stays external. Inlining it produced a 9.9 MB bundle that this package also
// declared as a dependency — paid for twice, and downloaded in full on every cold `npx` of an adapter
// whose own code is a few kilobytes.
export default CliBuildConfig(['typescript']);
