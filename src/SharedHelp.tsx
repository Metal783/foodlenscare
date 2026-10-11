import { snapshot } from "./backend"
const assetPathPrefix = "/assets"

export default function SharedHelp({ onBack }: { onBack: () => void }) {
  return (
    <main className="shared-help-page">
      <header className="child-back-header">
        <button aria-label="返回" type="button" onClick={onBack}>
          <img
            alt=""
            height="22"
            src={`${assetPathPrefix}/7e864.svg`}
            width="22"
          />
        </button>
        <h1>帮助与使用指南</h1>
      </header>
      <div className="shared-help-content">
        <section>
          <h2>一步一步，安心使用</h2>
          <p>老人端与子女端通用指南</p>
        </section>
        <section className="child-card">
          <h2>拍照识别</h2>
          <p>① 拍食品背面，完整拍清配料表与过敏原声明。</p>
          <p>② 光线明亮，避免反光，拿稳手机等对焦。</p>
          <p>③ 识别仅供参考，请核对包装与已有的饮食方案。</p>
          <p>④ 点击“保存记录”后才写入历史，子女按您授权的范围查看。</p>
        </section>
        <section className="child-card">
          <h2>发送与收听关怀语音</h2>
          <strong>子女：说给家人听</strong>
          <p>概览 → 发送语音 → 录制 → 停止。先试听，再发送。</p>
          <strong>老人：听听家人的关心</strong>
          <p>首页的语音入口 → 关怀语音。点击播放或暂停，也可回拨家人。</p>
        </section>
        <section className="child-card">
          <h2>绑定与共享</h2>
          <p>① 老人登录后在“我的设置 → 子女守护 → 添加家人”生成绑定码，5分钟内告诉子女使用。</p>
          <p>② 老人在本人端核对姓名、手机号尾号和关系，确认绑定。</p>
          <p>③ 老人单独选择食物与资料的共享范围，确认后子女才可查看。</p>
          <p>④ 老人点击家人详情可切换主要联系人或解除绑定，子女可在家人管理解除绑定。呼叫家人使用选定的主要联系人，紧急求助拨打120。</p>
          <p>⑤ 老人和子女均可在设置中退出登录，退出后返回可选择登录方式的欢迎页。</p>
        </section>
        <section className="child-card">
          <h2>还需要帮助？</h2>
          <a
            className="child-secondary"
            href={snapshot().account?.prefs.supportEmail ? `mailto:${snapshot().account!.prefs.supportEmail}?subject=食护家使用反馈` : undefined}
            onClick={() => { if (!snapshot().account?.prefs.supportEmail) window.alert("尚未配置帮助或反馈邮箱，请联系本机应用维护者。"); }}
          >
            <img
              alt=""
              height="22"
              src={`${assetPathPrefix}/d7323.svg`}
              width="22"
            />
            联系帮助／反馈问题
          </a>
          <p className="shared-help-note">
            说明所在页面与遇到的问题。请勿在反馈中发送验证码或不必要的健康资料。
          </p>
        </section>
        <div className="child-sharing">
          <img
            alt=""
            height="20"
            src={`${assetPathPrefix}/b1192.svg`}
            width="20"
          />
          <span>
            普通帮助不是急救服务。遇到紧急危险，请立即拨打当地急救电话。
          </span>
        </div>
      </div>
    </main>
  )
}
