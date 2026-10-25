// Application resource limits, not a provider billing switch. Deploy only on Free/Build accounts.
export const FREE_LIMITS = Object.freeze({
  participantsPerCall: 4,
  uploadBytes: 2 * 1024 * 1024,
  uploadBytesPerUser: 16 * 1024 * 1024,
  uploadBytesTotal: 64 * 1024 * 1024,
  downloadBytesPerMonth: 256 * 1024 * 1024,
  databaseBytes: 128 * 1024 * 1024,
  users: 32,
  spaces: 24,
  channelsPerSpace: 16,
  messages: 20000,
  cameraHeight: 480,
  cameraBitrate: 500000,
  cameraFrameRate: 15,
  screenHeight: 720,
  screenBitrate: 900000,
  screenFrameRate: 10,
});
export const COST_POLICY = Object.freeze({
  mode: 'free-only',
  autoUpgrade: false,
  intendedHostingPlan: 'Railway Free',
  intendedMediaPlan: 'LiveKit Build',
  providerPlanVerifiedByApp: false,
});
export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}
