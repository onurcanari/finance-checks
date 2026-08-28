import Link from 'next/link';

export function Header({ active, stamp = 'US EQUITY ROTATION MONITOR / LIVE PRICE DATA' }) {
  const links = [['/', 'DASHBOARD'], ['/sector?ticker=XLK', 'SECTOR DETAIL'], ['/data', 'DATA SOURCE']];
  return <header className="topbar"><div><div className="brand">FLOW<i>//</i>SECTOR</div><div className="stamp">{stamp}</div></div><nav className="nav">{links.map(([href, label]) => <Link key={label} className={active === label ? 'active' : ''} href={href}>{label}</Link>)}</nav></header>;
}

export const percent = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
export const movement = (value) => value >= 0 ? 'up' : 'down';
