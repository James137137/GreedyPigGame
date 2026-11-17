import { memo, useId } from 'react'
import { DEFAULT_FACE, type PigFace } from '../shared/avatar'

const skins = {
  pink:  { light: '#ffe4e1', body: '#f9afbd', shade: '#d6839d', muzzle: '#ffb4c0', dark: '#a45b76' },
  peach: { light: '#fff0d8', body: '#f6c295', shade: '#d99878', muzzle: '#fac4a2', dark: '#a76958' },
  rose:  { light: '#ffd7df', body: '#e996ab', shade: '#bc637e', muzzle: '#f1a1b3', dark: '#98465f' },
  cocoa: { light: '#d3a382', body: '#ae765a', shade: '#865342', muzzle: '#d9a48b', dark: '#653e35' },
  slate: { light: '#dee0ec', body: '#adb1c6', shade: '#83889e', muzzle: '#d6b4c4', dark: '#62657c' },
} satisfies Record<PigFace['skin'], object>

const irises = { brown: '#945b39', blue: '#468bbb', green: '#4c8b69', hazel: '#ac903c', violet: '#9268bd' }
const scarves = {
  mint: ['#76d7b4', '#389a80'], violet: ['#a897ff', '#7662c4'],
  coral: ['#ff9988', '#ce695d'], blue: ['#83c4ee', '#4e91bd'],
}

function Hat({ kind }: { kind: PigFace['hat'] }) {
  switch (kind) {
    case 'cap':
      return <g transform="rotate(-9 80 45)">
        <path d="M44 44C44 23 57 14 76 14c20 0 31 9 36 27l-8 7Z" fill="#6878d6" stroke="#4b519e" strokeWidth="2"/>
        <path d="M80 16c8 3 15 13 16 24M59 23c-5 4-8 10-9 15" fill="none" stroke="#909ce6" strokeWidth="2.5"/>
        <ellipse cx="77" cy="14.5" rx="5" ry="2.8" fill="#5058a6"/>
        <path d="M43 43c16-4 35-5 56-4 12 0 22 3 29 8 3 3 2 6-4 7-11 1-24-6-34-7-15-1-32 0-44 2Z" fill="#495ba9" stroke="#40498d" strokeWidth="2"/>
        <path d="M99 42c11 0 20 3 25 6" fill="none" stroke="#798ad1" strokeWidth="2.5"/>
      </g>
    case 'beanie':
      return <g transform="rotate(5 80 42)">
        <circle cx="76" cy="13" r="8" fill="#f5b08f"/>
        <path d="M43 48c1-22 14-32 34-32 22 0 35 14 37 33Z" fill="#db795f" stroke="#ae594c" strokeWidth="2"/>
        <path d="M59 43c1-11 6-19 12-23m6 0c-4 8-5 15-4 23m7-22c7 5 11 13 12 22" fill="none" stroke="#f09b7c" strokeWidth="2.6"/>
        <path d="M45 39c21-4 48-4 67 2 5 1 6 5 4 10l-2 4c-24-6-44-6-69-1-3 0-5-3-5-7 0-4 1-7 5-8Z" fill="#ed9477" stroke="#ba6758" strokeWidth="2"/>
        {[48,57,66,75,84,93,102,111].map((x, i) => <path key={x} d={`M${x} ${i < 2 || i > 5 ? 43 : 41}l-1 7`} stroke="#c97865" strokeWidth="2"/>)}
      </g>
    case 'bucket':
      return <g transform="rotate(-5 80 45)">
        <path d="m46 42 7-23c15-5 36-6 53 0l8 25Z" fill="#77b7a5" stroke="#4d887a" strokeWidth="2"/>
        <path d="M49 35c17 4 43 3 61-1l2 9-66 1Z" fill="#4b8f80"/>
        <path d="M45 40c21 4 48 4 68-1l14 16c-1 5-10 5-21 3-20-4-36-4-56 0-12 2-19 2-20-3Z" fill="#92cbbb" stroke="#538f81" strokeWidth="2"/>
        <path d="M36 53c11 1 23-4 44-4 20 0 28 4 40 4" fill="none" stroke="#76b1a0" strokeWidth="2" strokeDasharray="3 3"/>
      </g>
    case 'crown':
      return <g transform="rotate(-6 80 42)">
        <path d="m48 22 17 8 14-21 13 20 20-11-7 31c-17-4-34-4-51 0Z" fill="#ffd571" stroke="#bc8748" strokeWidth="2"/>
        <path d="M53 40c17-4 36-4 54-1l-2 10c-18-4-33-3-51 0Z" fill="#edb658"/>
        <path d="m75 32 5-7 5 7-5 7Z" fill="#ad79ce"/>
        <circle cx="48" cy="21" r="3" fill="#ffe59e"/><circle cx="79" cy="9" r="3" fill="#ffe59e"/><circle cx="112" cy="18" r="3" fill="#ffe59e"/>
      </g>
    default: return null
  }
}

/** Self-contained, scalable portrait for both the editor and the class roster. */
export const PigAvatar = memo(function PigAvatar({ avatar = DEFAULT_FACE, className, label }: {
  avatar?: PigFace; className?: string; label?: string
}) {
  const id = useId()
  const skin = skins[avatar.skin]
  const scarf = avatar.scarf === 'none' ? null : scarves[avatar.scarf]
  return <svg viewBox="0 0 160 160" width="128" height="128" className={className}
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    focusable="false" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <radialGradient id={id + '-face'} cx=".35" cy=".26" r=".85">
        <stop stopColor={skin.light}/><stop offset=".66" stopColor={skin.body}/><stop offset="1" stopColor={skin.shade}/>
      </radialGradient>
      <linearGradient id={id + '-snout'} x2="0" y2="1">
        <stop stopColor={skin.light}/><stop offset=".45" stopColor={skin.muzzle}/><stop offset="1" stopColor={skin.shade}/>
      </linearGradient>
    </defs>

    {scarf && <g>
      <path d="M53 119c13 3 45 3 59-1l3 10c-9 8-23 12-36 21-4 2-6 2-9-1-9-9-17-16-21-23Z" fill={scarf[0]} stroke={scarf[1]} strokeWidth="2.5"/>
      <path d="M107 125c8-6 16-4 21-2-4 6-9 9-15 9 7 1 9 6 10 11-8-2-15-6-17-12Z" fill={scarf[0]} stroke={scarf[1]} strokeWidth="2"/>
      <path d="M54 129c15 7 31 9 47 3" stroke={scarf[1]} strokeWidth="3" fill="none"/>
    </g>}

    {/* Floppy ears sit behind the cheeks, leaving their tips visible under every hat. */}
    {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(160 0) scale(-1 1)' : undefined}>
      <path d="M54 45c-8-9-24-16-37-14-7 1-8 7-6 15 3 11 8 21 15 27 4 3 9 0 13-6Z" fill={skin.body} stroke={skin.shade} strokeWidth="2"/>
      <path d="M19 39c8 0 20 5 26 12L30 67c-5-5-11-18-12-25Z" fill={skin.dark} opacity=".46"/>
      <path d="M16 36c7-1 13 1 19 4" fill="none" stroke={skin.light} strokeWidth="3"/>
    </g>)}
    <path d="M80 38c27 0 47 17 51 41 2 10 8 16 6 28-4 21-25 29-57 29s-53-8-57-29c-2-12 4-18 6-28 4-24 24-41 51-41Z"
      fill={`url(#${id}-face)`} stroke={skin.shade} strokeWidth="2.2"/>
    <g fill={skin.muzzle}>
      <ellipse cx="43" cy="104" rx="12" ry="6" opacity=".72"/><ellipse cx="117" cy="104" rx="12" ry="6" opacity=".72"/>
    </g>
    {avatar.freckles && <g fill={skin.dark}>
      {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(160 0) scale(-1 1)' : undefined}>
        <circle cx="38" cy="103" r="1.9"/><circle cx="45" cy="100" r="1.6"/><circle cx="46" cy="106" r="1.7"/>
      </g>)}
    </g>}

    {[54, 106].map(x => <g key={x}>
      <path d={`M${x - 6} 72q5-5 11-2`} fill="none" stroke={skin.dark} strokeWidth="3" opacity=".8"/>
      <ellipse cx={x} cy="86" rx="7.3" ry="9" fill="#fffcf7"/>
      <ellipse cx={x} cy="86" rx="6.3" ry="7.9" fill={irises[avatar.eyes]} stroke="#493744" strokeWidth="1"/>
      <ellipse cx={x} cy="85.8" rx="3.1" ry="4.8" fill="#292438"/>
      <circle cx={x - 2.4} cy="82.6" r="1.9" fill="#fff"/>
    </g>)}
    <path d="M66 118q14 8 27-1c-1 8-8 12-15 10-6-1-10-5-12-9Z" fill="#63394c"/>
    <path d="M75 124q5-4 12-2c-3 4-8 5-12 2Z" fill="#ef8b99"/>
    <path d="M56 106c0-11 10-17 24-17s24 6 24 17c0 9-10 15-24 15s-24-6-24-15Z" fill={skin.dark} opacity=".22"/>
    <path d="M56 103c0-10 10-16 24-16s24 6 24 16-10 15-24 15-24-5-24-15Z" fill={`url(#${id}-snout)`} stroke={skin.shade} strokeWidth="1.7"/>
    <ellipse cx="70.5" cy="103" rx="3.6" ry="5.4" fill={skin.dark} transform="rotate(7 70.5 103)"/>
    <ellipse cx="89.5" cy="103" rx="3.6" ry="5.4" fill={skin.dark} transform="rotate(-7 89.5 103)"/>

    {avatar.jewelry === 'gold-hoops' && [21, 139].map(x => <g key={x}>
      <ellipse cx={x} cy="69" rx="5" ry="6.5" fill="none" stroke="#9f7442" strokeWidth="4"/>
      <ellipse cx={x} cy="68.7" rx="5" ry="6.5" fill="none" stroke="#f8d274" strokeWidth="2.5"/>
    </g>)}
    {avatar.jewelry === 'silver-studs' && [21, 139].map(x => <g key={x}>
      <circle cx={x} cy="64" r="4.5" fill="#b6c6d5" stroke="#687b92" strokeWidth="1.5"/>
      <circle cx={x-1.3} cy="62.5" r="1.5" fill="#fff"/>
    </g>)}
    {avatar.jewelry === 'nose-ring' && <g fill="none">
      <path d="M90 105c6 1 7 11 1 13-3 1-7-1-7-5" stroke="#976d42" strokeWidth="4.1"/>
      <path d="M90 105c6 1 7 11 1 13-3 1-7-1-7-5" stroke="#ffdc83" strokeWidth="2.5"/>
    </g>}
    <Hat kind={avatar.hat}/>
  </svg>
}, (previous, next) => {
  const a = previous.avatar ?? DEFAULT_FACE
  const b = next.avatar ?? DEFAULT_FACE
  return previous.label === next.label && previous.className === next.className &&
    a.skin === b.skin && a.eyes === b.eyes && a.hat === b.hat &&
    a.scarf === b.scarf && a.jewelry === b.jewelry && a.freckles === b.freckles
})
