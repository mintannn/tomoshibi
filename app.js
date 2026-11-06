// Shared by every page of the web app: the flame's faces, the tab bar, and "add to home screen".
'use strict'
;(function () {
  // The same small flame that lives on the Ledger, in colour. Its face says how things are.
  const FACE = {
    asleep: '<path d="M43 71 q6 5 12 0 M65 71 q6 5 12 0" fill="none" stroke="#1B1630" stroke-width="4" stroke-linecap="round"/><path d="M55 84 q5 3 10 0" fill="none" stroke="#1B1630" stroke-width="3.5" stroke-linecap="round"/><text x="92" y="34" font-size="20" font-weight="700" fill="#b9b3c9" font-family="ui-rounded,system-ui">z</text><text x="104" y="20" font-size="14" font-weight="700" fill="#d6d1e3" font-family="ui-rounded,system-ui">z</text>',
    awake: '<circle cx="49" cy="70" r="4.5" fill="#1B1630"/><circle cx="71" cy="70" r="4.5" fill="#1B1630"/><path d="M52 82 q8 6 16 0" fill="none" stroke="#1B1630" stroke-width="3.5" stroke-linecap="round"/>',
    alert: '<circle cx="48" cy="69" r="6.5" fill="#fff" stroke="#1B1630" stroke-width="3"/><circle cx="72" cy="69" r="6.5" fill="#fff" stroke="#1B1630" stroke-width="3"/><circle cx="49" cy="70" r="2.5" fill="#1B1630"/><circle cx="71" cy="70" r="2.5" fill="#1B1630"/><ellipse cx="60" cy="86" rx="4.5" ry="5.5" fill="#1B1630"/>',
    happy: '<path d="M43 71 q6 -8 12 0 M65 71 q6 -8 12 0" fill="none" stroke="#1B1630" stroke-width="4" stroke-linecap="round"/><path d="M49 80 q11 12 22 0 z" fill="#1B1630"/>',
    guard: '<path d="M40 60 l15 6 M80 60 l-15 6" stroke="#1B1630" stroke-width="4.5" stroke-linecap="round"/><circle cx="50" cy="72" r="4" fill="#1B1630"/><circle cx="70" cy="72" r="4" fill="#1B1630"/><path d="M52 86 h16" stroke="#1B1630" stroke-width="4" stroke-linecap="round"/>',
  }
  window.flameFace = (mood = 'awake') => `<svg viewBox="0 0 120 152" aria-hidden="true"><rect x="31" y="100" width="58" height="46" rx="19" fill="#27407a"/><path d="M60 8 C62.4 8 64 10.4 65 13 C71 27 92 49 92 70 A32 32 0 1 1 28 70 C28 49 49 27 55 13 C56 10.4 57.6 8 60 8 Z" fill="#F2600C"/><path d="M60 34 C61.6 34 62.7 35.6 63.4 37.4 C67 46 80 60 80 73 A20 20 0 1 1 40 73 C40 60 53 46 56.6 37.4 C57.3 35.6 58.4 34 60 34 Z" fill="#FFC24A"/>${FACE[mood] || FACE.awake}</svg>`

  const keep = (extra) => { const q = new URLSearchParams(location.search), o = new URLSearchParams(extra || ''); for (const k of ['broker', 'agent', 'bridge', 'pub']) if (q.get(k) && !o.get(k)) o.set(k, q.get(k)); const s = o.toString(); return s ? '?' + s : '' }
  window.appKeep = keep

  // Three tabs: your keys, what happened, whose lights.
  const ICON = {
    keys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/></svg>',
    record: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/></svg>',
    lights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c2 3.5 6 6.5 6 11a6 6 0 1 1-12 0c0-4.500 4-7.500 6-11z"/></svg>',
  }
  function tabs() {
    if (document.querySelector('.tabbar') || document.documentElement.dataset.tabs === 'off') return
    const here = location.pathname.split('/').pop() || 'index.html'
    let last = {}; try { last = JSON.parse(localStorage.getItem('tomoshibi.last') || '{}') } catch {}
    const rec = last.holder ? new URLSearchParams({ broker: last.broker || '', holder: last.holder, since: last.since || '' }).toString() : ''
    const t = [['gate.html', 'Keys', ICON.keys, keep()], ['morning.html', 'Record', ICON.record, rec ? '?' + rec : keep()], ['index.html', 'Lights', ICON.lights, keep()]]
    const nav = document.createElement('nav'); nav.className = 'tabbar'; nav.setAttribute('aria-label', 'Sections')
    nav.innerHTML = t.map(([href, name, icon, q]) => `<a href="${href}${q}" ${here === href ? 'aria-current="page"' : ''}>${icon}${name}</a>`).join('')
    document.body.appendChild(nav)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tabs); else tabs()

  // Lets a phone keep it on the home screen like an app. It caches nothing that could go stale: see sw.js.
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {})
})()
