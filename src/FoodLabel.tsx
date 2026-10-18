import LabelChecklist from './LabelChecklist';

export default function FoodLabel({ label }: { label: any }) {
  const ingredients = String(label?.ingredientText || '').replace(/^(?:(?:配料表?|配科表?|妃料表?|原辅料|原料|成分配料)\s*[:：]?\s*)+/, '').replace(/\s*\n\s*/g, '');
  const rows = label?.nutritionTable || [];
  return <>
    <section className="recognition-card">
      <h3>识别到的成分</h3>
      <p className="result-large">{ingredients || '未识别到配料表'}</p>
    </section>
    {rows.length > 0 && <section className="recognition-card">
      <h3>营养成分表</h3>
      <p>{label.servingLabel || '计量基准未识别'}</p>
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '1rem' }}>
        <thead><tr>{['项目', '含量', 'NRV%'].map(title => <th key={title} style={{ padding: '10px 4px', textAlign: title === '项目' ? 'left' : 'right', borderBottom: '1px solid #dce5db', overflowWrap: 'anywhere' }} scope="col">{title}</th>)}</tr></thead>
        <tbody>{rows.map((row: any) => <tr key={row.key}>
          <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '10px 4px', borderBottom: '1px solid #edf0eb' }}>{row.label}</th>
          <td style={{ textAlign: 'right', padding: '10px 4px', borderBottom: '1px solid #edf0eb', overflowWrap: 'anywhere' }}>{row.value} {row.unit}{!label.nutritionConfirmed && (label.nutritionCandidates?.[row.key]?.confidence ?? label.confidence?.[row.key] ?? 0) < .7 && <small style={{ display: 'block' }}>识别把握较低，请核对</small>}</td>
          <td style={{ textAlign: 'right', padding: '10px 4px', borderBottom: '1px solid #edf0eb' }}>{row.nrv == null ? '-' : `${row.nrv}%`}</td>
        </tr>)}</tbody>
      </table>
    </section>}
    <LabelChecklist label={label} />
  </>;
}
