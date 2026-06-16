/**
 * Kazam contract — the machine-checkable form of CLAUDE.md.
 *
 * These types describe the tool ↔ runtime contract: the settings schema, the
 * `ctx` handed to build()/frame(), the tool definition, and the versioned
 * `postMessage` protocol between a framed tool and its host. They are consumed
 * from JS via JSDoc `import('./contract')` references and checked by `tsc`
 * (see tsconfig.json + the `// @ts-check` files). Nothing here ships.
 */

// --------------------------------------------------------------- value shapes

/** A colour field's value. `hex:null` = transparent; `opacity` ∈ 0–1. */
export interface ColorValue {
  hex: string | null;
  opacity: number;
}

/** An image field's stored (serialisable) value — bytes inlined as a data URL. */
export interface ImageValue {
  src: string;
  width: number;
  height: number;
  name?: string;
}

/** The decoded form an `image` field takes when handed to build()/frame(). */
export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  name?: string;
}

export type SelectOption = string | { value: string; label: string };

/** A single value in the flat, JSON-serialisable state object. */
export type StateValue =
  | number
  | string
  | boolean
  | null
  | ColorValue
  | ImageValue
  | string[];

/** The whole tool state: one entry per settings key. */
export type State = Record<string, StateValue>;

// --------------------------------------------------------------- field schema

export interface BaseField {
  label?: string;
  group?: string;
  /** Layout hint: `'half'` fields pack two-up into a row. */
  col?: 'full' | 'half';
  help?: string;
  /** Render this toggle as an eye in the section header. */
  header?: boolean;
  /** Render this field in the Export section, not its group. */
  export?: boolean;
  /** Reserved — conditional visibility (declared in CLAUDE.md, not yet wired). */
  showIf?: (state: State) => boolean;
}

export interface NumericField extends BaseField {
  default?: number | null;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** `'percent'` displays a 0–1 value as 0–100. */
  format?: 'percent';
  /**
   * Auto/derived default: a string expression over the state (kept as a string
   * so it survives postMessage to the host) or a function. Empty input → auto.
   */
  auto?: string | ((state: State) => number);
}

export interface SliderField extends NumericField {
  type: 'slider';
}

export interface NumberField extends NumericField {
  type: 'number';
}

export interface SelectField extends BaseField {
  type: 'select';
  default?: string;
  options: SelectOption[];
  /** Launcher selects write a preset value into another field… */
  presets?: Record<string, StateValue>;
  /** …named by `writes`, then snap back to `default`. */
  writes?: string;
}

export interface ColorField extends BaseField {
  type: 'color';
  default?: ColorValue | null;
  /** Renders an "Add …/remove" affordance; an optional colour starts `null`. */
  optional?: boolean;
  addLabel?: string;
}

export interface ToggleField extends BaseField {
  type: 'toggle';
  default?: boolean;
}

export interface TextField extends BaseField {
  type: 'text';
  default?: string;
}

export interface ImageField extends BaseField {
  type: 'image';
  default?: ImageValue | null;
  addLabel?: string;
}

export interface SwatchesField extends BaseField {
  type: 'swatches';
  default?: string[];
  /** Max number of chips (default 16). */
  max?: number;
}

export type Field =
  | SliderField
  | NumberField
  | SelectField
  | ColorField
  | ToggleField
  | TextField
  | ImageField
  | SwatchesField;

export type Settings = Record<string, Field>;

// --------------------------------------------------------------- ctx

/** Seeded PRNG handed to tools — never `Math.random`. */
export interface Random {
  (): number;
  int(n: number): number;
  range(a: number, b: number): number;
  /** Stable float [0,1) keyed by integer coords/salts (order-independent). */
  hash(...keys: number[]): number;
}

/** Everything the runtime hands a tool's build()/frame(). */
export interface Ctx {
  width: number;
  height: number;
  tokens: Tokens;
  random: Random;
  seed: number;
  mode: 'standalone' | 'framed';
  /** Current time in seconds (animated tools). */
  t: number;
  /** Current frame index (animated tools). */
  frame: number;
  duration: number;
  fps: number;
  /** True only during continuous rAF playback — gate audio on this. */
  live: boolean;
  uid(name?: string): string;
  svg(tag: string, attrs?: Record<string, string | number>): SVGElement;
  colorToCss(c: ColorValue | null): string | null;
  /** canvas tools only */
  canvas?: HTMLCanvasElement;
  /** canvas tools only */
  ctx2d?: CanvasRenderingContext2D;
}

export interface Tokens {
  color: {
    background: string;
    foreground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    primary: string;
    secondary: string;
  };
  radius: string;
}

// --------------------------------------------------------------- tool def

export interface ToolDef {
  id: string;
  name?: string;
  tagline?: string;
  version?: number;
  render: 'svg' | 'canvas';
  groups?: string[];
  settings: Settings;
  seed?: number;
  /** Animation: seconds. > 0 means animated. */
  duration?: number;
  fps?: number;
  autoplay?: boolean;
  preview?: unknown;
  exportFormats?: ExportFormat[];
  /** Explicit output size (else inferred from the returned SVG / stage). */
  size?: (state: State) => { width: number; height: number };
  /** svg → return an SVGElement; canvas → draw into ctx.canvas. */
  build?: (state: State, ctx: Ctx) => SVGElement | void;
  /** Deterministic frame at time t ∈ [0, duration) for animated tools. */
  frame?: (state: State, t: number, ctx: Ctx) => SVGElement | void;
}

export type ExportFormat = 'svg' | 'png' | 'gif' | 'webm';

// --------------------------------------------------------------- protocol

/** Wire-safe schema (functions stripped) sent to the host. */
export type WireSettings = Record<string, Record<string, unknown>>;

export type ExportPayload =
  | { kind: 'text'; text: string }
  | { kind: 'blob'; blob: Blob }
  | null;

/** Tool (iframe) → Frame (parent). */
export type ToolMessage =
  | {
      v: number;
      type: 'kazam/ready';
      tool: {
        id: string;
        name?: string;
        tagline: string;
        render: 'svg' | 'canvas';
        duration: number;
        exportFormats: ExportFormat[];
        preview: unknown;
      };
      schema: WireSettings;
      groups: string[] | null;
      state: State;
    }
  | { v: number; type: 'kazam/size'; width: number; height: number }
  | {
      v: number;
      type: 'kazam/export-result';
      requestId: number;
      format: ExportFormat;
      ok: boolean;
      payload: ExportPayload;
    }
  | { v: number; type: 'kazam/error'; message: string };

/** Frame (parent) → Tool (iframe). */
export type FrameMessage =
  | { v: number; type: 'kazam/state'; state: State }
  | { v: number; type: 'kazam/tokens'; dark: boolean }
  | { v: number; type: 'kazam/preview-bg'; color: string }
  | {
      v: number;
      type: 'kazam/export';
      requestId: number;
      format: ExportFormat;
      scale?: number;
    }
  | { v: number; type: 'kazam/seed'; seed: number };

// --------------------------------------------------------------- store

export interface Store {
  get(): State;
  set(key: string, value: StateValue): void;
  replace(next: State): void;
  subscribe(fn: (state: State, key: string | null) => void): () => void;
  serialise(): string;
  deserialise(json: string): boolean;
}

// --------------------------------------------------------------- globals

export interface KazamGlobal {
  defineTool(tool: ToolDef): ToolDef;
  version: number;
  host: Record<string, unknown>;
}

declare global {
  interface Window {
    Kazam: KazamGlobal;
  }
  // Non-standard: Chrome's manual captureStream frame pump.
  interface MediaStreamTrack {
    requestFrame?(): void;
  }
  // CommonJS export hook (present in Node test harness, absent in browsers).
  var module: { exports: any } | undefined;
}
