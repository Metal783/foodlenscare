import { useEffect } from "react";
import type { SessionKind } from "./Onboarding";
import { bindingCode, invite, localRead, patchFamily, refresh, savePrefs, snapshot, useBackend, mask } from "./backend";
export type ElderFontSize = "small" | "standard" | "large";
export type FamilyMember = { id: string; name: string; relation: string; maskedPhone: string; fullPhone?: string; primary: boolean; demo: boolean };
export type ShareGrant = { memberId: string; foodRecords: boolean; dietProfile: boolean };
export type BindingRequest = { id: string; applicantName: string; relation: string; maskedPhone: string; lookupCode: string; status: "pending" | "accepted" | "rejected" };
export type ElderPreferences = { fontSize: ElderFontSize; speechEnabled: boolean; grants: ShareGrant[]; members: FamilyMember[]; requests: BindingRequest[]; bindingCode: string };
export function familyMembersFor(_session: SessionKind, preferences?: ElderPreferences) { return preferences?.members || []; }
export function useElderPreferences(_session: SessionKind, _phone: string) {
  const backend = useBackend();
  const prefs = backend.account?.prefs || localRead<any>("prefs", {});
  const own = backend.families.filter(f => f.amElder);
  const preferences: ElderPreferences = {
    fontSize: prefs.fontSize || "standard", speechEnabled: !!prefs.speechEnabled,
    members: own.filter(f => f.status === "bound").map(f => ({ id: f.id, name: f.member.name, relation: f.relation, maskedPhone: mask(f.member.phone), fullPhone: f.member.phone, primary: !!f.is_primary, demo: false })),
    grants: own.filter(f => f.status === "bound").map(f => ({ memberId: f.id, foodRecords: !!f.records_allowed, dietProfile: !!f.profile_allowed })),
    requests: own.filter(f => f.status === "pending").map(f => ({ id: f.id, applicantName: f.member.name, relation: f.relation, maskedPhone: mask(f.member.phone), lookupCode: "", status: "pending" })),
    bindingCode: bindingCode(),
  };
  useEffect(() => { if (backend.account?.role === "elder") void invite().catch(() => { /* 状态和错误由绑定页显示，可主动重试。 */ }); }, [backend.account?.id, backend.account?.role, backend.families.length]);
  useEffect(() => { document.documentElement.dataset.elderFontSize = preferences.fontSize; return () => { delete document.documentElement.dataset.elderFontSize; }; }, [preferences.fontSize]);
  const save = async (next: ElderPreferences): Promise<boolean> => {
    try {
      if (next.fontSize !== preferences.fontSize || next.speechEnabled !== preferences.speechEnabled) await savePrefs({ fontSize: next.fontSize, speechEnabled: next.speechEnabled });
      for (const family of snapshot().families.filter(f => f.amElder)) {
        const request = next.requests.find(r => r.id === family.id);
        const member = next.members.find(m => m.id === family.id);
        const grant = next.grants.find(g => g.memberId === family.id);
        const status = request?.status === "accepted" || member ? "bound" : request?.status === "rejected" ? "rejected" : family.status;
        const records = !!grant?.foodRecords, profile = !!grant?.dietProfile;
        if (status !== family.status || (family.status === "bound" && (records !== !!family.records_allowed || profile !== !!family.profile_allowed || (member && (member.primary !== !!family.is_primary || member.relation !== family.relation))))) await patchFamily(family.id, { status, records_allowed: records, profile_allowed: profile, is_primary: member?.primary ?? !!family.is_primary, relation: member?.relation || family.relation });
      }
      await refresh(); return true;
    } catch (error) { window.alert(error instanceof Error ? error.message : "保存失败，请重试。"); return false; }
  };
  return { preferences, save };
}
export function sharingLabel(members: FamilyMember[], grants: ShareGrant[]) { if (grants.some(g => g.foodRecords || g.dietProfile)) return "已授权共享 · 家庭服务同步"; return members.length ? "已绑定 · 尚未授权共享" : "未绑定家人"; }
