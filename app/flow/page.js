import { Header } from '../components';
import FlowBoard from './FlowBoard';

export const metadata = {
  title: 'FLOW//SECTOR · Flow Map',
  description: 'End-of-day sector and theme flow: money in, money out, most-hedged, and participation breadth.',
};

export default async function FlowPage({ searchParams }) {
  // Next.js 16: searchParams is a Promise — must await before reading.
  const params = (await searchParams) || {};
  const period = ['1W', '1M', '3M'].includes(params.period) ? params.period : '1M';
  const type = ['sectors', 'themes', 'both'].includes(params.type) ? params.type : 'both';
  return (
    <main className="shell flow-page">
      <Header active="FLOW" stamp="FLOW MAP / SECTOR + THEME ROTATION" />
      <section className="flow-hero">
        <div>
          <div className="eyebrow">FLOW MAP / SECTOR &amp; THEME</div>
          <h1>Where the dollars<br /><em>actually went.</em></h1>
          <p>One screen, two layers: 11 sector ETFs and 45+ thematic ETFs ranked vs SPY over 1W / 1M / 3M. RVOL flags the most-hedged. Breadth flags the names that actually confirmed the move.</p>
        </div>
        <div className="flow-hero-mark" aria-hidden="true">
          <span>↯</span>
          <i />
        </div>
      </section>
      <FlowBoard period={period} type={type} />
    </main>
  );
}
