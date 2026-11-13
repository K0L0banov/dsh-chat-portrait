window.__ModuleLoader__.load({
  id: '@local/chat-portrait',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const BASE = '/chat-portrait/'
    const STORAGE_KEY = 'dsh.chat-portrait.visible'
    const TICK_MS = 400
    const HOLD_MS = 1200
    const NS = 'chat-portrait'

    // Standing sheets are normalised to this height; every other sheet is drawn
    // at its own share of it so a kneeling pose reads shorter, not smaller.
    const REF_HEIGHT = 1200

    // Temporary capture mode: cycles every available expression so the whole
    // set can be screenshotted in one pass. Left false in the delivered build.
    const DEMO = false
    const DEMO_MS = 2400

    const FALLBACK_MANIFEST = {
      character: 'Portrait',
      fallback: 'neutral',
      emotions: { neutral: { file: 'neutral.png', label: 'neutral' } },
    }

    /* ------------------------------------------------------------------ *
     * Visibility, shared between the figure and its reopen button
     * ------------------------------------------------------------------ */

    const listeners = new Set()
    let visible = true
    try {
      visible = window.localStorage.getItem(STORAGE_KEY) !== 'false'
    } catch {}

    function setVisible(next) {
      visible = next
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next))
      } catch {}
      for (const listener of listeners) listener()
    }

    function useVisible() {
      const [, bump] = useState(0)
      useEffect(() => {
        const listener = () => bump((value) => value + 1)
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }, [])
      return visible
    }

    /* ------------------------------------------------------------------ *
     * Emotion engine
     *
     * A reply has no structured mood, so the portrait reads the tail of the
     * latest assistant message and scores it against ordered signal lists.
     * Sharper moods sit first, and a match closer to the end of the text
     * weighs more than one buried mid-paragraph.
     * ------------------------------------------------------------------ */

    const SIGNALS = [
      { id: 'tsundere', words: ['才不', '才没', '才不是', '谁要', '哼'] },
      { id: 'panic', words: ['慌了', '怎么办', '糟了', '完蛋', '来不及', '急死', '惨了', '救命'] },
      { id: 'aggrieved', words: ['委屈', '冤枉', '怪本喵', '不是本喵', '欺负', '凶本喵'] },
      { id: 'angry', words: ['生气', '愤怒', '可恶', '讨厌', '烦死', '炸毛', '气死', '不许', '少来', '闭嘴', '凭什么'] },
      { id: 'sad', words: ['难过', '伤心', '抱歉', '对不起', '遗憾', '可惜', '没办法', '无能为力', '唉', '呜'] },
      { id: 'surprised', words: ['诶', '咦', '哇', '居然', '竟然', '没想到', '真的吗', '怎么会', '哎呀', '吓'] },
      { id: 'shy', words: ['害羞', '脸红', '不好意思', '别夸', '嘿嘿', '贴贴', '喜欢你', '抱抱', '摸头', '可爱', '撒娇', '蹭', '捏'] },
      { id: 'proud', words: ['得意', '厉害吧', '本喵厉害', '骄傲', '看本喵的', '牛吧', '佩服吧'] },
      { id: 'praised', words: ['表扬', '夸', '做得好', '真棒', '干得好'] },
      { id: 'obedient', words: ['乖乖', '乖', '听话', '坐好'] },
      { id: 'excited', words: ['好耶', '太棒', '冲呀', '终于', '来了来了', '耶'] },
      { id: 'happy', words: ['开心', '太好了', '成功', '完成', '搞定', '谢谢', '哈哈', '喜欢', '好哇', '棒', '一起', '陪你', '玩'] },
      { id: 'thinking', words: ['让我想想', '先想想', '分析一下', '理一理', '思考', '核实一下', '确认一下'] },
      { id: 'sleepy', words: ['困了', '好困', '困死', '想睡', '晚安', '哈欠', '熬夜', '睡了', '睡一会', '眯一会'] },
    ]

    function detectEmotion(text) {
      if (typeof text !== 'string') return 'neutral'
      const tail = text.slice(-260)
      if (tail.trim() === '') return 'neutral'

      let bestId = 'neutral'
      let bestScore = 0

      for (let index = 0; index < SIGNALS.length; index++) {
        const rule = SIGNALS[index]
        let score = 0
        for (const word of rule.words) {
          let from = 0
          let hits = 0
          while (hits < 2) {
            const at = tail.indexOf(word, from)
            if (at < 0) break
            hits++
            score += 1 + at / Math.max(1, tail.length)
            from = at + word.length
          }
        }
        if (score === 0) continue
        // Earlier rules carry sharper moods, so they win an otherwise even match.
        const weighted = score * (1 + (SIGNALS.length - index) * 0.02)
        if (weighted > bestScore) {
          bestScore = weighted
          bestId = rule.id
        }
      }

      return bestId
    }

    /**
     * Whether the most recent tool call failed.
     *
     * A failed call is what "tried to fix it and it did not work" looks like
     * from the outside, so it drives the frustrated sheet. Several shapes are
     * accepted because the node contract differs by tool family.
     */
    function selectLatestToolFailed(chat) {
      if (!chat || !Array.isArray(chat.order) || !chat.nodes) return false
      const floor = Math.max(0, chat.order.length - 12)
      for (let i = chat.order.length - 1; i >= floor; i--) {
        const key = chat.order[i]
        const node = typeof chat.nodes.get === 'function' ? chat.nodes.get(key) : chat.nodes[key]
        if (!node || node.kind !== 'tool-call') continue
        const root = node.data && node.data.root
        if (!root) return false
        return (
          root.isError === true ||
          root.error !== undefined ||
          root.phase === 'error' ||
          root.phase === 'failed' ||
          (root.result && root.result.isError === true)
        )
      }
      return false
    }

    /**
     * The mood the conversation is in right now.
     *
     * While a turn runs there is no settled reply to read yet, so the portrait
     * tracks the work itself: a failed tool attempt reads as frustration,
     * fresh streamed text reads as progress, and the rest of the time it looks
     * busy. Progress holds its own beat — a pleased expression that vanishes
     * in one tick reads as a glitch, not as a reaction.
     */
    const PROGRESS_HAPPY_MS = 1400
    const HAPPY_HOLD_MS = 3500
    const REPLAY_STEP_MS = 1300

    function currentEmotion(reply, running, stalledMs, toolFailed, happyUntil, now) {
      const text = typeof reply === 'string' ? reply : ''
      if (!running) return detectEmotion(text)
      if (toolFailed) return 'sad'
      if (now < happyUntil) return 'happy'
      if (stalledMs < PROGRESS_HAPPY_MS && text.trim().length > 0) return 'happy'
      return 'thinking'
    }

    /**
     * Score a finished reply in ~100-character blocks and collapse runs of the
     * same mood. Sentence-sized units flipped far too often — one aside could
     * cut the arc in half — while 100 characters keeps about one beat per real
     * paragraph of speech.
     */
    function emotionSequence(text) {
      if (typeof text !== 'string' || text.trim() === '') return []

      const CHUNK_CHARS = 100
      const chunks = []
      for (let start = 0; start < text.length; start += CHUNK_CHARS) {
        chunks.push(text.slice(start, start + CHUNK_CHARS))
      }

      const sequence = []
      for (const chunk of chunks) {
        let id = detectEmotion(chunk)
        // A trailing block with no mood words ("……呼……呼噜……") would otherwise
        // read as neutral and erase the mood the reply actually ended on.
        if (id === 'neutral' && sequence.length > 0) id = sequence[sequence.length - 1]
        if (sequence.length === 0 || sequence[sequence.length - 1] !== id) sequence.push(id)
      }
      if (sequence.length === 0) sequence.push(detectEmotion(text))
      return sequence
    }

    /* ------------------------------------------------------------------ *
     * Reading the conversation
     * ------------------------------------------------------------------ */

    function blocksToText(blocks) {
      let out = ''
      for (const block of blocks) {
        if (!block || block.kind !== 'text') continue
        if (typeof block.text !== 'string') continue
        out += block.text + '\n'
      }
      return out
    }

    /**
     * Text of the *latest* assistant step, even while it is still empty.
     *
     * Deliberately does not fall back to an older settled reply: during a turn
     * the newest step is the one being written, and an empty result is what
     * tells the portrait the model is working rather than finished.
     */
    function selectLatestReply(chat) {
      if (!chat) return ''
      const order = chat.order
      const nodes = chat.nodes
      if (!Array.isArray(order) || !nodes) return ''

      for (let i = order.length - 1; i >= 0; i--) {
        const key = order[i]
        const node = typeof nodes.get === 'function' ? nodes.get(key) : nodes[key]
        if (!node || node.kind !== 'assistant-step') continue
        const blocks = node.data && node.data.blocks
        if (!Array.isArray(blocks)) return ''
        return blocksToText(blocks)
      }
      return ''
    }

    /* ------------------------------------------------------------------ *
     * Portrait manifest
     * ------------------------------------------------------------------ */

    function normalizeManifest(raw) {
      if (!raw || typeof raw !== 'object' || !raw.emotions) return FALLBACK_MANIFEST
      const emotions = {}
      for (const [id, value] of Object.entries(raw.emotions)) {
        if (!value || typeof value !== 'object') continue
        const data = typeof value.data === 'string' && value.data.startsWith('data:') ? value.data : undefined
        const file = typeof value.file === 'string' && value.file !== '' ? value.file : undefined
        if (data === undefined && file === undefined) continue
        emotions[id] = {
          data,
          file,
          label: typeof value.label === 'string' ? value.label : id,
          // Per-sheet framing correction: generated art does not always share
          // the reference camera, so each expression may need its own nudge.
          scale: typeof value.scale === 'number' && value.scale > 0 ? value.scale : 1,
          offsetX: typeof value.offsetX === 'number' ? value.offsetX : 0,
          offsetY: typeof value.offsetY === 'number' ? value.offsetY : 0,
        }
      }
      if (Object.keys(emotions).length === 0) return FALLBACK_MANIFEST
      const fallback = typeof raw.fallback === 'string' && emotions[raw.fallback] ? raw.fallback : Object.keys(emotions)[0]
      return {
        character: typeof raw.character === 'string' ? raw.character : FALLBACK_MANIFEST.character,
        fallback,
        emotions,
      }
    }

    /** An inlined data URL wins; a file reference is the fallback address. */
    function sourceOf(entry) {
      if (!entry) return null
      if (typeof entry.data === 'string' && entry.data !== '') return entry.data
      if (typeof entry.file === 'string' && entry.file !== '') return BASE + encodeURI(entry.file)
      return null
    }

    function useManifest() {
      const [manifest, setManifest] = useState(FALLBACK_MANIFEST)
      useEffect(() => {
        let alive = true
        // The Host route answers the bare prefix with the manifest itself.
        fetch(BASE, { cache: 'no-cache' })
          .then((response) => (response.ok ? response.json() : null))
          .then((raw) => {
            if (alive && raw) setManifest(normalizeManifest(raw))
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])
      return manifest
    }

    /**
     * Probe every declared expression once: which ones have art, and each
     * sheet's height as a share of the standing reference. Knowing the height
     * up front is what stops a newly selected sheet from rendering at full
     * height for a frame before its own onLoad fires.
     */
    function useUsableEmotions(manifest) {
      const [state, setState] = useState({ usable: null, sizes: {} })
      useEffect(() => {
        let alive = true
        const ids = Object.keys(manifest.emotions)
        const found = new Set()
        const sizes = {}
        let pending = ids.length
        if (pending === 0) {
          setState({ usable: found, sizes })
          return
        }
        const settle = () => {
          pending--
          if (alive && pending <= 0) setState({ usable: found, sizes })
        }
        for (const id of ids) {
          const source = sourceOf(manifest.emotions[id])
          if (source === null) {
            settle()
            continue
          }
          const probe = new Image()
          probe.onload = () => {
            found.add(id)
            if (probe.naturalHeight > 0) sizes[id] = probe.naturalHeight / REF_HEIGHT
            settle()
          }
          probe.onerror = settle
          probe.src = source
        }
        return () => {
          alive = false
        }
      }, [manifest])
      return state
    }

    /* ------------------------------------------------------------------ *
     * Shared portrait state
     * ------------------------------------------------------------------ */

    const BUILTIN_TEXT = {
      zh: { title: '立绘', hide: '收起立绘', reveal: '叫出立绘', noReply: '等待对话', empty: '还没有立绘素材' },
      en: { title: 'Portrait', hide: 'Put the portrait away', reveal: 'Call the portrait back', noReply: 'Waiting for a reply', empty: 'No portrait artwork yet' },
    }

    const DICT_ZH = { title: '立绘', hide: '收起立绘', reveal: '叫出立绘', noReply: '等待对话', empty: '还没有立绘素材' }
    const DICT_EN = { title: 'Portrait', hide: 'Put the portrait away', reveal: 'Call the portrait back', noReply: 'Waiting for a reply', empty: 'No portrait artwork yet' }

    function pickBuiltinText() {
      const lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
      return lang.toLowerCase().startsWith('zh') ? BUILTIN_TEXT.zh : BUILTIN_TEXT.en
    }

    function usePortrait(props, override) {
      const useChat = props.useChat
      const t = typeof props.t === 'function' ? props.t : null
      const builtin = pickBuiltinText()
      const say = (key) => {
        if (t) {
          const value = t(key)
          if (typeof value === 'string' && value !== key) return value
        }
        return builtin[key] ?? key
      }

      const reply = typeof useChat === 'function' ? useChat(selectLatestReply) : ''
      const toolFailed = typeof useChat === 'function' ? useChat(selectLatestToolFailed) : false
      const useSessionHook = props.useSession
      const running =
        typeof useSessionHook === 'function' ? !!useSessionHook((state) => state && state.running) : false
      const manifest = useManifest()
      const { usable, sizes } = useUsableEmotions(manifest)
      const [emotion, setEmotion] = useState('neutral')
      const [pose, setPose] = useState('stand')
      const [replay, setReplay] = useState({ key: '', sequence: [], index: 0 })
      const replyRef = useRef(reply)
      replyRef.current = reply
      const runningRef = useRef(running)
      runningRef.current = running
      const toolFailedRef = useRef(toolFailed)
      toolFailedRef.current = toolFailed

      useEffect(() => {
        let last = { id: 'neutral', at: 0 }
        let progress = { length: -1, at: Date.now() }
        let happyUntil = 0
        if (DEMO) return () => {}
        const id = window.setInterval(() => {
          const text = replyRef.current
          const running = runningRef.current
          const now = Date.now()
          if (text.length !== progress.length) progress = { length: text.length, at: now }
          const stalled = now - progress.at
          // Fresh output earns a longer pleased beat than the sampling window.
          if (running && stalled < PROGRESS_HAPPY_MS && text.trim().length > 0) {
            happyUntil = now + HAPPY_HOLD_MS
          }
          const next = currentEmotion(text, running, stalled, toolFailedRef.current, happyUntil, now)
          if (next === last.id) return
          if (now - last.at < HOLD_MS && last.at !== 0) return
          last = { id: next, at: now }
          setEmotion(next)
        }, TICK_MS)
        return () => window.clearInterval(id)
      }, [])

      // Demo sweep over whatever artwork actually exists, in manifest order.
      useEffect(() => {
        if (!DEMO) return
        const ids = Object.keys(manifest.emotions).filter((id) => usable && usable.has(id))
        if (ids.length === 0) return
        let index = 0
        setEmotion(ids[0])
        const id = window.setInterval(() => {
          index = (index + 1) % ids.length
          setEmotion(ids[index])
        }, DEMO_MS)
        return () => window.clearInterval(id)
      }, [usable, manifest])

      // A finished turn gets its mood arc played back, ending on its last mood.
      useEffect(() => {
        if (running) {
          setReplay((current) => (current.sequence.length === 0 ? current : { key: '', sequence: [], index: 0 }))
          return
        }
        if (reply.trim() === '') return
        setReplay((current) =>
          current.key === reply ? current : { key: reply, sequence: emotionSequence(reply), index: 0 },
        )
      }, [reply, running])

      // Advance the arc one beat at a time, then hold on the final mood.
      useEffect(() => {
        if (replay.sequence.length <= 1) return
        if (replay.index >= replay.sequence.length - 1) return
        const timer = window.setTimeout(() => {
          setReplay((current) =>
            current.sequence.length > 0 && current.index < current.sequence.length - 1
              ? { ...current, index: current.index + 1 }
              : current,
          )
        }, REPLAY_STEP_MS)
        return () => window.clearTimeout(timer)
      }, [replay])

      const fallbackId = manifest.fallback
      const picked = typeof override === 'string' && usable && usable.has(override) ? override : null
      const replayed =
        replay.sequence.length > 0 ? replay.sequence[Math.min(replay.index, replay.sequence.length - 1)] : null
      const baseEmotion = picked ?? replayed ?? (usable && usable.has(emotion) ? emotion : fallbackId)

      // Some moods ship in both a standing and a kneeling sheet (`shy` /
      // `shy_sit`). Prefer the variant matching the pose already on screen, so
      // switching mood never makes her stand up or kneel down for no reason.
      const posedId = manifest.emotions[baseEmotion + '_' + pose] ? baseEmotion + '_' + pose : baseEmotion
      const activeEmotion =
        usable && usable.has(posedId) ? posedId : usable && usable.has(baseEmotion) ? baseEmotion : fallbackId
      const active = manifest.emotions[activeEmotion] || manifest.emotions[fallbackId]

      // Remember which pose is on screen so the next mood can pick its matching
      // variant, and so a poke reuses the same posture.
      useEffect(() => {
        const entry = manifest.emotions[activeEmotion]
        const next = entry && entry.pose
        if (next && next !== pose) setPose(next)
      }, [activeEmotion, manifest, pose])
      const src = sourceOf(active)
      const label = active && active.label ? active.label : activeEmotion
      const scale = active && typeof active.scale === 'number' ? active.scale : 1
      const offsetX = active && typeof active.offsetX === 'number' ? active.offsetX : 0
      const offsetY = active && typeof active.offsetY === 'number' ? active.offsetY : 0

      const order = Object.keys(manifest.emotions).filter((id) => usable && usable.has(id))

      return { reply, src, emotion: activeEmotion, label, scale, offsetX, offsetY, usable, sizes, order, say }
    }

    /* ------------------------------------------------------------------ *
     * One figure at a time across Session panels
     * ------------------------------------------------------------------ */

    let mountedToken = null

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    const CSS = `
.cp-root {
  position: fixed;
  right: 28px;
  bottom: 130px;
  height: min(66vh, 700px);
  max-width: calc(min(22vw, 300px) - 28px);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  z-index: 30;
  pointer-events: none;
  opacity: 1;
  transition: opacity .3s ease, transform .3s ease;
}

/* The transcript keeps its own column: while the figure is on screen the flow
   reserves the same width on the right, so text never runs underneath it. */
body:has(> .cp-root[data-hidden="false"]) [data-chat-flow] {
  padding-right: min(22vw, 300px);
}
.cp-root[data-hidden="true"] {
  opacity: 0;
  transform: translateY(24px);
  pointer-events: none;
}
.cp-stage {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  transform-origin: 50% 100%;
  animation: cp-breathe 5.6s ease-in-out infinite;
  pointer-events: auto;
  cursor: pointer;
}
.cp-adjust {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  height: 100%;
  transform-origin: 50% 100%;
  will-change: transform;
}
.cp-figure {
  display: block;
  height: var(--cp-h, 100%);
  width: auto;
  max-width: none;
  max-height: none;
  object-fit: contain;
  object-position: bottom right;
  user-select: none;
  -webkit-user-drag: none;
  transform-origin: 50% 100%;
  filter:
    drop-shadow(-6px 10px 22px rgba(0, 0, 0, .32))
    drop-shadow(0 0 30px rgba(150, 180, 255, .13));
}
.cp-figure.cp-react-happy { animation: cp-hop .78s ease-out both; }
.cp-figure.cp-react-excited { animation: cp-hop .62s ease-out 2 both; }
.cp-figure.cp-react-surprised { animation: cp-startle .46s ease-out both; }
.cp-figure.cp-react-angry { animation: cp-shake .5s ease-in-out both; }
.cp-figure.cp-react-sad { animation: cp-sink 1.1s ease-in-out both; }
.cp-figure.cp-react-shy { animation: cp-sway 1.2s ease-in-out both; }
.cp-figure.cp-react-thinking { animation: cp-sway 1.6s ease-in-out both; }
.cp-figure.cp-react-sleepy { animation: cp-drowse 2.2s ease-in-out both; }
/* Poke reaction: a quick, tight tremble that reads as flustered. Later than the
   mood rules so it wins while it plays. */
.cp-figure.cp-shiver { animation: cp-shiver .52s ease-in-out both; }

.cp-bar {
  position: absolute;
  top: 8px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 11px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity .18s ease, transform .18s ease;
  pointer-events: none;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .16);
}
.cp-stage:hover .cp-bar {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.cp-mood { font-variant-numeric: tabular-nums; }
.cp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.cp-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.cp-btn:focus-visible,
.cp-reopen:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.cp-reopen {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .18);
  transition: transform .16s ease, color .16s ease;
}
.cp-reopen:hover {
  transform: translateY(-1px);
  color: var(--dsw-alias-label-primary);
}

@media (max-width: 1280px) {
  .cp-root { height: min(58vh, 620px); max-width: min(19vw, 250px); }
}
@media (max-width: 1040px) {
  .cp-root { height: min(48vh, 520px); max-width: min(17vw, 200px); }
}

@keyframes cp-breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.006); }
}
@keyframes cp-hop {
  0%, 100% { transform: translateY(0); }
  38% { transform: translateY(-13px); }
  68% { transform: translateY(-3px); }
}
@keyframes cp-startle {
  0% { transform: scale(1); }
  34% { transform: scale(1.055); }
  100% { transform: scale(1); }
}
@keyframes cp-shake {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-6px); }
  38% { transform: translateX(5px); }
  58% { transform: translateX(-3px); }
  78% { transform: translateX(2px); }
}
@keyframes cp-sink {
  0%, 100% { transform: translateY(0); }
  45% { transform: translateY(7px) scale(.994); }
}
@keyframes cp-sway {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(-1.1deg); }
  75% { transform: rotate(.8deg); }
}
@keyframes cp-drowse {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(2px) rotate(-.6deg); }
}
@keyframes cp-shiver {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  12% { transform: translateX(-4px) rotate(-.7deg); }
  26% { transform: translateX(4px) rotate(.7deg); }
  40% { transform: translateX(-3px) rotate(-.5deg); }
  55% { transform: translateX(3px) rotate(.5deg); }
  70% { transform: translateX(-2px) rotate(-.3deg); }
  85% { transform: translateX(1px); }
}

@media (prefers-reduced-motion: reduce) {
  .cp-stage { animation: none; }
  .cp-figure { animation: none !important; }
}
`

    /* ------------------------------------------------------------------ *
     * Figure
     * ------------------------------------------------------------------ */

    function PortraitFigure(props) {
      const [preview, setPreview] = useState(null)
      const [shiver, setShiver] = useState(0)
      const portrait = usePortrait(props, preview)
      const shown = useVisible()
      const figureRef = useRef(null)
      const [reaction, setReaction] = useState(null)
      const returnTimer = useRef(null)

      // Height comes from the preloaded manifest, so a new sheet is already the
      // right size on its first frame instead of snapping from full height.
      const heightRatio = portrait.sizes[portrait.emotion] ?? 1

      // Poking the figure is a shy beat: show the shy sheet, shiver, then fall
      // back to whatever mood the conversation was in. `usePortrait` resolves
      // the pose, so a kneeling scene gets the kneeling shy sheet.
      const onPoke = () => {
        if (!portrait.usable) return
        if (!portrait.usable.has('shy') && !portrait.usable.has('shy_sit')) return
        setPreview('shy')
        setShiver((value) => value + 1)
        if (returnTimer.current) window.clearTimeout(returnTimer.current)
        returnTimer.current = window.setTimeout(() => {
          setPreview(null)
          returnTimer.current = null
        }, 1100)
      }

      useEffect(
        () => () => {
          if (returnTimer.current) window.clearTimeout(returnTimer.current)
        },
        [],
      )

      useEffect(() => {
        // The shy sheet gets the shiver instead of the generic sway.
        setReaction(portrait.emotion === 'shy' ? null : portrait.emotion)
      }, [portrait.emotion])

      // Replay the shiver on each poke without remounting the image.
      useEffect(() => {
        if (shiver === 0) return
        const node = figureRef.current
        if (!node) return
        node.classList.remove('cp-shiver')
        void node.offsetWidth
        node.classList.add('cp-shiver')
      }, [shiver])

      useEffect(() => {
        const node = figureRef.current
        if (!node) return
        const classes = node.classList
        for (const name of ['happy', 'excited', 'surprised', 'angry', 'sad', 'shy', 'thinking', 'sleepy']) {
          classes.remove('cp-react-' + name)
        }
        void node.offsetWidth
        if (reaction && reaction !== 'neutral') classes.add('cp-react-' + reaction)
      }, [reaction])

      const mood = portrait.label

      const scene = h(
        'div',
        {
          className: 'cp-root',
          'data-hidden': shown ? 'false' : 'true',
        },
        h(
          'div',
          { className: 'cp-stage', onClick: onPoke },
          portrait.src
            ? h(
                'div',
                {
                  className: 'cp-adjust',
                  style: {
                    transform:
                      'translate(' + portrait.offsetX + 'px, ' + portrait.offsetY + 'px) scale(' + portrait.scale + ')',
                  },
                  'data-emotion': portrait.emotion,
                },
                h('img', {
                  ref: figureRef,
                  className: 'cp-figure',
                  src: portrait.src,
                  alt: '',
                  draggable: false,
                  style: { '--cp-h': heightRatio * 100 + '%' },
                }),
              )
            : null,
          h(
            'div',
            { className: 'cp-bar' },
            h('span', { className: 'cp-mood' }, mood),
            h(
              'button',
              {
                type: 'button',
                className: 'cp-btn',
                title: portrait.say('hide'),
                'aria-label': portrait.say('hide'),
                onClick: () => setVisible(false),
              },
              '×',
            ),
          ),
        ),
      )

      return ReactDOM.createPortal(h(React.Fragment, null, h('style', null, CSS), scene), document.body)
    }

    /* ------------------------------------------------------------------ *
     * Reopen button, kept in the composer dock while the figure is away
     * ------------------------------------------------------------------ */

    function PortraitReopen(props) {
      const shown = useVisible()
      const t = typeof props.t === 'function' ? props.t : null
      const builtin = pickBuiltinText()
      const say = (key) => {
        if (t) {
          const value = t(key)
          if (typeof value === 'string' && value !== key) return value
        }
        return builtin[key] ?? key
      }
      const tokenRef = useRef(null)
      if (tokenRef.current === null) tokenRef.current = {}
      const [, setClaimed] = useState(0)

      useEffect(() => {
        if (mountedToken === null) {
          mountedToken = tokenRef.current
          setClaimed((value) => value + 1)
        }
        return () => {
          if (mountedToken === tokenRef.current) mountedToken = null
        }
      }, [])

      if (shown || mountedToken !== tokenRef.current) return null

      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'cp-reopen',
            title: say('reveal'),
            'aria-label': say('reveal'),
            onClick: () => setVisible(true),
          },
          h(
            'svg',
            { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
            h('path', {
              d: 'M4 9c0-3 1.2-5 2.4-5 1 0 1.9 1.1 2.6 3h6c.7-1.9 1.6-3 2.6-3C18.8 4 20 6 20 9c0 6-3.6 12-8 12S4 15 4 9Z',
              stroke: 'currentColor',
              strokeWidth: 1.6,
              strokeLinejoin: 'round',
            }),
            h('circle', { cx: 9.4, cy: 12.4, r: 1.15, fill: 'currentColor' }),
            h('circle', { cx: 14.6, cy: 12.4, r: 1.15, fill: 'currentColor' }),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), 'chat-portrait: dictionaries')

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'chat-portrait', order: 100, locale: NS },
            PortraitFigure,
          ),
        )

        // The reopen chip only matters once the figure is dismissed, so it lives
        // in the same dock cell under a second id.
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'chat-portrait-reopen', order: 101, locale: NS },
            PortraitReopen,
          ),
        )
      },
    }
  },
})
