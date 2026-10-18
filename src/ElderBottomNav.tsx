type Destination = "home" | "records" | "settings";

export default function ElderBottomNav({
  active,
  onHome,
  onRecords,
  onSettings,
}: {
  active: Destination;
  onHome: () => void;
  onRecords?: () => void;
  onSettings?: () => void;
}) {
  return (
    <nav aria-label="底部导航" className="records-bottom-nav" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      <button aria-current={active === "records" ? "page" : undefined} className={active === "records" ? "active" : ""} type="button" onClick={onRecords}>
        <img alt="" src={`/assets/${active === "records" ? "5fda0.svg" : "099f4.svg"}`} />
        <span>健康记录</span>
      </button>
      <button aria-current={active === "home" ? "page" : undefined} className={`records-camera-nav ${active === "home" ? "active" : ""}`} style={{ position: "static" }} type="button" onClick={onHome}>
        <span aria-hidden="true" style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          backgroundColor: "currentColor",
          maskImage: "url(/assets/2a219.svg)",
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
        }} />
        <span>拍照识别</span>
      </button>
      <button aria-current={active === "settings" ? "page" : undefined} className={active === "settings" ? "active" : ""} type="button" onClick={onSettings}>
        <img alt="" src={`/assets/${active === "settings" ? "0b815.svg" : "81cb9.svg"}`} />
        <span>我的设置</span>
      </button>
    </nav>
  );
}
