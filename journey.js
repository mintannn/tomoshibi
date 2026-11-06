// The four steps of using Tomoshibi, shown at the top of every page so a person always
// knows where they are and which thing is in their hand at that moment.
//   journey('lend', ['choose'])  ->  step 2 is current, step 1 is done
'use strict'
;(function () {
  const ICON = {
    pc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    ledger: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8c1.6 2 2.6 3.3 2.6 4.8a2.6 2.6 0 1 1-5.2 0C9.4 11.300 10.4 10 12 8z" fill="currentColor"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  }
  const STEPS = [
    { k: 'choose', t: 'Choose a tool', s: 'See which AI tools the people you know really use.', on: 'On your computer', icon: 'pc', href: 'index.html' },
    { k: 'lend', t: 'Lend it a key', s: 'Plug in your Ledger. Read the range, hold the button.', on: 'On your Ledger', icon: 'ledger', href: 'gate.html' },
    { k: 'work', t: 'Let it work', s: 'It uses the key without holding it. You are asked only when it matters.', on: 'Ledger stays on your desk', icon: 'ledger', href: 'gate.html' },
    { k: 'light', t: 'Your light goes on', s: 'One real person, really using it. The next person sees it in step 1.', on: 'On your phone · World', icon: 'phone', href: 'gate.html' },
  ]
  // Keep ?broker= and ?agent= when moving between pages.
  const keep = () => { const q = new URLSearchParams(location.search), o = new URLSearchParams(); for (const k of ['broker', 'agent', 'bridge']) if (q.get(k)) o.set(k, q.get(k)); const s = o.toString(); return s ? '?' + s : '' }
  window.journey = function (current, done = []) {
    const el = document.getElementById('journey'); if (!el) return
    el.innerHTML = STEPS.map((x, i) => {
      const cls = x.k === current ? 'cur' : done.includes(x.k) ? 'done' : ''
      return `<li class="${cls}"><a href="${x.href}${keep()}" ${x.k === current ? 'aria-current="step"' : ''}>
        <span class="jn">${done.includes(x.k) && x.k !== current ? '✓' : i + 1}</span>
        <span class="jt"><b>${x.t}</b><span>${x.s}</span></span>
        <span class="jon">${ICON[x.icon]}${x.on}</span></a></li>`
    }).join('')
  }
  window.journeyKeep = keep
})()
