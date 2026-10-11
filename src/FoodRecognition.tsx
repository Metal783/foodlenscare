import { runRecognition, assess, ruleProfile } from "./recognition";
import { putRecord } from "./backend";
import { useEffect, useRef, useState } from "react";
import type { ElderDraft, SessionKind } from "./Onboarding";
import { recordAccount, type RecognitionRecord } from "./records";
import ElderProfileEdit from "./ElderProfileEdit";

export type RecognitionStage = "camera" | "processing" | "result" | "failure";
type DemoOutcome = "success" | "failure";
type ConfirmAction = "home" | "camera" | null;

const assetPathPrefix = "/assets";

function RecognitionHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="recognition-header">
      <button aria-label="返回" type="button" onClick={onBack}>
        <img alt="" src={`${assetPathPrefix}/7e864.svg`} />
      </button>
      <h1>{title}</h1>
    </header>
  );
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择支持的图片文件"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片无法读取，请重新选择"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("图片无法读取，请重新选择"));
    reader.readAsDataURL(file);
  });
}

function CameraPage({
  outcome,
  setOutcome,
  onBack,
  onRecognize,
}: {
  outcome: DemoOutcome;
  setOutcome: (outcome: DemoOutcome) => void;
  onBack: () => void;
  onRecognize: (photo: string, userPhoto: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"preparing" | "ready" | "unavailable">(
    "preparing",
  );
  const [cameraMessage, setCameraMessage] = useState("正在准备相机…");
  const [flashOn, setFlashOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    stopCamera();
    setCameraState("preparing");
    setCameraMessage("正在准备相机…");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unavailable");
      setCameraMessage("当前浏览器不支持相机，请从相册选择或使用演示照片。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("ready");
      setCameraMessage("");
    } catch (error) {
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      setCameraState("unavailable");
      setCameraMessage(
        denied
          ? "相机权限已被拒绝。您可以重新授权后重试，或从相册选择照片。"
          : "未找到可用相机。您仍可从相册选择或使用演示照片。",
      );
    }
  };

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, []);

  const capture = () => {
    if (busy || cameraState !== "ready" || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraMessage("无法捕获照片，请重新尝试。");
      return;
    }
    setBusy(true);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    onRecognize(canvas.toDataURL("image/jpeg", 0.82), true);
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    try {
      setBusy(true);
      const photo = await readImage(file);
      stopCamera();
      onRecognize(photo, true);
    } catch (error) {
      setBusy(false);
      setCameraMessage(error instanceof Error ? error.message : "图片无法读取，请重新选择");
    }
  };

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
      torch?: boolean;
    };
    if (!track || !capabilities?.torch) {
      setCameraMessage("当前设备或浏览器不支持闪光灯控制。");
      return;
    }
    const next = !flashOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }] as unknown as MediaTrackConstraintSet[],
      } as MediaTrackConstraints);
      setFlashOn(next);
      setCameraMessage(`闪光灯已${next ? "开启" : "关闭"}`);
    } catch {
      setCameraMessage("无法切换闪光灯，请使用设备自带相机或调整环境光线。");
    }
  };

  return (
    <main className="recognition-page">
      <RecognitionHeader title="拍照识别" onBack={onBack} />
      <div className="recognition-content camera-content">
        <h2>对准食品背面标签</h2>
        <p className="recognition-lead">把完整配料表放进框里，拿稳手机。</p>
        <div className="camera-viewport">
          <video ref={videoRef} muted playsInline />
          {cameraState !== "ready" && (
            <div className="camera-state" role="status">
              <strong>{cameraState === "preparing" ? "相机准备中" : "无法使用相机"}</strong>
              <p>{cameraMessage}</p>
              {cameraState === "unavailable" && (
                <div>
                  <button type="button" onClick={() => void startCamera()}>重新尝试</button>
                  <button
                    type="button"
                    onClick={() => onRecognize(`${assetPathPrefix}/dd0c1.png`, false)}
                  >
                    使用演示照片
                  </button>
                </div>
              )}
            </div>
          )}
          <button className="flash-button" type="button" onClick={() => void toggleFlash()}>
            <img alt="" src={`${assetPathPrefix}/be2bd.svg`} />
            闪光灯{flashOn ? "开" : "关"}
          </button>
          <div className="camera-frame" aria-hidden="true" />
        </div>

        <div className="demo-outcome" aria-label="演示识别结果" role="group">
          <span>演示识别：</span>
          <button
            aria-pressed={outcome === "success"}
            type="button"
            onClick={() => setOutcome("success")}
          >
            演示成功
          </button>
          <button
            aria-pressed={outcome === "failure"}
            type="button"
            onClick={() => setOutcome("failure")}
          >
            演示未看清标签
          </button>
        </div>

        <div className="camera-actions">
          <button
            aria-label="从相册选择照片"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            <img alt="" src={`${assetPathPrefix}/fc17f.svg`} />
          </button>
          <button
            aria-label="拍照"
            className="shutter"
            disabled={busy || cameraState !== "ready"}
            type="button"
            onClick={capture}
          >
            <img alt="" src={`${assetPathPrefix}/d4c0b.svg`} />
          </button>
          <span aria-hidden="true" />
        </div>
        <input
          ref={fileRef}
          accept="image/*"
          className="sr-only"
          type="file"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {cameraMessage && cameraState === "ready" && (
          <p className="camera-inline-message" role="status">{cameraMessage}</p>
        )}
        <div className="recognition-tip">
          <img alt="" src={`${assetPathPrefix}/b1192.svg`} />
          <p>照片仅用于食品识别。包装反光时，稍微倾斜食品再拍。</p>
        </div>
      </div>
    </main>
  );
}

function ProcessingPage({ onCancel, progress }: { onCancel: () => void; progress: string }) {
  return (
    <main className="recognition-page">
      <RecognitionHeader title="拍照识别" onBack={onCancel} />
      <div className="processing-state" role="status">
        <div className="recognition-spinner" aria-hidden="true" />
        <h2>正在识别食品标签</h2>
        <p>{progress || "正在本机读取包装文字，请稍候。"}</p>
        <button className="recognition-secondary" type="button" onClick={onCancel}>
          取消识别
        </button>
      </div>
    </main>
  );
}

function FailurePage({
  onBack,
  onRetry,
  onChoose,
}: {
  onBack: () => void;
  onRetry: () => void;
  onChoose: (photo: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <main className="recognition-page">
      <RecognitionHeader title="重新拍清楚" onBack={onBack} />
      <div className="recognition-content failure-content">
        <section className="failure-hero">
          <div><img alt="" src={`${assetPathPrefix}/03c58.svg`} /></div>
          <h2>这次没看清标签</h2>
          <p>照片有些模糊，或配料表没拍全。<br />别着急，换个方法再试试。</p>
        </section>
        <section className="recognition-card failure-advice">
          <h3>这样拍，会更清楚</h3>
          <strong>① 找一处明亮的地方</strong>
          <p>避开灯光反射，不要遮住配料表。</p>
          <strong>② 把完整标签放进框里</strong>
          <p>包含配料表及过敏原声明，别只拍正面。</p>
          <strong>③ 拿稳，等画面清晰再拍</strong>
          <p>字体太小时靠近一点，保持对焦。</p>
        </section>
        <button className="recognition-primary" type="button" onClick={onRetry}>
          <img alt="" src={`${assetPathPrefix}/dd693.svg`} />重新拍照
        </button>
        <button className="recognition-secondary" type="button" onClick={() => fileRef.current?.click()}>
          <img alt="" src={`${assetPathPrefix}/06887.svg`} />从相册选清晰照片
        </button>
        <input
          ref={fileRef}
          accept="image/*"
          className="sr-only"
          type="file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            try {
              onChoose(await readImage(file));
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "图片无法读取，请重新选择");
            }
          }}
        />
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="recognition-tip">
          <img alt="" src={`${assetPathPrefix}/b1192.svg`} />
          <p>本次未生成食用建议，也未保存记录。仍看不清时，请直接查看实物包装，或请家人帮忙。</p>
        </div>
      </div>
    </main>
  );
}

function ResultPage({
  record,
  photo,
  userPhoto,
  elder,
  session,
  saved,
  saving,
  onBack,
  onRetake,
  onSave,
  speechEnabled,
  speaking,
  speechMessage,
  onToggleSpeech,
  onEditProfile,
}: {
  record: any;
  photo: string;
  userPhoto: boolean;
  elder: ElderDraft;
  session: SessionKind;
  saved: boolean;
  saving: boolean;
  onBack: () => void;
  onRetake: () => void;
  onSave: () => void;
  speechEnabled: boolean;
  speaking: boolean;
  speechMessage: string;
  onToggleSpeech: () => void;
  onEditProfile: () => void;
}) {
  const diseases = elder.diseases.filter((item) => item !== "无");
  const allergens = elder.allergens.filter((item) => item !== "无");
  const hasSettings = diseases.length > 0 || allergens.length > 0;
  const settingsText = hasSettings
    ? `您本人填写：${diseases.length ? diseases.join("、") : "未填写基础疾病"}；过敏原：${
        allergens.length ? allergens.join("、") : "未填写"
      }。`
    : "尚未填写饮食相关设置。";

  return (
    <main className="recognition-page">
      <RecognitionHeader title="本次识别结果" onBack={onBack} />
      <div className="recognition-content result-content">
        <section className="recognition-card result-summary">
          <img alt="本次食品照片" className="result-photo" src={photo} />
          <h2>{record?.productName || "未读清标签"}</h2>
          <span className="result-badge" style={record?.assessment?.level === "red" ? { color: "#a21717", background: "#fff0f0" } : record?.assessment?.level !== "green" ? { color: "#7c4a12", background: "#fff2dc" } : undefined}>{record?.assessment?.headline || "待核对包装"}</span>
          <p>本次识别 · {saved ? "已保存" : "尚未保存记录"}</p>
          {!userPhoto && <small>独立演示用例，不记入真实识别历史。</small>}
        </section>
        <section className="recognition-card">
          <h3>识别到的成分</h3>
          <div className="result-warning">
            <img alt="" src={`${assetPathPrefix}/dae24.svg`} />
            <p>{record?.label?.ingredientsConfirmed ? "已核对配料，请仍以实物包装为准。" : "本机OCR读取内容，尚未人工核对，请对照完整包装。"}</p>
          </div>
          <p className="result-large">配料：{record?.label?.ingredientText || "未读清，请重新拍摄配料区域"}</p>
          <p>{record?.label?.allergenDeclaration || "未读到过敏原声明不等于不含过敏原，请核对完整包装。"}</p>
        </section>
        <section className="recognition-card">
          <h3>吃多少，慢慢安排</h3>
          <p className="result-large">{record?.assessment?.advice || "请核对营养表和实际食用份量。"}</p>
        </section>
        <section className="recognition-card">
          <h3>结合您的已有设置</h3>
          <p className="result-settings">
            {session === "guest-demo" && "游客演示信息："}{settingsText}
          </p>
          {(record?.assessment?.diseaseReminders || []).map((item: any) => <div className="result-warning" key={item.condition}><img alt="" src={`${assetPathPrefix}/dae24.svg`} /><p><strong>{item.title}</strong><br />{item.message}</p></div>)}
          <p className="result-large">请核对糖、钠和食用份量。配料未列出过敏原，不代表没有交叉接触风险。</p>
          <button className="settings-link" type="button" onClick={onEditProfile}>
            查看／修改饮食相关设置 ›
          </button>
        </section>
        <div className="recognition-tip">
          <img alt="" src={`${assetPathPrefix}/b1192.svg`} />
          <p>照片识别可能遗漏或误读，需要核对完整包装和营养表；不能判断血压、血糖，也不是医疗诊断。</p>
        </div>
        {speechMessage && !speechEnabled && <p className="saved-message" role="status">{speechMessage}</p>}
        {speechEnabled && (
          <>
            <button className="recognition-secondary" type="button" onClick={onToggleSpeech}>
              {speaking ? "停止朗读" : "朗读识别结果"}
            </button>
            {speechMessage && <p className="saved-message" role="status">{speechMessage}</p>}
          </>
        )}
        <button className="recognition-primary" disabled={saved || saving} type="button" onClick={onSave}>
          {saving ? "保存中…" : saved ? "已保存" : "保存记录"}
        </button>
        {saved && <p className="saved-message" role="status">已保存识别历史；尚未计为实际食用</p>}
        <button className="recognition-secondary" type="button" onClick={onRetake}>
          <img alt="" src={`${assetPathPrefix}/b09bd.svg`} />重新拍照
        </button>
      </div>
    </main>
  );
}

export default function FoodRecognition({
  stage,
  setStage,
  elder,
  session,
  onHome,
  speechEnabled,
  onStopFamilyAudio,
  onUpdateElder,
}: {
  stage: RecognitionStage;
  setStage: (stage: RecognitionStage) => void;
  elder: ElderDraft;
  session: SessionKind;
  onHome: () => void;
  speechEnabled: boolean;
  onStopFamilyAudio: () => void;
  onUpdateElder: (draft: ElderDraft) => Promise<boolean>;
}) {
  const [record, setRecord] = useState<any>(null);
  const [progress, setProgress] = useState("");
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); window.speechSynthesis?.cancel(); }; }, []);
  const [outcome, setOutcome] = useState<DemoOutcome>("success");
  const [photo, setPhoto] = useState(`${assetPathPrefix}/dd0c1.png`);
  const [userPhoto, setUserPhoto] = useState(false);
  const [taskId, setTaskId] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const spokenTask = useRef<number | null>(null);

  const stopSpeech = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const speakResult = () => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeechMessage("当前浏览器不支持语音朗读，请阅读页面文字。");
      return;
    }
    if (speaking) {
      stopSpeech();
      setSpeechMessage("已停止朗读。");
      return;
    }
    onStopFamilyAudio();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `${record?.productName || "未读清标签"}。${record?.assessment?.headline || "待核对"}。${record?.assessment?.advice || "请核对完整包装"}。${(record?.assessment?.diseaseReminders || []).map((item: any) => item.message).join("。")}。识别不是医疗诊断。`,
    );
    utterance.lang = "zh-CN";
    utterance.onstart = () => {
      setSpeaking(true);
      setSpeechMessage("正在朗读识别结果。");
    };
    utterance.onend = () => {
      setSpeaking(false);
      setSpeechMessage("朗读已结束。");
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setSpeechMessage("语音朗读未能开始，请点击按钮手动重试。");
    };
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (stage !== "result" || saved) return;
    if (!window.history.state?.recognitionGuard) {
      window.history.pushState(
        { foodlensView: "recognition", recognitionGuard: true },
        "",
      );
    }
    const confirmBrowserBack = () => {
      window.history.pushState(
        { foodlensView: "recognition", recognitionGuard: true },
        "",
      );
      setConfirmAction("home");
    };
    window.addEventListener("popstate", confirmBrowserBack);
    return () => window.removeEventListener("popstate", confirmBrowserBack);
  }, [saved, stage]);

  useEffect(() => {
    if (stage === "result" && speechEnabled && spokenTask.current !== taskId) {
      spokenTask.current = taskId;
      speakResult();
    }
    if (stage !== "result" || !speechEnabled) stopSpeech();
    return () => {
      if (stage === "result") window.speechSynthesis?.cancel();
    };
  }, [speechEnabled, stage, taskId]);

  const recognize = async (nextPhoto: string, isUserPhoto: boolean) => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    setPhoto(nextPhoto); setUserPhoto(isUserPhoto); setRecord(null); setSaved(false);
    setTaskId(current => current + 1); setProgress("正在准备照片…"); setStage("processing");
    try {
      if (!isUserPhoto && outcome === "failure") { setStage("failure"); return; }
      const result = await runRecognition(nextPhoto, elder, active.signal, text => { if (!active.signal.aborted) setProgress(text); }, !isUserPhoto);
      if (!alive.current || active.signal.aborted) return;
      setRecord(result); setPhoto(result.photoDataUrl);
      setStage(!result.label.rawText && !result.label.ingredientText && isUserPhoto ? "failure" : "result");
    } catch (error) { if (!active.signal.aborted && alive.current) { setProgress((error as Error).message); setSpeechMessage((error as Error).message); setStage("failure"); } }
  };
  const startCamera = () => {
    controller.current?.abort(); stopSpeech();
    setTaskId(current => current + 1); setSaved(false); setSaving(false); setStage("camera");
  };
  const requestLeave = (action: Exclude<ConfirmAction, null>) => {
    if (stage === "result" && !saved) setConfirmAction(action);
    else action === "home" ? onHome() : startCamera();
  };

  const save = async () => {
    if (saving || saved || !record) return;
    if (!userPhoto) { setSpeechMessage("演示用例不保存到真实识别历史。"); return; }
    setSaving(true);
    try { await putRecord(record); setSaved(true); }
    catch (error) { setSpeechMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  if (stage === "camera") {
    return (
      <CameraPage
        outcome={outcome}
        setOutcome={setOutcome}
        onBack={onHome}
        onRecognize={recognize}
      />
    );
  }
  if (editOpen) {
    return (
      <ElderProfileEdit
        initial={elder}
        session={session}
        onBack={() => setEditOpen(false)}
        onSave={async (next) => {
          const success = await onUpdateElder(next);
          if (success && record) { setRecord({ ...record, assessment: assess(record.label, next), profileSnapshot: { ...ruleProfile(next), name: next.name, diseases: next.diseases, allergens: next.allergens } }); setSaved(false); }
          if (success) setEditOpen(false);
          return success;
        }}
      />
    );
  }
  if (stage === "processing") {
    return <ProcessingPage onCancel={startCamera} progress={progress} />;
  }
  if (stage === "failure") {
    return (
      <FailurePage
        onBack={startCamera}
        onRetry={startCamera}
        onChoose={(nextPhoto) => recognize(nextPhoto, true)}
      />
    );
  }
  return (
    <>
      <ResultPage
        record={record}
        elder={elder}
        photo={photo}
        saved={saved}
        saving={saving}
        session={session}
        userPhoto={userPhoto}
        onBack={() => requestLeave("home")}
        onRetake={() => requestLeave("camera")}
        onSave={save}
        onToggleSpeech={speakResult}
        speaking={speaking}
        speechEnabled={speechEnabled}
        speechMessage={speechMessage}
        onEditProfile={() => setEditOpen(true)}
      />
      {confirmAction && (
        <div className="dialog-backdrop">
          <section aria-modal="true" className="dialog-card" role="dialog">
            <h2>本次结果还未保存，是否放弃？</h2>
            <p>放弃后，本次结果不会保存为记录。</p>
            <button className="primary-button" type="button" onClick={() => setConfirmAction(null)}>
              继续查看
            </button>
            <button
              className="dialog-cancel"
              type="button"
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                action === "home" ? onHome() : startCamera();
              }}
            >
              放弃并返回
            </button>
          </section>
        </div>
      )}
    </>
  );
}
