// Screen C — the record of one request, top to bottom.
// Opened from a QR or link:  trace.html?thread=0x…&broker=http://…
// Every value on this page is read from the record. Nothing is filled in.
'use strict'

const $ = (id) => document.getElementById(id)
const qs = new URLSearchParams(location.search)
const BROKER = (qs.get('broker') || localStorage.getItem('tomoshibi.broker') || 'http://127.0.0.1:8787').replace(/\/$/, '')
const thread = qs.get('thread') || ''
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const short = (h, n = 10) => (typeof h === 'string' && h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h)

// How each decision reads to a person. The tiers come from the Broker in Japanese.
const TITLE = {
  ALLOWED: 'Let through', DENIED: 'Stopped', STOPPED: 'Stopped, on purpose', NEEDS_PRESS: 'Waiting for a press on the Ledger',
  SEALED: 'Written to 0G Storage', STAR: 'A light was lit', VOUCH_DENIED: 'No light was lit',
}
const TIER = { 'ふだん': 'routine', '大事': 'matters', '決定的': 'critical' }
const REASON = {
  OUT_OF_TARGET: 'It tried to reach a place that was not allowed.',
  OUT_OF_SCOPE: 'It tried to do something that was not allowed.',
  WRONG_KEY: 'It asked for a key it was not given.',
  INSECURE_TRANSPORT: 'It tried to send the key over an unencrypted connection.',
  REPLAY: 'It reused an approval that belongs to another tool.',
  EXPIRED: 'The approval had run out.', EXHAUSTED: 'The approval had been used up.',
  BAD_SIGNATURE: 'The approval was not signed by the owner.',
  ZG_UNREACHABLE: '0G could not be reached, so no judgement was made and nothing ran.',
  ESCALATED: '0G judged this request heavy. A standing approval is not enough; it needs a fresh press.',
  human_denied: 'The person said no on their own phone.', proof_expired: 'No one confirmed in time.',
  ALREADY_VOUCHED: 'This person had already lit this version.',
}

function rows(pairs) {
  const p = pairs.filter(([, v]) => v !== undefined && v !== null && v !== '')
  return p.length ? `<dl class="kv">${p.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''
}
function step(r) {
  const bad = r.decision === 'DENIED' || r.decision === 'VOUCH_DENIED'
  const quiet = r.decision === 'STOPPED' || r.decision === 'NEEDS_PRESS'
  const zg = r.zg || {}, st = r.storage || {}
  const sim = zg.simulated || r.world?.simulated
  const tags = `<span class="tag ${r.decision === 'SEALED' && !st.uploaded ? 'STOPPED' : esc(r.decision)}">${esc(r.decision)}</span>` +
    (r.violation ? '<span class="tag DENIED">recorded against the tool</span>' : '') +
    (sim ? '<span class="tag sim">simulated</span>' : '')
  const why = REASON[r.reason] || r.message
  // "Sealed" only means the Broker tried. Say plainly whether it reached 0G Storage.
  const notStored = r.decision === 'SEALED' && !st.uploaded
  const title = notStored ? 'Not written to 0G Storage' : (TITLE[r.decision] || r.decision)
  return `<li class="${bad ? 'bad' : quiet || notStored ? 'quiet' : ''}">
    <div>
      <h3>${esc(title)} ${tags}</h3>
      <time>${esc(r.at || '')}</time>
      ${why ? `<p class="sub">${esc(why)}</p>` : ''}
      ${rows([
        ['asked for', r.request ? esc(`${r.request.method} ${r.request.url}`) : null],
        ['allowed by', r.holder ? esc(short(r.holder, 6)) + (r.holderValid ? ' (signature checked)' : ' (signature NOT valid)') : null],
        ['tool signed the request', r.request ? (r.skillSigner ? esc(short(r.skillSigner, 6)) : 'no') : null],
        ['uses left', r.remaining],
        ['what came back', r.attestation ? `status ${esc(r.attestation.status)} · hash ${esc(short(r.attestation.bodyHash))}` : null],
        ['0G judged it', zg.tier ? `${esc(TIER[zg.tier] || zg.tier)}${zg.reason ? ' — ' + esc(zg.reason) : ''}` : null],
        ['0G request id', zg.requestId ? esc(zg.requestId) : (zg.model ? 'none (0G was not asked)' : null)],
        ['0G model', zg.model ? esc(zg.model) + (zg.ms ? ` · ${esc(zg.ms)} ms` : '') : null],
        ['0G usage', zg.usage ? esc(JSON.stringify(zg.usage)) : null],
        ['0G error', zg.error ? esc(zg.error) : null],
        ['storage root', st.rootHash ? esc(st.rootHash) : null],
        ['storage tx', st.tx ? (st.url ? `<a href="${esc(st.url)}" rel="noopener">${esc(short(st.tx))}</a>` : esc(st.tx)) : (r.decision === 'SEALED' ? `not uploaded: ${esc(st.reason || 'unknown')}` : null)],
        ['who', r.nullifier ? esc(short(r.nullifier, 8)) + ' (pseudonym)' : null],
        ['version', r.version ? esc(r.version) : null],
      ])}
    </div></li>`
}

async function load() {
  $('thread').textContent = thread || 'No request id in the link.'
  $('t').value = thread
  $('where').innerHTML = `Read from the Broker at <code>${esc(BROKER)}</code>. The Broker is a point of trust today: this page shows what it says it recorded. When a step says “Written to 0G Storage”, the root hash and transaction are the part you can check without it.`
  if (!thread) { $('status').textContent = 'no request id'; $('empty').hidden = false; return }
  try {
    const r = await (await fetch(`${BROKER}/trace/${encodeURIComponent(thread)}`, { cache: 'no-store' })).json()
    const recs = r.records || []
    $('status').textContent = `${recs.length} ${recs.length === 1 ? 'entry' : 'entries'}`
    $('status').className = 'chip live'
    $('chain').innerHTML = recs.map(step).join('')
    $('empty').hidden = recs.length > 0
  } catch (e) {
    $('status').textContent = 'Broker not reachable'; $('status').className = 'chip warn'
    $('empty').hidden = false
    $('empty').textContent = `Could not read the record from ${BROKER}. If you opened this on a phone, the Broker has to be reachable from the phone.`
  }
}
// The QR points at this same page. A phone cannot follow "localhost", so the link is rebuilt with
// an address the phone can reach: the one this page was opened with, or ?lan=<address>.
function carry() {
  if (!thread) return
  const local = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
  const priv = (h) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h) || h.endsWith('.local')
  const lan = qs.get('lan') || (local(location.hostname) ? '' : location.hostname)
  const page = new URL(location.href), broker = new URL(BROKER)
  if (lan) { page.hostname = lan; if (local(broker.hostname)) broker.hostname = lan }
  page.search = ''
  page.searchParams.set('thread', thread)
  page.searchParams.set('broker', broker.origin)
  const link = page.toString()
  $('carry').hidden = false
  try { $('qr').innerHTML = qrSvg(link, 200) } catch (e) { $('qr').textContent = e.message }
  const stuck = local(page.hostname) || local(broker.hostname)
  $('carryNote').className = stuck ? 'note warn' : 'note'
  $('carryNote').innerHTML = stuck
    ? `This link says <code>${esc(page.hostname)}</code>, which a phone cannot reach. Open this page by this computer's network address, or add <code>&amp;lan=192.168.x.x</code> to the address bar.`
    : `<code>${esc(link)}</code>${priv(page.hostname) || priv(broker.hostname) ? '<br>The phone has to be on the same network as this computer.' : ''}`
}
carry()

$('open').addEventListener('submit', (e) => {
  e.preventDefault()
  const u = new URL(location.href); u.searchParams.set('thread', $('t').value.trim()); location.href = u.toString()
})
load()
