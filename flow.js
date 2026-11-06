// TOMOSHIBI — the app (web/app.html).
// Two surfaces, like two browser tabs: the AI tool's chat, and TOMOSHIBI. The page does not drive
// the AI tool (broker/demo-agent.mjs, its own process); it shows what that process reports and
// passes on what the person chooses. The Ledger is never drawn here: when a hold is needed the
// page says "continue on your Ledger" and waits.
//   live     the agent is running next to a Broker. Permits are signed on the Ledger when one is there.
//   preview  no agent. Answers recorded from the real Broker and 0G (scenes.json) are replayed, a button
//            stands in for the Ledger, and the bottom bar says so.
'use strict'
;(function () {
const $ = (id) => document.getElementById(id)
const AGENT = window.appAgent
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const TOOL = 'Billing assistant'

// ── the flame on its dish: the same character that lives on the Ledger, in colour ──
const INK = '#1B1630'
const DISH = `<path d="M20 92 H100 C98 105 85 111 60 111 C35 111 22 105 20 92 Z" fill="#fff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
const BODY = `<path d="M60 10 C64 30 97 44 97 68 C97 84 83 92 60 92 C37 92 23 84 23 68 C23 44 56 30 60 10 Z" fill="#F2600C" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M60 40 C62 50 80 58 80 72 C80 81 72 86 60 86 C48 86 40 81 40 72 C40 58 58 50 60 40 Z" fill="#FFC24A"/>`
const CK = '<ellipse cx="38" cy="76" rx="5" ry="3" fill="#ff8f6b" opacity=".8"/><ellipse cx="82" cy="76" rx="5" ry="3" fill="#ff8f6b" opacity=".8"/>'
const SPK = `<path d="M8 30 v14 M1 37 h14 M108 18 v12 M102 24 h12 M110 52 v10 M105 57 h10" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`
const WICK = `<path d="M60 92 v-9" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
const FACE = {
  awake: `<circle cx="49" cy="68" r="5" fill="${INK}"/><circle cx="71" cy="68" r="5" fill="${INK}"/><circle cx="50.5" cy="66.5" r="1.6" fill="#fff"/><circle cx="72.5" cy="66.5" r="1.6" fill="#fff"/><path d="M54 78 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>${CK}`,
  happy: `<path d="M43 69 q6 -8 12 0 M65 69 q6 -8 12 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M52 77 q8 9 16 0 z" fill="${INK}"/>${CK}`,
  guard: `<path d="M40 58 l15 6 M80 58 l-15 6" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><circle cx="50" cy="70" r="4.5" fill="${INK}"/><circle cx="70" cy="70" r="4.5" fill="${INK}"/><path d="M53 81 h14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  alert: `<circle cx="48" cy="67" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="72" cy="67" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="49" cy="68" r="2.8" fill="${INK}"/><circle cx="71" cy="68" r="2.8" fill="${INK}"/><ellipse cx="60" cy="81" rx="4" ry="5" fill="${INK}"/>${CK}`,
}
function lamp(m = 'awake', s = 120) {
  const v = `<svg viewBox="0 0 120 120" width="${s}" height="${s}" aria-hidden="true">`
  if (m === 'asleep') return v + `<g transform="translate(0 44) scale(1 .52)">${BODY}</g><path d="M42 74 q5 4 10 0 M68 74 q5 4 10 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M56 82 q4 3 8 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>${DISH}<text x="92" y="44" font-size="18" font-weight="800" fill="${INK}">z</text><text x="104" y="28" font-size="13" font-weight="800" fill="${INK}">z</text></svg>`
  if (m === 'unlit') return v + WICK + DISH + '</svg>'
  return v + BODY + FACE[m] + (m === 'happy' ? SPK : '') + DISH + '</svg>'
}

// ── what the page remembers (this browser tab only) ──
const mem = { get(k, d) { try { const v = sessionStorage.getItem('tomo.' + k); return v === null ? d : JSON.parse(v) } catch { return d } }, set(k, v) { try { sessionStorage.setItem('tomo.' + k, JSON.stringify(v)) } catch {} } }
const KEEP = ['surface', 'chat', 'onb', 'ackLit', 'choice', 'opened', 'gain']
const fresh = () => ({ surface: 'ai', chat: 0, onb: 'welcome', ackLit: false, choice: 0, opened: false, gain: null, tab: 'home', pending: null, busy: null, seenRid: null, world: null, lightsMode: 'all', friend: 0, err: null })
let ui = fresh(); for (const k of KEEP) ui[k] = mem.get(k, ui[k])
const save = () => { for (const k of KEEP) mem.set(k, ui[k]) }
const CHO = [{ uses: 20, days: 7 }, { uses: 10, days: 1 }, { uses: 50, days: 30 }]
const choLabel = (c) => `${c.uses} uses · ${c.days} day${c.days === 1 ? '' : 's'}`
const untilDay = (days) => new Date(Date.now() + days * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

let mode = 'boot', agent = null, REC = null
let all = [], epoch = null
const BROKER = () => (window.appAgentIsRemote ? AGENT + '/b' : agent.broker)

// ── where events come from ──
const live = {
  post: (path, body) => fetch(AGENT + path, { method: 'POST', body: JSON.stringify(body || {}) }).catch(() => {}),
  // One request at a time, and every event taken exactly once and in order (by its number). On a slow
  // link two overlapping requests would otherwise bring the same event twice, and the next one would be skipped.
  busy: false,
  async poll() {
    if (this.busy) return
    this.busy = true
    try {
      const r = await (await fetch(`${AGENT}/events?since=${epoch === null ? 0 : all.length}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })).json()
      if (r.epoch !== epoch) { const first = epoch === null; epoch = r.epoch; all = []; if (!first) { ui = fresh(); save() } paint() }
      const got = []
      for (const e of r.events) if (e.n === all.length) { all.push(e); got.push(e) }
      if (got.length) { onEvents(got); paint() }
    } finally { this.busy = false }
  },
}
// The same events, made here from the recording. Used only when no agent is running.
const replay = {
  standing: false, hold: null, busy: false,
  emit(e) { const ev = { n: all.length, at: new Date().toISOString(), ...e }; all.push(ev); onEvents([ev]); paint() },
  rec: (id) => (REC?.scenes || []).find((x) => x.id === id),
  WHAT: { usual: 'Read the unpaid invoices', heavy: 'Refund ₹4,800 for order #1042 (a returned bag)', 'denied-host': 'Send customer data to files.unknown-host.example', stopped: 'Refund ₹4,800 for order #1042 — while 0G cannot be reached' },
  URL: { 'denied-host': 'https://files.unknown-host.example/upload' },
  async ask(uses, why, rid, lines) {
    this.emit({ type: 'asking', rid, why, uses, device: false, lines })
    const ok = await new Promise((r) => { this.hold = r }); this.hold = null
    this.emit(ok ? { type: 'signed', rid, why, uses, device: false, holder: 'the recorded key', lines } : { type: 'declined', rid, why, error: 'declined' })
    return ok
  },
  async post(path, body) {
    if (path === '/hold') { if (this.hold) this.hold(body?.ok !== false); return }
    if (path === '/reset') { this.standing = false; all = []; if (this.hold) this.hold(false); return }
    if (this.busy) return
    this.busy = true
    try {
      if (path === '/lend') { const c = body || CHO[0]; if (await this.ask(c.uses, 'lend', null, ['KEY stripe-live', 'TO api.stripe.com', `SCOPE * /v1 x${c.uses}`, `UNTIL ${new Date(Date.now() + c.days * 864e5).toISOString().slice(0, 16).replace('T', ' ')}Z`])) this.standing = true; return }
      const s = this.rec(body.id); if (!s || !this.standing) return
      const rid = 'r' + all.length
      this.emit({ type: 'request', rid, id: s.id, tool: 'billing-assistant', what: this.WHAT[s.id] || s.id, method: s.request.method, url: this.URL[s.id] || s.request.url })
      await new Promise((r) => setTimeout(r, s.response.decision === 'DENIED' ? 600 : 1800))
      this.emit({ type: 'verdict', rid, ms: s.ms, response: s.response, device: false })
      if (s.response.decision === 'NEEDS_PRESS' && await this.ask(1, 'press', rid, ['KEY stripe-live', 'TO api.stripe.com', 'SCOPE * /v1 x1', 'UNTIL in 1 hour'])) {
        await new Promise((r) => setTimeout(r, 900))
        const p = this.rec('pressed'); if (p) this.emit({ type: 'verdict', rid, pressed: true, ms: p.ms, response: p.response, device: false })
      }
    } finally { this.busy = false }
  },
}
const src = () => (mode === 'live' ? live : replay)

/** Things the page does once, when something new arrives. */
function onEvents(evs) {
  for (const e of evs) {
    if (e.type === 'request') { ui.tab = 'home'; ui.seenRid = null }
    else if (e.type === 'asking') { ui.pending = null; if (e.via === 'page' && mode === 'live') pipe(e) }
    else if (e.type === 'signed' && e.why === 'lend') { ui.pending = null; ui.ackLit = false }
    else if (e.type === 'declined') ui.pending = null
    else if (e.type === 'notice' && e.via === 'page' && window.Ledger?.connected && Date.now() - Date.parse(e.at) < 15000) Ledger.exchange(e.apdu, 6000).catch(() => {})
  }
  save()
}

// ── what the events add up to ──
function reduce() {
  const st = { lent: null, asking: null, cards: [], waitingDevice: false, lendDeclined: false, error: null }
  const card = (rid) => st.cards.find((c) => c.rid === rid)
  for (const e of all) {
    if (e.type === 'request') st.cards.push({ ...e, verdicts: [] })
    else if (e.type === 'verdict') { const c = card(e.rid); if (c) { c.verdicts.push(e); c.declined = false } if (st.lent && !e.pressed && typeof e.response.remaining === 'number') st.lent.left = e.response.remaining }
    else if (e.type === 'asking') { st.asking = e; st.lendDeclined = false; st.waitingDevice = false }
    else if (e.type === 'waiting-device') st.waitingDevice = true
    else if (e.type === 'signed') { st.asking = null; st.waitingDevice = false; if (e.why === 'lend') st.lent = { holder: e.holder, device: e.device, uses: e.uses, left: e.uses, at: e.at, lines: e.lines } }
    else if (e.type === 'declined') { st.asking = null; st.waitingDevice = false; const c = card(e.rid); if (c) c.declined = true; else st.lendDeclined = e.error || true }
    else if (e.type === 'device' || e.type === 'notice') { const c = card(e.rid); if (c) c.onDevice = e.type === 'notice' ? true : e.ok }
    else if (e.type === 'error') st.error = e.error
  }
  st.uses = st.cards.filter((c) => ['ALLOWED', 'BYHAND'].includes(dec(c))).length
  return st
}
const final = (c) => c.verdicts[c.verdicts.length - 1]
function dec(c) { const v = final(c); if (!v) return 'checking'; if (c.declined) return 'DECLINED'; const d = v.response.decision; return d === 'ALLOWED' ? (v.pressed ? 'BYHAND' : 'ALLOWED') : d === 'NEEDS_PRESS' ? 'NEEDS' : d }
const thread = (c) => c.verdicts.map((x) => x.response.thread).filter(Boolean).pop()
const recLink = (c) => { const t = thread(c); return t && mode === 'live' ? `<a class="rec" href="trace.html?thread=${encodeURIComponent(t)}&broker=${encodeURIComponent(BROKER())}" target="_blank" rel="noopener">record →</a>` : '' }
const zgLine = (c) => { const z = c && final(c)?.response.zg; return !z ? '' : z.simulated ? '0G is simulated on this Broker.' : `Read by a sealed model on 0G${z.requestId ? ` · request ${esc(String(z.requestId).slice(0, 18))}` : ''}` }
function money(c) { const m = /^Refund (\S+) for (order #\d+)(?: \((.+)\))?/.exec(c.what || ''); return m ? { amount: m[1], order: m[2][0].toUpperCase() + m[2].slice(1), note: m[3] || '' } : null }

// ── the Ledger, when this page is the one connected to it (USB or Bluetooth from the browser) ──
// The page only carries bytes. It cannot sign: the device shows the person what it is about to sign.
let dev = { on: false, app: null, how: null, error: null, piping: false }
const say = (msg) => { if (mode === 'live') live.post('/device/log', { msg }) }
async function connectLedger(way) {
  dev.error = null
  try {
    if (!(await Ledger.connect(true, way))) { dev.error = 'No Ledger was chosen.'; paint(); return }
    dev.on = true; dev.how = Ledger.how; say(`connected: ${Ledger.info}`); await checkApp()
  } catch (e) { dev.on = false; dev.error = String(e.message || e); say(`connect failed: ${dev.error}`) }
  paint()
}
async function checkApp() {
  if (!dev.on || dev.piping) return
  try {
    const a = await Ledger.app()
    dev.app = a.locked ? 'locked' : a.busy ? 'Tomoshibi' : a.name; dev.error = null
    if (mode === 'live') live.post('/device', { ready: dev.app === 'Tomoshibi', how: dev.how })
  } catch (e) {
    dev.error = `The Ledger did not answer: ${String(e.message || e)}`
    if (!Ledger.connected) { dev.on = false; dev.error = 'The Ledger disconnected.'; if (mode === 'live') live.post('/device', { ready: false }) }
  }
}
setInterval(() => { if (dev.on) checkApp().then(paint) }, 3000)
let piped = null
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
  say(`asked ${a.apdus.length} apdu(s): ${error ? 'error ' + error : 'answer …' + String(hex).slice(-4)}`)
  live.post('/device/answer', error ? { askId: a.askId, error } : { askId: a.askId, hex })
}
const hasDevice = () => mode === 'live' && Boolean(agent?.device || (dev.on && dev.app === 'Tomoshibi'))

// ── lights: who really uses this tool (the Broker), and which of them is you (this browser) ──
let lights = { ok: false, count: 0, who: [] }
const me = () => { try { return localStorage.getItem('tomoshibi.me') } catch { return null } }
const people = () => { try { return JSON.parse(localStorage.getItem('tomoshibi.people') || '[]') } catch { return [] } }
async function refreshLights() {
  if (mode !== 'live') return
  try { const r = await (await fetch(`${BROKER()}/stars/${agent.skill}?version=${encodeURIComponent(agent.version)}`, { cache: 'no-store' })).json(); lights = { ok: true, count: r.stars || 0, who: r.who || [] } } catch { lights.ok = false }
  paint()
}
// One question, asked once, by World: are you one real person? Three endings, kept apart.
async function startWorld() {
  if (mode !== 'live') { ui.world = { step: 'preview' }; paint(); return }
  ui.world = { step: 'starting' }; paint()
  try {
    const r = await fetch(BROKER() + '/vouch/start', { method: 'POST', body: '{}' }); const b = await r.json()
    if (r.status !== 200) { ui.world = { step: 'end', title: 'World is not set up on this Broker', text: `${b.error || r.status}. Nothing was shown, and nothing is pretended.` }; paint(); return }
    const uri = String(b.verificationUri || ''), real = /^https:\/\/\S+$/.test(uri) && !b.simulated
    ui.world = { step: 'confirm', uri, real, code: b.userCode, simulated: Boolean(b.simulated) }; paint()
    const o = await (await fetch(AGENT + '/vouch/finish', { method: 'POST', body: JSON.stringify({ deviceCode: b.deviceCode }) })).json()
    if (o.decision === 'STAR' || o.reason === 'ALREADY_VOUCHED') {
      if (o.nullifier) try { localStorage.setItem('tomoshibi.me', o.nullifier); const list = people().filter((p) => p.id !== o.nullifier); list.push({ name: 'You', id: o.nullifier, tie: 'me' }); localStorage.setItem('tomoshibi.people', JSON.stringify(list)) } catch {}
      ui.world = { step: 'done', already: o.reason === 'ALREADY_VOUCHED', simulated: Boolean(o.world?.simulated || b.simulated), checked: Boolean(o.ownerChecked) }
      await refreshLights()
    } else {
      const title = o.reason === 'human_denied' ? 'You said no' : o.reason === 'proof_expired' ? 'Nobody confirmed in time' : ['NOT_OWNER', 'NOT_LENT', 'NOT_USED'].includes(o.reason) ? 'Only someone who really used the key can show a light' : (o.message || o.reason || 'Not confirmed')
      const text = o.reason === 'human_denied' ? 'Nothing was shown. That you declined is on the record too.' : o.reason === 'proof_expired' ? 'The code ran out. Nothing was shown. This is not the same as saying no.' : `${o.message || ''} Nothing was shown.`
      ui.world = { step: 'end', title, text }
    }
  } catch (e) { ui.world = { step: 'end', title: 'Could not reach the Broker', text: `${String(e.message || e)}. Nothing was shown.` } }
  paint()
}

// ── pieces ──
let cur = ''
const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`
const tag = (t, c) => `<span class="tag ${c}">${t}</span>`
const hero = (m, sayTxt, h, p) => `<div class="hero"><div class="c">${lamp(m, 150)}</div><div class="say">${sayTxt}</div></div><h1>${h}</h1><p>${p}</p>`
/** While something is on its way: what is happening, what comes next, and why it is worth the wait. */
const waitbox = (doing, next, why) => `<div class="wait"><div class="flick">${lamp('awake', 46)}</div><div><b>${doing}<span class="dots"><i>.</i><i>.</i><i>.</i></span></b><div class="nx"><i>NEXT</i>${next}</div><div class="nx y"><i>WHY</i>${why}</div></div></div>`
const LS = [['Plug in your Ledger', 'USB cable'], ['Unlock it', 'Enter your PIN'], ['Open TOMOSHIBI', 'Tap the flame on the Ledger'], ['Tap “See it”', 'Read what it shows'], ['Hold to light', 'Keep holding for 3 seconds']]
const stepsDone = (a) => (a && a.device ? 3 : hasDevice() ? 3 : dev.on ? (dev.app === 'locked' ? 1 : 2) : 0)
const strip = (a) => { const n = stepsDone(a); return `<div class="steps"><b class="lt">ON YOUR LEDGER</b>${LS.map(([t], j) => `<div class="st ${j < n ? 'ok' : j === n ? 'now' : ''}"><em>${j < n ? '✓' : j + 1}</em><span>${t}</span></div>`).join('')}</div>` }
function frame(o) {
  const nav = o.steps !== undefined
    ? `<div class="stepper">${['Leave your key', 'Choose what it may do', 'Hold to light'].map((t, i) => `<span class="${i === o.steps ? 'on' : i < o.steps ? 'done' : ''}"><em>${i < o.steps ? '✓' : i + 1}</em>${t}</span>`).join('')}</div>`
    : o.tabs ? `<div class="links">${['home', 'activity', 'lights'].map((t) => `<span class="${t === ui.tab ? 'on' : ''}" data-act="tab:${t}">${t[0].toUpperCase() + t.slice(1)}</span>`).join('')}</div>` : '<div class="links"></div>'
  return `<div class="frame ${o.cls || ''}" data-view="${cur}"><div class="nav"><div class="logo">${lamp('awake', 30)}<b>tomoshibi</b></div>${nav}<div class="who">${o.who || 'Priya’s shop'}</div></div>`
    + `<div class="nowbar"><div><i>NOW</i><b>${o.now}</b></div><div class="y"><i>WHY IT MATTERS</i><b>${o.why}</b></div></div>`
    + (o.gain ? `<div class="gain"><i>${o.gainLabel || 'NOW YOU CAN'}</i>${o.gain}</div>` : '')
    + (o.stage || `<div class="body" style="background:${o.bg || '#FFF3E4'}"><div class="l">${o.left}</div><div class="r">${o.right}</div></div>`)
    + (o.strip || '') + '</div>'
}
/** When no Ledger is connected: a button on this page stands in for it, and says so. */
const softHold = (label) => `<div class="softhold"><b>No Ledger is connected${mode === 'live' ? '' : ' in this preview'}.</b> This button stands in for it, and every record says so.<div class="two"><button class="holdbtn" data-hold="1"><i></i>${label}</button><button class="ghost" data-act="soft-no">Not now</button></div></div>`
const connectRow = () => { const ways = (mode === 'live' && window.Ledger && Ledger.ways) || []; if (!ways.length || dev.on || hasDevice()) return dev.on && dev.app !== 'Tomoshibi' ? `<p class="connectmsg">${dev.app === 'locked' ? 'Unlock your Ledger.' : 'Open TOMOSHIBI on your Ledger.'}</p>` : ''
  return `<div class="connect">${ways.includes('usb') ? '<button class="ghost" data-act="connect:usb">Connect by USB</button>' : ''}${ways.includes('bluetooth') ? '<button class="ghost" data-act="connect:bluetooth">Connect by Bluetooth</button>' : ''}</div>${dev.error ? `<div class="err">${esc(dev.error)}</div>` : ''}` }

// ── TOMOSHIBI: the views ──
function vWelcome() {
  cur = 'welcome'
  const pre = [['Leave your key with me', 'You never paste it into an AI again.'], ['Choose what it may do', 'It gets one small job, not the key.'], ['Hold your Ledger', 'Nothing starts without your hand.']]
  return frame({ now: 'Welcome', why: 'From here on, you never touch a key file again.',
    left: hero('happy', 'Welcome! So glad you came.', 'Let’s take keys<br>off your plate.', `${TOOL} asked you to edit a file. You do not have to. Three small steps, about two minutes, and key files are behind you.`),
    right: `<div class="card"><div class="cardh">What happens next <span>about 2 minutes</span></div>${pre.map(([t, g], i) => `<div class="pre"><em>${i + 1}</em><div><b>${t}</b><span>${g}</span></div></div>`).join('')}<button data-act="onb:key">Let’s go →</button></div>` })
}
function vKey() {
  cur = 'key'
  return frame({ steps: 0, now: 'Step 1 of 3 · Leave your key with TOMOSHIBI', why: 'No file to edit. Your AI never sees the key.',
    left: hero('awake', 'Leave the key stuff to me!', 'No files. No folders.<br>Just paste it here, once.', `${TOOL} asked for your Stripe key. Give it to me instead. It will never see it.`),
    right: `<div class="card"><div class="cardh">Get your key <span>about a minute</span></div><ol class="how"><li>Open <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener"><u>Stripe → API keys ↗</u></a></li><li>Copy the <b>Secret key</b></li><li>Paste it below</li></ol>
      <label class="inp"><input id="keyIn" type="password" placeholder="sk_live_…" autocomplete="off" spellcheck="false"></label><button data-act="key-keep" disabled>Keep it with me</button>
      <small>Only once. It stays with me — never in a file, never with your AI. <button class="link" data-act="key-test">Use a test key</button></small><small>Demo build: what you paste stays on this page and is not sent or stored anywhere.</small></div>` })
}
function vChoose(st) {
  cur = 'choose'
  const c = CHO[ui.choice]
  return frame({ steps: 1, now: 'Step 2 of 3 · Choose what it may do', why: 'You lend one small job, not the key.',
    gain: ui.gain === 'key' ? 'forget this key. You will never paste it into an AI again.' : '',
    left: hero('awake', 'What may it do?', 'Lend one small job.', `Pick in plain words. This is all ${TOOL} gets.`),
    right: `<div class="card">${kv('Key', 'Stripe')}${kv('Goes to', 'api.stripe.com')}${kv('Can', 'Work with your orders')}<div class="kv"><span>Ends</span><select id="ends">${CHO.map((x, i) => `<option value="${i}" ${i === ui.choice ? 'selected' : ''}>${choLabel(x)}</option>`).join('')}</select></div>
      <div class="sentence">${TOOL} may <b>work with your orders</b> on <b>Stripe</b>, up to <b>${c.uses} times</b>, until <b>${untilDay(c.days)}</b>. <b>Anything that moves money still needs your hand.</b></div>
      ${st.lendDeclined ? '<div class="err">Nothing was signed, so nothing started. You can try again.</div>' : ''}${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
      <button data-act="lend">Continue on my Ledger →</button></div>` })
}
function vHold(st) {
  cur = 'hold'
  const a = st.asking, c = CHO[ui.choice], n = stepsDone(a), soft = a && !a.device
  const status = !a ? 'Sending it to your Ledger…' : st.waitingDevice ? 'Looking for your Ledger…' : soft ? 'No Ledger connected' : 'Waiting for your Ledger…'
  const lines = a?.lines ? `<small>Your Ledger says it in its own words:</small><div class="codes">${a.lines.map((l) => `<code>${esc(l)}</code>`).join('')}</div><small>If anything differs, do not hold.</small>` : ''
  return frame({ steps: 2, cls: 'hero5', now: 'Step 3 of 3 · Continue on your Ledger', why: 'Your AI cannot go ahead on its own. Nothing starts until you hold.',
    stage: `<div class="stage"><div class="headline"><small class="eyebrow">NOW, PICK UP YOUR LEDGER</small><h3>Nothing starts until you hold.</h3><p>Your AI cannot go ahead on its own, and it cannot press the button on your Ledger. Only your hand can.</p></div>
      <div class="cols2"><ol class="st5">${LS.map(([t, u], i) => `<li class="${i < n ? 'ok' : i === n ? 'now' : ''}"><em>${i < n ? '✓' : i + 1}</em><div><b>${t}</b><small>${u}</small></div></li>`).join('')}</ol>
        <div class="mid"><div class="hold"><svg viewBox="0 0 220 220" class="ring" aria-hidden="true"><circle cx="110" cy="110" r="98" class="tr"/></svg><svg viewBox="0 0 120 120" class="lamp" aria-hidden="true">${WICK}${DISH}</svg></div><div class="status">${status}</div></div></div>
      ${soft ? softHold('Hold here to light') : connectRow()}
      <div class="chosen"><i>NEXT</i><div>The moment you hold, your light goes on and ${TOOL} can start. Until then, nothing has happened.</div></div>
      <div class="chosen"><i>YOU CHOSE</i><div>${TOOL} may <b>work with your orders</b> on <b>Stripe</b>, up to <b>${c.uses} times</b>, until <b>${untilDay(c.days)}</b>.</div>${lines}</div></div>` })
}
function vLit(st) {
  cur = 'lit'
  return frame({ steps: 3, cls: 'lit-in', now: `Lit · ${TOOL} is working`, why: 'You pasted once, chose, and held. That is all.',
    gain: `let ${TOOL} work, and stop thinking about keys.`, bg: '#EAF7EF',
    left: `<div class="hero"><div class="c"><svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">${WICK}<g id="hf" style="transform-origin:60px 92px">${BODY}${FACE.happy}${SPK}</g>${DISH}</svg></div><div class="say">A light is lit!</div></div><h1>You did it.<br>Go back to your AI.</h1><p>${TOOL} holds a pass, not your key. I will only call you when money is about to move.</p>`,
    right: `<div class="card"><div class="did"><div><i>YOU DID</i><span class="y">Pasted a key, once</span><span class="y">Chose what it may do</span><span class="y">Held your Ledger</span></div><div><i>YOU DID NOT</i><span class="x">Create a file</span><span class="x">Look for a folder</span><span class="x">Give your key to an AI</span></div></div>
      <button data-act="back-ai">Back to ${TOOL} ↗</button><small>Your light is on. For now, only you can see it.${st.lent.device ? '' : ' (Signed by a software key: no Ledger was connected.)'}</small></div>` })
}
function vHome(st) {
  const c = st.cards[st.cards.length - 1], a = st.asking
  const d = c && ui.seenRid !== c.rid ? dec(c) : null
  const through = st.cards.filter((x) => dec(x) === 'ALLOWED')
  const ok = '<button class="ghost" data-act="seen">OK</button>'
  if ((a && a.why === 'press') || d === 'NEEDS') {
    cur = 'money'
    const m = money(c) || { amount: '', order: '', note: '' }, soft = a && !a.device, signed = !a && d === 'NEEDS'
    return frame({ tabs: 1, now: 'Money is about to move', why: 'It waits for your hold. One hold, one payment.', bg: '#FFE9DC',
      left: hero('alert', 'Money is about to move. Your call!', m.amount ? `A refund of ${esc(m.amount)}<br>is waiting for you.` : 'This one is<br>waiting for you.', `${esc(m.order)}${m.note ? ', ' + esc(m.note) : ''}. Nothing happens until you hold your Ledger. Take your time: nothing has moved.`),
      right: `<div class="card">${tag('NEEDS YOUR HAND', 'hand')}${kv('What', esc(m.amount ? 'Refund ' + m.amount : c.what))}${m.order ? kv('For', esc(m.order)) : ''}${kv('How many times', 'Once')}
        ${signed ? waitbox('Your Ledger signed. Sending it, once', 'The refund goes out one time, and the pass is used up.', 'One hold, one payment. It cannot be repeated.') : st.waitingDevice ? '<div class="wstatus">Looking for your Ledger… check the cable, unlock it, open TOMOSHIBI.</div>' : soft ? softHold('Hold here to approve') : `<div class="wstatus">Waiting for your Ledger…</div>${connectRow()}`}
        <small>${zgLine(c) || 'A sealed model on 0G read this and judged it heavy.'} Your AI cannot press this button.</small></div>`, strip: soft || signed ? '' : strip(a) })
  }
  if (d === 'checking') {
    cur = 'checking'
    return frame({ tabs: 1, now: 'Reading a request', why: 'You are only asked when it matters.', bg: '#FFF3E4',
      left: hero('awake', 'One moment, I am reading it.', 'Checking this one<br>for you.', esc(c.what) + '.'),
      right: `<div class="card">${waitbox('A sealed model on 0G is reading this request', 'If it is ordinary, it simply goes through. If money moves, I call you.', 'You are not interrupted for small things, and never skipped for big ones.')}</div>` })
  }
  if (d === 'DENIED') {
    cur = 'blocked'
    let host = ''; try { host = new URL(c.url).hostname } catch {}
    return frame({ tabs: 1, now: 'Something was stopped', why: 'Outside what you lit, nothing gets through.', gainLabel: 'YOU DID NOTHING', gain: 'and nothing got out. This is what I am here for.', bg: '#ECEAFB',
      left: hero('guard', 'Blocked it. Sleep on.', 'I stopped it<br>while you slept.', `${TOOL} tried to send data to a place you never allowed. It was a mistake, not an attack. It still did not get through.`),
      right: `<div class="card">${tag('BLOCKED', 'no')}${kv('Tried', esc(`${c.method} ${host}`))}${kv('You allowed', 'api.stripe.com only')}${kv('Tried by', esc(`${c.tool} ${agent?.version || '1.0.0'}`))}
        <small>Nothing was sent. Nothing was charged.${c.onDevice ? ' Your Ledger shows BLOCKED too.' : ''}</small><div class="two">${ok}${recLink(c)}</div></div>` })
  }
  if (d === 'STOPPED') {
    cur = 'noverdict'
    return frame({ tabs: 1, now: 'No verdict, so nothing ran', why: 'I never guess. No answer means no action.', bg: '#ECEAFB',
      left: hero('guard', 'I stopped. No guessing.', 'No answer,<br>so nothing ran.', '0G could not be reached, so nobody judged this request. I do not make up a verdict in its place.'),
      right: `<div class="card">${tag('NO VERDICT', 'no')}${kv('What', esc(c.what))}<small>Nothing ran, and no use was spent.</small><div class="two">${ok}${recLink(c)}</div></div>` })
  }
  if (d === 'BYHAND') {
    cur = 'paid'
    const m = money(c)
    return frame({ tabs: 1, now: 'Done, once', why: 'One hold, one payment. It cannot be repeated.', gain: 'trust that money never moves behind your back.', bg: '#EAF7EF',
      left: hero('happy', 'Done. Once, because you said so.', m ? `${esc(m.amount)} refunded.<br>Once.` : 'Done. Once.', `${TOOL} still does not have your key, and that pass is used up.`),
      right: `<div class="card">${tag('BY HAND', 'hand')}${kv('What', esc(c.what))}${kv('How many times', 'Once')}<small>${zgLine(c)}</small><div class="two"><button data-act="open-ai">Back to ${TOOL} ↗</button>${ok}</div>${recLink(c)}</div>` })
  }
  if (d === 'DECLINED') {
    cur = 'refused'
    return frame({ tabs: 1, now: 'Not let through', why: 'Saying no is always allowed.', bg: '#ECEAFB',
      left: hero('guard', 'Understood. Not sent.', 'You said no.<br>Nothing moved.', 'Your key was not used. That you declined is on the record too.'),
      right: `<div class="card">${tag('YOU SAID NO', 'no')}${kv('What', esc(c.what))}<div class="two">${ok}${recLink(c)}</div></div>` })
  }
  cur = 'quiet'
  const n = through.length
  return frame({ tabs: 1, now: 'Nothing needs you', why: 'On an ordinary day, I never ask.', gain: n ? '' : '', bg: '#EAF7EF',
    left: hero('asleep', 'zzz… all quiet.', 'All quiet.<br>That is the point.', n ? `${n} request${n === 1 ? '' : 's'} went through. You were not bothered once.` : `${TOOL} has not asked for anything yet. When it does, small things simply go through.`),
    right: `<div class="card">${n ? tag('ROUTINE', 'ok') + kv(esc(through[n - 1].what), '× ' + n) + `<small>${zgLine(through[n - 1])}</small>` : '<small>Nothing yet.</small>'}</div><div class="card soft">You can close this tab. I will only call you when money is about to move.</div>` })
}
function vActivity(st) {
  cur = 'activity'
  const k = (x) => st.cards.filter((c) => x.includes(dec(c))).length
  const T = { ALLOWED: ['WENT THROUGH', 'ok'], BYHAND: ['BY HAND', 'hand'], DENIED: ['BLOCKED', 'no'], STOPPED: ['NO VERDICT', 'no'], DECLINED: ['YOU SAID NO', 'no'], NEEDS: ['NEEDS YOUR HAND', 'hand'], checking: ['CHECKING', 'ok'] }
  const rows = st.cards.slice().reverse().map((c) => { const t = T[dec(c)]; return `<div class="li">${tag(t[0], t[1])} ${esc(c.what)}${recLink(c)}</div>` }).join('')
  return frame({ tabs: 1, now: 'Your week', why: 'You can explain what happened, yourself.',
    left: hero('awake', 'Here is everything, nothing hidden.', 'Your week,<br>in three numbers.', 'What was stopped, what went through without asking you, and what you let through by hand. You can explain every line.'),
    right: `<div class="nums"><div><b class="n no">${k(['DENIED', 'STOPPED', 'DECLINED'])}</b>stopped</div><div><b class="n ok">${k(['ALLOWED'])}</b>went through<br>without asking</div><div><b class="n hand">${k(['BYHAND'])}</b>you let through<br>by hand</div></div><div class="card">${rows || '<small>Nothing yet.</small>'}</div>` })
}
const field = (names, others) => `<div class="field">${names.map((nm, i) => `<div class="me">${lamp(i === 0 ? 'happy' : 'awake', 66)}<b>${esc(nm)}</b></div>`).join('')}${Array.from({ length: Math.min(40, others) }, () => `<div class="an">${lamp('awake', 34)}</div>`).join('')}</div>`
const tgl = (on, act) => `<div class="tgl">${[['all', 'Everyone'], ['known', 'People I know']].map(([k, t]) => `<span class="${k === on ? 'on' : ''}" ${act ? `data-act="lights-mode:${k}"` : ''}>${t}</span>`).join('')}</div>`
function vLights(st) {
  const name = `billing-assistant ${agent?.version || '1.0.0'}`, w = ui.world
  if (ui.friend === 1) {
    cur = 'friend'
    return frame({ tabs: 1, who: 'Arjun’s shop', now: 'Choosing a tool <span class="sample">SAMPLE</span>', why: 'Choose by whose light it is, not by how many.',
      left: hero('awake', 'Someone you know uses this.', 'Priya’s light<br>shows the way.', 'You met Priya in person. She really uses this tool, with her own key. That tells you more than 212 strangers.'),
      right: `<div class="card"><div class="cardh2"><b>Tools for chasing unpaid orders</b>${tgl('known')}</div><div class="tool"><b>invoice-wizard 2.3</b><span>212 lights</span><em>nobody you know</em></div><div class="tool pick"><b>${name}</b><span>14 lights</span><em>${lamp('happy', 30)} Priya</em></div><div class="tool"><b>pay-helper 0.9</b><span>3 lights</span><em>nobody you know</em></div><button data-act="friend:2">Use it with TOMOSHIBI →</button></div>` })
  }
  if (ui.friend === 2) {
    cur = 'ending'
    return frame({ tabs: 1, now: 'Lights from people you know <span class="sample">SAMPLE</span>', why: 'Trust between people becomes the light.', gainLabel: 'BECAUSE OF YOU', gain: 'one more person never has to paste a key into an AI.',
      left: hero('happy', 'Look who is here!', 'Arjun found his way<br>by your light.', 'He chose this tool because your light was on. The next person will see both of you.'),
      right: `<div class="card"><div class="cardh2"><b>${name}</b>${tgl('known')}</div>${field(['You', 'Arjun'], 0)}<small>15 lights in all · 2 from people you know</small></div>` })
  }
  const mine = Boolean(me() && lights.who.includes(me())) || w?.step === 'done'
  if (mine) {
    cur = 'shown'
    const others = Math.max(0, lights.count - 1), known = people().filter((p) => p.tie !== 'me' && lights.who.includes(p.id)).map((p) => p.name)
    const all = ui.lightsMode === 'all'
    return frame({ tabs: 1, now: 'Your light is showing', why: 'Every light is one real person who really used this tool.', gainLabel: 'BECAUSE OF YOU', gain: 'the next shop owner can choose this tool with confidence.',
      left: hero('happy', 'Thank you!', 'You are a guidepost<br>now.', `People who know you will see your light and know this tool is really used${others ? `. ${others} other${others === 1 ? '' : 's'} really use it too` : ''}. That is how the next person finds their way.`),
      right: `<div class="card"><div class="cardh2"><b>${name}</b>${tgl(ui.lightsMode, true)}</div>${field(['You', ...known], all ? Math.max(0, others - known.length) : 0)}
        <small>${lights.count || 1} light${(lights.count || 1) === 1 ? '' : 's'} in all. Lights cannot be bought. They all go out when the version changes, and are earned again.${w?.simulated ? ' (World was simulated on this Broker.)' : ''}</small></div>` })
  }
  if (!st.uses) {
    cur = 'lights-early'
    return frame({ tabs: 1, now: 'Your light', why: 'A light means real use, so it cannot be shown early.',
      left: hero('awake', 'Not yet. Soon!', 'Let it do some<br>real work first.', `Once ${TOOL} has really used your key, you can let others see your light.`), right: '<div class="card soft">A light is not a review or a like. It says one thing: a real person really uses this, with their own key.</div>' })
  }
  cur = 'lights'
  let right
  if (!w) right = `<div class="card">${kv('Tool', name)}${kv('You used it', `${st.uses} time${st.uses === 1 ? '' : 's'}`)}<button data-act="show-light">Show my light →</button><small>World asks one question, once: are you one real person? It does not learn which tool, which key, or when.</small></div>`
  else if (w.step === 'starting') right = `<div class="card">${waitbox('Asking World for a code', 'You confirm on your own phone, in World App.', 'One real person, one light. That is why a light cannot be faked.')}</div>`
  else if (w.step === 'confirm') right = `<div class="card"><div class="qrrow">${w.real && typeof qrSvg === 'function' ? `<div class="qrbox">${qrSvg(w.uri, 132)}</div>` : ''}<div><b>Confirm you are one real person</b><ol><li>Open World App on your phone</li><li>Scan this code</li><li>Tap Confirm</li></ol></div></div>
      ${w.real ? `<a class="btn ghost" href="${esc(w.uri)}" target="_blank" rel="noopener">Or open World App on this device ↗</a><small>Code <b>${esc(w.code)}</b></small>` : '<small>Simulated on this Broker: no phone is asked.</small>'}
      ${waitbox('Waiting for you in World App', 'Your light becomes visible to people who know you.', 'They can choose a tool because you really use it.')}</div>`
  else if (w.step === 'preview') right = '<div class="card soft">This is the preview: no Broker is connected, so World is not asked. In the live app, World App confirms you here.</div>'
  else right = `<div class="card">${tag(esc(w.title), 'no')}<small>${esc(w.text)}</small><button class="ghost" data-act="show-light">Ask again</button></div>`
  return frame({ tabs: 1, now: 'Show your light', why: 'Others choose by whose light it is, not by how many.',
    left: hero('happy', 'Your light is already on!', 'Let your light<br>guide others.', 'You lit it when you held your Ledger, and you have really used it since. This lights nothing new. It lets people who know you see it, so they can choose with confidence.'), right })
}
function tomo(st) {
  if (mode === 'boot') { cur = 'boot'; return `<div class="frame"><div class="body"><div class="l">${waitbox('Waking up', 'I check whether your AI tool is running.', 'Then we get keys off your plate.')}</div><div class="r"></div></div></div>` }
  if (ui.busy) { cur = 'busy'; return frame({ steps: ui.busy.steps, now: ui.busy.now, why: ui.busy.why, left: hero('awake', 'One moment!', ui.busy.h, ''), right: `<div class="card">${waitbox(ui.busy.doing, ui.busy.next, ui.busy.why2)}</div>` }) }
  if (!st.lent) {
    if (st.asking || ui.pending === 'lend') return vHold(st)
    return ui.onb === 'welcome' ? vWelcome() : ui.onb === 'key' ? vKey() : vChoose(st)
  }
  if (!ui.ackLit && !st.cards.length) return vLit(st)
  if (st.asking?.why === 'press') return vHome(st)
  return ui.tab === 'activity' ? vActivity(st) : ui.tab === 'lights' ? vLights(st) : vHome(st)
}

// ── the AI tool's chat. The first two messages are scripted; what it does afterwards is real. ──
function chat(st) {
  cur = 'chat' + ui.chat
  const M = [['me', 'Chase the unpaid orders from last week.'], ['bot', 'Happy to. First I need to connect to Stripe:<ol><li>Open the folder <code>shop-tools</code></li><li>Create a file named <code>.env</code></li><li>Add the line <code>STRIPE_SECRET_KEY=sk_live_…</code></li><li>Tell me when it is done</li></ol>']]
  let extra = ''
  if (ui.chat === 0) extra = '<div class="thoughts"><span>What is a .env?</span><span>Which folder…?</span><span>How do I even write that?</span></div><div class="suggest">Can you use TOMOSHIBI instead? <span class="link">tomoshibi.app/priya</span><button data-act="chat-send">Send</button></div>'
  else {
    M.push(['me', 'Can you use TOMOSHIBI instead? <span class="link">tomoshibi.app/priya</span>'])
    M.push(['bot', 'Yes. Then there is no file to create, and I never hold your key.' + (st.lent ? '' : `<br>Approve what I may do here:<button class="aibtn" data-act="open-tomo">${lamp('awake', 22)} Approve in TOMOSHIBI ↗</button>`)])
  }
  if (st.lent) M.push(['bot', 'Thank you. I am connected through TOMOSHIBI, no file needed. I will start on the unpaid orders.'])
  for (const c of st.cards.slice(-8)) {
    const d = dec(c)
    const state = d === 'checking' ? '<span class="state wait">TOMOSHIBI is checking…</span>' : d === 'ALLOWED' ? '<span class="state ok">Done. It went through TOMOSHIBI.</span>'
      : d === 'NEEDS' ? '<span class="state wait">Waiting: this one needs your hand. <button class="link" data-act="open-tomo">Open TOMOSHIBI ↗</button></span>' : d === 'BYHAND' ? '<span class="state ok">Sent once, because you approved it.</span>'
      : d === 'DECLINED' ? '<span class="state bad">Not sent. You said no.</span>' : d === 'DENIED' ? '<span class="state bad">I could not. TOMOSHIBI blocked it.</span>' : '<span class="state bad">No decision could be made, so nothing ran.</span>'
    M.push(['bot', `${esc(c.what)}…${state}`])
  }
  return `<div class="frame ai" data-view="${cur}"><div class="aibody"><div class="aihd"><span class="bot"></span>${TOOL} <small>an AI tool for small shops</small></div>${M.map(([c, t]) => `<div class="m ${c}">${t}</div>`).join('')}${extra}<div class="aiin">Message ${TOOL}…</div>
    <div class="foot">${TOOL} is a demo AI tool (broker/demo-agent.mjs). Its first two messages are scripted; what it does after that is real.</div></div></div>`
}

// ── the page ──
let lastHtml = '', lastDemo = '', lastView = ''
function paint() {
  const st = reduce(), root = $('root'); if (!root) return
  const needs = st.lent && (st.asking?.why === 'press' || (st.cards.length && ['NEEDS', 'DENIED'].includes(dec(st.cards[st.cards.length - 1])) && ui.seenRid !== st.cards[st.cards.length - 1].rid))
  const showTomo = ui.opened || st.lent || ui.surface === 'tomo'
  const tabs = `<div class="tabs"><button class="${ui.surface === 'ai' ? 'on' : ''}" data-act="open-ai"><span class="bot"></span>${TOOL}</button>${showTomo ? `<button class="${ui.surface === 'tomo' ? 'on' : ''}" data-act="open-tomo">${lamp('awake', 18)}tomoshibi${needs && ui.surface !== 'tomo' ? '<i class="dot"></i>' : ''}</button>` : ''}</div>`
  const main = ui.surface === 'ai' ? chat(st) : tomo(st)
  const c = st.cards[st.cards.length - 1], m = c && money(c)
  const toast = ui.surface === 'ai' && st.lent && (st.asking?.why === 'press' || (c && dec(c) === 'NEEDS')) ? `<div class="toast" data-act="open-tomo">${lamp('alert', 34)}<div><b>TOMOSHIBI</b><br>${m ? `A refund of ${esc(m.amount)} is waiting for you.` : 'Something is waiting for you.'}</div><span>Open ↗</span></div>` : ''
  const html = tabs + main + toast
  if (html !== lastHtml) { root.innerHTML = html; lastHtml = html; const f = root.querySelector('.frame'); if (f && cur === lastView) f.style.animation = 'none'; lastView = cur }
  const busy = Boolean(st.asking) || st.cards.some((x) => !final(x)) || Boolean(ui.pending)
  const b = (id, t) => `<button data-act="run:${id}" ${!st.lent || busy ? 'disabled' : ''}>${t}</button>`
  const chip = (t, k) => `<span class="chip ${k}">${t}</span>`
  const demo = `<b>DEMO</b><span>Make the AI do something now:</span>${b('usual', 'A normal day')}${b('heavy', 'A customer returns a bag')}${b('denied-host', '3 a.m. mistake')}${mode === 'live' && agent?.deaf ? b('stopped', '0G unreachable') : ''}
    <button data-act="friend:${ui.friend === 0 ? 1 : 0}">${ui.friend ? 'Back to Priya' : 'Later: a friend chooses'}</button><span class="sp"></span>`
    + (mode === 'live' ? chip(agent.simulated ? '0G simulated' : `0G live${agent.model ? ' · ' + esc(agent.model) : ''}`, agent.simulated ? 'warn' : 'live') + chip(hasDevice() ? 'Ledger connected' : 'no Ledger', hasDevice() ? 'live' : 'warn') + chip(agent.worldSimulated ? 'World simulated' : 'World live', agent.worldSimulated ? 'warn' : 'live') + chip(agent.execute ? 'execution on' : 'execution off', '')
      : mode === 'preview' ? chip('PREVIEW · recorded answers, nothing is sent', 'warn') : chip('starting…', ''))
    + `<button data-act="reset">Start over</button>${st.error ? `<span class="chip warn">${esc(st.error)}</span>` : ''}`
  if (demo !== lastDemo) { $('demo').innerHTML = demo; lastDemo = demo }
}
function step(o, ms, then) { ui.busy = o; paint(); setTimeout(() => { ui.busy = null; then(); save(); paint() }, ms) }
// Start over. Wait for the tool to forget first, so its new, empty record is not mistaken for a restart of its own.
async function restart() { await src().post('/reset'); epoch = null; all = []; ui = fresh(); save(); paint() }

const ACT = {
  'chat-send': () => { ui.chat = 1 },
  'open-tomo': () => { ui.surface = 'tomo'; ui.opened = true; if (ui.chat === 0) ui.chat = 1 },
  'open-ai': () => { ui.surface = 'ai' },
  onb: (a) => { ui.onb = a },
  'key-test': () => { const i = $('keyIn'); if (i) { i.value = 'sk_test_demo_not_a_real_key'; i.dispatchEvent(new Event('input', { bubbles: true })) } return false },
  'key-keep': () => { const i = $('keyIn'); if (!i || !i.value.trim()) return false; i.value = ''
    step({ steps: 0, now: 'Step 1 of 3 · Leave your key with TOMOSHIBI', why: 'No file to edit. Your AI never sees the key.', h: 'Putting your key<br>somewhere safe.', doing: 'Putting your key away', next: `You choose what ${TOOL} may do with it.`, why2: 'It will get a small permission. Never the key itself.' }, 1500, () => { ui.onb = 'choose'; ui.gain = 'key' }); return false },
  lend: () => { ui.pending = 'lend'; ui.err = null; ui.gain = null; src().post('/lend', CHO[ui.choice]); setTimeout(() => { if (ui.pending === 'lend') { ui.pending = null; ui.err = `${TOOL} did not answer. Try again.`; paint() } }, 15000) },
  'soft-no': () => { src().post('/hold', { ok: false }) },
  'back-ai': () => { ui.ackLit = true; ui.surface = 'ai' },
  tab: (a) => { ui.tab = a; ui.friend = 0; if (a === 'lights') refreshLights() },
  seen: () => { const st = reduce(), c = st.cards[st.cards.length - 1]; if (c) ui.seenRid = c.rid },
  connect: (a) => { connectLedger(a); return false },
  run: (a) => { src().post('/run', { id: a }) },
  reset: () => { restart(); return false },
  'show-light': () => { startWorld(); return false },
  'lights-mode': (a) => { ui.lightsMode = a },
  friend: (a) => { ui.friend = Number(a); if (ui.friend) { ui.surface = 'tomo'; ui.opened = true; ui.tab = 'lights' } },
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return
  const [act, arg] = t.dataset.act.split(':'); if (!ACT[act]) return
  if (ACT[act](arg) !== false) { save(); paint() }
})
document.addEventListener('change', (e) => { if (e.target.id === 'ends') { ui.choice = Number(e.target.value); save(); paint() } })
document.addEventListener('input', (e) => { if (e.target.id === 'keyIn') { const b = document.querySelector('[data-act="key-keep"]'); if (b) b.disabled = !e.target.value.trim() } })
// The stand-in for the Ledger: a real hold, a little over a second.
let ht = null
document.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-hold]'); if (!b) return; b.classList.add('down'); ht = setTimeout(() => { src().post('/hold', { ok: true }) }, 1150) })
for (const n of ['pointerup', 'pointercancel']) document.addEventListener(n, () => { clearTimeout(ht); document.querySelectorAll('.holdbtn.down').forEach((b) => b.classList.remove('down')) })
const KEYS = { 1: 'usual', 2: 'heavy', 3: 'denied-host', 5: 'stopped' }
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.closest?.('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return   // a held key repeats; one press is one request
  if (KEYS[e.key]) src().post('/run', { id: KEYS[e.key] }); else if (e.key === 'r' || e.key === 'R') restart()
})

// Is the AI tool there? A slow link gets a second, longer try before the page settles for the preview.
async function probeAgent(ms) { try { const h = await (await fetch(AGENT + '/health', { signal: AbortSignal.timeout(ms) })).json(); return h.ok && h.brokerUp ? h : null } catch { return null } }
function goLive(h) {
  agent = h; mode = 'live'
  const loop = async () => { await live.poll().catch(() => {}); setTimeout(loop, 400) }
  loop()
  setInterval(async () => { const n = await probeAgent(6000); if (!n) return; const ch = n.device !== agent.device || n.lent !== agent.lent; agent = n; if (ch) paint() }, 3000)
  refreshLights()
}
async function init() {
  paint()
  const h = (await probeAgent(3000)) || (await probeAgent(7000))
  if (h) goLive(h)
  else {
    mode = 'preview'
    for (const u of ['scenes.json', '../ui/scenes.json']) { if (REC) break; try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) REC = await r.json() } catch {} }
    // If the tool turns up later and nothing has been replayed yet, switch to it.
    const again = setInterval(async () => { const n = await probeAgent(5000); if (n && all.length === 0) { clearInterval(again); goLive(n); paint() } }, 6000)
  }
  paint()
}
// For looking at the page's own state from the console when something does not move.
window.tomoshibi = { get events() { return all }, get ui() { return ui }, get mode() { return mode }, get epoch() { return epoch }, reduce, paint }
init()
})()
