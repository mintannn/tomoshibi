// Screen A — the sky. Each light is an AI tool (a skill).
// "Everyone" shows what a star count shows: a crowded sky you cannot read.
// "People I know" keeps only the tools that someone you know has lit.
//
// What comes from where:
//   - which pseudonyms lit which version  -> the Broker  (GET /stars/:skill?version=)
//   - who those pseudonyms are to you     -> this browser only (localStorage)
//   - the crowd of anonymous stars        -> drawn here, to show what a bought sky looks like
'use strict'

const $ = (id) => document.getElementById(id)
const qs = new URLSearchParams(location.search)
const BROKER = (qs.get('broker') || localStorage.getItem('tomoshibi.broker') || 'http://127.0.0.1:8787').replace(/\/$/, '')
// The bridge runs next to the Ledger (bridge/bridge.py). Without it, the Ledger step is skipped and said so.
const BRIDGE = (qs.get('bridge') || localStorage.getItem('tomoshibi.bridge') || 'http://127.0.0.1:8791').replace(/\/$/, '')

// The tools on show. `skill` is the id the Broker keys lights by.
const CATALOG = [
  // The tool the gate page (gate.html) drives. Its id is keccak256 of the demo tool's address.
  { name: 'billing-assistant', about: 'Charges your customers for you.',
    skill: '0x7fceb9cb096b5fe6215d6c43a4e81c6bb6eb88036c1ebeee400a61d521bf5e23', version: '1.0.0',
    key: 'STRIPE_SECRET', target: 'api.stripe.com', scope: 'POST /v1/charges', rating: 4.6, reviews: 212, x: .36, y: .44 },
  { name: 'invoice-bot', about: 'Creates and sends invoices for you.',
    skill: '0x' + 'b1'.repeat(32), version: '2.3.0',
    key: 'STRIPE_SECRET', target: 'api.stripe.com', scope: 'POST /v1/invoices', rating: 4.9, reviews: 1284, x: .68, y: .30 },
  { name: 'calendar-sync', about: 'Keeps two calendars in step.',
    skill: '0x' + 'c2'.repeat(32), version: '0.9.2',
    key: 'GOOGLE_TOKEN', target: 'www.googleapis.com', scope: 'GET /calendar/v3', rating: 4.8, reviews: 903, x: .57, y: .62 },
]
const CROWD = 1284

// Shown only when the Broker cannot be reached, and labelled as sample data on screen.
const SAMPLE = {
  people: [{ name: 'Arjun', id: '0xsample_arjun', tie: 'met' }],
  stars: { 'billing-assistant': { who: ['0xsample_arjun', '0xsample_other'], byVersion: { '1.0.0': 2 } } },
}

// ---------- local state (never leaves this browser) ----------
const store = {
  get people() { try { return JSON.parse(localStorage.getItem('tomoshibi.people') || '[]') } catch { return [] } },
  set people(v) { try { localStorage.setItem('tomoshibi.people', JSON.stringify(v)) } catch {} },
  get permits() { try { return JSON.parse(localStorage.getItem('tomoshibi.permits') || '{}') } catch { return {} } },
  set permits(v) { try { localStorage.setItem('tomoshibi.permits', JSON.stringify(v)) } catch {} },
  get versions() { try { return JSON.parse(localStorage.getItem('tomoshibi.versions') || '{}') } catch { return {} } },
  set versions(v) { try { localStorage.setItem('tomoshibi.versions', JSON.stringify(v)) } catch {} },
}
const TIES = { me: 'you', met: 'met in person', know: 'know of' }

let mode = 'all'          // 'all' | 'mine'
let live = null           // null = unknown, true = Broker answered, false = sample data
let health = null
let selected = null
let flowing = false       // true while the lighting steps are on screen
const lastNote = {}       // name -> the last message of the lighting steps, kept across redraws
const stars = {}          // name -> { who: [], count, byVersion: {} }

const versionOf = (s) => store.versions[s.name] || s.version
const people = () => (live === false ? SAMPLE.people : store.people)
const whoIs = (id) => people().find((p) => p.id === id)

/** People you know who have lit this version, and how many others have. */
function litBy(s) {
  const st = stars[s.name] || { who: [], count: 0, byVersion: {} }
  const known = st.who.map(whoIs).filter(Boolean)
  return { known, others: Math.max(0, (st.who.length || st.count || 0) - known.length), st }
}
/** Lights on an older version that are gone now that the tool changed. */
function wentOut(s) {
  const st = stars[s.name]
  if (!st) return 0
  const v = versionOf(s)
  return Object.entries(st.byVersion || {}).filter(([ver]) => ver !== v).reduce((n, [, c]) => n + c, 0)
}

// ---------- Broker ----------
async function get(path) {
  const r = await fetch(BROKER + path, { cache: 'no-store' })
  return r.json()
}
async function post(path, body) {
  // Sent as plain text on purpose: a JSON content type makes the browser ask the Broker
  // for permission first (a CORS preflight). The Broker reads the body as JSON either way.
  const r = await fetch(BROKER + path, { method: 'POST', body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
async function refresh() {
  try {
    health = await get('/health')
    await Promise.all(CATALOG.map(async (s) => {
      const r = await get(`/stars/${s.skill}?version=${encodeURIComponent(versionOf(s))}`)
      stars[s.name] = { who: r.who || [], count: r.stars || 0, byVersion: r.byVersion || {}, noWho: r.who === undefined }
    }))
    live = true
  } catch {
    live = false
    for (const s of CATALOG) {
      const sample = SAMPLE.stars[s.name]
      const current = versionOf(s) === s.version
      stars[s.name] = sample
        ? { who: current ? sample.who : [], count: current ? sample.who.length : 0, byVersion: sample.byVersion }
        : { who: [], count: 0, byVersion: {} }
    }
  }
  // While someone is in the middle of lighting, leave the sheet alone: redrawing it would wipe the step they are on.
  paintStatus(); paintCaption(); if (selected && !flowing) paintSheet()
}
function paintStatus() {
  const el = $('status')
  if (live === false) { el.textContent = 'Broker not reachable · sample data'; el.className = 'chip warn'; return }
  const sim = health && (health.zg?.simulated || health.world?.simulated)
  el.textContent = sim ? 'Broker · simulated mode' : 'Broker · live'
  el.className = 'chip ' + (sim ? 'warn' : 'live')
}

// ---------- the sky ----------
const cv = $('sky'), cx = cv.getContext('2d')
let W = 0, H = 0, dpr = 1
const rnd = (s) => { const x = Math.sin(s * 999.13) * 43758.5453; return x - Math.floor(x) }
const crowd = Array.from({ length: CROWD }, (_, i) => ({ x: rnd(i + 1), y: rnd(i + 2000) * 0.9 + 0.03, r: 0.5 + rnd(i + 4000) * 1.3, a: 0, ph: rnd(i + 6000) * 6.28, d: rnd(i + 8000) }))
const lights = CATALOG.map((s) => ({ s, cold: 0, warm: 0, gone: 0 }))
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
function size() { dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr }
addEventListener('resize', size)
const ease = (v, to, k) => (reduce ? to : v + (to - v) * k)

function flamePath(x, y, w, h, lean) {
  cx.beginPath()
  for (let i = 0; i <= 60; i++) {
    const t = (2 * Math.PI * i) / 60
    const px = Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.6) * w
    const py = (Math.cos(t) + 1) / 2
    const X = x + px + lean * w * py * py, Y = y - py * h
    i ? cx.lineTo(X, Y) : cx.moveTo(X, Y)
  }
  cx.closePath()
}
function label(text, x, y, a, sub) {
  cx.textAlign = 'center'
  cx.fillStyle = `rgba(233,237,249,${a})`
  cx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  cx.fillText(text, x, y)
  if (sub) { cx.fillStyle = `rgba(142,152,189,${a})`; cx.font = '12px ui-sans-serif, system-ui, sans-serif'; cx.fillText(sub, x, y + 16) }
}
function frame(t) {
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H)
  const all = mode === 'all'
  for (const c of crowd) {
    c.a = ease(c.a, all ? 0.75 : 0, all ? 0.06 : 0.14 + c.d * 0.2)   // gone in about 0.6s
    if (c.a < 0.01) continue
    const tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t / 500 + c.ph)
    cx.fillStyle = `rgba(200,212,255,${c.a * tw})`
    cx.beginPath(); cx.arc(c.x * W, c.y * H, c.r, 0, 6.3); cx.fill()
  }
  for (const L of lights) {
    const { known } = litBy(L.s)
    const lit = known.length > 0, out = !lit && wentOut(L.s) > 0
    // In "Everyone" every tool looks the same: a cold star with a rating. Whose it is only shows in "People I know".
    L.warm = ease(L.warm, lit && !all ? 1 : 0, lit && !all ? 0.08 : 0.12)
    L.cold = ease(L.cold, all ? 1 : 0, 0.12)
    L.gone = ease(L.gone, out && !all ? 1 : 0, 0.05)
    const x = L.s.x * W, y = L.s.y * H
    if (L.cold > 0.01) {
      const g = cx.createRadialGradient(x, y, 0, x, y, 20)
      g.addColorStop(0, `rgba(220,228,255,${0.9 * L.cold})`); g.addColorStop(1, 'rgba(220,228,255,0)')
      cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, 20, 0, 6.3); cx.fill()
      label(L.s.name, x, y + 34, L.cold, `★ ${L.s.rating} · ${L.s.reviews.toLocaleString()} reviews`)
    }
    if (L.gone > 0.01 && L.warm < 0.5) {
      cx.strokeStyle = `rgba(142,152,189,${0.7 * L.gone})`; cx.lineWidth = 1.5
      cx.beginPath()
      for (let i = 0; i < 16; i++) { const X = x + 5 * Math.sin(i / 2.6 + t / 900), Y = y - i * 3.2; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y) }
      cx.stroke()
      label(L.s.name, x, y + 22, L.gone, 'the light went out')
    }
    if (L.warm > 0.01) {
      const lean = reduce ? 0 : 0.06 * Math.sin(t / 420 + L.s.x * 9)
      const g = cx.createRadialGradient(x, y - 14, 0, x, y - 14, 46)
      g.addColorStop(0, `rgba(240,167,59,${0.45 * L.warm})`); g.addColorStop(1, 'rgba(240,167,59,0)')
      cx.fillStyle = g; cx.beginPath(); cx.arc(x, y - 14, 46, 0, 6.3); cx.fill()
      cx.fillStyle = `rgba(240,167,59,${L.warm})`; flamePath(x, y, 26, 40, lean); cx.fill()
      cx.fillStyle = `rgba(255,217,138,${L.warm})`; flamePath(x, y - 2, 13, 20, lean); cx.fill()
      label(L.s.name, x, y + 24, L.warm, known.map((p) => p.name).join(', '))
    }
  }
  requestAnimationFrame(frame)
}
cv.addEventListener('click', (e) => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
  let best = null, bd = 60
  for (const L of lights) {
    if (L.cold < 0.3 && L.warm < 0.3 && L.gone < 0.3) continue
    const d = Math.hypot(x - L.s.x * W, y - L.s.y * H); if (d < bd) { bd = d; best = L.s }
  }
  if (best) { selected = best; paintSheet(); $('sheet').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }) }
})

function setMode(m) {
  mode = m
  $('tAll').setAttribute('aria-pressed', m === 'all'); $('tMine').setAttribute('aria-pressed', m === 'mine')
  paintCaption()
}
$('tAll').onclick = () => setMode('all'); $('tMine').onclick = () => setMode('mine')

function paintCaption() {
  const lit = CATALOG.filter((s) => litBy(s).known.length).length
  if (mode === 'all') {
    $('capTitle').textContent = `${CROWD.toLocaleString()} tools. Every one has stars.`
    $('capSub').textContent = 'A star costs a fraction of a cent to fake. You cannot tell whose they are.'
  } else {
    $('capTitle').textContent = lit ? `${lit === 1 ? 'One light' : lit + ' lights'}. Lit by someone you know.` : 'No one you know has lit anything yet.'
    $('capSub').textContent = lit ? 'A light stays on only while that person is still using this exact version.' : 'Add the people you have met below. Their lights will show here.'
  }
}

// ---------- detail sheet ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function paintSheet() {
  const s = selected, el = $('sheet'); if (!s) { el.hidden = true; return }
  const { known, others, st } = litBy(s), v = versionOf(s), gone = wentOut(s)
  const who = known.length
    ? known.map((p) => `<b>${esc(p.name)}</b> (${TIES[p.tie] || p.tie})`).join(', ') + (others ? ` and ${others} you don't know` : '')
    : st.who.length || st.count ? `${st.who.length || st.count} ${(st.who.length || st.count) === 1 ? 'person' : 'people'}, none you know` : 'No one yet'
  const human = (st.who.length || st.count) > 0
  // A permit this browser received from the Ledger for this exact version, by someone whose light is on.
  const mine = store.permits[s.name + '@' + v]
  const pressedHere = Boolean(mine && known.some((p) => p.tie === 'me'))
  const sim = health?.world?.simulated
  el.hidden = false
  el.innerHTML = `
    <div><h2>${esc(s.name)}</h2><p class="sub">${esc(s.about)}</p></div>
    ${gone && !human ? `<p class="note warn"><b>The light went out.</b> ${esc(s.name)} changed after it was lit: ${gone} ${gone === 1 ? 'light was' : 'lights were'} on an older version. A light belongs to one exact version, so it does not carry over.</p>` : ''}
    <dl class="rows">
      <dt>Who</dt><dd>${who}</dd>
      <dt>What it gets</dt><dd>${esc(s.key)} → ${esc(s.target)}, ${esc(s.scope)}</dd>
      <dt>Version</dt><dd>${esc(v)}</dd>
    </dl>
    <div class="dots">
      <div class="dot ${human ? 'on' : ''}"><i></i>A real person <small>World${sim ? ' (simulated)' : ''}</small></div>
      <div class="dot ${st.pressed || pressedHere ? 'on' : ''}"><i></i>Pressed by hand <small>Ledger${pressedHere && !st.pressed ? ' · seen by this browser' : ''}</small></div>
      <div class="dot ${st.used ? 'on' : ''}"><i></i>Actually in use <small>0G record</small></div>
    </div>
    ${human && !st.pressed ? `<p class="note">The Broker checks the first one today. It does not yet tie a light to a Ledger approval or to recorded use${pressedHere ? '; the second dot is on only because this browser itself received the signed permit from your Ledger' : ', so those two stay dark here rather than pretending'}.</p>` : ''}
    ${st.noWho ? '<p class="note warn">This Broker reports how many lights, but not whose. Update the Broker to see people you know.</p>' : ''}
    <div class="actions">
      ${s.name === 'billing-assistant' ? `<a class="btn primary" href="gate.html${journeyKeep()}">Use this tool: lend it a key →</a>` : '<button class="btn" disabled>Not installed on this computer</button>'}
      <button class="btn" id="changeIt">Demo: the tool changes</button>
    </div>
    <div id="flow">${lastNote[s.name] || ''}</div>`
  $('changeIt').onclick = () => bump(s)
}

/** Step one of lighting: lend the key on the Ledger. The person reads the range on the
 *  device and holds the button; the signed permit comes back through the bridge. */
async function lend(s, flow) {
  let ready = false
  try { ready = (await (await fetch(BRIDGE + '/health', { cache: 'no-store' })).json()).ready } catch {}
  if (!ready) {
    flow.innerHTML = '<p class="note warn">No Ledger with Tomoshibi open was found on this machine, so the key was not lent from here. Going on to the person check only.</p>'
    return null
  }
  flow.innerHTML = '<p class="note"><b>Look at your Ledger.</b> Read what this tool is asking for, then hold the button. Nothing happens unless you do.</p>'
  const r = await fetch(BRIDGE + '/permit', { method: 'POST', body: JSON.stringify({
    skill: s.skill, version: versionOf(s), keyLabel: s.key, target: s.target, scope: s.scope,
    maxCalls: 3, expiry: Math.floor(Date.now() / 1000) + 24 * 3600, nonce: Date.now() }) })
  const b = await r.json()
  if (r.status !== 200) { flow.innerHTML = `<p class="note warn">${esc(b.error || 'The Ledger did not sign.')}</p>`; return false }
  store.permits = { ...store.permits, [s.name + '@' + versionOf(s)]: b }
  return b
}

/** Publishing a light: first the key is lent on the Ledger, then the Broker asks
 *  World, once, whether a real person is behind it. */
async function vouch(s) {
  if (flowing) return
  flowing = true
  try { await light(s) } catch (e) {
    if ($('flow')) $('flow').innerHTML = `<p class="note warn">Could not reach the Broker: ${esc(e.message || e)}. Nothing was lit.</p>`
  } finally { flowing = false }
  // Redraw with the new state, and keep the last message where the person can read it.
  lastNote[s.name] = $('flow') ? $('flow').innerHTML : ''
  await refresh(); paintSheet()
}
async function light(s) {
  const flow = $('flow')
  if (live !== true) { flow.innerHTML = '<p class="note warn">The Broker is not reachable, so nothing can be lit from here.</p>'; return }
  const lent = await lend(s, flow)
  if (lent === false) return            // declined on the device: stop here, nothing is lit
  await new Promise((r) => setTimeout(r, lent ? 600 : 2200))
  flow.innerHTML = '<p class="note">Asking World…</p>'
  const start = await post('/vouch/start', {})
  if (start.status !== 200) { flow.innerHTML = `<p class="note warn">World is not set up on this Broker: ${esc(start.body.error || start.status)}</p>`; return }
  const b = start.body
  flow.innerHTML = `<p class="note">Confirm on your own phone that you are a person. Nothing else is asked, and your name is not sent.</p>
    <p class="code">${esc(b.userCode)}</p><p class="sub">${esc(b.verificationUri || '')}</p>`
  const done = await post('/vouch/finish', { deviceCode: b.deviceCode, skill: s.skill, version: versionOf(s) })
  const o = done.body
  if (o.decision === 'STAR') {
    const list = store.people.filter((p) => p.id !== o.nullifier)
    list.push({ name: 'You', id: o.nullifier, tie: 'me' }); store.people = list; paintPeople()
    flow.innerHTML = '<p class="note">Lit. It stays on while you keep using this version, and goes out by itself if the tool changes.</p>'
  } else {
    const why = { human_denied: 'You said no on your phone. Nothing was lit.', proof_expired: 'No one confirmed in time. Nothing was lit.', ALREADY_VOUCHED: 'You have already lit this version.' }[o.reason] || o.message || o.reason
    flow.innerHTML = `<p class="note warn">${esc(why)}</p>`
  }
}

/** Demo control. In the product, the version is the hash of the tool's manifest
 *  and changes when the tool does. Here a button stands in for the tool's author. */
async function bump(s) {
  const v = versionOf(s).split('.'); v[v.length - 1] = String(Number(v[v.length - 1]) + 1)
  store.versions = { ...store.versions, [s.name]: v.join('.') }
  await refresh()
}

// ---------- people ----------
function paintPeople() {
  const list = store.people
  $('peopleCount').textContent = list.length
  $('people').innerHTML = list.length ? list.map((p, i) => `<div class="person"><span><b>${esc(p.name)}</b> · ${TIES[p.tie] || p.tie}<br><code>${esc(p.id)}</code></span><span></span><button class="btn" data-i="${i}">Remove</button></div>`).join('') : '<p class="sub">No one yet.</p>'
  $('people').querySelectorAll('button').forEach((b) => (b.onclick = () => { const l = store.people; l.splice(Number(b.dataset.i), 1); store.people = l; paintPeople(); paintCaption(); if (selected) paintSheet() }))
}
$('addPerson').addEventListener('submit', (e) => {
  e.preventDefault()
  const l = store.people.filter((p) => p.id !== $('pId').value.trim())
  l.push({ name: $('pName').value.trim(), id: $('pId').value.trim(), tie: $('pTie').value }); store.people = l
  $('pName').value = ''; $('pId').value = ''
  paintPeople(); paintCaption(); if (selected) paintSheet()
})

size(); paintPeople(); paintCaption(); requestAnimationFrame(frame)
refresh(); setInterval(refresh, 3000)

journey('choose', store.people.some((p) => p.tie === 'me') ? ['lend', 'work', 'light'] : [])
