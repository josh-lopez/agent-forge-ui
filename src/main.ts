// Vite entry point for agent-forge-ui.
//
// The landing markup lives here (rendered into #app) rather than inline in
// index.html so the page goes through the Vite build. It reproduces the shipped
// static landing (issue #5) and pulls in the same styling (issue #6's
// style.css) so the rendered output is identical to the previous static page.
import '../style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <h1>Agent Forge</h1>
    <p>Agentic engineering in action: humans file issues, agents ship PRs.</p>
  `;
}
