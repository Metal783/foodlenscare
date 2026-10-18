/** 通知状态统一来自backend中的服务端语音回执，不在本机伪造送达事件。 */
export type ChildNotificationPreferences = { delivery: boolean; playback: boolean };
