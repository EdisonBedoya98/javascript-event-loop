import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

const codeLines = [
  { tokens: [{ type: 'fn', text: 'console' }, { type: 'op', text: '.' }, { type: 'fn', text: 'log' }, { type: '', text: '(' }, { type: 'str', text: '"Start"' }, { type: '', text: ')' }] },
  { tokens: [] },
  { tokens: [{ type: 'fn', text: 'setTimeout' }, { type: '', text: '(() ' }, { type: 'kw', text: '=>' }, { type: '', text: ' {' }] },
  { tokens: [{ type: '', text: '  ' }, { type: 'fn', text: 'console' }, { type: 'op', text: '.' }, { type: 'fn', text: 'log' }, { type: '', text: '(' }, { type: 'str', text: '"Timeout"' }, { type: '', text: ')' }] },
  { tokens: [{ type: '', text: '}, ' }, { type: 'num', text: '0' }, { type: '', text: ')' }] },
  { tokens: [] },
  { tokens: [{ type: 'kw', text: 'Promise' }, { type: 'op', text: '.' }, { type: 'fn', text: 'resolve' }, { type: '', text: '()' }, { type: 'op', text: '.' }, { type: 'fn', text: 'then' }, { type: '', text: '(() ' }, { type: 'kw', text: '=>' }, { type: '', text: ' {' }] },
  { tokens: [{ type: '', text: '  ' }, { type: 'fn', text: 'console' }, { type: 'op', text: '.' }, { type: 'fn', text: 'log' }, { type: '', text: '(' }, { type: 'str', text: '"Promise"' }, { type: '', text: ')' }] },
  { tokens: [{ type: '', text: '})' }] },
  { tokens: [] },
  { tokens: [{ type: 'fn', text: 'console' }, { type: 'op', text: '.' }, { type: 'fn', text: 'log' }, { type: '', text: '(' }, { type: 'str', text: '"End"' }, { type: '', text: ')' }] },
]

const stepsDef = [
  { line: 0, desc: 'Execute console.log("Start")', mutate: s => { s.stack.push('console.log("Start")') } },
  { line: 0, desc: 'Output: "Start" — popping from stack', mutate: s => { s.stack.pop() } },
  { line: 2, desc: 'Push setTimeout call onto stack', mutate: s => { s.stack.push('setTimeout(cb, 0)') } },
  { line: 2, desc: 'Hand timer to Web APIs, pop from stack', mutate: s => { s.stack.pop(); s.apis.push({ label: 'Timer (0ms)', id: 't1' }) }, transfer: { from: 'stack', to: 'apis', label: 'Timer (0ms)', cls: 'api' } },
  { line: 2, desc: 'Timer completes → callback moves to Macrotask Queue', mutate: s => { s.apis = s.apis.filter(a => a.id !== 't1'); s.taskQ.push('setTimeout cb') }, loop: true, transfer: { from: 'apis', to: 'taskQ', label: 'setTimeout cb', cls: 'task' } },
  { line: 6, desc: 'Push Promise.resolve().then() onto stack', mutate: s => { s.stack.push('Promise.resolve().then(cb)') } },
  { line: 6, desc: 'Promise resolves immediately → .then cb to Microtask Queue', mutate: s => { s.stack.pop(); s.microQ.push('Promise .then cb') }, transfer: { from: 'stack', to: 'microQ', label: 'Promise .then cb', cls: 'micro' } },
  { line: 10, desc: 'Execute console.log("End")', mutate: s => { s.stack.push('console.log("End")') } },
  { line: 10, desc: 'Output: "End" — popping from stack', mutate: s => { s.stack.pop() } },
  { line: -1, desc: 'Call stack empty. Event loop checks Microtask Queue first', mutate: () => {}, loop: true },
  { line: 7, desc: 'Move Promise .then cb → Call Stack', mutate: s => { s.microQ.shift(); s.stack.push('Promise .then cb') }, loop: true, transfer: { from: 'microQ', to: 'stack', label: 'Promise .then cb', cls: 'stack' } },
  { line: 7, desc: 'Execute console.log("Promise")', mutate: s => { s.stack.pop(); s.stack.push('console.log("Promise")') } },
  { line: 7, desc: 'Output: "Promise" — popping from stack', mutate: s => { s.stack.pop() } },
  { line: -1, desc: 'Microtask Queue empty. Event loop checks Macrotask Queue', mutate: () => {}, loop: true },
  { line: 3, desc: 'Move setTimeout cb → Call Stack', mutate: s => { s.taskQ.shift(); s.stack.push('setTimeout cb') }, loop: true, transfer: { from: 'taskQ', to: 'stack', label: 'setTimeout cb', cls: 'stack' } },
  { line: 3, desc: 'Execute console.log("Timeout")', mutate: s => { s.stack.pop(); s.stack.push('console.log("Timeout")') } },
  { line: 3, desc: 'Output: "Timeout" — popping from stack', mutate: s => { s.stack.pop() } },
  { line: -1, desc: 'All queues empty. Program complete!', mutate: () => {}, loop: false },
]

const initialState = () => ({ stack: [], apis: [], microQ: [], taskQ: [] })

function Items({ items, cls }) {
  return items.map((item, i) => {
    const label = typeof item === 'string' ? item : item.label
    return <div key={`${label}-${i}`} className={`item ${cls}`}>{label}</div>
  })
}

function CodeDisplay({ activeLine }) {
  return (
    <div className="code-display">
      {codeLines.map((line, i) => (
        <div key={i} className={`line${activeLine === i ? ' active' : ''}`}>
          <span className="ln">{i + 1}</span>
          {line.tokens.length === 0
            ? '\u00A0'
            : line.tokens.map((t, j) =>
                t.type ? <span key={j} className={t.type}>{t.text}</span> : <span key={j}>{t.text}</span>
              )}
        </div>
      ))}
    </div>
  )
}

function TransferBubble({ transfer, panelElements, onDone }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!transfer) return
    const fromEl = panelElements.current[transfer.from]
    const toEl = panelElements.current[transfer.to]
    const el = ref.current
    if (!fromEl || !toEl || !el) { onDone(); return }

    const fromRect = fromEl.getBoundingClientRect()
    const toRect = toEl.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    const startX = fromRect.left + fromRect.width / 2 - 80 + scrollX
    const startY = fromRect.top + fromRect.height / 2 + scrollY
    const endX = toRect.left + toRect.width / 2 - 80 + scrollX
    const endY = toRect.top + toRect.height / 2 + scrollY

    el.style.left = `${startX}px`
    el.style.top = `${startY}px`
    el.style.opacity = '1'
    el.style.transform = 'scale(1.1)'
    el.style.transition = 'none'

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.left = `${endX}px`
        el.style.top = `${endY}px`
        el.style.transform = 'scale(1)'
      })
    })

    const timer = setTimeout(onDone, 520)
    return () => clearTimeout(timer)
  }, [transfer, panelElements, onDone])

  if (!transfer) return null

  return (
    <div
      ref={ref}
      className={`transfer-bubble item ${transfer.cls}`}
      style={{ opacity: 0 }}
    >
      {transfer.label}
    </div>
  )
}

const SPEEDS = [2400, 1600, 1200, 800, 500]
const SPEED_LABELS = ['0.5x', '0.75x', '1x', '1.5x', '2x']

function App() {
  const [state, setState] = useState(initialState)
  const [currentStep, setCurrentStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(2)
  const [activeTransfer, setActiveTransfer] = useState(null)

  const stateRef = useRef(state)
  const stepRef = useRef(currentStep)
  const playingRef = useRef(playing)
  const speedRef = useRef(SPEEDS[2])
  const transferringRef = useRef(false)

  // Store panel DOM elements in a single ref object (no .current access during render)
  const panelElements = useRef({ stack: null, apis: null, microQ: null, taskQ: null })

  const setPanelRef = useCallback((name) => (el) => {
    panelElements.current[name] = el
  }, [])

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { stepRef.current = currentStep }, [currentStep])
  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { speedRef.current = SPEEDS[speedIdx] }, [speedIdx])

  const advance = useCallback(() => {
    const next = stepRef.current + 1
    if (next >= stepsDef.length) {
      setPlaying(false)
      return false
    }
    const stepDef = stepsDef[next]

    if (stepDef.transfer) {
      transferringRef.current = true
      setCurrentStep(next)
      setActiveTransfer(stepDef.transfer)
      return true
    }

    const newState = JSON.parse(JSON.stringify(stateRef.current))
    stepDef.mutate(newState)
    setState(newState)
    setCurrentStep(next)
    return true
  }, [])

  const onTransferDone = useCallback(() => {
    setActiveTransfer(null)
    transferringRef.current = false
    const idx = stepRef.current
    if (idx >= 0 && idx < stepsDef.length) {
      const newState = JSON.parse(JSON.stringify(stateRef.current))
      stepsDef[idx].mutate(newState)
      setState(newState)
    }
  }, [])

  const handlePlay = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false)
      return
    }
    setPlaying(true)
    const tick = () => {
      if (!playingRef.current) return
      if (transferringRef.current) {
        setTimeout(tick, 100)
        return
      }
      const continued = advance()
      if (!continued) return
      setTimeout(tick, speedRef.current)
    }
    setTimeout(tick, 100)
  }, [advance])

  const handleStep = useCallback(() => {
    if (transferringRef.current) return
    setPlaying(false)
    advance()
  }, [advance])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setCurrentStep(-1)
    setState(initialState())
    setActiveTransfer(null)
    transferringRef.current = false
  }, [])

  const step = currentStep >= 0 && currentStep < stepsDef.length ? stepsDef[currentStep] : null
  const isFinished = currentStep >= stepsDef.length - 1
  const statusText = step ? step.desc : 'Ready — press Play or Step'
  const loopActive = step?.loop

  return (
    <>
      <h1>JavaScript Event Loop</h1>
      <p className="subtitle">Interactive step-by-step visualization</p>

      <div className="controls">
        <button className="btn primary" onClick={handlePlay} disabled={isFinished}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button className="btn" onClick={handleStep} disabled={isFinished}>
          Step
        </button>
        <button className="btn" onClick={handleReset}>
          Reset
        </button>
        <div className="speed-control">
          <span>Speed</span>
          <input
            type="range"
            min="1"
            max="5"
            value={speedIdx + 1}
            onChange={e => setSpeedIdx(Number(e.target.value) - 1)}
          />
          <span>{SPEED_LABELS[speedIdx]}</span>
        </div>
      </div>

      <div className="container">
        <div className="panel call-stack" ref={setPanelRef('stack')}>
          <div className="panel-title"><span className="dot"></span>Call Stack</div>
          <div className="stack-items">
            <Items items={state.stack} cls="stack" />
          </div>
        </div>

        <div className="panel event-loop-panel">
          <div className="panel-title">Event Loop</div>
          <div className={`loop-ring${loopActive ? ' active' : ''}`}>
            <svg viewBox="0 0 100 100">
              <circle className="track" cx="50" cy="50" r="40" />
              <circle className="progress" cx="50" cy="50" r="40" transform="rotate(-90 50 50)" />
            </svg>
          </div>
          <div className="loop-label">Checking queues...</div>
          <div className="loop-status">{statusText}</div>
        </div>

        <div className="panel web-apis" ref={setPanelRef('apis')}>
          <div className="panel-title"><span className="dot"></span>Web APIs</div>
          <div className="api-items">
            <Items items={state.apis} cls="api" />
          </div>
        </div>

        <div className="queues">
          <div className="panel microtask-queue" ref={setPanelRef('microQ')}>
            <div className="panel-title"><span className="dot" style={{ background: 'var(--accent3)' }}></span>Microtask Queue (Promises)</div>
            <div className="queue-items">
              <Items items={state.microQ} cls="micro" />
            </div>
          </div>
          <div className="panel callback-queue" ref={setPanelRef('taskQ')}>
            <div className="panel-title"><span className="dot" style={{ background: 'var(--accent4)' }}></span>Macrotask Queue (setTimeout, etc.)</div>
            <div className="queue-items">
              <Items items={state.taskQ} cls="task" />
            </div>
          </div>
        </div>
      </div>

      <TransferBubble
        transfer={activeTransfer}
        panelElements={panelElements}
        onDone={onTransferDone}
      />

      <CodeDisplay activeLine={step?.line ?? -1} />

      <div className="legend">
        <div className="legend-item"><div className="swatch" style={{ background: 'var(--accent)' }}></div>Call Stack</div>
        <div className="legend-item"><div className="swatch" style={{ background: 'var(--accent2)' }}></div>Web APIs</div>
        <div className="legend-item"><div className="swatch" style={{ background: 'var(--accent3)' }}></div>Microtasks</div>
        <div className="legend-item"><div className="swatch" style={{ background: 'var(--accent4)' }}></div>Macrotasks</div>
      </div>
    </>
  )
}

export default App
