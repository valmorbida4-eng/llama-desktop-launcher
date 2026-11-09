interface ModelSettings { [key: string]: string | number }

interface ProgressUpdate { percent: number; label: string }
interface ChatOutput { stream: 'stdout' | 'stderr'; text: string }
interface ProcessExit { code: number | null; signal: string | null }
interface UpdateInfo { currentVersion: string; version: string; available: boolean; notes: string; url: string; publishedAt: string | null; asset: { name: string; size: number } | null }
interface UpdateResult { action: 'installer' | 'opened' | 'appimage' | 'package' | 'cancelled'; file: string; command?: string | null }
interface ParameterField { key: string; group: string; label: string; flag: string; kind: 'int' | 'float' | 'select' | 'toggle' | 'text' | 'model' | 'info'; min?: number; max?: number; step?: number; options: string[] | null; hint: string | null; applicable: boolean; reason: string | null; auto: { value: string; source: string } | null; serverOnly: boolean }
interface ParameterSchema { engine: string; version: number; fields: ParameterField[]; info: any; readOnly: { label: string; value: string }[] }
interface TuneOptions { budgetMinutes: number; priority: 'generation' | 'prompt' | 'balanced' }
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
  chooseDir(kind: 'engine' | 'models' | 'strata' | 'vllm', index?: number): Promise<any>;
  clearDir(index: number): Promise<any>;
  installEngine(backend: string): Promise<any>;
  installVllm(): Promise<any>;
  refreshEngines(): Promise<any>;
  openEngineLink(kind: string): Promise<string>;
  onEnginesChanged(callback: () => void): void;
  saveProfile(modelPath: string, settings: ModelSettings): Promise<any>;
  importLegacyProfiles(): Promise<ImportedProfiles | null>;
  recommend(modelPath: string): Promise<ModelSettings>;
  modelGuidance(): Promise<any>;
  copyGuidancePrompt(): Promise<string>;
  analyzeWithModel(modelPath: string, settings: ModelSettings): Promise<{ prompt: string }>;
  tune(modelPath: string, settings: ModelSettings, options?: TuneOptions): Promise<any>;
  cancelTune(): Promise<boolean>;
  parameterSchema(modelPath: string, settings: ModelSettings): Promise<ParameterSchema>;
  fitValues(modelPath: string, settings: ModelSettings): Promise<ParameterSchema>;
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
  listFirewallRules(): Promise<{ name: string; displayName: string }[]>;
  removeFirewallRules(): Promise<{ removed: number; remaining: number }>;
  openHF(kind: 'all' | 'quantized' | 'moe' | 'dense' | 'full' | string): Promise<string>;
  openModelExample(url: string): Promise<string>;
  openModelDir(index: number): Promise<boolean>;
  openManual(lang: 'pt-BR' | 'en', doc?: 'MANUAL' | 'INTEGRATION' | 'DIAGNOSTICS'): Promise<boolean>;
  copyDiagnosticReport(): Promise<string>;
  onProgress(callback: (value: ProgressUpdate) => void): void;
  onTuneProgress(callback: (value: string) => void): void;
  onLog(callback: (value: string) => void): void;
  onStopped(callback: (value: number | null) => void): void;
  onChatOutput(callback: (value: ChatOutput) => void): void;
  onChatStopped(callback: (value: ProcessExit) => void): void;
}

declare global {
  interface ModelSettings { [key: string]: string | number }
  interface ParameterField { key: string; group: string; label: string; flag: string; kind: 'int' | 'float' | 'select' | 'toggle' | 'text' | 'model' | 'info'; min?: number; max?: number; step?: number; options: string[] | null; hint: string | null; applicable: boolean; reason: string | null; auto: { value: string; source: string } | null; serverOnly: boolean }
  interface ParameterSchema { engine: string; version: number; fields: ParameterField[]; info: any; readOnly: { label: string; value: string }[] }
  interface TuneOptions { budgetMinutes: number; priority: 'generation' | 'prompt' | 'balanced' }
  interface Window { llama: RendererApi }
}

export {};
