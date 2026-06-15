// Small, framework-free helpers for the agent-forge-ui front-end.
//
// These functions are intentionally pure and DOM-light so they are easy to
// unit-test. `renderHeading` builds the page heading/tagline markup that the
// static `index.html` currently hard-codes, giving us a real piece of
// JavaScript logic to exercise from the test suite.

export interface HeadingContent {
  title: string;
  tagline: string;
}

/** The canonical heading content for the landing page. */
export const HEADING: HeadingContent = {
  title: 'Agent Forge',
  tagline: 'Agentic engineering in action: humans file issues, agents ship PRs.',
};

/**
 * Render the landing-page heading into the given container element.
 *
 * Returns the container so calls can be chained / asserted on.
 */
export function renderHeading(
  container: HTMLElement,
  content: HeadingContent = HEADING,
): HTMLElement {
  const h1 = document.createElement('h1');
  h1.textContent = content.title;

  const p = document.createElement('p');
  p.textContent = content.tagline;

  container.append(h1, p);
  return container;
}

/**
 * Build the document title used in the <title> element and page heading.
 * Kept separate so it is trivially unit-testable without a DOM.
 */
export function pageTitle(content: HeadingContent = HEADING): string {
  return content.title;
}
