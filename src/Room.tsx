import { useEffect, useRef, useState } from 'react'
import { EditStamp } from './EditStamp'
import { QuietMonitor } from './QuietMonitor'
import { AUTO_INTERVAL_SECONDS, MAX_ROUNDS, QUIET_MAX_ROUNDS, ranks, type Action, type GameState, type Player } from '../shared/game'
import './room.css'
import './board.css'

interface RoomProps {
  state: GameState
  online: string[]
  identity: { code: string; role: 'teacher' | 'student'; id: string }
  connected: boolean
  busy: boolean
  error: string
  onAction: (action: Action) => void
  onShowRules?: () => void
  onToggleSound?: () => void
  sound?: boolean
  onNewRoom: () => void
}

type IconName = 'people' | 'expand' | 'collapse' | 'copy' | 'check' | 'play' | 'pause' | 'die' | 'trophy' | 'remove' | 'signal' | 'settings'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const shapes: Record<IconName, React.ReactNode> = {
    settings: <><path d="M3 7h6m4 0h8M3 17h11m4 0h3" /><circle cx="11" cy="7" r="2.5" /><circle cx="16" cy="17" r="2.5" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    collapse: <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" />,
    copy: <><path d="M8 7V3h12v13h-3" /><rect x="3" y="8" width="12" height="13" rx="2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    play: <path d="m7 4 13 8-13 8z" fill="currentColor" stroke="none" />,
    pause: <><path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor" stroke="none" /></>,
    die: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 8h.01M12 12h.01M16 16h.01" strokeWidth="3.5" /></>,
    trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm-1 2H3v3a4 4 0 0 0 4 4m11-7h3v3a4 4 0 0 1-4 4m-5 2v5m-5 2h10" /></>,
    remove: <path d="m6 6 12 12M18 6 6 18" />,
    signal: <><path d="m3 3 18 18M3 9a14 14 0 0 1 4-2m5-1c3 0 6 1 9 3M6 13c2-2 5-3 8-2m-5 6a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r=".8" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>
}

const pipPositions: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
}

function Die({ face, deathNumber }: { face?: number; deathNumber: number }) {
  return <div className={'room-die' + (face === deathNumber ? ' room-die-bust' : '')} role="img" aria-label={face ? 'Die showing ' + face : 'Waiting for first roll'}>
    {face ? pipPositions[face].map(p => <i key={p} style={{ gridRow: Math.ceil(p / 3), gridColumn: (p - 1) % 3 + 1 }} />) : <span aria-hidden="true">?</span>}
  </div>
}

function ordinal(value: number) {
  const tens = value % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'
  return value + suffix
}

function points(value: number) { return value + (value === 1 ? ' point' : ' points') }

function playerStatus(player: Player, ended: boolean) {
  if (player.status === 'banked') return '+' + player.banked + ' saved'
  if (player.status === 'bust') return 'Bust'
  if (ended) return 'Finished'
  return player.status === 'waiting' ? 'Waiting' : 'In play'
}

function Invite({ code }: { code: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')
  const link = new URL('/', window.location.href)
  link.searchParams.set('room', code)
  const fallback = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (copy === 'manual') fallback.current?.select()
    if (copy !== 'copied') return
    const timer = window.setTimeout(() => setCopy('idle'), 2200)
    return () => window.clearTimeout(timer)
  }, [copy])
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.href)
      setCopy('copied')
    } catch {
      setCopy('manual')
    }
  }
  return <section className="room-invite room-box" aria-label="Join this game">
    <div className="room-invite-details">
      <div className="room-kicker"><span className="room-led" /> Room code</div>
      <p className="room-big-code" aria-label={'Room code ' + code.split('').join(' ')}>{code.slice(0, 3)}<span>{code.slice(3)}</span></p>
      <p className="room-copy">On your computer, open <strong>{link.host}</strong> and enter this code.</p>
      <button type="button" className="room-button room-minor" onClick={copyLink}><Icon name={copy === 'copied' ? 'check' : 'copy'} />{copy === 'copied' ? 'Link copied' : 'Copy join link'}</button>
      {copy === 'manual' && <label className="room-fallback">Copy this join link<input ref={fallback} readOnly value={link.href} onFocus={e => e.target.select()} /></label>}
    </div>
  </section>
}

function PlayerList({ state, online, teacher, ownId, disabled, onRemove }: {
  state: GameState; online: Set<string>; teacher: boolean; ownId: string; disabled: boolean; onRemove: (player: Player) => void
}) {
  const [manage, setManage] = useState(false)
  const lobby = state.phase === 'lobby'
  const sorted = lobby ? state.players : ranks(state.players)
  return <aside className="room-box room-list" aria-label={lobby ? 'Class roster' : 'Leaderboard'}>
    <div className="room-list-heading">
      <div className="room-list-title"><span className="room-icon-tile"><Icon name={lobby ? 'people' : 'trophy'} size={20} /></span><h2>{lobby ? 'Class roster' : 'Leaderboard'}</h2></div>
      {teacher && state.phase !== 'finished' && !!state.players.length && <button className="room-text-button" type="button" aria-pressed={manage} onClick={() => setManage(!manage)}>{manage ? 'Done' : 'Manage'}</button>}
    </div>
    <div className="room-roster-info"><span className="room-led" />{state.players.filter(p => online.has(p.id)).length} online <span aria-hidden="true">/</span> {state.players.length} joined</div>
    {sorted.length === 0 ? <div className="room-roster-empty"><Icon name="people" size={32} /><strong>Waiting for players</strong><span>Nicknames appear here as students join.</span></div> : <ul className="room-roster">
      {sorted.map((p, index) => {
        const rank = 'rank' in p ? Number(p.rank) : undefined
        return <li key={p.id} className={p.id === ownId ? 'room-self' : undefined}>
          {lobby ? <span className={'room-avatar tone-' + (index % 4)} aria-hidden="true">{Array.from(p.name)[0]}</span> : <span className={'room-rank' + (rank === 1 ? ' room-first' : '')}>{rank}</span>}
          <div className="room-name"><strong>{p.name}{p.id === ownId && <small>you</small>}</strong><span>{!online.has(p.id) ? 'Offline' : lobby ? 'Connected' : playerStatus(p, state.phase === 'finished')}</span></div>
          {!lobby && <strong className="room-score">{p.score}<small> pts</small></strong>}
          {manage && teacher && state.phase !== 'finished' && <button type="button" className="room-icon-button" aria-label={'Remove ' + p.name} title={'Remove ' + p.name} disabled={disabled} onClick={() => onRemove(p)}><Icon name="remove" size={16} /></button>}
        </li>
      })}
    </ul>}
  </aside>
}

type Confirmation = { kind: 'finish' } | { kind: 'remove'; player: Player }

function Confirm({ choice, onCancel, onConfirm, disabled }: {
  choice: Confirmation; onCancel: () => void; onConfirm: () => void; disabled: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const remove = choice.kind === 'remove'
  return <dialog ref={dialog} className="room-confirm" aria-labelledby="room-confirm-title" aria-describedby="room-confirm-info" onCancel={onCancel}>
    <h2 id="room-confirm-title">{remove ? 'Remove ' + choice.player.name + '?' : 'Finish this game?'}</h2>
    <p id="room-confirm-info">{remove ? 'This removes their score and ends access to this player session.' : 'The final standings will use the points already banked. Any unbanked points are lost.'}</p>
    <div><button type="button" className="room-button room-minor" autoFocus onClick={onCancel}>Cancel</button><button type="button" className="room-button room-alert" disabled={disabled} onClick={onConfirm}>{remove ? 'Remove player' : 'Finish game'}</button></div>
  </dialog>
}

function Countdown({ deadline, between, ring = false }: { deadline: number; between: boolean; ring?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 125);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const seconds = Math.min(AUTO_INTERVAL_SECONDS, Math.max(0, Math.ceil((deadline - now) / 1000)));
  if (ring) return <div className="host-timer" role="timer" aria-label={(between ? 'Next round' : 'Next roll') + ' in ' + seconds + ' seconds'}>
    <svg aria-hidden="true" viewBox="0 0 100 100"><circle className="host-ring-track" cx="50" cy="50" r="44" /><circle className="host-ring-fill" cx="50" cy="50" r="44" pathLength="100" strokeDasharray={seconds * 100 / AUTO_INTERVAL_SECONDS + ' 100'} /></svg>
    <strong>{seconds}<small>s</small></strong>
  </div>
  return <div className="room-countdown" role="timer">{seconds ? <>{between ? 'Next round' : 'Next roll'} in <strong>{seconds}</strong> s</> : between ? 'Starting round…' : 'Rolling…'}</div>;
}

function HostCards({ state, disabled, onAction, onNewRoom }: Pick<RoomProps, 'state' | 'onAction' | 'onNewRoom'> & { disabled: boolean }) {
  const between = state.phase === 'between'
  const finished = state.phase === 'finished'
  const ended = between || finished
  const face = state.rolls.at(-1)
  const winners = finished ? ranks(state.players).filter(p => p.rank === 1) : []
  const resultTitle = finished ? 'Game over' : 'Round over'
  let finalTitle = 'No players'
  if (winners.length === 1) finalTitle = winners[0].name
  if (winners.length > 1) finalTitle = winners.length + ' joint winners'
  const resultDetail = state.endReason === 'bust' ? 'Death number rolled' : state.endReason === 'banked' ? 'Everyone saved' : 'Finished by teacher'
  const active = state.players.filter(p => p.status === 'active').length
  return <>
    <section className="host-card host-last">
      <h2>Last roll</h2>
      <div className="host-die-bed"><Die key={state.round + '-' + state.rolls.length} face={face} deathNumber={state.deathNumber} /></div>
      <p className="host-death">Death number <b>{state.deathNumber}</b></p>
    </section>
    <section className="host-card host-points">
      <h2>{ended ? resultTitle : 'Points to save'}</h2>
      <div className="host-points-body">
        {ended ? <strong className="host-result">{finished ? finalTitle : resultDetail}</strong>
          : <strong className={'host-number' + (state.pot > 999 ? ' many-digits' : state.pot < 100 ? ' short-number' : '')}>{state.pot}</strong>}
        <img className="host-pig" src="/art/projector-pig.webp" alt="" />
      </div>
      <p className="host-caption">{finished && winners.length ? points(winners[0].score) + (winners.length > 1 ? ' each' : ' saved') : ended ? 'Saved scores carry over' : active + ' of ' + state.players.length + ' still playing'}</p>
    </section>
    <section className="host-card host-next">
      <h2>{finished ? 'Play again' : state.paused ? 'Game paused' : (between ? 'Next round' : 'Next roll') + (state.autoRoll && state.nextRollAt !== null ? ' in' : '')}</h2>
      <div className="host-next-body">
        {finished ? <button className="host-primary" onClick={onNewRoom}><Icon name="play" />New game</button>
          : state.paused ? <button className="host-primary" disabled={disabled} onClick={() => onAction({ type: 'resume', turn: state.turn })}><Icon name="play" />Resume</button>
          : state.autoRoll && state.nextRollAt !== null ? <Countdown deadline={state.nextRollAt} between={between} ring />
          : <button className="host-primary" disabled={disabled || state.autoRoll || !state.players.length} onClick={() => onAction({ type: between ? 'next' : 'roll', turn: state.turn })}><Icon name={between ? 'play' : 'die'} />{between ? 'Start next round' : 'Roll die'}</button>}
      </div>
    </section>
  </>
}

function HostScoreboard({ state, onView }: { state: GameState; onView: () => void }) {
  const leaders = ranks(state.players).slice(0, 3)
  return <section className="host-card host-scores" aria-label="Scoreboard">
    <header className="host-score-heading"><h2>Scoreboard</h2><button type="button" className="host-link" onClick={onView}>View all <span aria-hidden="true">↗</span></button></header>
    {leaders.length ? <ol className="host-leaders">
      {leaders.map(p => <li key={p.id}><span aria-label={'Rank ' + p.rank}>{p.rank}</span><strong>{p.name}</strong><b aria-label={points(p.score)}>{p.score}</b></li>)}
    </ol> : <p>No players in this room.</p>}
  </section>
}

function PlayBoard({ state }: { state: GameState }) {
  const face = state.rolls.at(-1)
  return <section className="room-box room-board" aria-label="Dice table">
    <div className="room-board-face">
      <span className="room-kicker">Latest roll</span>
      <Die key={state.round + '-' + state.rolls.length} face={face} deathNumber={state.deathNumber} />
      <span className="room-face-label">{face ? 'Rolled a ' + face : 'Ready to roll'}</span>
    </div>
    <div className="room-board-total">
      <span className="room-kicker">Round pot</span>
      <strong>{state.pot}</strong>
      <span>{state.pot === 1 ? 'point' : 'points'}</span>
    </div>
    {state.nextRollAt != null && <Countdown deadline={state.nextRollAt} between={state.phase === 'between'} />}
    <div className="room-history"><span className="room-kicker">Roll history</span>{state.rolls.length ? <ol aria-label="Roll history, newest last">{state.rolls.map((roll, index) => <li key={index} className={roll === state.deathNumber ? 'room-roll-bust' : ''}>{roll}</li>)}</ol> : <span className="room-copy">No rolls yet</span>}</div>
  </section>
}

function LobbySettings({ state, teacher, disabled, onAction }: {
  state: GameState; teacher: boolean; disabled: boolean; onAction: (action: Action) => void
}) {
  const [rounds, setRounds] = useState(state.rounds)
  const [deathNumber, setDeathNumber] = useState(state.deathNumber)
  const dirty = rounds !== state.rounds || deathNumber !== state.deathNumber
  const rule = 'Rolling ' + state.deathNumber + ' ends the round. ' + (state.deathNumber === 1 ? 'All other rolls add to the pot.' : 'A 1 adds one point.')
  return <section className="room-box room-settings">
    <h2>Game settings</h2>
    {teacher ? <>
      <div className="room-settings-fields">
        <div><label htmlFor="room-rounds">Rounds</label><select id="room-rounds" value={rounds} disabled={disabled} onChange={e => setRounds(Number(e.target.value))}>{Array.from({ length: state.quietMode ? QUIET_MAX_ROUNDS : MAX_ROUNDS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></div>
        <div><label htmlFor="room-death">Death number</label><select id="room-death" value={deathNumber} disabled={disabled} onChange={e => setDeathNumber(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
      </div>
      <p className="room-copy" role="status">{dirty ? 'Save your changes before starting the game.' : rule}</p>
      <div className="room-actions">
        {dirty && <button type="button" className="room-button room-minor" disabled={disabled} onClick={() => onAction({ type: 'configure', rounds, deathNumber, turn: state.turn })}>Save settings</button>}
        <button type="button" className="room-button room-primary" disabled={disabled || dirty || !state.players.length} onClick={() => onAction({ type: 'start', turn: state.turn })}><Icon name="play" />Start game</button>
        {!state.players.length && <small className="room-copy">Waiting for the first student.</small>}
      </div>
    </> : <>
      <div className="room-student-settings"><span><b>{state.rounds}</b> {state.rounds === 1 ? 'round' : 'rounds'}</span><span>Death number <b>{state.deathNumber}</b></span></div>
      <p className="room-copy">{rule}</p>
    </>}
  </section>
}

function Results({ state, player }: { state: GameState; player?: Player }) {
  const standings = ranks(state.players)
  const winners = standings.filter(p => p.rank === 1)
  const own = standings.find(p => p.id === player?.id)
  const multiple = winners.length > 1
  const winnerNames = winners.slice(0, 3).map(p => p.name).join(', ')
  const nameLine = winnerNames + (winners.length > 3 ? ' + ' + (winners.length - 3) + ' more' : '')
  return <section className="room-box room-results">
    <div className="room-trophy"><Icon name="trophy" size={46} /></div>
    <div className="room-kicker">{multiple ? 'Joint winners' : winners.length ? 'Winner' : 'Final standings'}</div>
    <h2>{nameLine || 'No players'}</h2>
    {!!winners.length && <p>{points(winners[0].score)}{multiple ? ' each' : ''}</p>}
    {own && <div className="room-final-rank">Your finish <strong>{ordinal(own.rank)} place</strong> · {own.score} pts</div>}
  </section>
}

export function Room({ state, online, identity, connected, busy, error, onAction, onNewRoom, onShowRules, onToggleSound, sound }: RoomProps) {
  const root = useRef<HTMLElement>(null)
  const projectorButton = useRef<HTMLButtonElement>(null)
  const [projector, setProjector] = useState(false)
  const [choice, setChoice] = useState<Confirmation | null>(null)
  const teacher = identity.role === 'teacher'
  const player = state.players.find(p => p.id === identity.id)
  const lobby = state.phase === 'lobby'
  const finished = state.phase === 'finished'
  const playing = state.phase === 'playing'
  const between = state.phase === 'between'
  const disabled = busy || !connected
  const onlineIds = new Set(online)
  const title = lobby ? 'Waiting room' : finished ? 'Game over' : 'Round ' + state.round
  const phaseLabel = lobby ? 'Lobby open' : finished ? 'Final results' : between ? 'Round complete' : state.paused ? 'Paused' : 'In play'
  const hostBoard = teacher && !lobby
  const controlsDialog = useRef<HTMLDialogElement>(null)
  const standingsDialog = useRef<HTMLDialogElement>(null)
  const [noiseControls, setNoiseControls] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    function onFullscreen() { setProjector(document.fullscreenElement === root.current) }
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])
  useEffect(() => {
    if (!projector) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !document.fullscreenElement && !choice && !root.current?.querySelector('dialog[open]')) setProjector(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      projectorButton.current?.focus({ preventScroll: true })
    }
  }, [projector, choice])

  async function toggleProjector() {
    if (projector) {
      if (document.fullscreenElement === root.current) await document.exitFullscreen().catch(() => {})
      setProjector(false)
    } else {
      setProjector(true)
      try { await root.current?.requestFullscreen?.() } catch { /* The in-page projector layout also fills the viewport. */ }
    }
  }
  function act(type: Exclude<Action['type'], 'remove' | 'configure' | 'autoRoll' | 'quietMode' | 'noisePenalty' | 'quietRestore'>) { onAction({ type, turn: state.turn }) }
  function confirm() {
    if (!choice || disabled) return
    if (choice.kind === 'finish') {
      controlsDialog.current?.close()
      act('finish')
    }
    else onAction({ type: 'remove', turn: state.turn, playerId: choice.player.id })
    setChoice(null)
  }
  const personalMessage = player?.status === 'banked' ? 'You saved ' + points(player.banked) + ' this round.' : player?.status === 'bust' ? 'Bust! Your saved score is safe.' : player?.status === 'waiting' ? 'You’ll join the next round.' : between ? 'Waiting for the next round.' : state.paused ? 'The teacher has paused play.' : 'Save before a ' + state.deathNumber + ' wipes the pot.'

  return <main className={'game-room' + (hostBoard ? ' host-live' : '') + (projector ? ' room-projector' : '')} ref={root}>
    {projector && <EditStamp />}
    <div className="room-content">
      {hostBoard ? <header className="host-header">
        <h1>Greedy Pig</h1>
        <button type="button" className="host-toolbar-button" onClick={() => controlsDialog.current?.showModal()}><Icon name="settings" />Teacher controls</button>
        {!finished && <label className="host-auto"><input type="checkbox" checked={state.autoRoll} disabled={disabled} onChange={e => onAction({ type: 'autoRoll', enabled: e.target.checked, turn: state.turn})} />Auto-roll</label>}
        <span className="host-round">Round {state.round} of {state.rounds}</span>
      </header> : <>
      <div className="room-topline">
        <div className="room-kicker"><span className={'room-led' + (!connected ? ' room-led-off' : '')} />{teacher ? 'Teacher console' : 'Player console'}<span className="room-slash">/</span><span>Room {state.code}</span></div>
        {teacher && <button ref={projectorButton} type="button" className="room-button room-minor room-project-toggle" aria-pressed={projector} onClick={toggleProjector}><Icon name={projector ? 'collapse' : 'expand'} size={16} />{projector ? 'Exit projector' : 'Projector mode'}</button>}
      </div>
      <header className="room-heading">
        <h1>{title}{!lobby && !finished && <small> / {state.rounds}</small>}</h1>
        <span className={'room-phase' + (state.paused ? ' room-phase-paused' : '')}>{phaseLabel}</span>
        {!lobby && <span className="room-death-number">Death number <b>{state.deathNumber}</b></span>}
      </header>
      </>}
      {state.quietMode && !hostBoard && <p role="status" className="room-copy">Quiet Mode · {state.noiseLosses} {state.noiseLosses === 1 ? 'round' : 'rounds'} removed by noise{state.restoredRounds > 0 && <> · {state.restoredRounds} earned back</>} · {state.rounds} total rounds</p>}
      {!connected && <p className="room-notice" role="status"><Icon name="signal" /> Reconnecting… Controls will return when the connection is restored.</p>}
      {error && <p className="room-notice room-error" role="alert">{error}</p>}
      <div className={hostBoard ? 'host-grid' + (state.quietMode && !finished ? ' with-noise' : '') : 'room-grid'}>
        <div className={hostBoard ? 'host-main' : 'room-main'}>
          {hostBoard && <HostCards state={state} disabled={disabled} onAction={onAction} onNewRoom={onNewRoom} />}
          {lobby && (teacher ? <Invite code={state.code} /> : <section className="room-box room-welcome"><span className="room-welcome-icon"><Icon name="check" size={32} /></span><span className="room-kicker">Joined the game</span><h2>You’re in, {player?.name ?? 'player'}!</h2><p>Stay on this screen. Your teacher will start the first roll.</p></section>)}
          {teacher && lobby && <label className="room-auto"><input type="checkbox" checked={state.quietMode} disabled={disabled} onChange={e => onAction({ type: 'quietMode', enabled: e.target.checked, turn: state.turn })} /> Quiet Mode</label>}
          {teacher && state.quietMode && !finished && <div className={hostBoard ? 'host-noise' : undefined}><QuietMonitor key={state.code} state={state} connected={connected} busy={busy} onAction={onAction} settingsTarget={hostBoard ? noiseControls : null} /></div>}
          {teacher && lobby && <label className="room-auto"><input type="checkbox" checked={state.autoRoll} disabled={disabled} onChange={e => onAction({ type: 'autoRoll', enabled: e.target.checked, turn: state.turn })} /> Auto-roll every {AUTO_INTERVAL_SECONDS} seconds and start new rounds</label>}
          {lobby && <LobbySettings key={state.code + '-' + state.rounds + '-' + state.deathNumber} state={state} teacher={teacher} disabled={disabled} onAction={onAction} />}
          {finished && !hostBoard && <Results state={state} player={player} />}
          {finished && !hostBoard && state.rolls.length > 0 && <p className="room-final-note">{state.endReason === 'bust' ? 'The final roll was a ' + state.deathNumber + '. ' : ''}{player?.status === 'bust' ? 'Your unbanked points were lost.' : player?.status === 'banked' ? 'You saved ' + points(player.banked) + ' in the final round.' : ''}</p>}
          {!hostBoard && (playing || between) && <>
            <PlayBoard state={state} />
            <section className="room-box room-controls room-personal">
              <div><span className="room-kicker">Your score</span><h2>{player?.score ?? 0} <small>pts</small></h2><p role="status">{personalMessage}</p></div>
              {playing && player?.status === 'active' && <button type="button" className="room-button room-primary" disabled={disabled || state.paused} onClick={() => act('bank')}><Icon name="check" />Save {points(state.pot)}</button>}
            </section>
          </>}
          {!hostBoard && (playing || between) && state.deathNumber !== 1 && <p className="room-final-note">A 1 adds one point. Only a {state.deathNumber} wipes the pot.</p>}
          {finished && !hostBoard && <div><button type="button" className="room-button room-primary" onClick={onNewRoom}><Icon name="play" />{teacher ? 'New game' : 'Join another game'}</button></div>}
        </div>
        {hostBoard ? <HostScoreboard state={state} onView={() => standingsDialog.current?.showModal()} /> : <PlayerList state={state} online={onlineIds} ownId={identity.id} teacher={teacher} disabled={disabled} onRemove={p => setChoice({ kind: 'remove', player: p })} />}

      </div>
      {hostBoard && <>
        <dialog ref={controlsDialog} className="host-dialog" aria-labelledby="host-controls-title">
          <div className="host-dialog-header"><h2 id="host-controls-title">Teacher controls</h2><button type="button" className="host-close" aria-label="Close teacher controls" onClick={() => controlsDialog.current?.close()}><Icon name="remove" /></button></div>
          <p className="host-room-code">Room {state.code} · Death number {state.deathNumber}</p>
          <div className="host-control-actions">
            {playing && <button className="host-primary" disabled={disabled} onClick={() => act(state.paused ? 'resume' : 'pause')}><Icon name={state.paused ? 'play' : 'pause'} />{state.paused ? 'Resume' : 'Pause'} game</button>}
            <button ref={projectorButton} className="host-secondary" aria-pressed={projector} onClick={() => { controlsDialog.current?.close(); void toggleProjector() }}><Icon name={projector ? 'collapse' : 'expand'} />{projector ? 'Exit projector' : 'Projector mode'}</button>
            {onToggleSound && <button className="host-secondary" aria-pressed={sound} onClick={onToggleSound}>Sound {sound ? 'on' : 'off'}</button>}
            {onShowRules && <button className="host-secondary" onClick={async () => { controlsDialog.current?.close(); if (projector) await toggleProjector(); onShowRules() }}>How to play</button>}
          </div>
          <div ref={setNoiseControls} />
          <details className="host-detail"><summary>Roll history</summary><p>{state.rolls.length ? state.rolls.join(' · ') : 'No rolls yet'}</p></details>
          {between && <details className="host-detail"><summary>Join this room</summary><Invite code={state.code} /></details>}
          {!finished && <button type="button" className="host-end" disabled={disabled} onClick={() => setChoice({ kind: 'finish' })}>Finish game early</button>}
          <button type="button" className="host-link" onClick={onNewRoom}>Return to joining screen</button>
        </dialog>
        <dialog ref={standingsDialog} className="host-dialog" aria-label="Full scoreboard">
          <div className="host-dialog-header"><h2>Full scoreboard</h2><button type="button" className="host-close" aria-label="Close scoreboard" onClick={() => standingsDialog.current?.close()}><Icon name="remove" /></button></div>
          <PlayerList state={state} online={onlineIds} ownId={identity.id} teacher={teacher} disabled={disabled} onRemove={p => setChoice({ kind: 'remove', player: p })} />
        </dialog>
      </>}
      <span className="sr-only" role="status" aria-live="polite">{title}. {phaseLabel}. {playing || between ? (state.rolls.length ? 'Latest roll ' + state.rolls.at(-1) + '. ' : '') + 'Round pot ' + points(state.pot) + '.' : ''}</span>
      {choice && <Confirm choice={choice} onCancel={() => setChoice(null)} onConfirm={confirm} disabled={disabled} />}
    </div>
  </main>
}
