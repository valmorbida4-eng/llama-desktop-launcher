interface ModelSettings {
  gpuLayers: string | number;
  device: string;
  context: string | number;
  cpuMoe: string | number;
  cacheK: string;
  cacheV: string;
  flash: string;
  threads: string | number;
  batch: string | number;
  ubatch: string | number;
}

interface ProgressUpdate { percent: number; label: string }
interface ChatOutput { stream: 'stdout' | 'stderr'; text: string }
interface ProcessExit { code: number | null; signal: string | null }
interface UpdateInfo { currentVersion: string; version: string; available: boolean; notes: string; url: string; publishedAt: string | null; asset: { name: string; size: number } | null }
interface UpdateResult { action: 'installer' | 'opened' | 'appimage' | 'package' | 'cancelled'; file: string; command?: string | null }
interface ImportedProfiles { imported: number; missing: number; existing: number; invalid: number }
interface RendererApi {
  state(): Promise<any>;
  checkUpdate(): Promise<UpdateInfo>;
  installUpdate(): Promise<UpdateResult>;
  setUpdateCheck(enabled: boolean): Promise<any>;
  onUpdateAvailable(callback: (value: UpdateInfo) => void): void;
  onUpdateProgress(callback: (value: ProgressUpdate) => void): void;
  selectModel(modelPath: string): Promise<any>;
  completeSetup(): Promise<any>;
  chooseDir(kind: 'engine' | 'models', index?: number): Promise<any>;
  clearDir(index: number): Promise<any>;
  installEngine(backend: string): Promise<any>;
  saveProfile(modelPath: string, settings: ModelSettings): Promise<any>;
  importLegacyProfiles(): Promise<ImportedProfiles | null>;
  recommend(modelPath: string): Promise<ModelSettings>;
  modelGuidance(): Promise<any>;
  copyGuidancePrompt(): Promise<string>;
  analyzeWithModel(modelPath: string, settings: ModelSettings): Promise<{ prompt: string }>;
  tune(modelPath: string, settings: ModelSettings): Promise<any>;
  launch(modelPath: string, settings: ModelSettings, options: { host: string; parallel: number; openBrowser?: boolean }): Promise<any>;
  stop(): Promise<boolean>;
  startChat(modelPath: string, settings: ModelSettings): Promise<boolean>;
  openCliTerminal(modelPath: string, settings: ModelSettings): Promise<boolean>;
  sendChat(value: string): Promise<any>;
  stopChat(): Promise<boolean>;
  getKey(): Promise<string>;
  copyKey(): Promise<boolean>;
  rotateKey(): Promise<string>;
  copyClientSetup(application: string, format: 'bash' | 'powershell' | 'config', shared: boolean): Promise<boolean>;
  copySharedLink(): Promise<boolean>;
  revokeSharedAccess(): Promise<boolean>;
  copySharedCommand(platform: 'bash' | 'powershell'): Promise<boolean>;
  copyEndpoint(): Promise<string>;
  copyOpenCodeCommand(platform: 'bash' | 'powershell'): Promise<boolean>;
  copyBrowserLink(): Promise<string>;
  createFirewallRule(address: string): Promise<any>;
  openHF(kind: 'all' | 'quantized' | 'moe' | 'dense' | 'full' | string): Promise<string>;
  openModelExample(url: string): Promise<string>;
  openModelDir(index: number): Promise<boolean>;
  openManual(lang: 'pt-BR' | 'en'): Promise<boolean>;
  onProgress(callback: (value: ProgressUpdate) => void): void;
  onTuneProgress(callback: (value: string) => void): void;
  onLog(callback: (value: string) => void): void;
  onStopped(callback: (value: number | null) => void): void;
  onChatOutput(callback: (value: ChatOutput) => void): void;
  onChatStopped(callback: (value: ProcessExit) => void): void;
}

declare global {
  interface ModelSettings {
    gpuLayers: string | number;
    device: string;
    context: string | number;
    cpuMoe: string | number;
    cacheK: string;
    cacheV: string;
    flash: string;
    threads: string | number;
    batch: string | number;
    ubatch: string | number;
  }
  interface Window { llama: RendererApi }
}

export {};
