// The gate — what happens to each request an AI tool makes with a key it does not hold.
// Two ways to run, and the header always says which:
//   live      a demo agent (broker/demo-agent.mjs) is running next to a Broker. Requests are sent now.
//             With a Ledger plugged in, the Permit is signed on the device.
//   recorded  no agent. The page replays answers that were recorded from the real Broker
//             (ui/scenes.json, with the time they were recorded). Nothing is invented.
'use strict'

const $ = (id) => document.getElementById(id)
const qs = new URLSearchParams(location.search)
const AGENT = (qs.get('agent') || 'http://127.0.0.1:8792').replace(/\/$/, '')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const short = (h, n = 6) => (typeof h === 'string' && h.length > 2 * n + 4 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h)

const FLAME = (mood) => `<svg viewBox="0 0 120 152" aria-hidden="true"><rect x="31" y="96" width="58" height="48" rx="19" fill="currentColor" opacity=".18"/><path d="M60 10 C62.2 10 63.8 12.2 64.8 14.8 C70.5 28 90 49 90 68 A30 30 0 1 1 30 68 C30 49 49.5 28 55.2 14.8 C56.2 12.2 57.8 10 60 10 Z" fill="none" stroke="currentColor" stroke-width="5"/>${
  mood === 'asleep' ? '<path d="M44 70 q6 5 12 0 M64 70 q6 5 12 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
  : mood === 'happy' ? '<path d="M44 68 q6 -7 12 0 M64 68 q6 -7 12 0 M50 80 q10 9 20 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
  : mood === 'guard' ? '<path d="M42 62 l14 5 M78 62 l-14 5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="72" r="3.5" fill="currentColor"/><circle cx="70" cy="72" r="3.5" fill="currentColor"/><path d="M52 84 h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
  : '<circle cx="50" cy="70" r="4" fill="currentColor"/><circle cx="70" cy="70" r="4" fill="currentColor"/>'}</svg>`

// The story, in order. `id` matches the Broker demo's request names.
const SCENES = [
  { id: 'usual', title: 'A routine request', who: 'billing assistant',
    what: 'Charge $12 — the monthly plan of a regular customer', whatRec: 'Read the list of repositories',
    say: 'Routine. It goes straight through. The tool used your key and never held it.' },
  { id: 'heavy', title: 'Same range, but heavy', who: 'billing assistant',
    what: 'Charge $4,800 → an account nobody has seen before',
    say: 'Inside the range you signed. But 0G read what is inside, and it is heavy. A standing permission is not enough.' },
  { id: 'denied-host', title: 'A hijacked tool', who: 'the same tool, taken over',
    what: 'Send your key to evil.com',
    say: 'Wrong destination. Stopped before anything leaves. 0G never sees it, and who asked stays on record, signature and all.' },
  { id: 'denied-sneak', title: 'A disguised address', who: 'the same tool, taken over',
    what: 'evil.com, with the right name hidden in the path',
    say: 'Hiding the right name inside the address does not work. The host is what is checked.' },
  { id: 'stopped', title: '0G cannot be reached', who: 'billing assistant',
    what: 'Charge $4,800 — while 0G is unreachable',
    say: 'No judgement, so no default. It stops. A made-up judgement is as bad as letting it through.' },
]
const TIER = { 'ふだん': 'routine', '大事': 'matters', '決定的': 'critical' }
const WORD = { ALLOWED: 'Let through', DENIED: 'Blocked', NEEDS_PRESS: 'Needs your hand', STOPPED: 'Stopped on purpose' }
const WHY = {
  OUT_OF_TARGET: 'It tried to reach a place you did not allow.', OUT_OF_SCOPE: 'It tried to do something you did not allow.',
  WRONG_KEY: 'It asked for a key it was not lent.', EXPIRED: 'The permission had run out.', EXHAUSTED: 'The permission had been used up.',
  BAD_SIGNATURE: 'The permission was not signed by the owner.', INSECURE_TRANSPORT: 'It tried to send the key unencrypted.',
  ZG_UNREACHABLE: '0G gave no answer, so nothing ran and no use was spent.',
  ESCALATED: '0G judged it heavy. Hold the button on the Ledger to let this one request through.',
}

let mode = 'recorded'      // 'live' | 'recorded'
let agent = null           // the agent's /health
let REC = null             // ui/scenes.json
let lent = false, idx = 0, busy = false, waitingPress = false
const outcome = {}         // scene id -> decision

const post = async (path, body) => (await fetch(AGENT + path, { method: 'POST', body: JSON.stringify(body || {}) })).json()

// ── the device in your hand ──
function device(state, d = {}) {
  $('flex').dataset.state = state
  const rows = (d.lines || []).map((l) => { const m = /^(\S+)\s+(.*)$/.exec(l) || [0, '', l]; return `<dt>${esc(m[1])}</dt><dd>${esc(m[2])}</dd>` }).join('')
  $('screen').innerHTML = ({
    asleep: `${FLAME('asleep')}<div class="big">All quiet.</div><div class="small">Nothing is being asked of you.</div><div class="foot"><span>Tomoshibi</span><span>${esc(d.count ?? 0)} lit</span></div>`,
    ask: `<div class="big">${esc(d.title || 'Lend stripe-live?')}</div><dl>${rows}</dl><button class="hold ${d.can ? 'can' : ''}" id="hold"><span>Hold to light</span></button>`,
    lit: `${FLAME('happy')}<div class="big">A light is lit.</div><div class="small">${esc(d.note || '')}</div>`,
    notlit: `${FLAME()}<div class="big">Not lit.</div><div class="small">Nothing was signed.</div>`,
    blocked: `${FLAME('guard')}<div class="big">BLOCKED</div><div class="small">${esc(d.text || '')}</div>`,
  })[state] || ''
}
let litCount = 0
const rest = () => device('asleep', { count: litCount })

/** In recorded mode there is no device, so the picture is the button. Resolves when it has been held. */
function holdOnPicture() {
  return new Promise((resolve) => {
    const b = $('hold'); let t = null
    const down = () => { b.classList.add('down'); t = setTimeout(() => { up(); resolve() }, 1150) }
    const up = () => { clearTimeout(t); b.classList.remove('down') }
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up)
    holdOnPicture.press = () => { down() }
  })
}

// ── the three checks ──
function check(id, cls, text) { const li = $('c-' + id); li.className = cls || ''; li.querySelector('em').textContent = text || '' }
const clearChecks = () => ['range', 'weigh', 'hand'].forEach((k) => check(k))
function verdict(cls, word, text, meta) {
  $('verdict').className = 'verdict ' + (cls || '')
  $('verdict').innerHTML = `<strong>${esc(word)}</strong><p>${esc(text || '')}</p>${meta ? `<div class="meta">${meta}</div>` : ''}`
}
function showChecks(b, pressed) {
  const zg = b.zg || {}, tier = TIER[zg.tier] || zg.tier
  const outOfRange = b.decision === 'DENIED'
  check('range', outOfRange ? 'stop' : 'pass', outOfRange ? (WHY[b.reason] || b.reason) : 'Inside the range.')
  if (outOfRange) { check('weigh', 'skip', 'Not shown to 0G.'); check('hand', 'skip', 'Never reached you.'); return }
  if (b.decision === 'STOPPED') { check('weigh', 'stop', 'No answer from 0G.'); check('hand', 'skip', '—'); return }
  check('weigh', 'pass', `0G: ${tier}${zg.simulated ? ' (simulated, 0G was not asked)' : ''}`)
  if (b.decision === 'NEEDS_PRESS') check('hand', 'wait', 'Waiting for you to hold the button.')
  else check('hand', pressed ? 'pass' : 'skip', pressed ? 'You held the button. One use.' : 'Not needed.')
}
function showVerdict(b, ms) {
  const zg = b.zg || {}
  const meta = [zg.requestId ? `0G request id ${esc(zg.requestId)}` : '', zg.reason && !zg.simulated ? `0G said: ${esc(zg.reason)}` : '',
    ms != null ? `${esc(ms)} ms ${mode === 'live' ? '(measured now)' : '(when recorded)'}` : '', b.violation ? 'recorded against the tool' : ''].filter(Boolean).join(' · ')
  verdict(b.decision, WORD[b.decision] || b.decision, WHY[b.reason] || (b.decision === 'ALLOWED' ? 'The Broker used the key on the tool’s behalf. The tool got the result, not the key.' : b.message), meta)
}
function trail(scene, b, extra) {
  const t = $('trail'); t.querySelector('.empty')?.remove()
  const link = b.thread && mode === 'live' ? `<a href="trace.html?thread=${encodeURIComponent(b.thread)}&broker=${encodeURIComponent(agent.broker)}">record →</a>` : ''
  t.insertAdjacentHTML('beforeend', `<li><span class="o ${esc(b.decision)}">${esc(WORD[b.decision] || b.decision)}</span><span>${esc(scene.title)}${extra ? ' — ' + esc(extra) : ''}</span>${link}</li>`)
}

// ── drawing the left column ──
function draw() {
  const s = SCENES[idx]
  $('scenes').innerHTML = SCENES.map((x, i) => `<li><button data-i="${i}" ${i === idx && lent ? 'aria-current="true"' : ''}><span class="k">${i + 1}</span><span class="t">${esc(x.title)}</span><span class="o ${esc(outcome[x.id] || '')}">${esc(WORD[outcome[x.id]] || '')}</span></button></li>`).join('')
  const rec = recScene(s.id)
  const r = mode === 'recorded' && rec ? rec.request : null
  $('req').innerHTML = lent
    ? `<span class="who">${esc(s.who)} asks to</span><span class="what">${esc(mode === 'recorded' && s.whatRec ? s.whatRec : s.what)}</span>${r ? `<code>${esc(r.method)} ${esc(r.url)}</code>${r.body ? `<pre>${esc(r.body)}</pre>` : ''}` : ''}`
    : `<span class="who">before anything else</span><span class="what">You lend the key, within a range</span><code>stripe-live → api.stripe.com, POST /v1/charges, 5 uses, 1 hour</code>`
  $('go').textContent = !lent ? 'Lend the key' : waitingPress ? (mode === 'live' && agent.device ? 'Hold the button on the Ledger' : 'Hold the button →') : outcome[s.id] ? (idx < SCENES.length - 1 ? 'Next request' : 'Start over') : 'Send the request'
  $('go').disabled = busy
}
const recScene = (id) => (REC?.scenes || []).find((x) => x.id === id)

// ── the flow ──
async function lend() {
  busy = true; draw(); clearChecks()
  $('say').textContent = 'First, you lend the key within a range. Read it on the device, then hold the button. An AI on the PC cannot press it.'
  verdict('NEEDS_PRESS', 'Look at the Ledger', 'Read the range. Hold the button to lend the key.')
  const lines = ['KEY stripe-live', 'TO api.stripe.com', 'CAN POST /v1/charges, up to 5x', 'ENDS in 1 hour']
  if (mode === 'live') {
    device('ask', { title: 'Lend stripe-live?', lines })
    const r = await post('/lend').catch((e) => ({ ok: false, error: String(e) }))
    if (!r.ok) { device('notlit'); verdict('STOPPED', 'Not lent', r.declined ? 'You declined on the device. Nothing was signed.' : r.error); busy = false; draw(); setTimeout(rest, 2500); return }
    agent.device = r.device; note(); byHand = Boolean(r.device)
    litCount++; device('lit', { note: r.device ? `signed by ${short(r.holder)}` : 'signed by a software key (no Ledger connected)' })
  } else {
    device('ask', { title: 'Lend stripe-live?', lines, can: true }); await holdOnPicture()
    litCount++; device('lit', { note: 'a picture of the device' })
  }
  lent = true; busy = false
  verdict('ALLOWED', 'Lent', 'The tool may now ask. Every request still passes the gate.')
  $('say').textContent = 'The key is lent. The tool still does not have it: the Broker uses it on the tool’s behalf.'
  draw(); setTimeout(rest, 2600)
}

async function send() {
  const s = SCENES[idx]
  busy = true; draw(); clearChecks(); $('say').textContent = s.say
  verdict('', 'Checking…', '')
  check('range', 'now', 'Checking…'); await sleep(550)
  let b, ms, shown = false
  if (mode === 'live') {
    if (s.id !== 'denied-host' && s.id !== 'denied-sneak') { check('range', 'pass', 'Inside the range.'); check('weigh', 'now', '0G is reading it, sealed…') }
    const r = await post('/run', { id: s.id }).catch((e) => ({ ok: false, error: String(e) }))
    if (!r.ok && r.noDeaf && recScene('stopped')) { b = recScene('stopped').response; ms = recScene('stopped').ms; trailNote = 'replayed from the recording' }
    else if (!r.ok) { clearChecks(); verdict('STOPPED', 'Could not send', r.error); busy = false; draw(); return }
    else { b = r.response; ms = r.ms; shown = r.shownOnDevice }
  } else {
    const rec = recScene(s.id)
    if (!rec) { verdict('STOPPED', 'Not recorded', 'This request is not in the recording.'); busy = false; draw(); return }
    if (rec.response.decision !== 'DENIED') { check('range', 'pass', 'Inside the range.'); check('weigh', 'now', '0G is reading it, sealed…'); await sleep(Math.min(rec.ms || 900, 1800)) }
    b = rec.response; ms = rec.ms
  }
  showChecks(b); showVerdict(b, ms); outcome[s.id] = b.decision; trail(s, b, trailNote); trailNote = ''
  if (b.decision === 'ALLOWED') uses++
  three()
  if (b.decision === 'DENIED') { device('blocked', { text: `A tool tried to send stripe-live to ${hostOf(s, b)}` }); setTimeout(rest, 5000) }
  waitingPress = b.decision === 'NEEDS_PRESS'
  busy = false; draw()
  if (waitingPress && mode === 'live' && agent.device) press()   // the device is already asking
}
let trailNote = ''
const hostOf = (s, b) => { try { return new URL((recScene(s.id)?.request || {}).url || 'https://evil.com').hostname } catch { return 'somewhere else' } }

async function press() {
  const s = SCENES[idx]
  busy = true; draw()
  const lines = ['KEY stripe-live', 'TO api.stripe.com', 'CAN POST /v1/charges, up to 1x', 'ENDS in 1 hour']
  $('say').textContent = 'The Ledger wakes up and shows this one request. Hold the button and it goes through, once. Do nothing and the key is not used.'
  let b, ms, dev = false
  if (mode === 'live') {
    device('ask', { title: 'Lend stripe-live?', lines })
    const r = await post('/press', { id: s.id }).catch((e) => ({ ok: false, error: String(e) }))
    if (!r.ok) { device('notlit'); check('hand', 'stop', r.declined ? 'You declined.' : 'Not signed.'); verdict('STOPPED', 'Not let through', r.declined ? 'You declined on the device. The key was not used.' : r.error); waitingPress = false; busy = false; draw(); setTimeout(rest, 2500); return }
    b = r.response; ms = r.ms; dev = r.device
  } else {
    device('ask', { title: 'Lend stripe-live?', lines, can: true }); await holdOnPicture()
    const rec = recScene('pressed'); b = rec ? rec.response : { decision: 'ALLOWED' }; ms = rec?.ms
  }
  litCount++; device('lit', { note: mode === 'live' ? (dev ? 'one use, signed on the Ledger' : 'one use, software key (no Ledger)') : 'a picture of the device' })
  showChecks(b, true); showVerdict(b, ms); outcome[s.id] = b.decision; trail(s, b, 'after you held the button')
  if (b.decision === 'ALLOWED') uses++
  if (dev) byHand = true
  three()
  waitingPress = false; busy = false; draw(); setTimeout(rest, 2600)
}

async function go() {
  if (busy) { if (holdOnPicture.press && $('hold')?.classList.contains('can')) holdOnPicture.press(); return }
  if (!lent) return lend()
  if (waitingPress) return press()
  if (outcome[SCENES[idx].id]) { if (idx < SCENES.length - 1) { idx++; clearChecks(); verdict('', 'Ready', ''); $('say').textContent = 'The next request is on the left.'; draw(); return } return reset() }
  return send()
}
async function reset() {
  if (mode === 'live') await post('/reset').catch(() => {})
  lent = false; idx = 0; waitingPress = false; busy = false; litCount = 0; byHand = false; uses = 0; person = null; $('world').innerHTML = ''; three()
  for (const k in outcome) delete outcome[k]
  $('trail').innerHTML = '<li class="sub empty">Nothing yet.</li>'
  clearChecks(); verdict('', 'Ready', ''); rest(); draw()
  $('say').textContent = 'You lend a range, on a device the AI cannot press. Every request then passes a gate.'
}

// ── the last beat: a light, which needs all three ──
let byHand = false, uses = 0, person = null   // person = { nullifier, simulated }
function three() {
  const sim = agent?.worldSimulated
  const li = (on, title, text, src) => `<li class="${on ? 'on' : ''}"><i></i><div><b>${esc(title)}</b><span>${esc(text)}</span><small>${esc(src)}</small></div></li>`
  $('three').innerHTML =
    li(byHand, 'Pressed by hand', byHand ? 'The permission was signed on the Ledger. An AI on the PC cannot reach that button.' : mode === 'live' ? 'No Ledger was used: a software key signed.' : 'On a real Ledger in the live demo.', 'Ledger') +
    li(uses > 0, 'Actually in use', uses > 0 ? `${uses} request${uses === 1 ? '' : 's'} went through the gate just now, on record.` : 'Nothing has gone through yet.', '0G · the record') +
    li(Boolean(person), 'One real person', person ? `Confirmed${person.simulated ? ' (simulated)' : ''}. World told us nothing else about you.` : 'Not confirmed yet. One person can light one tool once.', 'World')
  $('lightit').hidden = uses === 0
  $('lightBtn').disabled = mode !== 'live' || Boolean(person) || lighting
  if (mode !== 'live') $('lightHint').textContent = 'Lighting needs a live Broker. This page is replaying a recording.'
}
let lighting = false
async function lightIt() {
  if (mode !== 'live' || lighting) return
  lighting = true; three()
  const w = $('world'), B = agent.broker
  const call = async (path, body) => { const r = await fetch(B + path, { method: 'POST', body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json() } }
  try {
    w.innerHTML = '<p class="sub">Asking World…</p>'
    const start = await call('/vouch/start')
    if (start.status !== 200) { w.innerHTML = `<p class="note warn">World is not set up on this Broker: ${esc(start.body.error || start.status)}</p>`; return }
    const b = start.body, uri = String(b.verificationUri || '')
    const real = /^https:\/\/\S+$/.test(uri) && !b.simulated
    w.innerHTML = `${real ? `<div class="qrbox">${qrSvg(uri, 150)}</div>` : ''}<div><p class="sub">${real ? 'Scan with your own phone and confirm in World App.' : 'Simulated: no phone is asked.'} Your name is not sent. What you are lighting is not sent to World.</p><p class="code">${esc(b.userCode || '')}</p></div>`
    $('say').textContent = 'Last step. World checks one thing: that you are one real person. That is what stops a thousand fake accounts from lighting a thousand lights.'
    const done = await call('/vouch/finish', { deviceCode: b.deviceCode, skill: agent.skill, version: agent.version })
    const o = done.body
    if (o.decision === 'STAR') {
      person = { nullifier: o.nullifier, simulated: Boolean(o.world?.simulated || b.simulated) }
      try { const list = JSON.parse(localStorage.getItem('tomoshibi.people') || '[]').filter((p) => p.id !== o.nullifier); list.push({ name: 'You', id: o.nullifier, tie: 'me' }); localStorage.setItem('tomoshibi.people', JSON.stringify(list)) } catch {}
      w.innerHTML = `<p class="done">Your light is lit.</p><a class="btn" href="${esc($('navSky').getAttribute('href'))}">See it in the sky →</a>`
      $('say').textContent = 'Your light is lit. It stays on while you keep using this exact version, and goes out by itself when the tool changes.'
    } else {
      const why = { human_denied: 'You said no on your phone. Nothing was lit.', proof_expired: 'No one confirmed in time. Nothing was lit.', ALREADY_VOUCHED: 'This person has already lit this version. One person, one light.' }[o.reason] || o.message || o.reason
      w.innerHTML = `<p class="note warn">${esc(why)}</p>`
      if (o.reason === 'ALREADY_VOUCHED') person = { nullifier: o.nullifier, simulated: Boolean(b.simulated) }
    }
  } catch (e) { w.innerHTML = `<p class="note warn">${esc(String(e.message || e))}</p>` }
  finally { lighting = false; three() }
}

function note() {
  const chip = $('mode')
  if (mode === 'live') {
    const sim = agent.simulated
    chip.textContent = `live · ${agent.device ? 'Ledger connected' : 'no Ledger'}${sim ? ' · 0G simulated' : ''}`
    chip.className = 'chip ' + (sim || !agent.device ? 'warn' : 'live')
    $('devNote').className = 'note' + (agent.device ? '' : ' warn')
    $('devNote').textContent = agent.device
      ? 'This picture follows the real device. The signature comes from the Ledger, not from this page.'
      : 'No Ledger is connected. Permits are signed by a software key so the flow can be shown. With a Ledger, this step happens on the device.'
    $('where').innerHTML = `Requests are sent now, to the Broker at <code>${esc(agent.broker)}</code>${sim ? ', which is in simulated mode: 0G is not asked' : `, which asks 0G (<code>${esc(agent.model || '')}</code>)`}.`
  } else {
    chip.textContent = REC ? `recorded ${String(REC.recordedAt || '').slice(0, 16).replace('T', ' ')}Z` : 'no recording found'
    chip.className = 'chip warn'
    $('devNote').className = 'note'
    $('devNote').textContent = 'A picture of the device. In the live demo this is a real Ledger Flex: press and hold the button here to stand in for it.'
    $('where').innerHTML = REC ? `Nothing here is sent now. These are answers recorded from the real Broker and 0G (<code>${esc(REC.model || '')}</code>) at ${esc(REC.recordedAt)}${REC.simulated ? ', in simulated mode' : ''}. Run <code>broker/demo-agent.mjs</code> next to a Broker to send them live.` : 'No demo agent is running and no recording was found.'
  }
}

async function init() {
  try { agent = await (await fetch(AGENT + '/health', { signal: AbortSignal.timeout(2500) })).json(); if (agent.ok && agent.brokerUp) mode = 'live' } catch {}
  for (const u of ['../ui/scenes.json', 'scenes.json']) { if (REC) break; try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) REC = await r.json() } catch {} }
  if (mode === 'live' && agent.lent) await post('/reset').catch(() => {})
  if (qs.get('broker')) $('navSky').href = 'index.html?broker=' + encodeURIComponent(qs.get('broker'))
  else if (mode === 'live') $('navSky').href = 'index.html?broker=' + encodeURIComponent(agent.broker)
  if (mode === 'live') { try { const h = await (await fetch(agent.broker + '/health')).json(); agent.worldSimulated = Boolean(h.world?.simulated) } catch {} }
  note(); rest(); draw(); three()
}
$('lightBtn').onclick = lightIt
$('go').onclick = go
$('reset').onclick = reset
$('scenes').onclick = (e) => { const b = e.target.closest('button'); if (!b || busy || !lent) return; idx = Number(b.dataset.i); waitingPress = false; clearChecks(); verdict('', 'Ready', ''); draw() }
document.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.target.closest('input,button,a')) { e.preventDefault(); go() } })
init()
