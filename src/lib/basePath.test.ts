import { describe, it, expect } from 'vitest';
import { resolveBasePath } from './basePath';

describe('resolveBasePath', () => {
  it('falls back to "/" when value is undefined', () => {
    expect(resolveBasePath(undefined)).toBe('/');
  });

  it('falls back to "/" when value is null', () => {
    expect(resolveBasePath(null)).toBe('/');
  });

  it('falls back to "/" when value is an empty or whitespace string', () => {
    expect(resolveBasePath('')).toBe('/');
    expect(resolveBasePath('   ')).toBe('/');
  });

  it('passes through an already-normalised path unchanged', () => {
    expect(resolveBasePath('/agent-forge-ui/')).toBe('/agent-forge-ui/');
  });

  it('adds a leading slash when missing', () => {
    expect(resolveBasePath('agent-forge-ui/')).toBe('/agent-forge-ui/');
  });

  it('adds a trailing slash when missing', () => {
    expect(resolveBasePath('/agent-forge-ui')).toBe('/agent-forge-ui/');
  });

  it('adds both leading and trailing slashes when missing', () => {
    expect(resolveBasePath('agent-forge-ui')).toBe('/agent-forge-ui/');
  });

  it('trims surrounding whitespace before normalising', () => {
    expect(resolveBasePath('  /agent-forge-ui/  ')).toBe('/agent-forge-ui/');
  });
});
