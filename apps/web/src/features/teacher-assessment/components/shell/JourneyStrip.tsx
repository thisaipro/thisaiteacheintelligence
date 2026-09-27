import { Fragment } from 'react';

const STEPS = ['Choose age group', 'Rank 35 scenarios', 'Review & submit', 'Read your profile'];

/** stage: 0 not started · 1 in progress · 2 all ranked · 3 submitted */
export function JourneyStrip({ stage }: { stage: number }) {
  return (
    <ol className="tl-journey" aria-label="Your journey" style={{ listStyle: 'none', margin: 0 }}>
      {STEPS.map((j, i) => {
        const done = i < stage + 1 && !(stage === 0 && i === 0);
        const on = i === stage + 1 || (stage === 0 && i === 0) || (stage === 3 && i === 3);
        return (
          <Fragment key={j}>
            {i > 0 && <li className="arw" aria-hidden="true">→</li>}
            <li className={'jn' + (done && !on ? ' done' : '') + (on ? ' on' : '')} aria-current={on ? 'step' : undefined}>
              <i aria-hidden="true"></i><span>{j}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
