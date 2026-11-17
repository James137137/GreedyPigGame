declare const __LAST_EDITED__: string;
declare const __HAS_COMMIT_TIME__: boolean;

const formatted = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(__LAST_EDITED__));

export function EditStamp() {
  return <small className="edit-stamp">{__HAS_COMMIT_TIME__ ? 'Last edited' : 'Built'} · <time dateTime={__LAST_EDITED__}>{formatted} NZ</time></small>;
}
