// "Since you last looked" — what happened with your key, in the order a person wants to know it:
// what was stopped, what you let through by hand, and what went through without asking you.
// Everything here is read from the Broker's record for one holder. Nothing is filled in, and the
// times are the real times in the record.
'use strict'
const $ = (id) => document.getElementById(id)
const qs = new URLSearchParams(location.search)
// Opened from the tab bar there is no link to read from, so use what the keys page remembered on this device.
let last = {}; try { last = JSON.parse(localStorage.getItem('tomoshibi.last') || '{}') } catch {}
const BROKER = (qs.get('broker') || last.broker || 'http://127.0.0.1:8787').replace(/\/$/, '')
const holder = qs.get('holder') || last.holder || ''
// Only what happened since the key was last lent (the keys page passes that moment). Without it, everything.
const since = Date.parse(qs.get('since') || last.since || '') || 0
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const WHY = {
  OUT_OF_TARGET: 'It tried to use your key somewhere you did not allow.', OUT_OF_SCOPE: 'It tried to do something you did not allow.',
  WRONG_KEY: 'It asked for a key it was not lent.', EXPIRED: 'Your permission had run out.', EXHAUSTED: 'Your permission had been used up.',
  ZG_UNREACHABLE: '0G gave no answer, so no judgement was made and nothing ran.',
}
// A request in a person's words, from what the record holds (method and address only; the body is not kept).
function inWords(req) {
  let u; try { u = new URL(req.url) } catch { return `${req.method} ${req.url}` }
  const p = u.pathname
  if (/\/refunds/.test(p)) return 'A refund'
  if (/\/charges/.test(p) && req.method === 'POST') return 'A charge'
  if (/\/invoices/.test(p) && req.method === 'GET') return 'Checked unpaid orders'
  if (/\/balance/.test(p)) return 'Read the balance'
  return `${req.method} ${u.hostname}${p}`
}
const time = (at) => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }
const link = (t) => `<a href="trace.html?thread=${encodeURIComponent(t)}&broker=${encodeURIComponent(BROKER)}">full record →</a>`

async function load() {
  if (!holder) { $('headline').textContent = 'Nothing yet.'; $('subline').textContent = 'Lend a key on the Keys tab. What happens with it shows up here.'; $('status').textContent = 'no key lent'; return }
  let recs
  try { recs = (await (await fetch(`${BROKER}/holder/${encodeURIComponent(holder)}`, { cache: 'no-store' })).json()).records || [] } catch {
    $('headline').textContent = 'Could not read the record.'; $('subline').textContent = `The Broker at ${BROKER} did not answer from here.`
    $('status').textContent = 'Broker not reachable'; $('status').className = 'chip warn'; return
  }
  // One request can have several records (asked, waited, pressed). Group them by request.
  const byThread = new Map()
  for (const r of recs) if (r.thread && r.request && (!since || Date.parse(r.at) >= since - 2000)) { const l = byThread.get(r.thread) ?? []; l.push(r); byThread.set(r.thread, l) }
  const items = [...byThread.entries()].map(([thread, l]) => {
    const last = l[l.length - 1], asked = l.some((r) => r.decision === 'NEEDS_PRESS')
    const kind = last.decision === 'DENIED' ? 'bad' : last.decision === 'STOPPED' ? 'stop' : last.decision === 'NEEDS_PRESS' ? 'wait' : asked ? 'hand' : 'quiet'
    // The same request repeated under one permission shares an id; count how many times it went through.
    return { thread, last, kind, n: Math.max(1, l.filter((r) => r.decision === 'ALLOWED').length), sim: l.some((r) => r.zg?.simulated) }
  })
  // A press is a new, single-use permission, so the Broker files it under a new request id. Join the two:
  // the same request, asked for and then let through, is one thing the person did by hand.
  const same = (i) => `${i.last.request.method} ${i.last.request.url}`
  const waiting = new Map()
  for (const i of items) {
    if (i.kind === 'wait') waiting.set(same(i), i)
    else if (i.kind === 'quiet' && waiting.has(same(i))) { waiting.get(same(i)).gone = true; waiting.delete(same(i)); i.kind = 'hand' }
  }
  for (let k = items.length - 1; k >= 0; k--) if (items[k].gone) items.splice(k, 1)
  const bad = items.filter((i) => i.kind === 'bad'), hand = items.filter((i) => i.kind === 'hand'), wait = items.filter((i) => i.kind === 'wait')
  const quiet = items.filter((i) => i.kind === 'quiet'), stop = items.filter((i) => i.kind === 'stop')
  $('headline').textContent = bad.length ? `${bad.length} ${bad.length === 1 ? 'thing was' : 'things were'} stopped.` : 'Nothing had to be stopped.'
  $('headline').className = bad.length ? 'stopped' : 'calm'
  const quietN = quiet.reduce((a, i) => a + i.n, 0)
  $('subline').textContent = `${quietN} went through without asking you. ${hand.length} you let through by hand.${wait.length ? ` ${wait.length} still waiting for you.` : ''}`
  const row = (i, tag, title, why) => `<li class="${i.kind === 'wait' ? 'hand' : i.kind}"><span class="tag">${tag}</span><b>${title}</b><span class="why">${why}</span><span class="meta">${esc(time(i.last.at))} · ${link(i.thread)}${i.sim ? ' · simulated' : ''}</span></li>`
  const host = (i) => { try { return new URL(i.last.request.url).hostname } catch { return 'somewhere else' } }
  let html = ''
  for (const i of bad.reverse()) html += row(i, 'STOPPED', `A tool tried to use your key at ${esc(host(i))}`, `${esc(WHY[i.last.reason] || i.last.message || '')} ${i.last.violation ? 'It is on record against the tool, with the tool’s own signature.' : ''}`)
  for (const i of wait.reverse()) html += row(i, 'WAITING FOR YOU', esc(inWords(i.last.request)), 'Nothing happens until you hold the button on your Ledger.')
  for (const i of hand.reverse()) html += row(i, 'YOU HELD THE BUTTON', esc(inWords(i.last.request)), 'Money was about to move, so you were asked. It went through once.')
  for (const i of stop.reverse()) html += row(i, 'NOT DECIDED', esc(inWords(i.last.request)), esc(WHY[i.last.reason] || 'It was stopped on purpose.'))
  if (quiet.length) {
    const kinds = {}; for (const i of quiet) { const w = inWords(i.last.request); kinds[w] = (kinds[w] || 0) + i.n }
    html += `<li class="quiet"><span class="tag">YOU WERE NOT ASKED</span><b>${Object.entries(kinds).map(([w, n]) => `${esc(w)}${n > 1 ? `, ${n} times` : ''}`).join(' · ')}</b><span class="why">Inside the range you signed, and nothing that moves money.</span></li>`
  }
  $('list').innerHTML = html || '<li class="quiet"><b>Nothing has happened with this key yet.</b></li>'
  const total = bad.length + hand.length + wait.length + stop.length + quietN
  $('status').textContent = `${total} request${total === 1 ? '' : 's'}`; $('status').className = 'chip live'
  $('where').innerHTML = `Read from the Broker at <code>${esc(BROKER)}</code>, for the key lent by <code>${esc(holder.slice(0, 8))}…${esc(holder.slice(-4))}</code>. Times are the times in the record.`
}
load()
