import { describe, expect, it } from 'vitest';

// Trivial smoke test: proves the Vitest harness is wired up correctly and the
// suite exits 0 on a clean checkout. Real component/integration tests are added
// in the dependent test-authoring slices.
describe('vitest harness smoke test', () => {
  it('runs basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  it('has a jsdom DOM environment available', () => {
    // If the jsdom environment is configured correctly, `document` exists and
    // we can create/query elements.
    const el = document.createElement('div');
    el.textContent = 'hello';
    document.body.appendChild(el);

    expect(document.body.contains(el)).toBe(true);
    expect(el.textContent).toBe('hello');
  });
});
