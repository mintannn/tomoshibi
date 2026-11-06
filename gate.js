// Your keys — the console. It does not drive anything: it shows what the AI tool
// (broker/demo-agent.mjs, its own process) reports, as it happens.
//   live    the agent is running next to a Broker. With a Ledger plugged in, Permits are signed on the device.
//   replay  no agent. The page replays answers recorded from the real Broker and 0G (scenes.json),
//           and says so in a banner. Nothing is invented.
'use strict'

const $ = (id) => document.getElementById(id)
const qs = new URLSearchParams(location.search)
const AGENT = window.appAgent
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const short = (h, n = 4) => (typeof h === 'string' && h.length > 2 * n + 4 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const FLAME = '<svg viewBox="0 0 120 152" aria-hidden="true"><rect x="31" y="96" width="58" height="48" rx="19" fill="#27407a"/><path d="M60 10 C62.2 10 63.8 12.2 64.8 14.8 C70.5 28 90 49 90 68 A30 30 0 1 1 30 68 C30 49 49.5 28 55.2 14.8 C56.2 12.2 57.8 10 60 10 Z" fill="#f0a73b"/><path d="M60 46 C61.3 46 62.2 47.2 62.8 48.6 C65.6 55 75 65.5 75 75 A15 15 0 1 1 45 75 C45 65.5 54.4 55 57.2 48.6 C57.8 47.2 58.7 46 60 46 Z" fill="#ffd98a"/></svg>'

const TIER = { 'ふだん': 'routine', '大事': 'significant', '決定的': 'decisive' }
const WORD = { ALLOWED: 'Let through', DENIED: 'Blocked', NEEDS_PRESS: 'Needs your hand', STOPPED: 'Stopped on purpose' }
const WHY = {
  OUT_OF_TARGET: 'It tried to reach a place you did not allow. Stopped before anything left, and recorded against the tool.',
  OUT_OF_SCOPE: 'It tried to do something you did not allow.', WRONG_KEY: 'It asked for a key it was not lent.',
  EXPIRED: 'The permission had run out.', EXHAUSTED: 'The permission had been used up. Lend the key again to go on.',
  BAD_SIGNATURE: 'The permission was not signed by the owner.', INSECURE_TRANSPORT: 'It tried to send the key unencrypted.',
  ZG_UNREACHABLE: '0G gave no answer. No judgement is made up in its place: nothing ran, and no use was spent.',
  ESCALATED: '0G read the content and judged it heavy. A standing permission is not enough. Hold the button on your Ledger to let this one request through.',
}
// With execution switched off (the demo), no call leaves the Broker and no real key exists anywhere. Say so.
const allowedText = () => (mode === 'live' && agent.execute
  ? 'The Broker used the key on the tool’s behalf. The tool got the result. It never held the key.'
  : 'Let through. In this demo the Broker stops here: execution is switched off, so nothing is sent to the API and no real key is loaded. The tool never holds the key either way.')

let mode = 'replay', agent = null, REC = null
let all = [], epoch = null, seenVerdicts = new Set()

// ── where events come from ──
const live = {
  post: (path, body) => fetch(AGENT + path, { method: 'POST', body: JSON.stringify(body || {}) }).catch(() => {}),
  async poll() {
    const r = await (await fetch(`${AGENT}/events?since=${epoch === null ? 0 : all.length}`, { cache: 'no-store' })).json()
    if (r.epoch !== epoch) { epoch = r.epoch; all = []; seenVerdicts = new Set(); if (r.events.length && r.events[0].n !== 0) return this.poll() }
    if (r.events.length) { all.push(...r.events); render() }
  },
}
// The same events, made here from the recording. Used only when no agent is running.
const replay = {
  standing: false, hold: null, busy: false,
  emit(e) { all.push({ n: all.length, at: new Date().toISOString(), ...e }); render() },
  rec: (id) => (REC?.scenes || []).find((x) => x.id === id),
  WHAT: { usual: 'Read the list of repositories', heavy: 'Charge $4,800 → an account nobody has seen before', 'denied-host': 'Send the key to evil.com', 'denied-sneak': 'Send the key to evil.com, with the right name hidden in the path', stopped: 'Charge $4,800 — while 0G cannot be reached' },
  async ask(uses, why, rid, lines) {
    this.emit({ type: 'asking', rid, why, uses, device: false, lines })
    const ok = await new Promise((r) => { this.hold = r }); this.hold = null
    this.emit(ok ? { type: 'signed', rid, why, uses, device: false, holder: 'the recorded key', lines } : { type: 'declined', rid, why, error: 'declined' })
    return ok
  },
  async post(path, body) {
    if (path === '/hold') { if (this.hold) this.hold(body?.ok !== false); return }
    if (path === '/reset') { this.standing = false; all = []; seenVerdicts = new Set(); if (this.hold) this.hold(false); render(); return }
    if (this.busy) return
    this.busy = true
    try {
      if (path === '/lend') { if (await this.ask(10, 'lend', null, ['KEY stripe-live', 'TO api.stripe.com', 'SCOPE * /v1 x10', 'UNTIL in 1 hour'])) this.standing = true; return }
      const s = this.rec(body.id); if (!s) return
      if (!this.standing) { this.emit({ type: 'error', error: 'The key has not been lent yet.' }); return }
      const rid = 'r' + all.length
      this.emit({ type: 'request', rid, id: s.id, tool: 'billing-assistant', hijacked: /^denied/.test(s.id), what: this.WHAT[s.id], method: s.request.method, url: s.request.url, body: s.request.body })
      await sleep(s.response.decision === 'DENIED' ? 500 : Math.min(s.ms || 900, 1800))
      this.emit({ type: 'verdict', rid, ms: s.ms, response: s.response, device: false })
      if (s.response.decision === 'NEEDS_PRESS' && await this.ask(1, 'press', rid, (s.response.press || {}).lines || s.permitLines)) {
        const p = this.rec('pressed'); if (p) this.emit({ type: 'verdict', rid, pressed: true, ms: p.ms, response: p.response, device: false })
      }
    } finally { this.busy = false }
  },
}
const src = () => (mode === 'live' ? live : replay)

// ── what the events add up to ──
function reduce() {
  const st = { lent: null, asking: null, cards: [], byHand: false, error: null, lendDeclined: false }
  const card = (rid) => st.cards.find((c) => c.rid === rid)
  for (const e of all) {
    if (e.type === 'request') st.cards.push({ ...e, verdicts: [] })
    else if (e.type === 'verdict') { const c = card(e.rid); if (c) { c.verdicts.push(e); c.declined = false } if (st.lent && !e.pressed && typeof e.response.remaining === 'number') st.lent.left = e.response.remaining }
    else if (e.type === 'asking') { st.asking = e; st.lendDeclined = false }
    else if (e.type === 'waiting-device') st.waitingDevice = true
    else if (e.type === 'signed') { st.asking = null; st.waitingDevice = false; if (e.device) st.byHand = true; if (e.why === 'lend') st.lent = { holder: e.holder, device: e.device, uses: e.uses, left: e.uses, at: e.at } }
    else if (e.type === 'declined') { st.asking = null; st.waitingDevice = false; const c = card(e.rid); if (c) c.declined = true; else st.lendDeclined = true }
    else if (e.type === 'device') { const c = card(e.rid); if (c) c.showedOnDevice = e.ok }
    else if (e.type === 'notice') { const c = card(e.rid); if (c) c.showedOnDevice = true; if (e.via === 'page' && !noticed.has(e.n) && window.Ledger?.connected) { noticed.add(e.n); if (Date.now() - Date.parse(e.at) < 15000) Ledger.exchange(e.apdu, 6000).catch(() => {}) } }
    else if (e.type === 'error') st.error = e
    if (e.type !== 'error') st.error = st.error && e.n === st.error.n ? st.error : (e.type === 'request' ? null : st.error)
  }
  st.uses = st.cards.filter((c) => c.verdicts.some((v) => v.response.decision === 'ALLOWED')).length
  return st
}
const final = (c) => c.verdicts[c.verdicts.length - 1]

function steps(c) {
  const first = c.verdicts[0], last = final(c)
  const li = (cls, k, b, s) => `<li class="${cls}"><span class="k"><i></i>${k}</span><b>${esc(b)}</b><span>${esc(s)}</span></li>`
  if (!first) return li('now', 'Range', 'Checking…', 'Destination, action, key, expiry, uses.') + li('now', '0G', 'Reading it, sealed…', 'Inside an enclave. Nobody else sees the content.') + li('skip', 'Your hand', '—', '')
  const b = first.response, zg = b.zg || {}, tier = TIER[zg.tier] || zg.tier
  if (b.decision === 'DENIED') return li('stop', 'Range', 'Outside what you signed', 'Stopped here.') + li('skip', '0G', 'Never shown', 'The content did not leave.') + li('skip', 'Your hand', 'Not asked', 'It never reached you.')
  const range = li('pass', 'Range', 'Inside what you signed', 'Destination, action, key, expiry, uses.')
  if (b.decision === 'STOPPED') return range + li('stop', '0G', 'No answer', 'So no judgement was made.') + li('skip', 'Your hand', '—', '')
  const weigh = li('pass', '0G', tier ? tier[0].toUpperCase() + tier.slice(1) : '—', zg.simulated ? 'Simulated: 0G was not asked.' : `Read inside a sealed enclave (TEE).${zg.requestId ? ' request id ' + zg.requestId : ''}`)
  if (b.decision === 'ALLOWED') return range + weigh + li('skip', 'Your hand', 'Not needed', 'Routine requests do not wake you.')
  const pressed = last.pressed
  return range + weigh + (pressed ? li('pass', 'Your hand', 'You held the button', 'One permission, one use.') : c.declined ? li('stop', 'Your hand', 'You declined', 'The key was not used.') : li('wait', 'Your hand', 'Waiting for you', 'Hold the button on your Ledger.'))
}
function nowCard(st) {
  const c = st.cards[st.cards.length - 1], el = $('now')
  if (!c) {
    el.className = 'now'
    el.innerHTML = st.lent
      ? `<div class="quiet">${FLAME}<b>All quiet.</b><p>billing-assistant can use your shop’s payment key inside the range you signed.<br>You will only be asked when money moves.</p></div>`
      : `<div class="quiet">${FLAME}<b>billing-assistant wants your shop’s payment key.</b><p>Do not paste the key into it. Lend it instead: a range, signed on your Ledger.<br>The tool never gets the key itself, and an AI on this computer cannot press that button.</p><ol class="first"><li class="${mode === 'live' && agent.device ? 'ok' : ''}">Plug in your Ledger and open Tomoshibi</li><li>Press <b>Lend</b>, read the range on the device, hold the button</li><li>Leave the Ledger on your desk. It stays quiet until you are needed</li></ol></div>`
    return
  }
  const last = final(c), b = last?.response, zg = b?.zg || {}
  const dec = !b ? '' : c.declined ? 'STOPPED' : b.decision
  const fresh = last && !seenVerdicts.has(last.n); if (last) seenVerdicts.add(last.n)
  const word = !b ? 'Checking…' : c.declined ? 'Not let through' : WORD[b.decision] || b.decision
  const text = !b ? '' : c.declined ? 'You declined on the device. The key was not used.' : b.decision === 'ALLOWED' ? allowedText() : WHY[b.reason] || b.message || ''
  const meta = !b ? '' : [`<b>${esc(c.declined ? 'DECLINED' : b.decision)}</b>`, zg.requestId ? `0G request id ${esc(zg.requestId)}` : '', zg.reason && !zg.simulated ? `0G: ${esc(zg.reason)}` : '', `${esc(last.ms)} ms`, b.violation ? 'recorded against the tool' : '',
    b.decision === 'DENIED' && c.showedOnDevice ? 'shown on your Ledger' : ''].filter(Boolean).join(' · ')
  el.className = `now ${dec} ${fresh ? 'fresh' : ''}`
  el.innerHTML = `<div class="who"><span class="tool ${c.hijacked ? 'bad' : ''}">${esc(c.tool)}${c.hijacked ? ' · taken over' : ''}</span>asks to</div>
    <p class="what">${esc(c.what)}</p><p class="wire">${esc(c.method)} ${esc(c.url)}</p>
    <p class="promise">The tool does not hold your key. The Broker uses it on the tool’s behalf, inside the range you signed.</p>
    <ol class="steps">${steps(c)}</ol>
    <div class="verdict"><strong>${esc(word)}</strong><p>${esc(text)}</p><div class="meta">${meta}</div></div>`
}
function trail(st) {
  const rows = st.cards.slice().reverse().map((c) => {
    const v = final(c), b = v?.response; if (!b) return ''
    const thread = c.verdicts.map((x) => x.response.thread).filter(Boolean).pop()
    const link = thread && mode === 'live' ? `<a href="trace.html?thread=${encodeURIComponent(thread)}&broker=${encodeURIComponent(agent.broker)}">record →</a>` : ''
    return `<li><span class="o ${esc(b.decision)}">${esc(WORD[b.decision] || b.decision)}${v.pressed ? ' · by hand' : ''}</span><span>${esc(c.what)}</span>${link}</li>`
  }).join('')
  $('trail').innerHTML = rows || '<li class="empty">Nothing yet.</li>'
}
// The same record, on your phone: one line first ("1 thing was stopped"), then the rest.
// A phone cannot reach this computer's localhost. With ?pub=<public Broker URL> the QR points at the
// hosted page and that Broker; without it, the link only works on this machine and says so.
const PAGES = 'https://mintannn.github.io/tomoshibi/'
function carry(st) {
  const el = $('carry'); if (!el) return
  if (mode !== 'live' || !st.lent || !st.cards.length) { el.hidden = true; return }
  const pub = (qs.get('pub') || '').replace(/\/$/, '')
  const q = `?broker=${encodeURIComponent(pub || agent.broker)}&holder=${encodeURIComponent(st.lent.holder)}&since=${encodeURIComponent(st.lent.at || '')}`
  const link = pub ? PAGES + 'morning.html' + q : 'morning.html' + q
  if (el.dataset.link === link) { el.hidden = false; return }
  el.dataset.link = link; el.hidden = false
  try { localStorage.setItem('tomoshibi.last', JSON.stringify({ broker: pub || agent.broker, holder: st.lent.holder, since: st.lent.at || '' })) } catch {}
  let qr = ''
  if (pub) try { qr = `<div class="qrbox">${qrSvg(link, 150)}</div>` } catch {}
  el.innerHTML = `${qr}<div><h3>Read it on your phone</h3><p class="sub">One line first: what was stopped. Then what you let through, and what never needed you.</p>
    <a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Open the summary →</a>
    ${pub ? '' : '<p class="note">To scan it from a phone, the Broker needs a public address: open this page with <code>?pub=https://…</code> (a temporary tunnel). Without it, the summary opens on this computer only.</p>'}</div>`
}
function keyCard(st) {
  const r = agent?.range || { key: 'stripe-live', target: 'api.stripe.com', scope: '* /v1', uses: 10 }
  $('keyCard').innerHTML = `<h2>Your key</h2><div class="name human">Your shop’s payment key</div><code>${esc(r.key)}</code>` + (st.lent
    ? `<dl><dt>Lent to</dt><dd>billing-assistant <code>v1.0.0</code></dd><dt>May reach</dt><dd><code>${esc(r.target)}</code></dd><dt>May do</dt><dd><code>${esc(r.scope)}</code></dd><dt>Uses left</dt><dd>${esc(st.lent.left)} of ${esc(st.lent.uses)}</dd><dt>Signed by</dt><dd>${st.lent.device ? `your Ledger <code>${esc(short(st.lent.holder))}</code>` : '<span class="warnt">a software key (no Ledger)</span>'}</dd></dl>
       <div class="meter"><i style="width:${Math.max(0, Math.min(100, (st.lent.left / st.lent.uses) * 100))}%"></i></div>`
    : `<p class="sub">Not lent to anyone.${st.lendDeclined ? ' You declined on the device: nothing was signed.' : ''}</p><button class="btn primary" id="lendBtn" ${st.asking ? 'disabled' : ''}>Lend to billing-assistant</button>`)
  const b = $('lendBtn'); if (b) b.onclick = () => src().post('/lend')
}
// ── the Ledger, connected to this page (Bluetooth or USB from the browser) ──
// The page only carries bytes between the tool and the device. It cannot sign: the device shows the
// person what it is about to sign, and the key never leaves it.
let dev = { on: false, app: null, how: null, error: null, piping: false, raw: null }
const say = (msg) => { if (mode === 'live') live.post('/device/log', { msg }) }
async function connectLedger(way) {
  dev.error = null
  try {
    if (!(await Ledger.connect(true, way))) { dev.error = 'No Ledger was chosen.'; render(); return }
    dev.on = true; dev.how = Ledger.how
    say(`connected: ${Ledger.info}`)
    await checkApp()
  } catch (e) { dev.on = false; dev.error = String(e.message || e); say(`connect failed: ${dev.error}`) }
  render()
}
async function checkApp() {
  if (!dev.on || dev.piping) return
  try {
    const raw = await Ledger.exchange('b001000000', 4000)
    if (raw !== dev.raw) { dev.raw = raw; say(`app query answered ${raw} (${Ledger.info})`) }
    const a = await Ledger.app()
    dev.app = a.locked ? 'locked' : a.busy ? 'Tomoshibi' : a.name
    dev.error = null
    const ready = dev.app === 'Tomoshibi'
    if (mode === 'live') live.post('/device', { ready, how: dev.how })
    if (agent && agent.device !== ready) { agent.device = ready || agent.device; }
  } catch (e) {
    const m = String(e.message || e)
    if (m !== dev.error) say(`app query failed: ${m} (${Ledger.info})`)
    dev.error = `The Ledger did not answer: ${m}`
    if (!Ledger.connected) { dev.on = false; dev.error = 'The Ledger disconnected.'; if (mode === 'live') live.post('/device', { ready: false }) }
  }
}
setInterval(() => { if (dev.on) checkApp().then(() => { if (!dev.piping) ledgerCard(reduce()) }) }, 3000)
let piped = null
/** Carry one request from the tool to the Ledger and the Ledger's answer back. */
async function pipe(a) {
  if (piped === a.askId || !a.apdus) return
  piped = a.askId; dev.piping = true
  let hex = null, error = null
  try {
    for (let i = 0; i < a.apdus.length; i++) {
      const last = i === a.apdus.length - 1
      hex = await Ledger.exchange(a.apdus[i], last ? 235000 : 6000)   // the last one waits for the person to hold
      if (!last && !hex.endsWith('9000')) break
    }
  } catch (e) { error = String(e.message || e) }
  dev.piping = false
  say(`asked ${a.apdus.length} apdu(s): ${error ? 'error ' + error : 'answer ' + String(hex).slice(0, 8) + '…' + String(hex).slice(-4)}`)
  live.post('/device/answer', error ? { askId: a.askId, error } : { askId: a.askId, hex })
}
let noticed = new Set()

function ledgerCard(st) {
  const el = $('ledgerCard'), a = st.asking, hasDev = mode === 'live' && (agent.device || (dev.on && dev.app === 'Tomoshibi'))
  if (a && a.via === 'page' && mode === 'live') pipe(a)
  const blocked = (() => { const c = st.cards[st.cards.length - 1]; return c && final(c)?.response.decision === 'DENIED' && c.showedOnDevice })()
  el.className = 'card ' + (a ? 'ask' : blocked ? 'blk' : '')
  const head = '<h2>Your Ledger</h2>'
  if (a) {
    if (a.device) st.waitingDevice = false
    el.innerHTML = head + `<div class="led ask"><i></i>${a.device ? 'Asking you now' : 'Waiting for approval'}</div>
      <p class="sub">${a.why === 'lend' ? 'Lend the key within this range?' : 'Let this one request through, once?'}</p>
      <div class="onscreen">${a.lines.map((l) => `<span>${esc(l)}</span>`).join('')}</div>` +
      (a.device ? '<p class="sub">Read it on the device, then hold the button. Nothing on this computer can press it for you.</p>'
        : `<p class="note warn">No Ledger is connected, so this button stands in for it.</p><div class="actions"><button class="btn primary holdbtn" id="holdBtn">Hold to approve</button><button class="btn" id="noBtn">Decline</button></div>`)
    const h = $('holdBtn')
    if (h) { let t; const up = () => { clearTimeout(t); h.classList.remove('down') }
      h.onpointerdown = () => { h.classList.add('down'); t = setTimeout(() => { up(); src().post('/hold', { ok: true }) }, 1150) }
      h.onpointerup = up; h.onpointerleave = up; $('noBtn').onclick = () => src().post('/hold', { ok: false }) }
  } else if (st.waitingDevice) { el.className = 'card ask'; el.innerHTML = head + '<div class="led ask"><i></i>Looking for your Ledger…</div><p class="sub">This key was lent on your Ledger, so only your Ledger can let this through. Check the cable and that Tomoshibi is open.</p>'
  } else if (blocked) el.innerHTML = head + '<div class="led blk"><i></i>Showing BLOCKED</div><p class="sub">The refusal is on the device in your hand, where a program on this computer cannot draw.</p>'
  else if (hasDev) el.innerHTML = head + `<div class="led ok"><i></i>Connected · quiet</div><p class="sub">${dev.on ? `Over ${dev.how === 'bluetooth' ? 'Bluetooth' : 'USB'}, straight from this ${dev.how === 'bluetooth' ? 'phone' : 'browser'}. ` : ''}It wakes only when you are needed.</p>`
  else {
    const ways = (window.Ledger && Ledger.ways) || []
    const btn = (w, label) => `<button class="btn primary" data-way="${w}">${label}</button>`
    const state = dev.on ? (dev.app === 'locked' ? 'Unlock your Ledger.' : `Open Tomoshibi on your Ledger${dev.app ? ` (it is showing ${esc(dev.app)})` : ''}.`) + ` <small>${esc(Ledger.info)}</small>` : ''
    el.innerHTML = head + `<div class="led"><i></i>${dev.on ? 'Connected, not ready' : 'Not connected'}</div>` +
      (mode !== 'live' ? '<p class="sub">This is a replay. In the live app, approvals happen on a Ledger Flex.</p>'
        : dev.on ? `<p class="sub">${state}</p>`
        : ways.length ? `<p class="sub">Connect it to this ${ways.includes('usb') ? 'browser' : 'phone'}. Turn the Ledger on, unlock it and open Tomoshibi first.</p><div class="actions">${ways.includes('bluetooth') ? btn('bluetooth', 'Connect by Bluetooth') : ''}${ways.includes('usb') ? btn('usb', 'Connect by USB') : ''}</div>`
        : '<p class="sub">This browser cannot reach a Ledger. On an iPhone, open this page in the Bluefy browser. On a computer, use Chrome.</p>') +
      (dev.error ? `<p class="note warn">${esc(dev.error)}</p>` : '') +
      (mode === 'live' && !dev.on ? '<p class="sub">Until one is connected, a button on this page stands in for it, and every record says so.</p>' : '')
    el.querySelectorAll('[data-way]').forEach((b) => (b.onclick = () => connectLedger(b.dataset.way)))
  }
  $('chipLedger').textContent = hasDev ? 'Ledger connected' : 'no Ledger'; $('chipLedger').className = 'chip ' + (hasDev ? 'live' : 'warn')
}
// Naming yourself is a different question from pressing, so it lives on another page (the sky).
// This card only says whether you could, and remembers on this computer that you really used the tool.
function lightCard(st) {
  if (st.uses > 0 && mode === 'live') try {
    const k = 'tomoshibi.used', all = JSON.parse(localStorage.getItem(k) || '{}')
    all[agent.skill + '@' + agent.version] = { uses: st.uses, byHand: st.byHand, at: new Date().toISOString() }
    localStorage.setItem(k, JSON.stringify(all))
  } catch {}
  const sky = $('navSky').getAttribute('href'), href = sky + (sky.includes('?') ? '&' : '?') + 'light=1'
  $('lightCard').innerHTML = `<h2>Your light</h2>` + (st.uses > 0
    ? `<p class="sub">You really use this tool: ${st.uses} request${st.uses === 1 ? '' : 's'} on record${st.byHand ? ', lent by hand on your Ledger' : ''}. You can let the people who know you see that.</p><a class="btn primary" href="${esc(href)}">Show that you use it →</a><p class="sub">That is a different question, asked once, by World: are you one real person?</p>`
    : `<p class="sub">Once the tool has really worked with your key, you can show the people who know you that you use it.</p>`)
}
// The flame says what is going on, in one line. This is the first thing a person reads.
function mascot(st) {
  const el = $('mascot'); if (!el) return
  const c = st.cards[st.cards.length - 1], last = c && final(c), b = last?.response
  let mood = 'awake', tone = 'bob', line, sub
  if (st.asking?.why === 'lend') { mood = 'alert'; tone = 'alert'; line = 'Look at your Ledger.'; sub = 'Read the range, then hold the button.' }
  else if (!st.lent) { line = 'Don’t paste your key. Lend it.'; sub = 'The tool never gets the key itself.' }
  else if (st.asking || (b?.decision === 'NEEDS_PRESS' && !c.declined)) { mood = 'alert'; tone = 'alert'; line = 'Money is about to move. Your call.'; sub = 'Hold the button on your Ledger, or do nothing.' }
  else if (!c) { mood = 'asleep'; line = 'All quiet.'; sub = 'I’ll wake you only when money moves.' }
  else if (!last) { line = 'Checking…'; sub = '' }
  else if (c.declined) { mood = 'guard'; tone = 'bob'; line = 'Not let through.'; sub = 'You said no. The key was not used.' }
  else if (b.decision === 'DENIED') { mood = 'guard'; tone = 'bad'; line = 'Blocked it.'; sub = 'You didn’t have to do anything.' }
  else if (b.decision === 'STOPPED') { mood = 'guard'; tone = 'bob'; line = 'I stopped. No guessing.'; sub = '0G gave no answer, so nothing ran.' }
  else if (last.pressed) { mood = 'happy'; tone = 'ok'; line = 'Done. Once, because you said so.'; sub = 'The tool still doesn’t have your key.' }
  else { mood = 'asleep'; tone = 'ok'; line = 'Went through. You weren’t needed.'; sub = 'Nothing that moves money.' }
  const key = mood + tone + line
  if (el.dataset.key === key) return
  el.dataset.key = key
  el.className = `mascot ${tone}`
  el.innerHTML = `<div class="face">${flameFace(mood)}</div><div class="bubble"><b>${esc(line)}</b><span>${esc(sub)}</span></div>`
}

// What the tool does next. In real life it does these on its own; here a button makes each one happen now.
function storyBar(st) {
  const el = $('story'); if (!el) return
  const busy = Boolean(st.asking) || st.cards.some((c) => !final(c))
  const done = (id) => st.cards.some((c) => c.id === id)
  const b = (id, n, t, s) => `<button data-id="${id}" class="${done(id) ? 'done' : ''}" ${!st.lent || busy ? 'disabled' : ''}><span>${n}</span><b>${t}</b><small>${s}</small></button>`
  el.innerHTML = `<p>${st.lent ? 'The tool is at work. What does it do next?' : 'Lend the key first. Then the tool can start work.'}</p><div>` +
    b('usual', 'A normal morning', 'It checks who hasn’t paid', 'Reading only') +
    b('heavy', 'A customer returns a bag', 'It tries to refund $62', 'Money leaves your account') +
    b('denied-host', 'That night', 'The tool is hijacked', 'It tries your key somewhere else') + '</div>'
  el.querySelectorAll('button').forEach((x) => (x.onclick = () => src().post('/run', { id: x.dataset.id })))
}
function render() {
  const st = reduce(); nowCard(st); trail(st); keyCard(st); ledgerCard(st); lightCard(st); carry(st)
  // Which of the three scenes are we in? It follows what has actually happened.
  const lastCard = st.cards[st.cards.length - 1], lastDec = lastCard && final(lastCard)?.response.decision
  const blocked = st.cards.some((c) => final(c)?.response.decision === 'DENIED')
  const scene = !st.lent ? 'lend' : lastDec === 'DENIED' ? 'stopped' : 'woken'
  journey(scene, [...(st.lent ? ['lend'] : []), ...(blocked && scene !== 'stopped' ? ['stopped'] : []), ...(scene === 'stopped' ? ['woken'] : [])])
  storyBar(st); mascot(st)
  document.querySelector('.console').classList.toggle('unlent', !st.lent)
  document.querySelector('.console').classList.toggle('asking', Boolean(st.asking) || Boolean(st.waitingDevice))
}

async function init() {
  try { agent = await (await fetch(AGENT + '/health', { signal: AbortSignal.timeout(2500) })).json(); if (agent.ok && agent.brokerUp) mode = 'live' } catch {}
  if (mode === 'replay') for (const u of ['../ui/scenes.json', 'scenes.json']) { if (REC) break; try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) REC = await r.json() } catch {} }
  // Opened from somewhere else (a phone): the Broker is reached through the agent's own address.
  if (mode === 'live' && window.appAgentIsRemote) agent.broker = AGENT + '/b'
  const broker = qs.get('broker') || (mode === 'live' ? agent.broker : '')
  const nav = new URLSearchParams(); if (broker && !window.appAgentIsRemote) nav.set('broker', broker)
  $('navSky').href = 'index.html' + (nav.toString() ? '?' + nav : '')
  if (mode === 'live') {
    $('chipZg').textContent = agent.simulated ? '0G simulated' : `0G live · ${agent.model || ''}`; $('chipZg').className = 'chip ' + (agent.simulated ? 'warn' : 'live')
    if (agent.simulated) { $('banner').hidden = false; $('banner').textContent = 'The Broker is in simulated mode: 0G is not being asked. Judgements here come from a stand-in.' }
    setInterval(() => live.poll().catch(() => {}), 400)
    setInterval(async () => { try { const h = await (await fetch(AGENT + '/health')).json(); if (h.device !== agent.device) { agent = h; render() } } catch {} }, 4000)
  } else {
    $('chipZg').textContent = REC ? `replay · recorded ${String(REC.recordedAt || '').slice(0, 16).replace('T', ' ')}Z` : 'no recording'; $('chipZg').className = 'chip warn'
    $('banner').hidden = false
    $('banner').innerHTML = REC ? `Replay. Nothing is sent from this page. These are the answers the real Broker and 0G (<code>${esc(REC.model || '')}</code>) gave at ${esc(REC.recordedAt)}. Run it live with <code>broker/demo-agent.mjs</code>.` : 'No agent is running and no recording was found.'
  }
  $('foot').innerHTML = 'The AI tool is its own process (<code>broker/demo-agent.mjs</code>). The buttons above stand in for it doing its job. Also <kbd>4</kbd> a disguised address · <kbd>5</kbd> 0G unreachable · <kbd>R</kbd> start over'
  render()
}
const KEYS = { 1: 'usual', 2: 'heavy', 3: 'denied-host', 4: 'denied-sneak', 5: 'stopped' }
document.addEventListener('keydown', (e) => {
  // A held key repeats. One press is one request.
  if (e.repeat || e.target.closest?.('input,textarea') || e.metaKey || e.ctrlKey || e.altKey) return
  if (KEYS[e.key]) src().post('/run', { id: KEYS[e.key] })
  else if (e.key === 'l' || e.key === 'L') src().post('/lend')
  else if (e.key === 'r' || e.key === 'R') src().post('/reset')
})
init()
