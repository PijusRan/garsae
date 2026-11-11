/** A compiled Faust model, as scripts/build-faust.mjs writes it to gen/. */
export interface FaustModel {
  /** Bytes the DSP's state takes at the start of its memory; the audio buffers go after it. */
  size: number;
  outputs: number;
  /** Its controls in order. Each becomes one AudioParam, p0, p1, ... */
  params: { label: string; index: number; init: number }[];
  /** The WebAssembly module, base64. */
  wasm: string;
}
