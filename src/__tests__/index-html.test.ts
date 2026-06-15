// Structural tests for the root index.html (AC3).
// The HTML is imported as a raw string via Vite's `?raw` loader (so the test
// reads the same file Vite serves) and parsed with jsdom's DOMParser, letting
// us assert against the real DOM the browser would build.
import { describe, it, expect, beforeAll } from 'vitest';
import indexHtml from '../../index.html?raw';

describe('index.html structure', () => {
  let doc: Document;

  beforeAll(() => {
    doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  });

  it('declares the HTML5 doctype', () => {
    expect(indexHtml.trimStart().toLowerCase()).toMatch(/^<!doctype html>/);
  });

  it('sets the document language to English', () => {
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
  });

  it('has a non-empty <title>', () => {
    const title = doc.querySelector('title');
    expect(title).not.toBeNull();
    expect(title?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('declares a UTF-8 charset', () => {
    expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toMatch(
      /utf-8/i,
    );
  });

  it('includes a responsive viewport meta tag', () => {
    const viewport = doc.querySelector('meta[name="viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport?.getAttribute('content')).toContain('width=device-width');
  });

  it('links the global stylesheet', () => {
    const link = doc.querySelector('link[rel="stylesheet"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('style.css');
  });

  it('renders a root <h1> heading inside <body>', () => {
    const h1 = doc.querySelector('body h1');
    expect(h1).not.toBeNull();
    expect(h1?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
