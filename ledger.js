// The Ledger, straight from the browser. No helper program.
//   Bluetooth (Web Bluetooth): Chrome on a computer or Android, and on an iPhone in a browser that
//                              has Web Bluetooth (Bluefy). Safari on iPhone does not.
//   USB: WebHID on a computer (Chrome, Edge), WebUSB on an Android phone (Chrome).
//
// This file only carries bytes. It cannot sign anything: the key is in the device, and the device
// shows the person what it is about to sign. One exchange at a time.
'use strict'
;(function () {
  const VENDOR = 0x2c97   // Ledger
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')
  const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((b) => parseInt(b, 16)))

  // Ledger's framing: 64-byte packets, channel 0x0101, tag 0x05, a 2-byte sequence number; the first
  // packet of a message starts with its 2-byte length.
  function frames(apdu) {
    const data = new Uint8Array(apdu.length + 2); data[0] = apdu.length >> 8; data[1] = apdu.length & 255; data.set(apdu, 2)
    const out = []
    for (let i = 0, seq = 0; i < data.length; i += 59, seq++) {
      const p = new Uint8Array(64); p.set([1, 1, 5, seq >> 8, seq & 255]); p.set(data.subarray(i, i + 59), 5); out.push(p)
    }
    return out
  }
  /** Feed packets in until the whole message has arrived; returns it, or null if more are needed. */
  function assembler() {
    let need = -1, got = []
    return (p) => {
      if (p.length < 5 || p[2] !== 5) return null
      if (need < 0) { need = (p[5] << 8) | p[6]; got.push(...p.subarray(7)) } else got.push(...p.subarray(5))
      return got.length >= need ? new Uint8Array(got.slice(0, need)) : null
    }
  }

  class Hid {
    static get ok() { return 'hid' in navigator }
    async open(ask) {
      let d = (await navigator.hid.getDevices()).find((x) => x.vendorId === VENDOR)
      if (!d && ask) d = (await navigator.hid.requestDevice({ filters: [{ vendorId: VENDOR }] }))[0]
      if (!d) return false
      if (!d.opened) await d.open()
      this.d = d
      this.d.addEventListener('inputreport', (e) => this.onPacket && this.onPacket(new Uint8Array(e.data.buffer)))
      return true
    }
    async exchange(apdu, ms) {
      const add = assembler()
      const answer = new Promise((resolve, reject) => {
        const t = setTimeout(() => { this.onPacket = null; reject(new Error('the device did not answer in time')) }, ms)
        this.onPacket = (p) => { const m = add(p); if (m) { clearTimeout(t); this.onPacket = null; resolve(m) } }
      })
      for (const f of frames(apdu)) await this.d.sendReport(0, f)
      return answer
    }
    get name() { return this.d?.productName || 'Ledger' }
    async close() { try { await this.d.close() } catch {} }
  }

  class Usb {
    static get ok() { return 'usb' in navigator }
    async open(ask) {
      let d = (await navigator.usb.getDevices()).find((x) => x.vendorId === VENDOR)
      if (!d && ask) d = await navigator.usb.requestDevice({ filters: [{ vendorId: VENDOR }] })
      if (!d) return false
      await d.open()
      if (d.configuration === null) await d.selectConfiguration(1)
      const iface = d.configuration.interfaces.find((i) => i.alternates.some((a) => a.interfaceClass === 255))
      if (!iface) throw new Error('this Ledger does not offer a USB interface a browser can use')
      await d.claimInterface(iface.interfaceNumber)
      const eps = iface.alternates[0].endpoints
      this.out = eps.find((e) => e.direction === 'out').endpointNumber; this.in = eps.find((e) => e.direction === 'in').endpointNumber
      this.d = d
      return true
    }
    async exchange(apdu, ms) {
      for (const f of frames(apdu)) await this.d.transferOut(this.out, f)
      const add = assembler(), until = Date.now() + ms
      for (;;) {
        if (Date.now() > until) throw new Error('the device did not answer in time')
        const r = await this.d.transferIn(this.in, 64)
        const m = add(new Uint8Array(r.data.buffer)); if (m) return m
      }
    }
    get name() { return this.d?.productName || 'Ledger' }
    async close() { try { await this.d.close() } catch {} }
  }

  // Bluetooth. Each Ledger model has its own service; the three characteristics differ in one digit.
  const BLE_SERVICES = ['13d63400-2c97-3004-0000-4c6564676572',   // Flex
    '13d63400-2c97-6004-0000-4c6564676572',                       // Stax
    '13d63400-2c97-0004-0000-4c6564676572',                       // Nano X
    '13d63400-2c97-8004-0000-4c6564676572']                       // Apex
  class Ble {
    static get ok() { return 'bluetooth' in navigator }
    async open(ask) {
      if (!ask) return false   // Bluetooth always needs the person to pick the device
      const d = await navigator.bluetooth.requestDevice({ filters: BLE_SERVICES.map((s) => ({ services: [s] })) })
      const gatt = await d.gatt.connect()
      let svc = null, uuid = null
      for (const s of BLE_SERVICES) { try { svc = await gatt.getPrimaryService(s); uuid = s; break } catch {} }
      if (!svc) throw new Error('connected, but this device does not offer the Ledger service')
      const ch = (n) => svc.getCharacteristic(uuid.replace('-0000-4c65', `-000${n}-4c65`))
      this.notify = await ch(1); this.write = await ch(2)
      this.notify.addEventListener('characteristicvaluechanged', (e) => { const v = e.target.value; this.onPacket && this.onPacket(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) })
      await this.notify.startNotifications()
      this.d = d; this.mtu = 20
      d.addEventListener('gattserverdisconnected', () => { this.gone = true })
      // Ask how big a packet may be. Answer: 08 00 00 00 01 <size>.
      try {
        const size = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('no size')), 4000)
          this.onPacket = (p) => { if (p[0] === 8) { clearTimeout(t); this.onPacket = null; resolve(p[5]) } }
          this.send(new Uint8Array([8, 0, 0, 0, 0])).catch(reject)
        })
        if (size > 5) this.mtu = size
      } catch { this.onPacket = null }
      return true
    }
    send(u8) { return this.write.writeValueWithResponse ? this.write.writeValueWithResponse(u8) : this.write.writeValue(u8) }
    async exchange(apdu, ms) {
      if (this.gone) throw new Error('disconnected')
      // Frames: 05, a 2-byte sequence number, then (first frame only) the 2-byte length, then data.
      const out = []
      for (let i = 0, seq = 0; i < apdu.length || seq === 0; seq++) {
        const room = this.mtu - (seq === 0 ? 5 : 3), part = apdu.subarray(i, i + room); i += room
        const head = seq === 0 ? [5, 0, 0, apdu.length >> 8, apdu.length & 255] : [5, seq >> 8, seq & 255]
        const f = new Uint8Array(head.length + part.length); f.set(head); f.set(part, head.length); out.push(f)
      }
      let need = -1, got = []
      const answer = new Promise((resolve, reject) => {
        const t = setTimeout(() => { this.onPacket = null; reject(new Error('the device did not answer in time')) }, ms)
        this.onPacket = (p) => {
          if (p[0] !== 5) return
          if (need < 0) { need = (p[3] << 8) | p[4]; got.push(...p.subarray(5)) } else got.push(...p.subarray(3))
          if (got.length >= need) { clearTimeout(t); this.onPacket = null; resolve(new Uint8Array(got.slice(0, need))) }
        }
      })
      for (const f of out) await this.send(f)
      return answer
    }
    get name() { return this.d?.name || 'Ledger' }
    async close() { try { this.d.gatt.disconnect() } catch {} }
  }

  let t = null, busy = Promise.resolve()
  const KINDS = { bluetooth: Ble.ok ? Ble : null, usb: Hid.ok ? Hid : Usb.ok ? Usb : null }
  const Kind = KINDS.usb || KINDS.bluetooth
  const serial = (fn) => { const run = busy.then(fn, fn); busy = run.catch(() => {}); return run }

  window.Ledger = {
    /** Can this browser reach a Ledger at all? */
    supported: Boolean(Kind),
    /** Which ways this browser offers: any of 'usb', 'bluetooth'. */
    ways: Object.keys(KINDS).filter((k) => KINDS[k]),
    get how() { return t?.way || null },
    get connected() { return Boolean(t) },
    get name() { return t?.name },
    /** For telling a person (or a log) what the connection looks like. */
    get info() { return t ? `${t.way} · ${t.name}${t.mtu ? ' · packet ' + t.mtu : ''}${t.gone ? ' · DISCONNECTED' : ''}` : 'not connected' },
    /** `ask` true = show the browser's device chooser (needs a click). false = only a device already allowed. */
    async connect(ask, way) {
      if (!Kind) throw new Error('This browser cannot talk to a Ledger. On an iPhone, open this page in Bluefy. On a computer, use Chrome.')
      if (t) return true
      const K = (way && KINDS[way]) || Kind
      const k = new K()
      if (!(await k.open(ask))) return false
      k.way = K === Ble ? 'bluetooth' : 'usb'
      t = k
      return true
    },
    async disconnect() { if (t) { await t.close(); t = null } },
    /** One APDU in, the device's whole answer out (data then 2 status bytes), as hex. */
    exchange: (apduHex, ms = 3000) => serial(async () => {
      if (!t) throw new Error('no Ledger connected')
      try { return hex(await t.exchange(unhex(apduHex), ms)) } catch (e) {
        if (/disconnected|NotFoundError|NetworkError|not opened/i.test(String(e))) { t = null }
        throw e
      }
    }),
    /** Which app is open: { name, version } · { locked: true } · { busy: true } (Tomoshibi is showing a screen). */
    async app() {
      const r = await this.exchange('b001000000', 2000)
      if (r === '5515') return { locked: true }
      if (r === '6faa') return { busy: true, name: 'Tomoshibi' }
      const b = unhex(r)
      if (b[0] !== 1) return { name: null }
      const dec = new TextDecoder(), n = b[1]
      return { name: dec.decode(b.subarray(2, 2 + n)), version: dec.decode(b.subarray(3 + n, 3 + n + b[2 + n])) }
    },
  }
})()
