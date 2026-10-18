import { useEffect, useMemo } from "react";
import type { SessionKind } from "./Onboarding";
import type { CareVoice, VoicePlayer } from "./voice";

const assetPathPrefix = "assets";
const wave = [10, 18, 14, 28, 38, 22, 32, 48, 26, 18, 34, 44, 30, 20, 40, 32, 18, 26, 36, 22, 14, 24, 12];

function dateLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = (item: Date) =>
    `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
  const prefix =
    key(date) === key(today)
      ? "今天"
      : key(date) === key(yesterday)
        ? "昨天"
        : `${date.getFullYear()}年`;
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日 ${new Intl.DateTimeFormat(
    "zh-CN",
    { hour: "2-digit", minute: "2-digit", hour12: false },
  ).format(date)}`;
}

function time(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function playLabel(
  voice: CareVoice,
  current: boolean,
  playing: boolean,
): string {
  if (current && playing) return "暂停试听";
  if (voice.progress >= voice.duration - 0.15) return "再次收听";
  if (voice.progress > 0) return "继续收听";
  return "播放语音";
}

export default function CareVoicePage({
  session,
  requestedId,
  player,
  onBack,
}: {
  session: SessionKind;
  requestedId: string | null;
  player: VoicePlayer;
  onBack: () => void;
}) {
  const activeId = player.currentId || requestedId || player.voices[0]?.id || null;
  const active = player.voices.find((voice) => voice.id === activeId) || null;
  const history = useMemo(
    () =>
      player.voices
        .filter((voice) => voice.id !== active?.id)
        .sort(
          (a, b) =>
            new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
        ),
    [active?.id, player.voices],
  );
  const isCurrent = player.currentId === active?.id;
  const isPlaying = isCurrent && player.isPlaying;

  useEffect(
    () => () => {
      player.pause();
    },
    [],
  );

  if (!active) {
    return (
      <main className="care-voice-page">
        <header className="recognition-header">
          <button aria-label="返回首页" type="button" onClick={onBack}>
            <img alt="" src={`${assetPathPrefix}/7e864.svg`} />
          </button>
          <h1>关怀语音</h1>
        </header>
        <div className="care-voice-content">
          <h2>听听家人的关心</h2>
          <section className="voice-page-empty">
            <h3>
              {session === "guest-demo"
                ? "暂未提供演示语音"
                : "暂未收到家人的关怀语音"}
            </h3>
            <p>收到家人语音后，会显示在这里。</p>
          </section>
          <p className="voice-medical-note">语音来自家人，不是医疗建议。</p>
        </div>
      </main>
    );
  }

  const percentage = Math.min(100, (active.progress / active.duration) * 100);
  return (
    <main className="care-voice-page">
      <header className="recognition-header">
        <button aria-label="返回首页" type="button" onClick={onBack}>
          <img alt="" src={`${assetPathPrefix}/7e864.svg`} />
        </button>
        <h1>关怀语音</h1>
      </header>
      <div className="care-voice-content">
        <h2>听听{active.relation}的关心</h2>
        <section className="voice-main-card">
          <div className="voice-person">
            <div>{active.sender.slice(-1)}</div>
            <p>
              <strong>{active.relation} · {active.sender}</strong>
              <span>{dateLabel(active.sentAt)} · {Math.round(active.duration)}秒</span>
            </p>
          </div>
          {active.demo && (
            <p className="voice-demo-note">演示音频（提示音，不是真实家人留言）</p>
          )}
          <p className="voice-receipt">
            {isPlaying
              ? active.completedOnce
                ? "已播放过 · 正在再次试听"
                : "正在试听"
              : active.played
                ? "已播放"
                : "待播放"}
          </p>
          <div className="voice-wave" aria-hidden="true">
            {wave.map((height, index) => (
              <i
                className={index / wave.length <= percentage / 100 ? "played" : ""}
                key={`${height}-${index}`}
                style={{ height }}
              />
            ))}
          </div>
          <div className="voice-progress">
            <span style={{ width: `${percentage}%` }} />
          </div>
          <p className="voice-time">{time(active.progress)} ／ {time(active.duration)}</p>
          {player.error && <p className="voice-error" role="alert">{player.error}</p>}
          <button
            className="voice-play-main"
            disabled={player.loading}
            type="button"
            onClick={() => player.toggle(active.id)}
          >
            {isPlaying && <img alt="" src={`${assetPathPrefix}/ec9fd.svg`} />}
            {player.loading ? "音频加载中…" : playLabel(active, isCurrent, isPlaying)}
          </button>
        </section>

        <h2 className="voice-history-title">以前收到的语音</h2>
        {history.length ? (
          history.map((voice) => (
            <section className="voice-history-card" key={voice.id}>
              <h3>{voice.relation} · {voice.sender}</h3>
              {voice.summary && <p>“{voice.summary}”</p>}
              <span>{dateLabel(voice.sentAt)} · {Math.round(voice.duration)}秒</span>
              <div>
                <button type="button" onClick={() => player.play(voice.id)}>▷ 收听</button>
                <small>{voice.played ? "已播放" : "待播放"}</small>
              </div>
            </section>
          ))
        ) : (
          <section className="voice-history-empty">暂无其他语音</section>
        )}
        <p className="voice-medical-note">语音来自家人，不是医疗建议。</p>
      </div>
    </main>
  );
}
