// Kis DOM-segédek: elemek létrehozása innerHTML nélkül (így a beírt szöveg sosem lesz kód).

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        // a CSS-változókat (--valami) csak setProperty-vel lehet beállítani
        for (const [sk, sv] of Object.entries(v)) {
          if (sv === null || sv === undefined) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
          else el.style[sk] = sv;
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

/** Mint az Element.append, de a null / undefined / false elemeket kihagyja (nem írja ki „null”-ként). */
export function add(el, ...kids) { append(el, kids); return el; }

function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

// ---------- rövid értesítés ----------

let toastTimer = null;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  el.className = 'toast show ' + kind;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + kind; }, kind === 'error' ? 5000 : 2200);
}

// ---------- saját párbeszédablak (nem a böngésző confirm/alert ablaka) ----------

export function modal({ title, body, actions, onClose }) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      title && h('h2', { class: 'modal-title' }, title),
      body && h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-actions' },
        (actions || [{ label: 'Rendben' }]).map((a) => h('button', {
          class: 'btn ' + (a.kind || 'secondary'),
          onclick: async () => { if (a.onClick) { const keep = await a.onClick(); if (keep === true) return; } close(); },
        }, a.label)),
      ),
    ),
  );
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  const first = overlay.querySelector('input, textarea, select');
  if (first) first.focus();
  return close;
}

export function confirmModal(title, text, yesLabel = 'Igen') {
  return new Promise((resolve) => {
    let answer = false;
    modal({
      title,
      body: typeof text === 'string' ? h('p', null, text) : text,
      actions: [
        { label: 'Mégse', kind: 'secondary' },
        { label: yesLabel, kind: 'primary', onClick: () => { answer = true; } },
      ],
      onClose: () => resolve(answer),
    });
  });
}
