/// <reference types="vite/client" />

// Allow importing files as raw strings via Vite's `?raw` query suffix,
// e.g. `import html from '../../index.html?raw'`.
declare module '*?raw' {
  const content: string;
  export default content;
}
