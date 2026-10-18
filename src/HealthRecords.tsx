import ElderBottomNav from "./ElderBottomNav";
import { deleteRecord, useBackend } from "./backend";
import SavedFoodResult from "./SavedFoodResult";
import PrivatePhoto from './PrivatePhoto';
import RecordInsights from './RecordInsights';
import { useEffect, useMemo, useRef, useState } from "react";
import type { FamilyContact } from "./ElderHome";
import type { ElderDraft, SessionKind } from "./Onboarding";
import {
  readRecognitionRecords,
  type RecognitionRecord,
} from "./records";

type RecordsPage = "overview" | "all" | "detail";
type DetailSource = "overview" | "all";
type DateMode = "recent" | "specific";

const assetPathPrefix = "/assets";

function localDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function mondayOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const day = result.getDay() || 7;
  return addDays(result, 1 - day);
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatRecordDate(value: string): string {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatTime(value)}`;
}

function dayHeading(key: string, count: number): string {
  const today = localDateKey(new Date());
  const yesterday = localDateKey(addDays(new Date(), -1));
  const date = new Date(`${key}T12:00:00`);
  const prefix = key === today ? "今天" : key === yesterday ? "昨天" : `${date.getFullYear()}年`;
  return `${prefix} · ${formatMonthDay(date)}　${count}条`;
}


function RecordRow({
  record,
  compact = false,
  onClick,
}: {
  record: RecognitionRecord;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={compact ? "record-row record-row-compact" : "record-list-card"}
      type="button"
      onClick={onClick}
    >
      <div className="record-main">
        <PrivatePhoto alt={`${record.foodName}照片`} src={record.photo} />
        <div>
          <strong>{record.foodName}</strong>
          <span>
            {compact ? formatRecordDate(record.recognizedAt) : formatTime(record.recognizedAt)}
          </span>
          {!compact && <em>查看详情 ›</em>}
        </div>
        {compact && <img alt="" className="record-chevron" src={`${assetPathPrefix}/6c0ad.svg`} />}
      </div>
      <div className="record-reference">
        <span className={record.attention ? "attention" : ""}>
          {record.attention ? "需留意" : "饮食参考"}
        </span>
        <p>{record.referenceNote || record.reference}</p>
      </div>
    </button>
  );
}

function EmptyRecords({ onCamera }: { onCamera: () => void }) {
  return (
    <section className="records-empty">
      <h2>还没有食品识别记录</h2>
      <p>只有成功保存的识别结果会显示在这里。</p>
      <button className="records-primary" type="button" onClick={onCamera}>
        去拍照识别
      </button>
    </section>
  );
}

function OverviewPage({
  records,
  onAll,
  onDetail,
  onHome,
  onSettings,
  sharingStatus,
}: {
  records: RecognitionRecord[];
  onAll: () => void;
  onDetail: (record: RecognitionRecord) => void;
  onHome: () => void;
  onSettings: () => void;
  sharingStatus: string;
}) {
  const today = startOfDay(new Date());
  const monday = mondayOfWeek(today);
  const sunday = addDays(monday, 6);
  const weekRecords = records.filter((record) => {
    const time = new Date(record.recognizedAt);
    return time >= monday && time < addDays(sunday, 1);
  });
  const dateSet = new Set(records.map((record) => localDateKey(record.recognizedAt)));
  let cursor = dateSet.has(localDateKey(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (dateSet.has(localDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  const attention = weekRecords.filter((record) => record.attention).length;

  return (
    <main className="records-page">
      <div className="records-content">
        <section className="week-card">
          <div className="week-heading">
            <h1>本周识别概览</h1>
            <span>{formatMonthDay(monday)}—{formatMonthDay(sunday)}</span>
          </div>
          <div className="week-stats">
            <div><strong>{weekRecords.length}</strong><span>食物已识别</span></div>
            <div><strong>{streak}</strong><span>连续记录天数</span></div>
            <div><strong>{attention}</strong><span>需留意食物</span></div>
          </div>
          <div className="sharing-status">
            <img alt="" src={`${assetPathPrefix}/a7056.svg`} />
            <span>{sharingStatus}</span>
          </div>
        </section>
        <button className="records-primary" type="button" onClick={onAll}>全部记录</button>
        <RecordInsights />
        {records.length ? (
          <section className="recent-records">
            <h2>最近识别记录</h2>
            {records.slice(0, 5).map((record) => (
              <RecordRow compact key={record.id} record={record} onClick={() => onDetail(record)} />
            ))}
          </section>
        ) : (
          <EmptyRecords onCamera={onHome} />
        )}
        <div className="records-tip">
          <img alt="" src={`${assetPathPrefix}/828cc.svg`} />
          <p>识别建议仅供饮食参考，不能替代医生诊断。身体不适时，请及时联系医生。</p>
        </div>
      </div>
      <ElderBottomNav active="records" onHome={onHome} onSettings={onSettings} />
    </main>
  );
}

function AllRecordsPage({
  records,
  onBack,
  onDetail,
  onHome,
  onSettings,
  sharingStatus,
}: {
  records: RecognitionRecord[];
  onBack: () => void;
  onDetail: (record: RecognitionRecord) => void;
  onHome: () => void;
  onSettings: () => void;
  sharingStatus: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dateMode, setDateMode] = useState<DateMode>("recent");
  const [selectedDate, setSelectedDate] = useState("");
  const [pendingDate, setPendingDate] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [dateDialog, setDateDialog] = useState(false);
  const today = startOfDay(new Date());
  const recentStart = addDays(today, -6);

  const filtered = records.filter((record) => {
    const time = new Date(record.recognizedAt);
    const dateMatches =
      dateMode === "recent"
        ? time >= recentStart && time < addDays(today, 1)
        : localDateKey(time) === selectedDate;
    return dateMatches && (!attentionOnly || Boolean(record.attention));
  });
  const groups = filtered.reduce<Record<string, RecognitionRecord[]>>((result, record) => {
    const key = localDateKey(record.recognizedAt);
    (result[key] ||= []).push(record);
    return result;
  }, {});

  return (
    <main className="records-page">
      <div className="records-scroll" ref={scrollRef}>
        <header className="records-subheader">
          <button aria-label="返回健康记录" type="button" onClick={onBack}>
            <img alt="" src={`${assetPathPrefix}/7e864.svg`} />
          </button>
          <h1>全部食物记录</h1>
        </header>
        <div className="records-content all-records-content">
          <h2>每一餐，都记在这里</h2>
          <p className="all-summary">共 {filtered.length} 条符合当前条件的记录</p>
          <div className="date-actions">
            <button
              className={dateMode === "recent" ? "selected" : ""}
              type="button"
              onClick={() => {
                setDateMode("recent");
                setSelectedDate("");
              }}
            >
              最近7天
            </button>
            <button type="button" onClick={() => {
              setPendingDate(selectedDate || localDateKey(today));
              setDateDialog(true);
            }}>
              <img alt="" src={`${assetPathPrefix}/25744.svg`} />选择日期
            </button>
          </div>
          <div className="attention-filter">
            <button
              className={!attentionOnly ? "active" : ""}
              type="button"
              onClick={() => setAttentionOnly(false)}
            >
              全部记录
            </button>
            <button
              className={attentionOnly ? "active" : ""}
              type="button"
              onClick={() => setAttentionOnly(true)}
            >
              需留意
            </button>
          </div>
          {Object.keys(groups).length ? (
            Object.entries(groups)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([key, items]) => (
                <section className="record-day" key={key}>
                  <h3>{dayHeading(key, items.length)}</h3>
                  {items.map((record) => (
                    <RecordRow key={record.id} record={record} onClick={() => onDetail(record)} />
                  ))}
                </section>
              ))
          ) : (
            <section className="records-empty">
              <h2>当前条件下没有记录</h2>
              <p>可以重置筛选查看最近7天的全部记录。</p>
              <button className="records-primary" type="button" onClick={() => {
                setDateMode("recent");
                setSelectedDate("");
                setAttentionOnly(false);
              }}>
                重置筛选
              </button>
            </section>
          )}
          <p className="sharing-line">{sharingStatus}</p>
          <div className="records-tip">
            <img alt="" src={`${assetPathPrefix}/b1192.svg`} />
            <p>建议仅供饮食参考，食品成分以实物包装为准。</p>
          </div>
        </div>
      </div>
      <ElderBottomNav active="records" onHome={onHome} onSettings={onSettings} />
      {dateDialog && (
        <div className="dialog-backdrop">
          <section aria-modal="true" className="dialog-card" role="dialog">
            <h2>选择日期</h2>
            <input
              className="date-input"
              max={localDateKey(today)}
              type="date"
              value={pendingDate}
              onChange={(event) => setPendingDate(event.target.value)}
            />
            <button className="primary-button" disabled={!pendingDate} type="button" onClick={() => {
              setSelectedDate(pendingDate);
              setDateMode("specific");
              setDateDialog(false);
            }}>
              确定
            </button>
            <button className="dialog-cancel" type="button" onClick={() => setDateDialog(false)}>
              取消
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function DetailPage({
  record,
  contact,
  onBack,
  sharingStatus,
}: {
  record: RecognitionRecord | null;
  contact: FamilyContact | null;
  onBack: () => void;
  sharingStatus: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deletingRef = useRef(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callMessage, setCallMessage] = useState("");
  if (!record) {
    return (
      <main className="records-page">
        <header className="records-subheader">
          <button aria-label="返回" type="button" onClick={onBack}><img alt="" src={`${assetPathPrefix}/7e864.svg`} /></button>
          <h1>我的识别记录</h1>
        </header>
        <section className="records-empty detail-missing">
          <h2>无法读取这条记录</h2>
          <p>记录可能已被移除，请返回记录列表。</p>
          <button className="records-primary" type="button" onClick={onBack}>返回</button>
        </section>
      </main>
    );
  }
  const confirmDelete = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true); setDeleteError("");
    try {
      await deleteRecord(record.id);
      onBack();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试。");
    } finally { deletingRef.current = false; setDeleting(false); }
  };

  const confirmCall = () => {
    if (!contact?.fullPhone || !/^1[3-9]\d{9}$/.test(contact.fullPhone)) {
      setCallMessage("当前为演示联系人，未提供可拨打的完整号码");
      return;
    }
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setCallMessage("无法打开系统电话，请使用手机电话手动拨打联系人号码");
      return;
    }
    window.location.href = `tel:${contact.fullPhone}`;
  };

  return (
    <main className="records-page detail-page">
      <header className="records-subheader">
        <button aria-label="返回来源列表" type="button" onClick={onBack}>
          <img alt="" src={`${assetPathPrefix}/7e864.svg`} />
        </button>
        <h1>我的识别记录</h1>
      </header>
      <div className="records-content detail-content">
        <SavedFoodResult record={record} caption={`我拍摄的 · ${formatRecordDate(record.recognizedAt)}`} />
        <p className="sharing-line">{sharingStatus}</p>
        {contact && (
          <button className="recognition-primary" type="button" onClick={() => setCallOpen(true)}>
            <img alt="" src={`${assetPathPrefix}/fb9fa.svg`} />联系{contact.relation}{contact.name}
          </button>
        )}
        <button className="recognition-secondary" type="button" onClick={() => { setDeleteError(""); setDeleteOpen(true); }}>删除记录</button>
      </div>
      {deleteOpen && (
        <div className="dialog-backdrop">
          <section aria-modal="true" aria-labelledby="delete-record-title" className="dialog-card" role="dialog">
            <h2 id="delete-record-title">删除这条识别记录？</h2>
            <p>删除后无法恢复，家人也将无法查看这条记录。</p>
            {deleteError && <p role="alert">{deleteError}</p>}
            <button className="primary-button" disabled={deleting} type="button" onClick={() => void confirmDelete()}>{deleting ? "正在删除…" : "确认删除"}</button>
            <button className="dialog-cancel" disabled={deleting} type="button" onClick={() => setDeleteOpen(false)}>取消</button>
          </section>
        </div>
      )}
      {callOpen && contact && (
        <div className="home-modal-backdrop" role="presentation" onMouseDown={() => setCallOpen(false)}>
          <section aria-modal="true" className="home-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>给{contact.relation}{contact.name}打电话？</h2>
            <div className="contact-row">
              <div className="contact-avatar">{contact.name.slice(-1)}</div>
              <div><strong>{contact.relation} · {contact.name}</strong><span>{contact.maskedPhone}</span></div>
            </div>
            <p>将打开系统电话，请确认拨打。<br />当前尚未拨打。</p>
            {callMessage && <p className="home-dialog-message" role="status">{callMessage}</p>}
            <button className="home-dialog-confirm" type="button" onClick={confirmCall}>确认呼叫</button>
            <button className="home-dialog-cancel" type="button" onClick={() => setCallOpen(false)}>取消</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default function HealthRecords({
  session,
  elder,
  contact,
  onHome,
  onSettings,
  sharingStatus,
}: {
  session: SessionKind;
  elder: ElderDraft;
  contact: FamilyContact | null;
  onHome: () => void;
  onRecognize: () => void;
  onSettings: () => void;
  sharingStatus: string;
}) {
  const backend = useBackend();
  const [page, setPage] = useState<RecordsPage>("overview");
  const [detailSource, setDetailSource] = useState<DetailSource>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollPositions = useRef<Record<DetailSource, number>>({
    overview: 0,
    all: 0,
  });
  const records = useMemo(
    () => readRecognitionRecords(session, elder.phone),
    [elder.phone, page, session, backend.revision],
  );
  const selected = records.find((record) => record.id === selectedId) || null;

  useEffect(() => {
    const handleBack = (event: PopStateEvent) => {
      const recordsPage = event.state?.recordsPage;
      if (
        recordsPage === "overview" ||
        recordsPage === "all" ||
        recordsPage === "detail"
      ) {
        setPage(recordsPage);
        if (recordsPage === "overview" || recordsPage === "all") {
          window.setTimeout(
            () => window.scrollTo(0, scrollPositions.current[recordsPage as DetailSource]),
            0,
          );
        }
        if (recordsPage === "detail" && event.state?.recordId) {
          setSelectedId(event.state.recordId);
          setDetailSource(event.state.detailSource || "overview");
        }
      } else if (event.state?.foodlensView === "health-records") {
        setPage("overview");
      }
    };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  const openAll = () => {
    scrollPositions.current.overview = window.scrollY;
    window.history.pushState(
      { foodlensView: "health-records", recordsPage: "all" },
      "",
    );
    setPage("all");
    window.scrollTo(0, 0);
  };

  const openDetail = (record: RecognitionRecord, source: DetailSource) => {
    scrollPositions.current[source] = window.scrollY;
    window.history.pushState(
      {
        foodlensView: "health-records",
        recordsPage: "detail",
        recordId: record.id,
        detailSource: source,
      },
      "",
    );
    setDetailSource(source);
    setSelectedId(record.id);
    setPage("detail");
    window.scrollTo(0, 0);
  };
  return (
    <>
      {(page === "overview" || (page === "detail" && detailSource === "overview")) && (
        <div hidden={page !== "overview"}>
          <OverviewPage
            records={records}
            onAll={openAll}
            onDetail={(record) => openDetail(record, "overview")}
            onHome={onHome}
            onSettings={onSettings}
            sharingStatus={sharingStatus}
          />
        </div>
      )}
      {(page === "all" || (page === "detail" && detailSource === "all")) && (
        <div hidden={page !== "all"}>
          <AllRecordsPage
            records={records}
            onBack={() => window.history.back()}
            onDetail={(record) => openDetail(record, "all")}
            onHome={onHome}
            onSettings={onSettings}
            sharingStatus={sharingStatus}
          />
        </div>
      )}
      {page === "detail" && (
        <DetailPage
          contact={contact}
          record={selected}
          onBack={() => window.history.back()}
          sharingStatus={sharingStatus}
        />
      )}
    </>
  );
}
