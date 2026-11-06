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
const AGENT = (qs.get('agent') || 'http://127.0.0.1:8792').replace(/\/$/, '')
const BROKER = (qs.get('broker') || localStorage.getItem('tomoshibi.broker') || 'http://127.0.0.1:8787').replace(/\/$/, '')
// The bridge runs next to the Ledger (bridge/bridge.py). Without it, the Ledger step is skipped and said so.
const BRIDGE = (qs.get('bridge') || localStorage.getItem('tomoshibi.bridge') || 'http://127.0.0.1:8791').replace(/\/$/, '')

// The tools on show. `skill` is the id the Broker keys lights by.
const CATALOG = [
  // The tool the gate page (gate.html) drives. Its id is keccak256 of the demo tool's address.
  { name: 'billing-assistant', about: 'Charges your customers for you.',
    skill: '0x7fceb9cb096b5fe6215d6c43a4e81c6bb6eb88036c1ebeee400a61d521bf5e23', version: '1.0.0',
    key: 'stripe-live', target: 'api.stripe.com', scope: '* /v1', rating: 4.6, reviews: 212, x: .36, y: .44 },
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
  get used() { try { return JSON.parse(localStorage.getItem('tomoshibi.used') || '{}') } catch { return {} } },
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
    // A light that goes out because the tool changed takes a few seconds, so you see it happen.
    L.warm = ease(L.warm, lit && !all ? 1 : 0, lit && !all ? 0.08 : out ? 0.018 : 0.12)
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
  // What this computer saw on the keys page: the tool really worked with the key, lent by hand.
  const used = store.used[s.skill + '@' + v]
  const meLit = known.some((p) => p.tie === 'me')
  const pressedHere = Boolean(used?.byHand && meLit), usedHere = Boolean(used && meLit)
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
      <div class="dot ${st.used || usedHere ? 'on' : ''}"><i></i>Actually in use <small>0G record${usedHere && !st.used ? ' · seen by this browser' : ''}</small></div>
    </div>
    ${human && !st.pressed ? `<p class="note">The Broker checks the first one today. It does not yet tie a light to a Ledger approval or to recorded use${pressedHere ? '; the second dot is on only because this browser itself received the signed permit from your Ledger' : ', so those two stay dark here rather than pretending'}.</p>` : ''}
    ${st.noWho ? '<p class="note warn">This Broker reports how many lights, but not whose. Update the Broker to see people you know.</p>' : ''}
    <div class="actions">
      ${s.name !== 'billing-assistant' ? '<button class="btn" disabled>Not installed on this computer</button>'
        : used && !meLit ? '<button class="btn primary" id="lightIt">Show that I use this</button>'
        : `<a class="btn ${used ? '' : 'primary'}" href="gate.html${journeyKeep()}">${used ? 'Open your keys →' : 'Use this tool: lend it a key →'}</a>`}
      <button class="btn" id="changeIt">Demo: the tool changes</button>
    </div>
    <div id="flow">${lastNote[s.name] || ''}</div>`
  if ($('lightIt')) $('lightIt').onclick = () => vouch(s)
  $('changeIt').onclick = () => bump(s)
}

/** Publishing a light. The key was lent on the keys page; here the Broker asks World, once. */
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
// Naming yourself. One question, asked once, by World: are you one real person?
// Four steps, and three endings that are kept apart: confirmed, you said no, nobody answered.
// Saying no is a result, not an error. It goes on the record like everything else.
const WSTEPS = ['Ask World for a code', 'You confirm on your own phone', 'World’s signature is checked', 'Your light goes on']
function worldSteps(at, ending) {
  return `<ol class="wsteps">${WSTEPS.map((t, i) => `<li class="${i < at ? 'done' : i === at ? (ending ? 'end' : 'now') : ''}"><i></i>${esc(i === at && ending ? ending : t)}</li>`).join('')}</ol>`
}
async function light(s) {
  const flow = $('flow')
  if (live !== true) { flow.innerHTML = '<p class="note warn">The Broker is not reachable, so nothing can be lit from here.</p>'; return }
  flow.innerHTML = worldSteps(0)
  const start = await post('/vouch/start', {})
  if (start.status !== 200) { flow.innerHTML = worldSteps(0, 'World is not set up on this Broker') + `<p class="note">${esc(start.body.error || start.status)}. Nothing was lit, and nothing is pretended.</p>`; return }
  const b = start.body
  // The code is the main thing; the QR helps only if World gave a complete link.
  const uri = String(b.verificationUri || ''), real = /^https:\/\/\S+$/.test(uri) && !b.simulated
  const until = Date.now() + (Number(b.expiresIn) || 600) * 1000
  const left = () => { const m = Math.max(0, Math.ceil((until - Date.now()) / 60000)); return `${m} minute${m === 1 ? '' : 's'} left` }
  flow.innerHTML = worldSteps(1) + `<div class="worldrow">${real && typeof qrSvg === 'function' ? `<div class="qrbox">${qrSvg(uri, 132)}</div>` : ''}
      <div><p class="code">${esc(b.userCode)}</p><p class="sub">${b.simulated ? 'Simulated: no phone is asked.' : esc(uri)}</p><p class="sub" id="wleft">${left()}</p></div></div>
    <p class="note">World learns that you are a person, and the same person as before. It does not learn which tool you are lighting, which key, or when you use it.</p>`
  const tick = setInterval(() => { const el = $('wleft'); if (el) el.textContent = left(); else clearInterval(tick) }, 15000)
  // Only the person who lent the key may light it. The agent on this computer adds the Permit that
  // was signed on the Ledger; this page never holds that signature. With no agent, the Broker is asked
  // without it and decides for itself.
  let o = null
  if (s.name === 'billing-assistant') try {
    const h = await (await fetch(AGENT + '/health', { signal: AbortSignal.timeout(2000) })).json()
    if (h.lent) o = await (await fetch(AGENT + '/vouch/finish', { method: 'POST', body: JSON.stringify({ deviceCode: b.deviceCode }) })).json()
  } catch {}
  if (!o) o = (await post('/vouch/finish', { deviceCode: b.deviceCode, skill: s.skill, version: versionOf(s) })).body
  clearInterval(tick)
  if (o.decision === 'STAR') {
    const list = store.people.filter((p) => p.id !== o.nullifier)
    list.push({ name: 'You', id: o.nullifier, tie: 'me' }); store.people = list; paintPeople()
    flow.innerHTML = worldSteps(4) + `<p class="note">Lit${o.world?.simulated || b.simulated ? ' (World was simulated)' : ''}.${o.ownerProof?.sent ? (o.owner ? ' The Broker checked that you are the one who lent the key.' : ' The Permit you signed was sent along; this Broker does not check it yet.') : ''} Only a pseudonym is kept. It stays on while you keep using this exact version, and goes out by itself when the tool changes.</p>`
  } else if (o.reason === 'ALREADY_VOUCHED') {
    flow.innerHTML = worldSteps(3, 'This person has already lit this version') + '<p class="note">One person, one light. Nothing was added.</p>'
  } else {
    if (o.reason === 'NOT_OWNER' || o.reason === 'NOT_LENT' || o.reason === 'NOT_USED') { flow.innerHTML = worldSteps(3, 'Only the person who lent the key can light it') + `<p class="note">${esc(o.message || '')} Nothing was lit.</p>`; return }
    const end = o.reason === 'human_denied' ? 'You said no' : o.reason === 'proof_expired' ? 'Nobody confirmed in time' : (o.message || o.reason || 'Not confirmed')
    const text = o.reason === 'human_denied' ? 'Nothing was lit. That you declined is on the record too.' : o.reason === 'proof_expired' ? 'The code ran out. Nothing was lit. This is not the same as saying no.' : 'Nothing was lit.'
    flow.innerHTML = worldSteps(1, end) + `<p class="note">${esc(text)}</p><div class="actions"><button class="btn" id="again">Ask again</button></div>`
    retry = s
  }
}
let retry = null
document.addEventListener('click', (e) => { if (e.target.id === 'again' && retry) { const s = retry; retry = null; vouch(s) } })

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

// Arriving from the keys page to name yourself: open the tool you just used.
const wantLight = new URLSearchParams(location.search).get('light') === '1'
if (wantLight) { selected = CATALOG[0]; setMode('mine'); setTimeout(() => { paintSheet(); $('sheet').scrollIntoView({ block: 'nearest' }) }, 600) }
journey(wantLight ? 'light' : 'choose', wantLight ? ['choose', 'lend', 'work'] : store.people.some((p) => p.tie === 'me') ? ['lend', 'work', 'light'] : [])
