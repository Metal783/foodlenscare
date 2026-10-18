/** Keep existing local reminders available when online analysis is off/unavailable. */
export default function LocalDiseaseReminders({ record }: { record: any }) {
  const reminders = record.aiAnalysis ? [] : record.assessment?.diseaseReminders || [];
  if (!reminders.length) return null;
  return <section className="recognition-card" aria-label="饮食核对提醒">
    {reminders.map((reminder: any) => <div key={reminder.condition}><h3>{reminder.title}</h3><p>{reminder.message}</p></div>)}
  </section>;
}
