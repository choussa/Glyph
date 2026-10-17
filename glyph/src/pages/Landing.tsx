import { Link } from '../router';
import { Icon } from '../ui/Icon';

/**
 * The exact source compiled into `public/sample-page.svg`. The page shown in
 * the preview is real engine output, not a hand-built mock; regenerate the
 * asset if this source changes.
 */
const SOURCE: { text: string; tone?: string }[][] = [
  [{ text: '#set', tone: 'key' }, { text: ' page(paper: ' }, { text: '"a4"', tone: 'str' }, { text: ', margin: ' }, { text: '2.4cm', tone: 'num' }, { text: ')' }],
  [{ text: '#set', tone: 'key' }, { text: ' text(font: ' }, { text: '"Libertinus Serif"', tone: 'str' }, { text: ', size: ' }, { text: '11pt', tone: 'num' }, { text: ')' }],
  [{ text: '#set', tone: 'key' }, { text: ' par(justify: ' }, { text: 'true', tone: 'pol' }, { text: ', leading: ' }, { text: '0.62em', tone: 'num' }, { text: ')' }],
  [{ text: '#set', tone: 'key' }, { text: ' heading(numbering: ' }, { text: '"1."', tone: 'str' }, { text: ')' }],
  [],
  [{ text: '#align', tone: 'func' }, { text: '(center)[' }],
  [{ text: '  #text', tone: 'func' }, { text: '(size: ' }, { text: '19pt', tone: 'num' }, { text: ', weight: ' }, { text: '"bold"', tone: 'str' }, { text: ')[On the shape of attention] \\' }],
  [{ text: '  #text', tone: 'func' }, { text: '(size: ' }, { text: '9pt', tone: 'num' }, { text: ')[A. Rivera · Institute for Cognitive Systems]' }],
  [{ text: ']' }],
  [],
  [{ text: '#block', tone: 'func' }, { text: '(inset: (x: ' }, { text: '1.2em', tone: 'num' }, { text: '))[' }],
  [{ text: '  *Abstract.* We study how attention distributes across a sequence,' }],
  [{ text: '  and why the shape of that distribution predicts recall.' }],
  [{ text: ']' }],
  [],
  [{ text: '= Method' }],
  [{ text: 'For a query $Q$, key $K$ and value $V$:' }],
  [{ text: '$ "Attention"(Q, K, V) = "softmax"(Q K^top / sqrt(d)) V $' }],
  [{ text: 'The result is computed once per head and concatenated. Figure 1 reports' }],
  [{ text: 'the distribution over a held-out set of 1,024 sequences.' }],
];

export function Landing() {
  return (
    <div className="landing">
      <header className="site-top">
        <Link to="/" className="site-brand" aria-label="glyph home">
          <span className="yc-mark" aria-hidden="true">g</span>
          <span className="site-word">glyph</span>
          <span className="site-tag">Typst editor</span>
        </Link>
        <nav className="site-nav" aria-label="Product">
          <a href="#product">Product</a>
          <a href="#engine">Engine</a>
          <a href="#workflow">Workflow</a>
        </nav>
        <div className="site-actions">
          <Link to="/signin" className="btn btn-quiet">
            Sign in
          </Link>
          <Link to="/dashboard" className="btn btn-ink">
            Open dashboard
          </Link>
        </div>
      </header>

      <main>
        <section className="hero" id="product">
          <div className="hero-copy">
            <h1>
              Write like a writer.
              <br />
              <em>Compile like an engineer.</em>
            </h1>
            <p className="hero-sub">
              glyph puts a real Typst compiler in your browser. Live vector preview,
              diagnostics that point at the line, and a workspace that keeps working when
              the network doesn't.
            </p>
            <div className="hero-actions">
              <Link to="/project/attention" className="btn btn-primary btn-lg">
                Start writing
                <Icon name="arrow-right" size={16} />
              </Link>
              <a href="#engine" className="btn btn-outline btn-lg">
                See the engine
              </a>
            </div>
            <p className="hero-note">
              Local demo. No account is created, and your project stays in this browser.
            </p>
          </div>

          <aside className="engine-spec" aria-label="Engine facts">
            <div className="spec-row">
              <span className="spec-key">Engine</span>
              <span className="spec-value">Typst · WebAssembly</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">Preview</span>
              <span className="spec-value">Compiled SVG, not a mock</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">Edit latency</span>
              <span className="spec-value">~2 ms, no network</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">Offline</span>
              <span className="spec-value">Editing works fully</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">Export</span>
              <span className="spec-value">PDF · SVG · HTML · Vector</span>
            </div>
            <div className="spec-row">
              <span className="spec-key">Source</span>
              <span className="spec-value">Clean-room build</span>
            </div>
          </aside>
        </section>

        <section className="stage" aria-label="A document open in glyph">
          <div className="stage-shell">
            <div className="stage-rail" aria-hidden="true">
              <span className="stage-rail-mark">g</span>
              <span className="stage-rail-icon is-on"><Icon name="files" size={16} /></span>
              <span className="stage-rail-icon"><Icon name="search" size={16} /></span>
              <span className="stage-rail-icon"><Icon name="outline" size={16} /></span>
              <span className="stage-rail-spacer" />
              <span className="stage-rail-icon"><Icon name="settings" size={16} /></span>
            </div>
            <div className="stage-main">
              <div className="stage-tabs">
                <span className="stage-tab is-active">
                  <Icon name="file" size={12} /> main.typ
                </span>
                <span className="stage-tab">
                  <Icon name="file" size={12} /> refs.bib
                </span>
                <span className="stage-tab">
                  <Icon name="image" size={12} /> figures/
                </span>
                <span className="stage-status" title="Rendered from the source on the left by the Typst engine">
                  <span className="live-dot" /> Typst output
                </span>
              </div>
              <div className="stage-body">
                <div className="stage-source">
                  <div className="stage-source-head">
                    <span>main.typ</span>
                    <span>Typst</span>
                  </div>
                  <pre className="code" aria-label="Typst source">
                    {SOURCE.map((line, index) => (
                      <div className="code-line" key={index}>
                        <span className="code-num">{index + 1}</span>
                        <span className="code-text">
                          {line.length === 0 ? '\u00a0' : line.map((token, tokenIndex) => (
                            <span key={tokenIndex} className={token.tone ? `tok-${token.tone}` : undefined}>
                              {token.text}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </pre>
                </div>
                <div className="stage-preview">
                  <div className="stage-preview-head">
                    <span>Preview</span>
                    <span>1 page · 596 × 842 pt</span>
                  </div>
                  <div className="paper-desk">
                    <img
                      className="paper-sheet"
                      src="/sample-page.svg"
                      width={596}
                      height={842}
                      alt="A compiled Typst page: On the shape of attention, by A. Rivera, with an abstract, a method section and a bar-chart figure."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="stage-caption">
            The page on the right is real Typst output from the source on the left,
            compiled by glyph&rsquo;s engine rather than drawn by hand.
          </p>
        </section>

        <section className="statement">
          <h2>
            The preview is not a picture of your document.
            <span> It is your document.</span>
          </h2>
          <div className="statement-body">
            <p>
              Most editors on the web render HTML and hope it lands near the printed page.
              glyph runs the same Typst compiler that produces the PDF, so line breaks,
              equations, figures and page geometry are the ones you will submit.
            </p>
            <p>
              When something is wrong, the engine says where. Diagnostics carry a file and
              a byte range, so the squiggle in the source and the issue in the panel are
              the same fact.
            </p>
          </div>
        </section>

        <section className="workflow" id="workflow">
          <header className="section-head">
            <h2>From draft to submission</h2>
            <p>
              Three steps, one engine. Nothing is re-implemented in the browser and then
              approximated again on the server.
            </p>
          </header>
          <div className="workflow-rows">
            <div className="workflow-row">
              <span className="row-index">Write</span>
              <div className="row-main">
                <h3>Plain text, real structure</h3>
                <p>
                  Multi-file projects with folders, tabs, project-wide search and replace,
                  an outline and per-file undo. <code>#import</code> and{' '}
                  <code>#include</code> resolve across the workspace because the engine sees
                  every file.
                </p>
              </div>
              <span className="row-tag">typst source</span>
            </div>
            <div className="workflow-row">
              <span className="row-index">Compile</span>
              <div className="row-main">
                <h3>Feedback while you type</h3>
                <p>
                  Completion, hover, formatting and diagnostics come from the running
                  compiler in a Web Worker. The preview recompiles as you go, and clicking
                  a rendered line sends you back to its source.
                </p>
              </div>
              <span className="row-tag">wasm worker</span>
            </div>
            <div className="workflow-row">
              <span className="row-index">Export</span>
              <div className="row-main">
                <h3>The artifact you hand over</h3>
                <p>
                  PDF renders instantly in the browser. The render service adds PDF, SVG,
                  HTML and vector IR from the native engine, plus share previews and
                  thumbnails that do not depend on a visitor's machine.
                </p>
              </div>
              <span className="row-tag">native typst</span>
            </div>
          </div>
        </section>

        <section className="proof" id="engine">
          <div className="proof-copy">
            <h2>The proof is the output.</h2>
            <p>
              glyph is a clean-room build: no source, CSS, assets or copy from the Typst
              web app. The behaviour comes from public documentation and the open-source
              toolchain, and the numbers below come from the code in this repository.
            </p>
            <a className="text-link" href="https://typst.app/docs/" target="_blank" rel="noreferrer">
              Read the Typst documentation <Icon name="external" size={13} />
            </a>
          </div>
          <dl className="proof-table">
            <div>
              <dt>Browser engine</dt>
              <dd>typst-web-service 0.18.8 · WASM</dd>
            </div>
            <div>
              <dt>Server engine</dt>
              <dd>typst-ts-node-compiler 0.7.0 · native</dd>
            </div>
            <div>
              <dt>Warm server compile</dt>
              <dd>~0.7 ms · 4 workers</dd>
            </div>
            <div>
              <dt>Server test suite</dt>
              <dd>48 passing checks</dd>
            </div>
            <div>
              <dt>Network calls while typing</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Editing with the service stopped</dt>
              <dd>Fully functional</dd>
            </div>
          </dl>
        </section>

        <section className="final-cta">
          <h2>Your next paper shouldn't fight you.</h2>
          <div className="final-cta-actions">
            <Link to="/project/attention" className="btn btn-ink btn-lg">
              Open the editor
              <Icon name="arrow-right" size={16} />
            </Link>
            <span>Local demo · no sign-up · your files stay in this browser</span>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="foot-brand">
          <span className="yc-mark">g</span> glyph
        </div>
        <p>Built with Typst, CodeMirror and WebAssembly.</p>
        <nav aria-label="Footer">
          <Link to="/signin">Sign in</Link>
          <Link to="/dashboard">Dashboard</Link>
          <a href="https://typst.app/docs/" target="_blank" rel="noreferrer">
            Typst docs
          </a>
        </nav>
      </footer>
    </div>
  );
}
