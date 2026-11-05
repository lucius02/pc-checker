/**
 * WebGL2 GPU-stresstest: een zware fragment-shader (geïtereerde fractal + ruis) wordt per frame
 * meerdere keren over het hele canvas gerenderd. Meet FPS en detecteert context-verlies
 * (= driver-reset / TDR).
 */

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform int uIter;
out vec4 color;

float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 c = vec2(-0.745 + 0.02 * sin(uTime * 0.13), 0.186 + 0.02 * cos(uTime * 0.11));
  vec2 z = uv * (1.2 + 0.3 * sin(uTime * 0.2));
  float acc = 0.0;
  for (int i = 0; i < 4096; i++) {
    if (i >= uIter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    acc += exp(-dot(z, z)) + 0.001 * hash(z + float(i));
    if (dot(z, z) > 64.0) z *= 0.125;
  }
  float v = acc / float(uIter);
  color = vec4(0.5 + 0.5 * cos(6.2831 * (v + vec3(0.0, 0.33, 0.67)) + uTime), 1.0);
}`;

export interface GpuStressStats {
  fps: number;
  avgFps: number;
  minFps: number;
  frames: number;
  elapsedMs: number;
  contextLost: boolean;
}

export interface GpuStressOptions {
  /** 1-10: bepaalt shader-iteraties en het aantal passes per frame. */
  intensity: number;
  onStats?: (s: GpuStressStats) => void;
  onContextLost?: () => void;
}

export class GpuStress {
  private gl: WebGL2RenderingContext | null;
  private program: WebGLProgram | null = null;
  private raf = 0;
  private running = false;
  private start = 0;
  private frames = 0;
  private secondFrames = 0;
  private secondStart = 0;
  private fpsSamples: number[] = [];
  private lost = false;
  private uRes: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uIter: WebGLUniformLocation | null = null;
  readonly renderer: string;
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: GpuStressOptions;

  constructor(canvas: HTMLCanvasElement, opts: GpuStressOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer = this.gl ? GpuStress.rendererName(this.gl) : "";
    canvas.addEventListener("webglcontextlost", this.handleLost);
    if (this.gl) this.init(this.gl);
  }

  static isSupported(): boolean {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }

  get supported(): boolean {
    return this.gl !== null && this.program !== null;
  }

  private static rendererName(gl: WebGL2RenderingContext): string {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(name ?? "");
  }

  private init(gl: WebGL2RenderingContext) {
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.program = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Eén driehoek die het hele scherm bedekt.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.uRes = gl.getUniformLocation(prog, "uRes");
    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uIter = gl.getUniformLocation(prog, "uIter");
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.stop();
    this.opts.onContextLost?.();
  };

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  stats(now = performance.now()): GpuStressStats {
    const elapsedMs = this.start ? now - this.start : 0;
    // De eerste seconde (shader-compilatie, opwarmen) telt niet mee voor het minimum.
    const steady = this.fpsSamples.slice(1);
    return {
      fps: this.fpsSamples[this.fpsSamples.length - 1] ?? 0,
      avgFps: elapsedMs > 0 ? (this.frames * 1000) / elapsedMs : 0,
      minFps: steady.length ? Math.min(...steady) : (this.fpsSamples[0] ?? 0),
      frames: this.frames,
      elapsedMs,
      contextLost: this.lost,
    };
  }

  startLoop() {
    const gl = this.gl;
    if (!gl || !this.program || this.running) return;
    this.running = true;
    this.start = performance.now();
    this.secondStart = this.start;
    this.frames = 0;
    this.secondFrames = 0;
    this.fpsSamples = [];
    const intensity = Math.min(10, Math.max(1, Math.round(this.opts.intensity)));
    const iterations = 64 * intensity * intensity; // 64 .. 6400 (begrensd door shader-lus)
    const passes = Math.ceil(intensity / 2);

    const frame = (now: number) => {
      if (!this.running || gl.isContextLost()) return;
      this.resize();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1i(this.uIter, Math.min(4096, iterations));
      for (let i = 0; i < passes; i++) {
        gl.uniform1f(this.uTime, (now - this.start) / 1000 + i * 0.01);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      this.frames++;
      this.secondFrames++;
      if (now - this.secondStart >= 1000) {
        this.fpsSamples.push((this.secondFrames * 1000) / (now - this.secondStart));
        this.secondFrames = 0;
        this.secondStart = now;
        this.opts.onStats?.(this.stats(now));
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
  }
}

/** Beoordeelt een afgeronde GPU-run. */
export function gpuVerdict(s: GpuStressStats): "ok" | "drops" | "lost" {
  if (s.contextLost) return "lost";
  if (s.avgFps > 0 && s.minFps < s.avgFps * 0.5) return "drops";
  return "ok";
}
