export type RecordNotificationSnapshot = { elder: string; recordIds: string[] };

export class RecordNotificationTracker {
  private records = new Map<string, Set<string>>();

  clear() { this.records.clear(); }

  update(elders: RecordNotificationSnapshot[]): string[] {
    const changed: string[] = [];
    const active = new Set(elders.map(item => item.elder));
    for (const elder of this.records.keys()) if (!active.has(elder)) this.records.delete(elder);
    for (const { elder, recordIds } of elders) {
      const previous = this.records.get(elder);
      if (previous && recordIds.some(id => !previous.has(id))) changed.push(elder);
      // Keep seen IDs until permission is withdrawn, including records deleted later.
      this.records.set(elder, new Set([...(previous || []), ...recordIds]));
    }
    return changed;
  }
}

export async function showRecordNotification(stillAllowed: () => boolean): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted" || !stillAllowed()) return;
  const title = "食护家";
  const options = { body: "家人刚刚识别了食品", tag: "foodlenscare-new-record" };
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (!stillAllowed() || Notification.permission !== "granted") return;
    if (registration?.active) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch { /* Unsupported system notifications must not interrupt record syncing. */ }
}
