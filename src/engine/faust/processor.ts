// The AudioWorklet processor that runs any compiled Faust model. It is loaded from a Blob, so it is written as plain
// JavaScript in a string. Every Faust control is driven by an a-rate AudioParam (p0, p1, ...): the main thread schedules
// notes with setValueAtTime, and the processor splits each 128-frame block wherever a control changes, so notes start
// on the exact sample, in real time and in an OfflineAudioContext alike.

/** Must match MAX_PARAMS in scripts/build-faust.mjs. */
export const MAX_PARAMS = 24;
export const PROCESSOR_NAME = 'garsae-faust';

export const PROCESSOR_SOURCE = `
const M = Math;
const env = {
  _abs: M.abs, _acosf: M.acos, _asinf: M.asin, _atanf: M.atan, _atan2f: M.atan2, _ceilf: M.ceil, _cosf: M.cos,
  _expf: M.exp, _floorf: M.floor, _fmodf: (x, y) => x % y, _logf: M.log, _log10f: M.log10, _max_f: M.max,
  _min_f: M.min, _remainderf: (x, y) => x - M.round(x / y) * y, _powf: M.pow, _roundf: M.round, _sinf: M.sin,
  _sqrtf: M.sqrt, _tanf: M.tan, _acoshf: M.acosh, _asinhf: M.asinh, _atanhf: M.atanh, _coshf: M.cosh,
  _sinhf: M.sinh, _tanhf: M.tanh, _isnanf: Number.isNaN, _isinff: (x) => !isFinite(x),
  _copysignf: (x, y) => (M.sign(x) === M.sign(y) ? x : -x),
};
const BLOCK = 128;
/** After this many silent blocks with every gate shut (about 2 s), stop computing until a control moves. */
const SLEEP_AFTER = 700;

class FaustProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return Array.from({ length: ${MAX_PARAMS} }, (_, i) => ({ name: 'p' + i, defaultValue: 0, automationRate: 'a-rate' }));
  }

  constructor(options) {
    super();
    const o = options.processorOptions;
    const module = o.module instanceof WebAssembly.Module ? o.module : new WebAssembly.Module(o.bytes);
    this.api = new WebAssembly.Instance(module, { env }).exports;
    const memory = this.api.memory;
    this.outs = o.outputs;
    const ptrs = o.size;
    const base = (ptrs + this.outs * 4 + 15) & ~15;
    const need = base + this.outs * BLOCK * 4;
    if (memory.buffer.byteLength < need) memory.grow(M.ceil((need - memory.buffer.byteLength) / 65536));
    const heap32 = new Int32Array(memory.buffer);
    for (let c = 0; c < this.outs; c++) heap32[(ptrs >> 2) + c] = base + c * BLOCK * 4;
    this.ptrs = ptrs;
    this.bufs = Array.from({ length: this.outs }, (_, c) => new Float32Array(memory.buffer, base + c * BLOCK * 4, BLOCK));
    this.api.init(0, sampleRate);
    this.index = o.index;
    this.gates = o.gates;
    this.last = new Float32Array(this.index.length).fill(NaN);
    this.arrays = new Array(this.index.length);
    this.quiet = 0;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0];
    const n = out[0].length;
    const count = this.index.length;
    const arrays = this.arrays;
    let moving = false;
    for (let k = 0; k < count; k++) {
      const a = parameters['p' + k];
      arrays[k] = a;
      if (a.length > 1 || a[0] !== this.last[k]) moving = true;
    }
    if (!moving && this.quiet >= SLEEP_AFTER) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    let pos = 0;
    let peak = 0;
    while (pos < n) {
      let end = n;
      for (let k = 0; k < count; k++) {
        const a = arrays[k];
        if (a.length === 1) continue;
        const v = a[pos];
        for (let j = pos + 1; j < end; j++) {
          if (a[j] !== v) {
            end = j;
            break;
          }
        }
      }
      for (let k = 0; k < count; k++) {
        const a = arrays[k];
        const v = a.length === 1 ? a[0] : a[pos];
        if (v !== this.last[k]) {
          this.api.setParamValue(0, this.index[k], v);
          this.last[k] = v;
        }
      }
      this.api.compute(0, end - pos, this.ptrs, this.ptrs);
      for (let c = 0; c < out.length; c++) {
        const src = this.bufs[M.min(c, this.outs - 1)];
        out[c].set(end - pos === BLOCK ? src : src.subarray(0, end - pos), pos);
      }
      for (let i = 0; i < end - pos; i++) peak = M.max(peak, M.abs(this.bufs[0][i]));
      pos = end;
    }
    let open = false;
    for (const g of this.gates) if (this.last[g] > 0) open = true;
    this.quiet = open || peak > 1e-5 ? 0 : this.quiet + 1;
    return true;
  }
}

registerProcessor('${PROCESSOR_NAME}', FaustProcessor);
`;
