// Unit tests for the front-end logic in src/app.ts (AC4).
// Runs under Vitest with the jsdom environment so DOM APIs are available.
import { describe, it, expect, beforeEach } from 'vitest';
import { HEADING, pageTitle, renderHeading } from '../app';

describe('pageTitle', () => {
  it('returns the canonical heading title', () => {
    expect(pageTitle()).toBe('Agent Forge');
  });

  it('honours a custom heading content override', () => {
    expect(pageTitle({ title: 'Custom', tagline: 'x' })).toBe('Custom');
  });
});

describe('renderHeading', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders an <h1> with the configured title', () => {
    renderHeading(container);
    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe(HEADING.title);
  });

  it('renders a <p> with the configured tagline', () => {
    renderHeading(container);
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe(HEADING.tagline);
  });

  it('returns the same container it was given', () => {
    expect(renderHeading(container)).toBe(container);
  });

  it('applies custom content when provided', () => {
    const content = { title: 'Hello', tagline: 'World' };
    renderHeading(container, content);
    expect(container.querySelector('h1')?.textContent).toBe('Hello');
    expect(container.querySelector('p')?.textContent).toBe('World');
  });
});
