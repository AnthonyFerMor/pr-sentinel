/**
 * Aurora — animated radial backdrop used on every page surface.
 *
 * Three soft, blurred radial gradients drifting in place create the
 * "premium product" feel without being distracting. Sits behind page
 * content via z-index 0 so anything above it (cards, text) reads normally.
 *
 * Keep this dumb and presentational — no props, no state. If a page wants
 * a different palette, fork the component rather than parameterising.
 */
export default function Aurora() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-blob aurora-blob--violet animate-aurora" />
      <div
        className="aurora-blob aurora-blob--blue animate-aurora"
        style={{ animationDelay: '-5s' }}
      />
      <div
        className="aurora-blob aurora-blob--cyan animate-aurora"
        style={{ animationDelay: '-9s' }}
      />
      <div className="grid-texture" />
    </div>
  );
}
