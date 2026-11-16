import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import './landing.css';

type Pixels = readonly string[];
const pig: Pixels = [
  '   hh       hh   ',
  '  hpph     hpph  ',
  '  hplphhhhhplph  ',
  '  hppppppppppph  ',
  ' hppppppppppppph ',
  ' hpppddpppddppph ',
  ' hpppddpppddppph ',
  ' hppppppppppppph ',
  ' hpppmmmmmmmppph ',
  '  hppmdmmdmmpph  ',
  '  hppmmmmmmmpph  ',
  '   hhppppppphh   ',
  '     hhhhhhh     ',
];
const gamepad: Pixels = [
  '   xxxxx xxxxx   ',
  '  xxxxxxxxxxxxx  ',
  '  xxxoxxxxxooxx  ',
  ' xxooooxxxxxoxxx ',
  ' xxxoxxxxxoxxxxx ',
  'xxxxxxxxxxxxxxxxx',
  'xxxxx       xxxxx',
  ' xxx         xxx ',
];
const screen: Pixels = [
  'xxxxxxxxxxxxxxxx',
  'xoooooooooooooox',
  'xoooxxxxxxxoooox',
  'xoooooooooooooox',
  'xoooxxoooxxoooox',
  'xoooooooooooooox',
  'xxxxxxxxxxxxxxxx',
  '       xx       ',
  '      xxxx      ',
  '    xxx  xxx    ',
];
const palettes = {
  pig: { h: '#c36399', p: '#ffacc8', l: '#ffe3e1', m: '#ec81ad', d: '#422142' },
  player: { x: '#d3ff82', o: '#42682d' },
  teacher: { x: '#c6a4ff', o: '#4b3473' },
};

function PixelSprite({ pixels, palette, className }: {
  pixels: Pixels; palette: Record<string, string>; className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = Math.max(...pixels.map((row) => row.length));
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, pixels.length);
    pixels.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (!palette[cell]) return;
        context.fillStyle = palette[cell];
        context.fillRect(x, y, 1, 1);
      });
    });
  }, [pixels, palette, width]);
  return <canvas ref={canvas} width={width} height={pixels.length}
    className={className} aria-hidden="true" />;
}

const letters: Record<string, Pixels> = {
  G: [' xxxx ', 'xx  xx', 'xx    ', 'xx xxx', 'xx  xx', 'xx  xx', ' xxxxx'],
  R: ['xxxxx ', 'xx  xx', 'xx  xx', 'xxxxx ', 'xxxx  ', 'xx xx ', 'xx  xx'],
  E: ['xxxxxx', 'xx    ', 'xx    ', 'xxxxx ', 'xx    ', 'xx    ', 'xxxxxx'],
  D: ['xxxxx ', 'xx  xx', 'xx  xx', 'xx  xx', 'xx  xx', 'xx  xx', 'xxxxx '],
  Y: ['xx  xx', 'xx  xx', ' xxxx ', '  xx  ', '  xx  ', '  xx  ', '  xx  '],
  P: ['xxxxx ', 'xx  xx', 'xx  xx', 'xxxxx ', 'xx    ', 'xx    ', 'xx    '],
  I: ['xxxx', ' xx ', ' xx ', ' xx ', ' xx ', ' xx ', 'xxxx'],
};
function wordPixels(word: string) {
  return Array.from({ length: 7 }, (_, row) => [...word].map((letter) => letters[letter][row]).join(' '));
}
const greedyWord = wordPixels('GREEDY');
const pigWord = wordPixels('PIG');
const ivory = { x: '#fff9ec' };
const lime = { x: '#c7fb68' };

export function Brand() {
  return <span className="arcade-brand">
    <PixelSprite pixels={pig} palette={palettes.pig} className="brand-pig" />
    <span>Greedy Pig<span className="brand-dot">.</span></span>
  </span>;
}

type LandingProps = {
  initialCode: string;
  onJoin: (code: string, name: string) => Promise<void>;
  onCreate: (rounds: number) => Promise<void>;
  busy: boolean;
  error: string;
};

function Arrow() {
  return <span className="action-arrow" aria-hidden="true">➜</span>;
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
    <section className="arcade-poster" aria-labelledby="game-title">
      <div className="poster-content">
        <div className="poster-kicker"><span aria-hidden="true" /> Classroom dice game</div>
        <h1 id="game-title" className="poster-title">
          <span className="sr-only">Greedy Pig</span>
          <PixelSprite pixels={greedyWord} palette={ivory} className="title-greedy" />
          <PixelSprite pixels={pigWord} palette={lime} className="title-pig" />
        </h1>
        <p>Roll the dice. Bank your points.<br />How greedy will you get?</p>
      </div>
    </section>

    {error && <p role="alert" className="landing-error">{error}</p>}

    <div className="entry-grid">
      <form className="entry-panel join-panel" onSubmit={(event) => void submit(event, 'join')}>
        <div className="panel-heading">
          <div className="panel-icon"><PixelSprite pixels={gamepad} palette={palettes.player} /></div>
          <div>
            <span className="panel-role">For students</span>
            <h2>Join a game</h2>
          </div>
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
        <div className="panel-heading">
          <div className="panel-icon"><PixelSprite pixels={screen} palette={palettes.teacher} /></div>
          <div>
            <span className="panel-role">For teachers</span>
            <h2>Host a game</h2>
          </div>
        </div>
        <p className="panel-intro">Set the rounds and death number in your waiting room.</p>
        <div className="host-settings">
          <span>Game defaults</span>
          <div className="host-defaults">
            <span>5 rounds</span>
            <span>Bust on 1</span>
          </div>
        </div>
        <button className="panel-button create-button" type="submit" disabled={disabled}>
          {submitting === 'create' ? 'Creating…' : 'Create room'}<Arrow />
        </button>
      </form>
    </div>
  </main>;
}
