import { useEffect, useId, useState, type FormEvent } from 'react';
import './landing.css';

export function Brand() {
  return <span className="game-brand">Greedy Pig</span>;
}

type LandingProps = {
  initialCode: string;
  onJoin: (code: string, name: string) => Promise<void>;
  onCreate: (rounds: number) => Promise<void>;
  busy: boolean;
  error: string;
};

function Arrow() {
  return <span className="action-arrow" aria-hidden="true">→</span>;
}

export function Landing({ initialCode, onJoin, onCreate, busy, error }: LandingProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState<'join' | 'create' | null>(null);
  const formId = useId();
  useEffect(() => setCode(initialCode), [initialCode]);
  const disabled = busy || submitting !== null;

  async function submit(event: FormEvent, kind: 'join' | 'create') {
    event.preventDefault();
    if (disabled) return;
    setSubmitting(kind);
    try {
      if (kind === 'join') await onJoin(code, name.trim());
      else await onCreate(5);
    } finally {
      setSubmitting(null);
    }
  }

  return <main className="landing shell-width">
    <section className="landing-hero" aria-labelledby="game-title">
      <div className="hero-copy">
        <p className="hero-kicker">Classroom dice game</p>
        <h1 id="game-title">Greedy Pig</h1>
        <p>Roll with your class. Save your points before the death number lands.</p>
      </div>
      <img className="hero-mascot" src="/art/projector-pig.webp" alt="" />
    </section>

    {error && <p role="alert" className="landing-error">{error}</p>}

    <div className="entry-grid">
      <form className="entry-panel join-panel" onSubmit={(event) => void submit(event, 'join')}>
        <div>
          <span className="panel-role">For students</span>
          <h2>Join a game</h2>
        </div>
        <p className="panel-intro">Use your teacher’s code and a classroom-friendly nickname.</p>
        <div className="join-fields">
          <label htmlFor={formId + '-code'}>Room code
            <input id={formId + '-code'} type="text" inputMode="numeric" autoComplete="off"
              name="code" pattern="[0-9]{6}" required maxLength={6} placeholder="000000"
              title="Enter the six-digit room code" className="code-input" value={code}
              disabled={disabled} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
          <label htmlFor={formId + '-name'}>Nickname
            <input id={formId + '-name'} type="text" autoComplete="off" name="nickname"
              required maxLength={20} placeholder="Your nickname" value={name} disabled={disabled}
              onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
        <button className="panel-button join-button" type="submit" disabled={disabled}>
          {submitting === 'join' ? 'Joining…' : 'Join game'}<Arrow />
        </button>
      </form>

      <form className="entry-panel host-panel" onSubmit={(event) => void submit(event, 'create')}>
        <div>
          <span className="panel-role">For teachers</span>
          <h2>Host a game</h2>
        </div>
        <p className="panel-intro">Set the rounds and death number in your waiting room.</p>
        <div className="host-settings">
          <span>Game defaults</span>
          <div className="host-defaults">
            <span>5 rounds</span>
            <span>Death number 1</span>
          </div>
        </div>
        <button className="panel-button create-button" type="submit" disabled={disabled}>
          {submitting === 'create' ? 'Creating…' : 'Create room'}<Arrow />
        </button>
      </form>
    </div>
  </main>;
}
