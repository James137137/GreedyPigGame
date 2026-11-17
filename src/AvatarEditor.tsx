import { useEffect, useId, useState } from 'react';
import { DEFAULT_FACE, FACE_OPTIONS, type PigFace } from '../shared/avatar';
import { PigAvatar } from './PigAvatar';
import './avatar-editor.css';

type Props = {
  name: string;
  savedFace?: PigFace;
  busy: boolean;
  connected: boolean;
  error: string;
  onSave: (face: PigFace) => void;
};

function matches(a: PigFace, b: PigFace) {
  return a.skin === b.skin && a.eyes === b.eyes && a.hat === b.hat &&
    a.scarf === b.scarf && a.jewelry === b.jewelry && a.freckles === b.freckles;
}

function Options<T extends string>({ title, choices, value, onSelect }: {
  title: string;
  choices: readonly { id: T; label: string; color?: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const group = useId();
  return <fieldset className="avatar-options">
    <legend>{title}</legend>
    <div className="avatar-options-list">{choices.map(choice =>
      <label key={choice.id} className="avatar-choice">
        <input type="radio" name={group} value={choice.id} checked={value === choice.id} onChange={() => onSelect(choice.id)} />
        <span>{choice.color && <i aria-hidden="true" style={{ backgroundColor: choice.color }} />}{choice.label}</span>
      </label>
    )}</div>
  </fieldset>;
}

export function AvatarEditor({ name, savedFace = DEFAULT_FACE, busy, connected, error, onSave }: Props) {
  const titleId = useId();
  const [accessories, setAccessories] = useState(false);
  const [draft, setDraft] = useState<PigFace | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const face = draft ?? savedFace;
  const dirty = !matches(face, savedFace);

  // A confirmed save goes back to following the room, including edits from another tab.
  useEffect(() => {
    if (draft && matches(draft, savedFace)) setDraft(null);
  }, [draft, savedFace]);

  function change<K extends keyof PigFace>(field: K, value: PigFace[K]) {
    setDraft({ ...face, [field]: value });
    setSubmitted(false);
  }

  function save() {
    if (!dirty || !connected || busy) return;
    setSubmitted(true);
    onSave(face);
  }

  const saving = submitted && busy;
  let status = dirty ? 'Unsaved changes' : 'Saved';
  if (saving) status = 'Saving…';
  else if (!connected) status = 'Waiting for connection';
  else if (dirty && submitted && error) status = 'Save failed. Try again.';

  return <section className="room-box avatar-editor" aria-labelledby={titleId}>
    <header className="avatar-editor-header">
      <h2 id={titleId}>Your pig</h2>
      <p>Choose a look while you wait for the first round.</p>
    </header>
    <div className="avatar-workspace">
      <figure className="avatar-portrait">
        <div className="avatar-portrait-stage"><PigAvatar avatar={face} className="avatar-editor-face" label="Your pig preview" /></div>
        <figcaption>{name}</figcaption>
      </figure>
      <div className="avatar-tools">
        <div className="avatar-pages" role="group" aria-label="Customise your pig">
          <button type="button" aria-pressed={!accessories} onClick={() => setAccessories(false)}>Face</button>
          <button type="button" aria-pressed={accessories} onClick={() => setAccessories(true)}>Accessories</button>
        </div>
        {accessories ? <>
          <Options title="Hat" choices={FACE_OPTIONS.hat} value={face.hat} onSelect={value => change('hat', value)} />
          <Options title="Scarf" choices={FACE_OPTIONS.scarf} value={face.scarf} onSelect={value => change('scarf', value)} />
          <Options title="Jewellery" choices={FACE_OPTIONS.jewelry} value={face.jewelry} onSelect={value => change('jewelry', value)} />
        </> : <>
          <Options title="Skin colour" choices={FACE_OPTIONS.skin} value={face.skin} onSelect={value => change('skin', value)} />
          <Options title="Eye colour" choices={FACE_OPTIONS.eyes} value={face.eyes} onSelect={value => change('eyes', value)} />
          <label className="avatar-freckles"><input type="checkbox" checked={face.freckles} onChange={event => change('freckles', event.target.checked)} />Freckles</label>
        </>}
      </div>
    </div>
    <footer className="avatar-editor-footer">
      <span role="status">{status}</span>
      <button className="room-button room-primary" type="button" disabled={!dirty || !connected || busy} onClick={save}>Save pig</button>
    </footer>
  </section>;
}
