import type { ReportView } from '../../model/reportView';

export function EquityGate({ gate }: { gate: NonNullable<ReportView['equityGate']> }) {
  return (
    <section className="gate" aria-labelledby="ta-gate-h" role="region">
      <div className="lbl">Priority conversation · Equity of treatment</div>
      <h3 id="ta-gate-h">This one is worth talking through before anything else.</h3>
      <p>Equity of treatment sits apart from the other six dimensions. The rest describe how a teacher works; this one describes
        who gets the benefit of it. A classroom can be well-run and still hand most of the attention, patience and benefit of the
        doubt to the same few children.</p>
      <p>{gate.body}</p>
      {gate.note && <div className="todo"><b>What the responses showed</b>{gate.note}</div>}
      <div className="todo" style={{ marginTop: 10 }}><b>One thing to try</b>{gate.action}</div>
    </section>
  );
}
