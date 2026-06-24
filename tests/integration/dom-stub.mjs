// Minimal DOM stub sufficient to mount the merchant view (Issue #97).
//
// The real UI runs in a browser; for a headless smoke/integration test we only
// need enough of the DOM API for mountApp(), the metrics dashboard, and the
// event log to render. This stub implements element creation, attribute and
// class handling, child management, querySelector by id/class, textContent,
// innerHTML (parsed into child <div>/<span> nodes for stat extraction), and a
// no-op event-listener API.

class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }
  add(...names) {
    for (const n of names) this.set.add(n);
    this.el.className = [...this.set].join(' ');
  }
  contains(name) {
    return this.set.has(name);
  }
}

let idSeq = 0;

class StubElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.classList = new ClassList(this);
    this._className = '';
    this.textContent = '';
    this.hidden = false;
    this.id = '';
    this.value = '';
    this.type = '';
    this._listeners = {};
    this.__uid = idSeq++;
  }

  get className() {
    return this._className;
  }
  set className(v) {
    this._className = v;
    this.classList.set = new Set(v.split(/\s+/).filter(Boolean));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
    }
  }

  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  dispatch(type) {
    for (const fn of this._listeners[type] || []) fn({ target: this });
  }

  // Very small innerHTML parser: only handles the dashboard's stat-card markup
  // produced by renderStatsHtml() — nested <div>/<span> with id + text.
  set innerHTML(html) {
    this.children = [];
    if (!html) {
      this._innerHTML = '';
      return;
    }
    this._innerHTML = html;
    const tagRe = /<(\w+)([^>]*)>([^<]*)<\/\1>|<(\w+)([^>]*)>/g;
    // Parse a flat-ish structure good enough for stat extraction: collect every
    // element with an id and its inner text.
    const idTextRe = /id="([^"]+)"[^>]*>([^<]*)</g;
    let m;
    while ((m = idTextRe.exec(html)) !== null) {
      const el = new StubElement('span');
      el.id = m[1];
      el.textContent = m[2];
      this.appendChild(el);
    }
    void tagRe;
  }
  get innerHTML() {
    return this._innerHTML || '';
  }

  _walk(cb) {
    for (const c of this.children) {
      cb(c);
      c._walk(cb);
    }
  }

  querySelector(sel) {
    let found = null;
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      this._walk((el) => {
        if (!found && el.id === id) found = el;
      });
    } else if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      this._walk((el) => {
        if (!found && el.classList.contains(cls)) found = el;
      });
    }
    return found;
  }

  querySelectorAll(sel) {
    const out = [];
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      this._walk((el) => {
        if (el.classList.contains(cls)) out.push(el);
      });
    } else {
      const tag = sel.toUpperCase();
      this._walk((el) => {
        if (el.tagName === tag) out.push(el);
      });
    }
    return out;
  }
}

export function createDocument() {
  const doc = {
    createElement: (tag) => new StubElement(tag),
    readyState: 'complete',
    addEventListener: () => {},
  };
  return doc;
}

export { StubElement };
